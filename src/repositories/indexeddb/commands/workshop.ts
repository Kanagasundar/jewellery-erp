import { D, money, weight } from '@/domain/calculations/decimal'
import { repairOutstanding } from '@/domain/calculations/ledger'
import { netWeightOf } from '@/domain/calculations/pricing'
import { REPAIR_FLOW } from '@/domain/workflows/rules'
import type { ErpCommands } from '@/repositories/interfaces'
import type { PolishingJob, Repair, StatusEvent } from '@/types/entities'
import { db } from '../db'
import { BusinessError, actorName, audit, getActor, moveItem, nextNo, nowIso, requirePerm, stampNew, stampUpdate, uid } from '../ctx'
import { insertPayment } from './sales'
import { tx } from './stock'

const ev = (status: string, note?: string): StatusEvent => ({ at: nowIso(), status, by: actorName(), note })

/** Artisans may only touch jobs assigned to them. */
function requireOwnJob(artisanId?: string) {
  const a = getActor()
  if (a?.role === 'artisan' && artisanId !== a.id) throw new BusinessError('This job is assigned to another artisan.')
}

async function getRepair(id: string): Promise<Repair> {
  const r = await db.repairs.get(id)
  if (!r) throw new BusinessError('Repair job not found.')
  return r
}
function move(r: Repair, to: Repair['status'], note?: string, patch: Partial<Repair> = {}): Repair {
  if (!REPAIR_FLOW[r.status].includes(to)) throw new BusinessError(`A ${r.status.replace('_', ' ')} job cannot move to ${to.replace('_', ' ')}.`)
  return { ...r, ...patch, status: to, history: [...r.history, ev(to, note)], ...stampUpdate() }
}

