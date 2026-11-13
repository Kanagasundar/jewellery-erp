import { D, money, weight } from '@/domain/calculations/decimal'
import { paidAgainst } from '@/domain/calculations/ledger'
import { netWeightOf, purchaseLineAmounts } from '@/domain/calculations/pricing'
import { isValidBarcode, makeBarcode, purchaseStatusAfterReceipt } from '@/domain/workflows/rules'
import type { BarcodeLookup, ErpCommands, LedgerCheck } from '@/repositories/interfaces'
import type { Barcode, PurchaseLine, PurchaseOrder, StockInward, StockItem } from '@/types/entities'
import { db } from '../db'
import {
  BusinessError, actorName, audit, ledgerForNewItem, moveItem, nextNo, nextSeq, nowIso, requirePerm, stampNew, stampUpdate, uid,
} from '../ctx'

export const tx = <T>(fn: () => Promise<T>): Promise<T> => db.transaction('rw', db.tables, fn)

/* ================= PURCHASES ================= */
export const purchases: ErpCommands['purchases'] = {
  save: (input) =>
    tx(async () => {
      requirePerm('purchases.manage')
      const supplier = await db.suppliers.get(input.supplierId)
      if (!supplier) throw new BusinessError('Select a valid supplier.')
      if (!input.lines.length) throw new BusinessError('Add at least one product line.')
      const existing = input.id ? await db.purchaseOrders.get(input.id) : undefined
      if (input.id && !existing) throw new BusinessError('Purchase order not found.')
      if (existing && !['draft', 'pending'].includes(existing.status))
        throw new BusinessError(`A ${existing.status.replace('_', ' ')} purchase order can no longer be edited.`)
      const lines: PurchaseLine[] = []
      for (const l of input.lines) {
        const p = await db.products.get(l.productId)
        if (!p) throw new BusinessError('A line references an unknown product.')
        if (!(l.qty >= 1) || !Number.isInteger(l.qty)) throw new BusinessError(`${p.name}: quantity must be a whole number ≥ 1.`)
        if (!(l.grossWeight > 0)) throw new BusinessError(`${p.name}: gross weight must be greater than zero.`)
        if (l.stoneWeight < 0 || l.stoneWeight >= l.grossWeight) throw new BusinessError(`${p.name}: stone weight must be less than gross weight.`)
        if (!(l.rate > 0)) throw new BusinessError(`${p.name}: purchase rate is required.`)
        const net = netWeightOf(l.grossWeight, l.stoneWeight)
        const a = purchaseLineAmounts({ qty: l.qty, netWeight: net, rate: l.rate, makingCharge: l.makingCharge, wastagePercent: l.wastagePercent, gstPercent: l.gstPercent })
        lines.push({
          id: l.id ?? uid(), productId: l.productId, qty: l.qty, grossWeight: weight(l.grossWeight), stoneWeight: weight(l.stoneWeight),
          netWeight: net, purityId: l.purityId, stoneDetails: l.stoneDetails, rate: money(l.rate), makingCharge: money(l.makingCharge),
          wastagePercent: l.wastagePercent, gstPercent: l.gstPercent, taxable: a.taxable, gst: a.gst, amount: a.amount, receivedQty: 0,
        })
      }
      const taxable = money(lines.reduce((s, l) => s.plus(l.taxable), D(0)))
      const gst = money(lines.reduce((s, l) => s.plus(l.gst), D(0)))
      const status: PurchaseOrder['status'] = input.submit ? 'pending' : existing?.status === 'pending' ? 'pending' : 'draft'
      const base = { supplierId: input.supplierId, invoiceNo: input.invoiceNo, date: input.date, expectedDate: input.expectedDate, notes: input.notes, status, lines, taxable, gst, total: money(D(taxable).plus(gst)) }
      if (existing) {
        const po: PurchaseOrder = { ...existing, ...base, ...stampUpdate() }
        await db.purchaseOrders.put(po)
        await audit('update', 'purchase', po.id, `${po.poNumber} updated (${status})`)
        return po
      }
      const po: PurchaseOrder = stampNew({ id: uid(), poNumber: await nextNo('po', 'PO-', 5), ...base })
      await db.purchaseOrders.add(po)
      await audit('create', 'purchase', po.id, `${po.poNumber} created (${status}), total ${po.total}`)
      return po
    }),
  submit: (id) =>
    tx(async () => {
      requirePerm('purchases.manage')
      const po = await db.purchaseOrders.get(id)
      if (!po) throw new BusinessError('Purchase order not found.')
      if (po.status !== 'draft') throw new BusinessError('Only draft purchase orders can be submitted.')
      const u = { ...po, status: 'pending' as const, ...stampUpdate() }
      await db.purchaseOrders.put(u)
      await audit('submit', 'purchase', id, `${po.poNumber} submitted`)
      return u
    }),
  cancel: (id, reason) =>
    tx(async () => {
      requirePerm('purchases.manage')
      if (!reason.trim()) throw new BusinessError('A cancellation reason is required.')
      const po = await db.purchaseOrders.get(id)
      if (!po) throw new BusinessError('Purchase order not found.')
      if (po.lines.some((l) => l.receivedQty > 0)) throw new BusinessError('Stock has already been received against this order – it cannot be cancelled.')
      if (po.status === 'cancelled') throw new BusinessError('Already cancelled.')
      const pays = await db.payments.where('partyId').equals(po.supplierId).toArray()
      if (paidAgainst(pays, 'purchase', id) > 0) throw new BusinessError('Payments exist against this order. Record a supplier refund first.')
      const u = { ...po, status: 'cancelled' as const, cancelReason: reason, ...stampUpdate() }
      await db.purchaseOrders.put(u)
      await audit('cancel', 'purchase', id, `${po.poNumber} cancelled: ${reason}`)
      return u
    }),
}

