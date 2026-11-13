import { D, Decimal, money } from '@/domain/calculations/decimal'
import { paidAgainst, purchaseOutstanding, repairOutstanding, saleOutstanding, unallocatedAmount } from '@/domain/calculations/ledger'
import { invoiceTotals, priceItem } from '@/domain/calculations/pricing'
import { sellBlockReason } from '@/domain/workflows/rules'
import type { ErpCommands, RecordPaymentInput } from '@/repositories/interfaces'
import type { Payment, PaymentAllocation, PaymentMode, Sale, SaleLine, SaleReturn } from '@/types/entities'
import { db } from '../db'
import { BusinessError, audit, latestRate, moveItem, nextNo, nowIso, requirePerm, stampNew, stampUpdate, uid } from '../ctx'
import { tx } from './stock'

interface PayRowInput {
  direction: 'in' | 'out'
  partyType: 'customer' | 'supplier'
  partyId: string
  mode: PaymentMode
  amount: number
  kind: Payment['kind']
  allocations: PaymentAllocation[]
  reference?: string
  notes?: string
  date?: string
}
/** Insert one payment row (internal helper â€“ always called inside a transaction). */
export async function insertPayment(p: PayRowInput): Promise<Payment> {
  if (!(p.amount > 0)) throw new BusinessError('Payment amount must be greater than zero.')
  const allocated = p.allocations.reduce((s, a) => s.plus(a.amount), D(0))
  if (allocated.gt(p.amount)) throw new BusinessError('Allocated amount exceeds the payment amount.')
  const pay: Payment = stampNew({
    id: uid(), paymentNo: await nextNo('payment', p.direction === 'in' ? 'RCP-' : 'PAY-', 5), date: p.date ?? nowIso(),
    direction: p.direction, partyType: p.partyType, partyId: p.partyId, mode: p.mode, amount: money(p.amount), kind: p.kind,
    reference: p.reference, notes: p.notes, allocations: p.allocations.map((a) => ({ ...a, amount: money(a.amount) })), status: 'posted' as const,
  })
  await db.payments.add(pay)
  return pay
}