export const repairs: ErpCommands['repairs'] = {
  create: (input) =>
    tx(async () => {
      requirePerm('repairs.manage')
      const cust = await db.customers.get(input.customerId)
      if (!cust) throw new BusinessError('Select a customer for the repair.')
      if (!input.description.trim()) throw new BusinessError('Describe the jewellery being repaired.')
      if (!(input.receivedWeight > 0)) throw new BusinessError('Enter the received weight.')
      const jobNo = await nextNo('repair', 'REP-', 5)
      const id = uid()
      if (input.stockItemId) {
        const item = await db.stockItems.get(input.stockItemId)
        if (!item || item.status !== 'available') throw new BusinessError('Only an available stock item can be sent for repair.')
        await moveItem(item, 'repair', { reason: `Sent for repair ${jobNo}`, ref: { type: 'repair', id, no: jobNo } })
      }
      const r: Repair = stampNew({
        id, jobNo, customerId: input.customerId, stockItemId: input.stockItemId, description: input.description, repairType: input.repairType,
        receivedWeight: weight(input.receivedWeight), damage: input.damage, instructions: input.instructions, expectedDelivery: input.expectedDelivery,
        artisanId: input.artisanId, labourEstimate: money(input.labourEstimate), labourFinal: 0, photos: input.photos, status: 'received' as const,
        history: [ev('received', 'Item received from customer')],
      })
      let rec = r
      if (input.artisanId) rec = move(r, 'assigned', 'Assigned at intake')
      await db.repairs.add(rec)
      if (input.advance && input.advance.amount > 0)
        await insertPayment({ direction: 'in', partyType: 'customer', partyId: cust.id, mode: input.advance.mode, amount: input.advance.amount, kind: 'advance', allocations: [{ docType: 'repair', docId: id, docNo: jobNo, amount: input.advance.amount }], notes: `Advance for ${jobNo}` })
      await audit('create', 'repair', id, `${jobNo} received for ${cust.name}`)
      return rec
    }),
  assign: (id, artisanId) =>
    tx(async () => {
      requirePerm('repairs.manage')
      const r = await getRepair(id)
      if (r.status !== 'received' && r.status !== 'assigned') throw new BusinessError('Artisan can only be changed before work starts.')
      const u = r.status === 'received' ? move(r, 'assigned', 'Artisan assigned', { artisanId }) : { ...r, artisanId, history: [...r.history, ev('assigned', 'Artisan reassigned')], ...stampUpdate() }
      await db.repairs.put(u)
      await audit('assign', 'repair', id, `${r.jobNo} assigned`)
      return u
    }),
  start: (id) =>
    tx(async () => {
      requirePerm('repairs.update')
      const r = await getRepair(id)
      requireOwnJob(r.artisanId)
      const u = move(r, 'in_progress', 'Work started')
      await db.repairs.put(u)
      return u
    }),
  complete: (id, labourFinal, note) =>
    tx(async () => {
      requirePerm('repairs.update')
      const r = await getRepair(id)
      requireOwnJob(r.artisanId)
      if (!(labourFinal >= 0)) throw new BusinessError('Enter the final labour charge.')
      const u = move(r, 'completed', note || 'Work completed', { labourFinal: money(labourFinal) })
      await db.repairs.put(u)
      await audit('complete', 'repair', id, `${r.jobNo} completed, charge ${labourFinal}`)
      return u
    }),
  deliver: (id) =>
    tx(async () => {
      requirePerm('repairs.manage')
      const r = await getRepair(id)
      const pays = await db.payments.where('partyId').equals(r.customerId).toArray()
      const due = repairOutstanding(r, pays)
      if (r.status === 'completed' && due > 0) throw new BusinessError(`Collect the outstanding ₹${due.toFixed(2)} before delivering the item.`)
      const u = move(r, 'delivered', 'Delivered to customer', { deliveredAt: nowIso() })
      if (r.stockItemId) {
        const item = await db.stockItems.get(r.stockItemId)
        if (item && item.status === 'repair') await moveItem(item, 'available', { reason: `Repair ${r.jobNo} completed – returned to stock`, ref: { type: 'repair', id, no: r.jobNo } })
      }
      await db.repairs.put(u)
      await audit('deliver', 'repair', id, `${r.jobNo} delivered`)
      return u
    }),
  cancel: (id, reason) =>
    tx(async () => {
      requirePerm('repairs.manage')
      if (!reason.trim()) throw new BusinessError('A cancellation reason is required.')
      const r = await getRepair(id)
      const u = move(r, 'cancelled', reason)
      if (r.stockItemId) {
        const item = await db.stockItems.get(r.stockItemId)
        if (item && item.status === 'repair') await moveItem(item, 'available', { reason: `Repair ${r.jobNo} cancelled – returned to stock`, ref: { type: 'repair', id, no: r.jobNo } })
      }
      // release any advance held against this job so it stays on the customer's account
      for (const p of await db.payments.where('partyId').equals(r.customerId).toArray())
        if (p.allocations.some((a) => a.docType === 'repair' && a.docId === id))
          await db.payments.put({ ...p, allocations: p.allocations.filter((a) => !(a.docType === 'repair' && a.docId === id)), ...stampUpdate() })
      await db.repairs.put(u)
      await audit('cancel', 'repair', id, `${r.jobNo} cancelled: ${reason}`)
      return u
    }),
}

/* ================= POLISHING ================= */
async function getJob(id: string): Promise<PolishingJob> {
  const j = await db.polishing.get(id)
  if (!j) throw new BusinessError('Polishing job not found.')
  return j
}
const step = (j: PolishingJob, from: PolishingJob['status'][], to: PolishingJob['status'], note?: string, patch: Partial<PolishingJob> = {}): PolishingJob => {
  if (!from.includes(j.status)) throw new BusinessError(`Job is ${j.status.replace('_', ' ')}; cannot move to ${to.replace('_', ' ')}.`)
  return { ...j, ...patch, status: to, history: [...j.history, ev(to, note)], ...stampUpdate() }
}