/* ================= INWARD ================= */
const lineCapacity = (po: PurchaseOrder, lineId: string) => {
  const l = po.lines.find((x) => x.id === lineId)
  return l ? l.qty - l.receivedQty : 0
}

export const inward: ErpCommands['inward'] = {
  save: (input) =>
    tx(async () => {
      requirePerm('inward.manage')
      const po = await db.purchaseOrders.get(input.purchaseOrderId)
      if (!po) throw new BusinessError('Purchase order not found.')
      if (!['pending', 'partially_received'].includes(po.status)) throw new BusinessError(`Cannot receive stock against a ${po.status.replace('_', ' ')} order.`)
      if (!input.items.length) throw new BusinessError('Add at least one received item.')
      const perLine = new Map<string, number>()
      for (const it of input.items) {
        perLine.set(it.poLineId, (perLine.get(it.poLineId) ?? 0) + 1)
        if (it.receivedGross <= 0) throw new BusinessError('Each received item needs a gross weight.')
        if (it.receivedStone < 0 || it.receivedStone >= it.receivedGross) throw new BusinessError('Stone weight must be less than gross weight.')
      }
      for (const [lineId, n] of perLine) if (n > lineCapacity(po, lineId)) throw new BusinessError('You are receiving more pieces than are pending on the purchase order.')
      const existing = input.id ? await db.inwards.get(input.id) : undefined
      if (existing && !['draft', 'rejected'].includes(existing.status)) throw new BusinessError('Only draft inward entries can be edited.')
      const items = input.items.map((i) => ({ ...i, receivedGross: weight(i.receivedGross), receivedStone: weight(i.receivedStone), receivedNet: netWeightOf(i.receivedGross, i.receivedStone) }))
      if (existing) {
        const u: StockInward = { ...existing, items, date: input.date, notes: input.notes, status: 'draft', ...stampUpdate() }
        await db.inwards.put(u)
        return u
      }
      const inw: StockInward = stampNew({ id: uid(), inwardNo: await nextNo('inward', 'GRN-', 5), purchaseOrderId: po.id, supplierId: po.supplierId, date: input.date, status: 'draft' as const, items, notes: input.notes })
      await db.inwards.add(inw)
      await audit('create', 'inward', inw.id, `${inw.inwardNo} drafted against ${po.poNumber} (no stock impact yet)`)
      return inw
    }),
  submit: (id) =>
    tx(async () => {
      requirePerm('inward.manage')
      const i = await db.inwards.get(id)
      if (!i) throw new BusinessError('Inward not found.')
      if (!['draft', 'rejected'].includes(i.status)) throw new BusinessError('Only draft entries can be submitted for approval.')
      const u = { ...i, status: 'pending_approval' as const, ...stampUpdate() }
      await db.inwards.put(u)
      await audit('submit', 'inward', id, `${i.inwardNo} submitted for approval`)
      return u
    }),
  approve: (id) =>
    tx(async () => {
      requirePerm('inward.approve')
      const inw = await db.inwards.get(id)
      if (!inw) throw new BusinessError('Inward not found.')
      if (inw.status !== 'pending_approval') throw new BusinessError('Only entries pending approval can be completed.')
      const po = await db.purchaseOrders.get(inw.purchaseOrderId)
      if (!po) throw new BusinessError('Linked purchase order is missing.')
      const accepted = inw.items.filter((i) => i.accepted)
      if (!accepted.length) throw new BusinessError('No accepted items – reject this entry instead.')
      const perLine = new Map<string, number>()
      accepted.forEach((i) => perLine.set(i.poLineId, (perLine.get(i.poLineId) ?? 0) + 1))
      for (const [lineId, n] of perLine) if (n > lineCapacity(po, lineId)) throw new BusinessError('Accepted pieces exceed what is still pending on the purchase order.')
      const items = [...inw.items]
      for (const it of accepted) {
        const product = await db.products.get(it.productId)
        const line = po.lines.find((l) => l.id === it.poLineId)
        if (!product || !line) throw new BusinessError('Inward line references missing product/line.')
        const itemId = uid()
        const barcodeCode = await uniqueBarcode()
        const stock: StockItem = stampNew({
          id: itemId, itemCode: await nextNo('item', `${product.code}-`, 4), barcode: barcodeCode, productId: product.id, metalId: product.metalId,
          purityId: it.verifiedPurityId, grossWeight: it.receivedGross, stoneWeight: it.receivedStone, netWeight: it.receivedNet,
          costPrice: money(D(line.taxable).div(line.qty)), status: it.condition === 'damaged' ? ('damaged' as const) : ('available' as const),
          purchaseOrderId: po.id, inwardId: inw.id, huid: product.huid, note: it.remarks || undefined,
        })
        await db.stockItems.add(stock)
        await db.barcodes.add(stampNew({ id: uid(), code: barcodeCode, stockItemId: itemId, active: true, printCount: 0 }))
        await ledgerForNewItem(stock, { reason: it.condition === 'damaged' ? 'Stock inward – received damaged' : 'Stock inward', ref: { type: 'inward', id: inw.id, no: inw.inwardNo } })
        const idx = items.findIndex((x) => x.id === it.id)
        items[idx] = { ...it, stockItemId: itemId }
        line.receivedQty += 1
      }
      const pays = await db.payments.where('partyId').equals(po.supplierId).toArray()
      const fullyPaid = D(paidAgainst(pays, 'purchase', po.id)).gte(po.total)
      const updatedPo: PurchaseOrder = { ...po, ...stampUpdate() }
      updatedPo.status = purchaseStatusAfterReceipt(updatedPo, fullyPaid)
      await db.purchaseOrders.put(updatedPo)
      const done: StockInward = { ...inw, items, status: 'completed', approvedBy: actorName(), approvedAt: nowIso(), ...stampUpdate() }
      await db.inwards.put(done)
      await audit('complete', 'inward', id, `${inw.inwardNo} completed: ${accepted.length} item(s) stocked, PO now ${updatedPo.status}`)
      return done
    }),
  reject: (id, reason) =>
    tx(async () => {
      requirePerm('inward.approve')
      if (!reason.trim()) throw new BusinessError('A rejection reason is required.')
      const i = await db.inwards.get(id)
      if (!i || i.status !== 'pending_approval') throw new BusinessError('Only entries pending approval can be rejected.')
      const u = { ...i, status: 'rejected' as const, rejectReason: reason, ...stampUpdate() }
      await db.inwards.put(u)
      await audit('reject', 'inward', id, `${i.inwardNo} rejected: ${reason}`)
      return u
    }),
  discardDraft: (id) =>
    tx(async () => {
      requirePerm('inward.manage')
      const i = await db.inwards.get(id)
      if (!i) return
      if (i.status !== 'draft') throw new BusinessError('Only unsubmitted drafts can be discarded.')
      await db.inwards.delete(id)
      await audit('discard', 'inward', id, `${i.inwardNo} draft discarded`)
    }),
}