export const sales: ErpCommands['sales'] = {
  create: (input) =>
    tx(async () => {
      requirePerm('sales.create')
      if (!input.items.length) throw new BusinessError('Add at least one item to the bill.')
      const ids = input.items.map((i) => i.stockItemId)
      if (new Set(ids).size !== ids.length) throw new BusinessError('The same item appears twice on the bill.')
      const settings = await db.settings.get('main')
      const date = input.date ?? nowIso()
      const customer = input.customerId ? await db.customers.get(input.customerId) : undefined
      if (input.customerId && !customer) throw new BusinessError('Selected customer not found.')

      const lines: SaleLine[] = []
      for (const inp of input.items) {
        const item = await db.stockItems.get(inp.stockItemId)
        if (!item) throw new BusinessError('An item on the bill no longer exists.')
        const block = sellBlockReason(item)
        if (block) throw new BusinessError(`Cannot bill: ${block}.`)
        const product = await db.products.get(item.productId)
        const purity = await db.purities.get(item.purityId)
        if (!product || !purity) throw new BusinessError(`${item.itemCode}: product or purity master data missing.`)
        const rate = product.pricingMode === 'fixed_price' ? { ratePerGram: 0 } : await latestRate(item.metalId, item.purityId, date)
        const discount = money(inp.discount ?? 0)
        if (discount < 0) throw new BusinessError('Discount cannot be negative.')
        const price = priceItem({
          pricingMode: product.pricingMode, fixedPrice: product.fixedPrice, netWeight: item.netWeight, ratePerGram: rate.ratePerGram,
          makingType: product.makingType, makingValue: product.makingValue, wastageType: product.wastageType, wastageValue: product.wastageValue,
          stoneCharge: product.stoneCharge, discount, gstPercent: product.gstPercent ?? settings?.defaultGstPercent ?? 3,
        })
        if (D(discount).gt(D(price.metalValue).plus(price.wastageValue).plus(price.makingValue).plus(price.stoneCharge))) throw new BusinessError(`${item.itemCode}: discount exceeds item value.`)
        lines.push({
          stockItemId: item.id, barcode: item.barcode, itemCode: item.itemCode, productId: product.id, name: product.name, metalId: item.metalId,
          purityId: item.purityId, purityLabel: purity.label, grossWeight: item.grossWeight, stoneWeight: item.stoneWeight, netWeight: item.netWeight,
          ratePerGram: rate.ratePerGram, pricingMode: product.pricingMode, ...price, gstPercent: product.gstPercent, hsn: product.hsn,
          huid: item.huid ?? '', costPrice: item.costPrice,
        })
      }
      const totals = invoiceTotals(lines)
      const advance = money(input.advanceAdjust ?? 0)
      const cash = input.payments.filter((p) => p.amount > 0)
      const paidNow = D(advance).plus(cash.reduce((s, p) => s.plus(p.amount), D(0)))
      if (paidNow.gt(totals.total)) throw new BusinessError('Payments exceed the invoice total.')
      if (!customer && !paidNow.equals(totals.total)) throw new BusinessError('Walk-in customers must pay the full amount. Select a customer to bill on credit.')
      if (advance > 0) {
        if (!customer) throw new BusinessError('Advance can only be adjusted for a registered customer.')
        const pays = await db.payments.where('partyId').equals(customer.id).toArray()
        if (D(advance).gt(unallocatedAmount(pays, 'customer', customer.id))) throw new BusinessError('Advance adjustment exceeds the customerâ€™s available advance.')
      }

      const sale: Sale = stampNew({
        id: uid(), invoiceNo: await nextNo('invoice', `${settings?.invoicePrefix ?? 'INV'}-`, 5), date, customerId: customer?.id ?? null,
        customerName: customer?.name ?? (input.walkInName?.trim() || 'Walk-in Customer'), customerPhone: customer?.phone ?? input.walkInPhone ?? '',
        branchId: input.branchId, branchName: settings?.branches?.find((b) => b.id === input.branchId)?.name,
        status: 'completed' as const, lines, ...totals, returnedValue: 0, notes: input.notes,
      })
      await db.sales.add(sale)
      for (const l of lines) {
        const item = (await db.stockItems.get(l.stockItemId))!
        await moveItem(item, 'sold', { reason: `Sold on ${sale.invoiceNo}`, ref: { type: 'sale', id: sale.id, no: sale.invoiceNo } })
      }
      const partyId = customer?.id ?? 'walk-in'
      const alloc = (amount: number): PaymentAllocation[] => [{ docType: 'sale', docId: sale.id, docNo: sale.invoiceNo, amount }]
      for (const p of cash) await insertPayment({ direction: 'in', partyType: 'customer', partyId, mode: p.mode, amount: p.amount, kind: 'receipt', allocations: alloc(p.amount), reference: p.reference, date, notes: `Payment for ${sale.invoiceNo}` })
      if (advance > 0 && customer) await consumeAdvance(customer.id, advance, { docType: 'sale', docId: sale.id, docNo: sale.invoiceNo })
      await audit('create', 'sale', sale.id, `${sale.invoiceNo} issued: ${lines.length} item(s), total ${sale.total}`)
      return sale
    }),

  cancel: (id, reason) =>
    tx(async () => {
      requirePerm('sales.cancel')
      if (!reason.trim()) throw new BusinessError('A cancellation reason is required.')
      const sale = await db.sales.get(id)
      if (!sale) throw new BusinessError('Invoice not found.')
      if (sale.status === 'cancelled') throw new BusinessError('Invoice is already cancelled.')
      if (sale.returnedValue > 0) throw new BusinessError('Items were already returned against this invoice; cancel is not allowed.')
      const partyId = sale.customerId ?? 'walk-in'
      const pays = await db.payments.where('partyId').equals(partyId).toArray()
      for (const p of pays) {
        if (p.status === 'void' || p.direction !== 'in') continue
        const mine = p.allocations.filter((a) => a.docType === 'sale' && a.docId === id)
        if (!mine.length) continue
        const amt = mine.reduce((s, a) => s.plus(a.amount), D(0))
        if (p.kind === 'advance' || p.allocations.length > 1) {
          // Money that came from a shared receipt / customer advance goes back to the customer's advance pool.
          await db.payments.put({ ...p, allocations: p.allocations.filter((a) => !(a.docType === 'sale' && a.docId === id)), ...stampUpdate() })
        } else {
          await insertPayment({ direction: 'out', partyType: 'customer', partyId, mode: p.mode, amount: amt.toNumber(), kind: 'refund', allocations: [{ docType: 'sale', docId: id, docNo: sale.invoiceNo, amount: amt.toNumber() }], notes: `Refund â€“ ${sale.invoiceNo} cancelled` })
        }
      }
      for (const l of sale.lines) {
        const item = await db.stockItems.get(l.stockItemId)
        if (item && item.status === 'sold') await moveItem(item, 'available', { reason: `Invoice ${sale.invoiceNo} cancelled: ${reason}`, ref: { type: 'sale_cancel', id, no: sale.invoiceNo } })
      }
      const u: Sale = { ...sale, status: 'cancelled', cancelReason: reason, cancelledAt: nowIso(), ...stampUpdate() }
      await db.sales.put(u)
      await audit('cancel', 'sale', id, `${sale.invoiceNo} cancelled: ${reason}`)
      return u
    }),

  returnItems: (input) =>
    tx(async () => {
      requirePerm('sales.return')
      if (!input.itemIds.length) throw new BusinessError('Select at least one item to return.')
      if (!input.reason.trim()) throw new BusinessError('A return reason is required.')
      const sale = await db.sales.get(input.saleId)
      if (!sale || sale.status === 'cancelled') throw new BusinessError('Invoice not found or cancelled.')
      const lines = sale.lines.map((l) => ({ ...l }))
      let value = D(0)
      for (const id of input.itemIds) {
        const l = lines.find((x) => x.stockItemId === id)
        if (!l) throw new BusinessError('Item is not on this invoice.')
        if (l.returned) throw new BusinessError(`${l.itemCode} was already returned.`)
        l.returned = true
        value = value.plus(l.amount)
      }
      // returning the last remaining lines settles the invoice exactly (absorbs the stored round-off)
      if (lines.every((l) => l.returned)) value = D(sale.total).minus(sale.returnedValue)
      const pays = await db.payments.where('partyId').equals(sale.customerId ?? 'walk-in').toArray()
      const paid = D(paidAgainst(pays, 'sale', sale.id))
      const newNet = D(sale.total).minus(sale.returnedValue).minus(value)
      const refund = paid.minus(newNet).gt(0) ? money(paid.minus(newNet)) : 0
      const ret: SaleReturn = stampNew({
        id: uid(), returnNo: await nextNo('return', 'SR-', 5), saleId: sale.id, invoiceNo: sale.invoiceNo, date: nowIso(), itemIds: input.itemIds,
        value: money(value), refund, refundMode: input.refundMode, reason: input.reason,
      })
      await db.saleReturns.add(ret)
      for (const id of input.itemIds) {
        const item = await db.stockItems.get(id)
        if (item) await moveItem(item, 'returned', { reason: `Return ${ret.returnNo}: ${input.reason}`, ref: { type: 'sale_return', id: ret.id, no: ret.returnNo } })
      }
      if (refund > 0)
        await insertPayment({ direction: 'out', partyType: 'customer', partyId: sale.customerId ?? 'walk-in', mode: input.refundMode, amount: refund, kind: 'refund', allocations: [{ docType: 'sale', docId: sale.id, docNo: sale.invoiceNo, amount: refund }], notes: `Refund for ${ret.returnNo}` })
      await db.sales.put({ ...sale, lines, returnedValue: money(D(sale.returnedValue).plus(value)), ...stampUpdate() })
      await audit('return', 'sale', sale.id, `${ret.returnNo}: ${input.itemIds.length} item(s) returned, refund ${refund}`)
      return ret
    }),
}

