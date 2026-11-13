import { D, weight } from '@/domain/calculations/decimal'
import { netWeightOf } from '@/domain/calculations/pricing'
import type { ErpCommands } from '@/repositories/interfaces'
import type { AuditDiscrepancy, StockAdjustment, StockAudit } from '@/types/entities'
import { db } from '../db'
import { BusinessError, actorName, audit, moveItem, nextNo, nowIso, requireBranch, requirePerm, stampNew, stampUpdate, uid } from '../ctx'
import { barcodes, tx } from './stock'

async function getAudit(id: string): Promise<StockAudit> {
  const a = await db.audits.get(id)
  if (!a) throw new BusinessError('Stock audit not found.')
  return a
}

export const audits: ErpCommands['audits'] = {
  create: (input) =>
    tx(async () => {
      requirePerm('audit.manage')
      if (!input.title.trim()) throw new BusinessError('Give the audit a title.')
      const branch = await requireBranch(input.branchId, 'branch to audit')
      let products = await db.products.toArray()
      if (input.categoryId) products = products.filter((p) => p.categoryId === input.categoryId)
      const pids = new Set(products.map((p) => p.id))
      const items = (await db.stockItems.toArray()).filter((i) => i.branchId === branch.id && pids.has(i.productId) && (i.status === 'available' || i.status === 'reserved'))
      const a: StockAudit = stampNew({
        id: uid(), auditNo: await nextNo('audit', 'AUD-', 4), title: input.title, branchId: branch.id, categoryId: input.categoryId, status: 'in_progress' as const,
        expectedItemIds: items.map((i) => i.id), scans: [], discrepancies: [],
      })
      await db.audits.add(a)
      await audit('create', 'stock_audit', a.id, `${a.auditNo} started: ${items.length} item(s) expected`)
      return a
    }),
  scan: (id, code, physicalWeight) =>
    tx(async () => {
      requirePerm('audit.manage')
      const a = await getAudit(id)
      if (a.status !== 'in_progress') throw new BusinessError('This audit is no longer accepting scans.')
      const c = code.trim()
      if (!c) throw new BusinessError('Enter or scan a barcode.')
      const hit = await barcodes.lookup(c)
      const key = hit?.item.barcode ?? c
      if (a.scans.some((s) => s.barcode === key)) return { audit: a, result: 'duplicate' as const }
      const scan = { barcode: key, stockItemId: hit?.item.id, physicalWeight: physicalWeight && physicalWeight > 0 ? weight(physicalWeight) : undefined, at: nowIso() }
      const u = { ...a, scans: [...a.scans, scan], ...stampUpdate() }
      await db.audits.put(u)
      const result = !hit ? ('unknown' as const) : a.expectedItemIds.includes(hit.item.id) ? ('matched' as const) : ('extra' as const)
      return { audit: u, result }
    }),
  removeScan: (id, code) =>
    tx(async () => {
      requirePerm('audit.manage')
      const a = await getAudit(id)
      if (a.status !== 'in_progress') throw new BusinessError('Audit is closed for changes.')
      const u = { ...a, scans: a.scans.filter((s) => s.barcode !== code), ...stampUpdate() }
      await db.audits.put(u)
      return u
    }),
  submit: (id) =>
    tx(async () => {
      requirePerm('audit.manage')
      const a = await getAudit(id)
      if (a.status !== 'in_progress') throw new BusinessError('Only audits in progress can be submitted.')
      const settings = await db.settings.get('main')
      const tol = settings?.weightTolerance ?? 0.01
      const d: AuditDiscrepancy[] = []
      const scannedIds = new Set(a.scans.map((s) => s.stockItemId).filter(Boolean))
      for (const itemId of a.expectedItemIds) {
        if (scannedIds.has(itemId)) continue
        const i = await db.stockItems.get(itemId)
        if (i) d.push({ kind: 'missing', stockItemId: i.id, barcode: i.barcode, itemCode: i.itemCode, name: (await db.products.get(i.productId))?.name, systemWeight: i.grossWeight, note: 'Expected in stock but not scanned' })
      }
      for (const s of a.scans) {
        if (!s.stockItemId) { d.push({ kind: 'unknown', barcode: s.barcode, note: 'Barcode not found in the system' }); continue }
        const i = await db.stockItems.get(s.stockItemId)
        if (!i) continue
        const name = (await db.products.get(i.productId))?.name
        if (!a.expectedItemIds.includes(i.id)) {
          d.push({ kind: 'extra', stockItemId: i.id, barcode: i.barcode, itemCode: i.itemCode, name, systemWeight: i.grossWeight, note: `Scanned but system status is “${i.status}”` })
        } else if (s.physicalWeight !== undefined && D(s.physicalWeight).minus(i.grossWeight).abs().gt(tol)) {
          d.push({ kind: 'weight', stockItemId: i.id, barcode: i.barcode, itemCode: i.itemCode, name, systemWeight: i.grossWeight, physicalWeight: s.physicalWeight, note: `Weight differs by ${D(s.physicalWeight).minus(i.grossWeight).toFixed(3)} g` })
        }
      }
      const u = { ...a, discrepancies: d, status: 'pending_approval' as const, ...stampUpdate() }
      await db.audits.put(u)
      await audit('submit', 'stock_audit', id, `${a.auditNo} submitted with ${d.length} discrepancy(ies)`)
      return u
    }),
  approve: (id, note) =>
    tx(async () => {
      requirePerm('audit.approve')
      if (!note.trim()) throw new BusinessError('An adjustment reason is required to approve.')
      const a = await getAudit(id)
      if (a.status !== 'pending_approval') throw new BusinessError('Only submitted audits can be approved.')
      for (const d of a.discrepancies) {
        if (!d.stockItemId) continue
        const item = await db.stockItems.get(d.stockItemId)
        if (!item) continue
        const base = { auditId: a.id, auditNo: a.auditNo, stockItemId: item.id, reason: note, approvedBy: actorName() }
        const ref = { type: 'audit' as const, id: a.id, no: a.auditNo }
        let adj: StockAdjustment | null = null
        if (d.kind === 'missing' && (item.status === 'available' || item.status === 'reserved')) {
          await moveItem(item, 'missing', { reason: `Audit ${a.auditNo}: not found – ${note}`, ref })
          adj = stampNew({ id: uid(), ...base, kind: 'missing' as const, oldWeight: item.grossWeight, newWeight: 0 })
        } else if (d.kind === 'extra' && item.status === 'missing') {
          await moveItem(item, 'available', { reason: `Audit ${a.auditNo}: found – ${note}`, ref })
          adj = stampNew({ id: uid(), ...base, kind: 'found' as const, oldWeight: 0, newWeight: item.grossWeight })
        } else if (d.kind === 'weight' && d.physicalWeight && (item.status === 'available' || item.status === 'reserved')) {
          await moveItem(item, null, { reason: `Audit ${a.auditNo}: weight corrected – ${note}`, ref, newGross: d.physicalWeight, newNet: netWeightOf(d.physicalWeight, item.stoneWeight) })
          adj = stampNew({ id: uid(), ...base, kind: 'weight' as const, oldWeight: item.grossWeight, newWeight: d.physicalWeight })
        }
        if (adj) await db.adjustments.add(adj)
      }
      const u = { ...a, status: 'approved' as const, approvedBy: actorName(), approvalNote: note, ...stampUpdate() }
      await db.audits.put(u)
      await audit('approve', 'stock_audit', id, `${a.auditNo} approved; adjustments posted to the stock ledger`)
      return u
    }),
  reject: (id, note) =>
    tx(async () => {
      requirePerm('audit.approve')
      if (!note.trim()) throw new BusinessError('Please explain the rejection.')
      const a = await getAudit(id)
      if (a.status !== 'pending_approval') throw new BusinessError('Only submitted audits can be rejected.')
      const u = { ...a, status: 'rejected' as const, approvalNote: note, ...stampUpdate() }
      await db.audits.put(u)
      await audit('reject', 'stock_audit', id, `${a.auditNo} rejected – no stock changed`)
      return u
    }),
}