export const polishing: ErpCommands['polishing'] = {
  create: (input) =>
    tx(async () => {
      requirePerm('polishing.manage')
      const item = await db.stockItems.get(input.stockItemId)
      if (!item) throw new BusinessError('Select an item (scan its barcode).')
      if (item.status !== 'available') throw new BusinessError(`${item.itemCode} is ${item.status}; only available items can be sent for polishing.`)
      const jobNo = await nextNo('polish', 'POL-', 5)
      const id = uid()
      await moveItem(item, 'polishing', { reason: `Sent for polishing ${jobNo}`, ref: { type: 'polishing', id, no: jobNo } })
      let j: PolishingJob = stampNew({
        id, jobNo, stockItemId: item.id, polishType: input.polishType, artisanId: input.artisanId, beforeWeight: item.grossWeight, afterWeight: 0,
        weightDiff: 0, labourCharge: money(input.labourCharge), expectedDate: input.expectedDate, status: 'pending' as const, remarks: input.remarks,
        history: [ev('pending', 'Job created')],
      })
      if (input.artisanId) j = step(j, ['pending'], 'assigned', 'Assigned at creation')
      await db.polishing.add(j)
      await audit('create', 'polishing', id, `${jobNo} created for ${item.itemCode}`)
      return j
    }),
  assign: (id, artisanId) =>
    tx(async () => {
      requirePerm('polishing.manage')
      const j = await getJob(id)
      const u = step(j, ['pending', 'assigned'], 'assigned', 'Artisan assigned', { artisanId })
      await db.polishing.put(u)
      return u
    }),
  start: (id) =>
    tx(async () => {
      requirePerm('polishing.update')
      const j = await getJob(id)
      requireOwnJob(j.artisanId)
      const u = step(j, ['assigned'], 'in_progress', 'Polishing started')
      await db.polishing.put(u)
      return u
    }),
  submitForQc: (id, afterWeight, remarks) =>
    tx(async () => {
      requirePerm('polishing.update')
      const j = await getJob(id)
      requireOwnJob(j.artisanId)
      if (!(afterWeight > 0)) throw new BusinessError('Enter the weight after polishing.')
      if (D(afterWeight).gt(j.beforeWeight)) throw new BusinessError('Weight after polishing cannot exceed the weight before polishing.')
      const u = step(j, ['in_progress'], 'quality_check', remarks, { afterWeight: weight(afterWeight), weightDiff: weight(D(j.beforeWeight).minus(afterWeight)), remarks: remarks || j.remarks })
      await db.polishing.put(u)
      return u
    }),
  qc: (id, passed, remarks) =>
    tx(async () => {
      requirePerm('polishing.manage')
      const j = await getJob(id)
      if (!passed && !remarks.trim()) throw new BusinessError('Explain why the quality check failed.')
      const u = passed
        ? step(j, ['quality_check'], 'completed', remarks || 'QC passed', { qcPassed: true, qcRemarks: remarks })
        : step(j, ['quality_check'], 'in_progress', `QC failed: ${remarks}`, { qcPassed: false, qcRemarks: remarks })
      await db.polishing.put(u)
      await audit('qc', 'polishing', id, `${j.jobNo} QC ${passed ? 'passed' : 'failed'}`)
      return u
    }),
  returnToStock: (id) =>
    tx(async () => {
      requirePerm('polishing.manage')
      const j = await getJob(id)
      const u = step(j, ['completed'], 'returned', 'Returned to inventory')
      const item = await db.stockItems.get(j.stockItemId)
      if (!item || item.status !== 'polishing') throw new BusinessError('The item is not in polishing status.')
      await moveItem(item, 'available', {
        reason: `Polishing ${j.jobNo} done – returned (loss ${j.weightDiff.toFixed(3)} g)`, ref: { type: 'polishing', id, no: j.jobNo },
        newGross: j.afterWeight, newNet: netWeightOf(j.afterWeight, item.stoneWeight),
      })
      await db.polishing.put(u)
      await audit('return', 'polishing', id, `${j.jobNo} returned to inventory`)
      return u
    }),
}