/** Draw `amount` from the customer's unallocated receipts (oldest first) and allocate it to a document. */
async function consumeAdvance(customerId: string, amount: number, doc: { docType: 'sale' | 'repair'; docId: string; docNo: string }) {
  const pays = (await db.payments.where('partyId').equals(customerId).toArray())
    .filter((p) => p.status === 'posted' && p.direction === 'in')
    .sort((a, b) => a.date.localeCompare(b.date))
  let left = D(amount)
  for (const p of pays) {
    if (left.lte(0)) break
    const free = D(p.amount).minus(p.allocations.reduce((s, a) => s.plus(a.amount), D(0)))
    if (free.lte(0)) continue
    const take = Decimal.min(free, left)
    await db.payments.put({ ...p, allocations: [...p.allocations, { ...doc, amount: take.toNumber() }], ...stampUpdate() })
    left = left.minus(take)
  }
  if (left.gt(0)) throw new BusinessError('Not enough advance available.')
}

export const payments: ErpCommands['payments'] = {
  record: (input: RecordPaymentInput) =>
    tx(async () => {
      requirePerm('payments.manage')
      if (!(input.amount > 0)) throw new BusinessError('Enter an amount greater than zero.')
      const isCustomer = input.partyType === 'customer'
      const party = isCustomer ? await db.customers.get(input.partyId) : await db.suppliers.get(input.partyId)
      if (!party) throw new BusinessError('Party not found.')
      const allPays = await db.payments.where('partyId').equals(input.partyId).toArray()
      const docs: { docType: 'sale' | 'purchase' | 'repair'; docId: string; docNo: string; outstanding: number; date: string }[] = []
      if (isCustomer) {
        for (const s of await db.sales.where('customerId').equals(input.partyId).toArray()) docs.push({ docType: 'sale', docId: s.id, docNo: s.invoiceNo, outstanding: saleOutstanding(s, allPays), date: s.date })
        for (const r of await db.repairs.where('customerId').equals(input.partyId).toArray()) docs.push({ docType: 'repair', docId: r.id, docNo: r.jobNo, outstanding: repairOutstanding(r, allPays), date: r.createdAt })
      } else {
        for (const po of await db.purchaseOrders.where('supplierId').equals(input.partyId).toArray()) docs.push({ docType: 'purchase', docId: po.id, docNo: po.poNumber, outstanding: purchaseOutstanding(po, allPays), date: po.date })
      }
      let allocations: PaymentAllocation[] = []
      if (input.allocations?.length) {
        for (const a of input.allocations) {
          const d = docs.find((x) => x.docId === a.docId && x.docType === a.docType)
          if (!d) throw new BusinessError('Allocation references an unknown document.')
          if (D(a.amount).gt(d.outstanding)) throw new BusinessError(`${d.docNo}: amount exceeds outstanding balance of ${d.outstanding.toFixed(2)}.`)
          allocations.push({ ...a, docNo: d.docNo })
        }
      } else if (input.autoAllocate && input.kind !== 'advance') {
        let left = D(input.amount)
        for (const d of docs.filter((x) => x.outstanding > 0).sort((a, b) => a.date.localeCompare(b.date))) {
          if (left.lte(0)) break
          const take = Decimal.min(left, d.outstanding)
          allocations.push({ docType: d.docType, docId: d.docId, docNo: d.docNo, amount: take.toNumber() })
          left = left.minus(take)
        }
      }
      allocations = allocations.filter((a) => a.amount > 0)
      const allocated = allocations.reduce((s, a) => s.plus(a.amount), D(0))
      if (allocated.gt(input.amount)) throw new BusinessError('Allocated amount exceeds payment amount.')
      const pay = await insertPayment({ ...input, allocations })
      // supplier payments may complete a received purchase
      for (const a of allocations.filter((x) => x.docType === 'purchase')) {
        const po = await db.purchaseOrders.get(a.docId)
        if (po && po.status === 'received') {
          const all = await db.payments.where('partyId').equals(po.supplierId).toArray()
          if (D(paidAgainst(all, 'purchase', po.id)).gte(po.total)) await db.purchaseOrders.put({ ...po, status: 'completed', ...stampUpdate() })
        }
      }
      await audit('create', 'payment', pay.id, `${pay.paymentNo} ${pay.direction} ${pay.mode} ${pay.amount} (${party.name})`)
      return pay
    }),
}

export { consumeAdvance }