async function uniqueBarcode(): Promise<string> {
  for (let n = 0; n < 50; n++) {
    const c = makeBarcode((await nextSeq('barcode')) + 1000)
    if (!(await db.barcodes.where('code').equals(c).first())) return c
  }
  throw new BusinessError('Could not generate a unique barcode.')
}

/* ================= BARCODES ================= */
export const barcodes: ErpCommands['barcodes'] = {
  markPrinted: (ids) =>
    tx(async () => {
      requirePerm('barcodes.manage')
      for (const itemId of ids) {
        const b = await db.barcodes.where('stockItemId').equals(itemId).and((x) => x.active).first()
        if (b) await db.barcodes.put({ ...b, printCount: b.printCount + 1, lastPrintedAt: nowIso(), ...stampUpdate() })
      }
    }),
  regenerate: (itemId, reason) =>
    tx(async () => {
      requirePerm('barcodes.manage')
      if (!reason.trim()) throw new BusinessError('Give a reason for replacing the barcode.')
      const item = await db.stockItems.get(itemId)
      if (!item) throw new BusinessError('Item not found.')
      const olds = await db.barcodes.where('stockItemId').equals(itemId).and((x) => x.active).toArray()
      for (const o of olds) await db.barcodes.put({ ...o, active: false, voidedReason: reason, ...stampUpdate() })
      const code = await uniqueBarcode()
      const b: Barcode = stampNew({ id: uid(), code, stockItemId: itemId, active: true, printCount: 0 })
      await db.barcodes.add(b)
      await db.stockItems.put({ ...item, barcode: code, ...stampUpdate() })
      await audit('regenerate', 'barcode', itemId, `${item.itemCode}: ${olds.map((o) => o.code).join(',')} → ${code} (${reason})`)
      return b
    }),
  lookup: async (code): Promise<BarcodeLookup | undefined> => {
    const c = code.trim()
    if (!isValidBarcode(c)) return undefined
    let item = await db.stockItems.where('barcode').equals(c).first()
    let barcode: Barcode | undefined
    if (!item) {
      barcode = await db.barcodes.where('code').equals(c).first()
      if (barcode) item = await db.stockItems.get(barcode.stockItemId)
    }
    if (!item) item = await db.stockItems.where('itemCode').equals(c).first()
    if (!item) return undefined
    return { item, barcode, product: await db.products.get(item.productId) }
  },
}

/* ================= INVENTORY ================= */
async function getItem(id: string) {
  const i = await db.stockItems.get(id)
  if (!i) throw new BusinessError('Stock item not found.')
  return i
}
export const inventory: ErpCommands['inventory'] = {
  reserve: (itemId, customerId, note) =>
    tx(async () => {
      requirePerm('sales.create')
      const i = await getItem(itemId)
      if (i.status !== 'available') throw new BusinessError(`${i.itemCode} is ${i.status}; only available items can be reserved.`)
      const u = await moveItem(i, 'reserved', { reason: note || 'Reserved for customer', ref: { type: 'reserve', id: i.id, no: i.itemCode }, extra: { reservedFor: customerId } })
      await audit('reserve', 'stock_item', itemId, `${i.itemCode} reserved`)
      return u
    }),
  release: (itemId) =>
    tx(async () => {
      requirePerm('sales.create')
      const i = await getItem(itemId)
      if (i.status !== 'reserved') throw new BusinessError('Item is not reserved.')
      return moveItem(i, 'available', { reason: 'Reservation released', ref: { type: 'reserve', id: i.id, no: i.itemCode }, extra: { reservedFor: undefined } })
    }),
  markDamaged: (itemId, reason) =>
    tx(async () => {
      requirePerm('inventory.manage')
      if (!reason.trim()) throw new BusinessError('A reason is required.')
      const i = await getItem(itemId)
      if (!['available', 'returned', 'reserved'].includes(i.status)) throw new BusinessError(`${i.itemCode} cannot be marked damaged from status ${i.status}.`)
      const u = await moveItem(i, 'damaged', { reason, ref: { type: 'manual', id: i.id, no: i.itemCode } })
      await audit('damage', 'stock_item', itemId, `${i.itemCode} marked damaged: ${reason}`)
      return u
    }),
  restock: (itemId, reason) =>
    tx(async () => {
      requirePerm('inventory.manage')
      if (!reason.trim()) throw new BusinessError('A reason is required.')
      const i = await getItem(itemId)
      if (!['returned', 'damaged', 'missing'].includes(i.status)) throw new BusinessError(`${i.itemCode} is ${i.status} and cannot be restocked.`)
      const u = await moveItem(i, 'available', { reason, ref: { type: 'restock', id: i.id, no: i.itemCode } })
      await audit('restock', 'stock_item', itemId, `${i.itemCode} restocked: ${reason}`)
      return u
    }),
  /** Reconcile stock items against the immutable ledger. */
  reconcile: async (): Promise<LedgerCheck> => {
    const [items, ledger] = await Promise.all([db.stockItems.toArray(), db.ledger.toArray()])
    ledger.sort((a, b) => a.txnNo.localeCompare(b.txnNo))
    const problems: LedgerCheck['problems'] = []
    const last = new Map<string, string>()
    const bal = new Map<string, { q: number; w: ReturnType<typeof D> }>()
    for (const e of ledger) {
      last.set(e.stockItemId, e.statusTo)
      const b = bal.get(e.productId) ?? { q: 0, w: D(0) }
      b.q += e.qtyIn - e.qtyOut
      b.w = b.w.plus(e.weightIn).minus(e.weightOut)
      bal.set(e.productId, b)
    }
    for (const i of items) {
      const l = last.get(i.id)
      if (!l) problems.push({ stockItemId: i.id, itemCode: i.itemCode, problem: 'No ledger history for this item' })
      else if (l !== i.status) problems.push({ stockItemId: i.id, itemCode: i.itemCode, problem: `Item status “${i.status}” differs from ledger status “${l}”` })
    }
    const productIds = new Set([...items.map((i) => i.productId), ...bal.keys()])
    const productBalances = [...productIds].map((productId) => {
      const av = items.filter((i) => i.productId === productId && i.status === 'available')
      const b = bal.get(productId) ?? { q: 0, w: D(0) }
      const w = weight(av.reduce((s, i) => s.plus(i.netWeight), D(0)))
      const lw = weight(b.w)
      return { productId, available: av.length, ledger: b.q, weightAvailable: w, weightLedger: lw, ok: av.length === b.q && D(w).equals(lw) }
    })
    return { ok: !problems.length && productBalances.every((p) => p.ok), checkedItems: items.length, problems, productBalances }
  },
}
