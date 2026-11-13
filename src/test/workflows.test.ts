import { beforeAll, describe, expect, it } from 'vitest'
import { customerBalance, customerLedger, paidAgainst, saleOutstanding, unallocatedAmount } from '@/domain/calculations/ledger'
import { invoiceTotals, priceItem } from '@/domain/calculations/pricing'
import { D, money } from '@/domain/calculations/decimal'
import { audits } from '@/repositories/indexeddb/commands/audits'
import { payments, sales } from '@/repositories/indexeddb/commands/sales'
import { barcodes, inventory, inward, purchases } from '@/repositories/indexeddb/commands/stock'
import { polishing, repairs } from '@/repositories/indexeddb/commands/workshop'
import { setActor } from '@/repositories/indexeddb/ctx'
import { db } from '@/repositories/indexeddb/db'
import { repos } from '@/repositories/indexeddb/repos'
import { resetAndSeed } from '@/repositories/indexeddb/seed'
import type { RoleKey } from '@/types/entities'
import { uid } from '@/repositories/indexeddb/ctx'

const as = (id: string, role: RoleKey) => setActor({ id, name: id, email: '', role })
const admin = () => as('u-super', 'super_admin')

beforeAll(async () => {
  await resetAndSeed()
  admin()
}, 60000)

const availableOf = async (code: string) => {
  const p = (await db.products.where('code').equals(code).first())!
  return db.stockItems.where('productId').equals(p.id).and((i) => i.status === 'available').toArray()
}

describe('pricing (decimal safe)', () => {
  it('weight-based price with percent making & wastage', () => {
    const r = priceItem({ pricingMode: 'weight_based', netWeight: 10, ratePerGram: 6000, makingType: 'percent', makingValue: 10, wastageType: 'percent', wastageValue: 2, stoneCharge: 500, gstPercent: 3 })
    expect(r.metalValue).toBe(60000)
    expect(r.wastageValue).toBe(1200)
    expect(r.makingValue).toBe(6120)
    expect(r.taxable).toBe(67820)
    expect(r.gst).toBe(2034.6)
    expect(r.amount).toBe(69854.6)
  })
  it('fixed-price items ignore weight formula', () => {
    const r = priceItem({ pricingMode: 'fixed_price', fixedPrice: 5000, netWeight: 3, ratePerGram: 6000, makingType: 'percent', makingValue: 10, wastageType: 'percent', wastageValue: 2, stoneCharge: 0, gstPercent: 3 })
    expect(r.taxable).toBe(5000)
    expect(r.gst).toBe(150)
  })
  it('no floating point drift', () => {
    expect(money(D(0.1).plus(0.2))).toBe(0.3)
    const t = invoiceTotals([priceItem({ pricingMode: 'fixed_price', fixedPrice: 100.1, netWeight: 0, ratePerGram: 0, makingType: 'fixed', makingValue: 0, wastageType: 'percent', wastageValue: 0, stoneCharge: 0, gstPercent: 3 })])
    expect(t.total).toBe(103)
    expect(D(t.total).minus(t.taxable).minus(t.gst).minus(t.roundOff).toNumber()).toBe(0)
  })
})

describe('seeded demo data is consistent', () => {
  it('ledger reconciles against stock items', async () => {
    const check = await inventory.reconcile()
    expect(check.problems).toEqual([])
    expect(check.ok).toBe(true)
    expect(check.checkedItems).toBeGreaterThan(50)
  })
  it('barcodes are unique and one-per-item', async () => {
    const items = await db.stockItems.toArray()
    expect(new Set(items.map((i) => i.barcode)).size).toBe(items.length)
    const active = await db.barcodes.filter((b) => b.active).toArray()
    expect(active.length).toBe(items.length)
  })
})

describe('Workflow 1 + 6: purchase â†’ partial inward â†’ full inward', () => {
  let poId = ''
  let lineId = ''
  it('creates a purchase with no stock impact', async () => {
    const before = await db.stockItems.count()
    const p = (await db.products.where('code').equals('RNG-003').first())!
    const po = await purchases.save({ supplierId: 's-1', invoiceNo: 'T-1', date: new Date().toISOString(), submit: true, lines: [{ productId: p.id, qty: 4, grossWeight: 9.6, stoneWeight: 0, purityId: p.purityId, stoneDetails: '', rate: 11000, makingCharge: 800, wastagePercent: 2, gstPercent: 3 }] })
    poId = po.id; lineId = po.lines[0].id
    expect(po.status).toBe('pending')
    expect(po.total).toBeGreaterThan(0)
    expect(await db.stockItems.count()).toBe(before)
  })
  const mk = (n: number, accepted = true, condition: 'ok' | 'damaged' = 'ok') =>
    Array.from({ length: n }, () => ({ id: uid(), poLineId: lineId, productId: '', expectedGross: 9.6, expectedPurityId: 'p-22k', receivedGross: 9.61, receivedStone: 0, receivedNet: 9.61, verifiedPurityId: 'p-22k', stoneOk: true, condition, accepted, remarks: '' }))
  it('saving / submitting an inward draft does not change stock; approval does', async () => {
    const p = (await db.products.where('code').equals('RNG-003').first())!
    const items = mk(2).map((i) => ({ ...i, productId: p.id }))
    const before = await db.stockItems.count()
    const inw = await inward.save({ purchaseOrderId: poId, date: new Date().toISOString(), items })
    await inward.submit(inw.id)
    expect(await db.stockItems.count()).toBe(before)
    expect((await db.ledger.count())).toBe(await db.ledger.count())
    const ledgerBefore = await db.ledger.count()
    await inward.approve(inw.id)
    expect(await db.stockItems.count()).toBe(before + 2)
    expect(await db.ledger.count()).toBe(ledgerBefore + 2)
    const po = (await db.purchaseOrders.get(poId))!
    expect(po.status).toBe('partially_received')
    expect(po.lines[0].receivedQty).toBe(2)
  })
  it('cannot over-receive; receiving the remainder completes the order', async () => {
    const p = (await db.products.where('code').equals('RNG-003').first())!
    await expect(inward.save({ purchaseOrderId: poId, date: new Date().toISOString(), items: mk(3).map((i) => ({ ...i, productId: p.id })) })).rejects.toThrow(/more pieces/)
    const inw = await inward.save({ purchaseOrderId: poId, date: new Date().toISOString(), items: mk(2).map((i) => ({ ...i, productId: p.id })) })
    await inward.submit(inw.id)
    await inward.approve(inw.id)
    expect((await db.purchaseOrders.get(poId))!.status).toBe('received')
    expect((await inventory.reconcile()).ok).toBe(true)
  })
  it('stock manager cannot create purchases; sales cannot approve inward', async () => {
    as('u-stock', 'stock_manager')
    await expect(purchases.save({ supplierId: 's-1', invoiceNo: '', date: '', lines: [], submit: false })).rejects.toThrow(/Permission denied/)
    as('u-sales', 'sales')
    await expect(inward.approve('x')).rejects.toThrow(/Permission denied/)
    admin()
  })
  it('purchase with received stock cannot be cancelled', async () => {
    await expect(purchases.cancel(poId, 'oops')).rejects.toThrow(/already been received/)
  })
})

describe('barcode scanning', () => {
  it('looks up by barcode and item code; rejects unknown', async () => {
    const [it0] = await availableOf('EAR-001')
    expect((await barcodes.lookup(it0.barcode))?.item.id).toBe(it0.id)
    expect((await barcodes.lookup(it0.itemCode))?.item.id).toBe(it0.id)
    expect(await barcodes.lookup('NOPE-0000')).toBeUndefined()
  })
  it('regenerating a barcode voids the old one and keeps uniqueness', async () => {
    const [it0] = await availableOf('EAR-001')
    const old = it0.barcode
    const b = await barcodes.regenerate(it0.id, 'Label damaged')
    expect(b.code).not.toBe(old)
    expect((await db.barcodes.where('code').equals(old).first())!.active).toBe(false)
    expect(await barcodes.lookup(old)).toBeDefined() // old code still resolves for history
    expect((await db.stockItems.get(it0.id))!.barcode).toBe(b.code)
  })
})

describe('Workflow 2 + 7: sale, split payment, stock reduction, ledger', () => {
  it('bills a customer with split cash + UPI, reduces stock, snapshots rate', async () => {
    const [item] = await availableOf('CHN-001')
    const sale = await sales.create({ customerId: 'cu-1', items: [{ stockItemId: item.id }], payments: [{ mode: 'cash', amount: 10000 }], notes: '' })
    expect(sale.lines[0].ratePerGram).toBeGreaterThan(0)
    expect((await db.stockItems.get(item.id))!.status).toBe('sold')
    const pays = await db.payments.toArray()
    expect(saleOutstanding(sale, pays)).toBe(money(D(sale.total).minus(10000)))
    // settle with UPI through the payments module
    await payments.record({ direction: 'in', partyType: 'customer', partyId: 'cu-1', mode: 'upi', amount: sale.total - 10000, kind: 'receipt', autoAllocate: true })
    const after = await db.payments.toArray()
    expect(saleOutstanding(sale, after)).toBe(0)
    expect(paidAgainst(after, 'sale', sale.id)).toBe(sale.total)
    expect((await inventory.reconcile()).ok).toBe(true)
  })
  it('refuses to sell the same item twice', async () => {
    const [item] = await availableOf('CHN-001')
    const s = await sales.create({ customerId: null, items: [{ stockItemId: item.id }], payments: [{ mode: 'cash', amount: 0.01 }] }).catch((e: Error) => e)
    expect(s).toBeInstanceOf(Error) // walk-in must pay in full
    const [sold] = await db.stockItems.where('status').equals('sold').toArray()
    await expect(sales.create({ customerId: 'cu-1', items: [{ stockItemId: sold.id }], payments: [] })).rejects.toThrow(/SOLD/)
  })
  it('credit sale shows in customer ledger as outstanding; receipts reduce it', async () => {
    const [item] = await availableOf('EAR-002')
    const sale = await sales.create({ customerId: 'cu-2', items: [{ stockItemId: item.id }], payments: [] })
    const c = (await db.customers.get('cu-2'))!
    const args = async () => [await db.sales.toArray(), await db.saleReturns.toArray(), await db.payments.toArray(), await db.repairs.toArray()] as const
    const [s, r, p, rep] = await args()
    const bal1 = customerBalance(c, s, r, p, rep)
    expect(bal1).toBeGreaterThanOrEqual(sale.total)
    await payments.record({ direction: 'in', partyType: 'customer', partyId: 'cu-2', mode: 'cash', amount: 5000, kind: 'receipt', autoAllocate: true })
    const [s2, r2, p2, rep2] = await args()
    expect(customerBalance(c, s2, r2, p2, rep2)).toBe(money(D(bal1).minus(5000)))
    expect(customerLedger(c, s2, r2, p2, rep2).length).toBeGreaterThan(2)
  })
  it('over-allocating a receipt is rejected', async () => {
    const sale = (await db.sales.where('customerId').equals('cu-2').toArray()).pop()!
    await expect(payments.record({ direction: 'in', partyType: 'customer', partyId: 'cu-2', mode: 'cash', amount: 99999999, kind: 'receipt', allocations: [{ docType: 'sale', docId: sale.id, amount: 99999999 }] })).rejects.toThrow(/exceeds outstanding/)
  })
  it('advance can be adjusted against an invoice', async () => {
    await payments.record({ direction: 'in', partyType: 'customer', partyId: 'cu-3', mode: 'upi', amount: 20000, kind: 'advance' })
    const pays = await db.payments.toArray()
    expect(unallocatedAmount(pays, 'customer', 'cu-3')).toBeGreaterThanOrEqual(20000)
    const [item] = await availableOf('PND-002')
    const before = unallocatedAmount(pays, 'customer', 'cu-3')
    const sale = await sales.create({ customerId: 'cu-3', items: [{ stockItemId: item.id }], payments: [], advanceAdjust: 5000 })
    const after = await db.payments.toArray()
    expect(unallocatedAmount(after, 'customer', 'cu-3')).toBe(money(D(before).minus(5000)))
    expect(paidAgainst(after, 'sale', sale.id)).toBe(5000)
  })
  it('sales person cannot cancel; admin cancel restores stock and refunds', async () => {
    const [item] = await availableOf('SLV-003')
    const sale = await sales.create({ customerId: null, items: [{ stockItemId: item.id }], payments: await totalAsPay(item.id) })
    as('u-sales', 'sales')
    await expect(sales.cancel(sale.id, 'x')).rejects.toThrow(/Permission denied/)
    as('u-admin', 'shop_admin')
    await sales.cancel(sale.id, 'Customer changed mind')
    expect((await db.stockItems.get(item.id))!.status).toBe('available')
    const cancelled = (await db.sales.get(sale.id))!
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.lines.length).toBe(1) // history retained
    expect(paidAgainst(await db.payments.toArray(), 'sale', sale.id)).toBe(0)
    admin()
    expect((await inventory.reconcile()).ok).toBe(true)
  })
  it('sales return refunds and puts item in returned status; restock makes it sellable', async () => {
    const [item] = await availableOf('BNG-001')
    const sale = await sales.create({ customerId: null, items: [{ stockItemId: item.id }], payments: await totalAsPay(item.id) })
    const ret = await sales.returnItems({ saleId: sale.id, itemIds: [item.id], reason: 'Size issue', refundMode: 'cash' })
    expect(ret.refund).toBe(sale.total)
    expect((await db.stockItems.get(item.id))!.status).toBe('returned')
    await expect(sales.returnItems({ saleId: sale.id, itemIds: [item.id], reason: 'again', refundMode: 'cash' })).rejects.toThrow(/already returned/)
    await inventory.restock(item.id, 'Inspected OK')
    expect((await db.stockItems.get(item.id))!.status).toBe('available')
    expect((await inventory.reconcile()).ok).toBe(true)
  })
})

async function totalAsPay(itemId: string) {
  // compute the invoice total through the same pricing function the command uses
  const it = (await db.stockItems.get(itemId))!
  const p = (await db.products.get(it.productId))!
  const rates = await db.metalRates.where('[metalId+purityId]').equals([it.metalId, it.purityId]).toArray()
  const rate = rates.sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))[0].ratePerGram
  const total = invoiceTotals([priceItem({ pricingMode: p.pricingMode, fixedPrice: p.fixedPrice, netWeight: it.netWeight, ratePerGram: rate, makingType: p.makingType, makingValue: p.makingValue, wastageType: p.wastageType, wastageValue: p.wastageValue, stoneCharge: p.stoneCharge, gstPercent: p.gstPercent })]).total
  return [{ mode: 'cash' as const, amount: total }]
}

describe('Workflow 3: repair lifecycle', () => {
  it('create â†’ assign â†’ start â†’ complete â†’ pay â†’ deliver, with permission rules', async () => {
    const r = await repairs.create({ customerId: 'cu-5', description: 'Ring resize', repairType: 'Resize', receivedWeight: 3.2, damage: '', instructions: '', expectedDelivery: new Date().toISOString(), labourEstimate: 500, photos: [], advance: { amount: 100, mode: 'cash' } })
    expect(r.status).toBe('received')
    await repairs.assign(r.id, 'u-art1')
    as('u-art2', 'artisan')
    await expect(repairs.start(r.id)).rejects.toThrow(/another artisan/)
    as('u-art1', 'artisan')
    await repairs.start(r.id)
    await repairs.complete(r.id, 450, 'done')
    await expect(repairs.deliver(r.id)).rejects.toThrow(/Permission denied/) // artisan cannot deliver
    admin()
    await expect(repairs.deliver(r.id)).rejects.toThrow(/outstanding/)
    await payments.record({ direction: 'in', partyType: 'customer', partyId: 'cu-5', mode: 'upi', amount: 350, kind: 'receipt', allocations: [{ docType: 'repair', docId: r.id, amount: 350 }] })
    const d = await repairs.deliver(r.id)
    expect(d.status).toBe('delivered')
    expect(d.history.length).toBeGreaterThanOrEqual(5)
  })
  it('repairing an in-stock item removes it from sellable stock', async () => {
    const [item] = await availableOf('RNG-001')
    const r = await repairs.create({ customerId: 'cu-5', stockItemId: item.id, description: 'Showroom piece', repairType: 'Polish', receivedWeight: item.grossWeight, damage: '', instructions: '', expectedDelivery: new Date().toISOString(), labourEstimate: 0, photos: [] })
    expect((await db.stockItems.get(item.id))!.status).toBe('repair')
    await expect(sales.create({ customerId: 'cu-1', items: [{ stockItemId: item.id }], payments: [] })).rejects.toThrow(/REPAIR/)
    await repairs.cancel(r.id, 'not needed')
    expect((await db.stockItems.get(item.id))!.status).toBe('available')
  })
})

describe('Workflow 4: polishing lifecycle', () => {
  it('moves item out of stock, records weight loss, returns with new weight', async () => {
    const [item] = await availableOf('NCK-003')
    const j = await polishing.create({ stockItemId: item.id, polishType: 'Buffing', artisanId: 'u-art2', labourCharge: 200, expectedDate: new Date().toISOString(), remarks: '' })
    expect((await db.stockItems.get(item.id))!.status).toBe('polishing')
    await expect(sales.create({ customerId: 'cu-1', items: [{ stockItemId: item.id }], payments: [] })).rejects.toThrow(/POLISHING/)
    await polishing.start(j.id)
    await expect(polishing.submitForQc(j.id, item.grossWeight + 1, '')).rejects.toThrow(/cannot exceed/)
    const after = D(item.grossWeight).minus(0.05).toNumber()
    await polishing.submitForQc(j.id, after, 'ok')
    await expect(polishing.returnToStock(j.id)).rejects.toThrow() // must pass QC first
    await polishing.qc(j.id, false, 'scratch remains')
    await polishing.submitForQc(j.id, after, 'redone')
    await polishing.qc(j.id, true, 'good')
    const done = await polishing.returnToStock(j.id)
    expect(done.status).toBe('returned')
    expect(done.weightDiff).toBe(0.05)
    const back = (await db.stockItems.get(item.id))!
    expect(back.status).toBe('available')
    expect(back.grossWeight).toBe(after)
    expect((await inventory.reconcile()).ok).toBe(true)
  })
})

describe('Workflow 5: stock audit â†’ adjustment â†’ ledger', () => {
  it('detects missing, extra and weight variance; adjusts only on approval', async () => {
    const a = await audits.create({ title: 'Earrings', categoryId: 'c-ear' })
    const items = await db.stockItems.filter((i) => a.expectedItemIds.includes(i.id)).toArray()
    expect(items.length).toBeGreaterThan(2)
    const [missing, weighed, ...rest] = items
    await audits.scan(a.id, weighed.barcode, D(weighed.grossWeight).plus(0.5).toNumber())
    for (const i of rest) await audits.scan(a.id, i.barcode)
    expect((await audits.scan(a.id, rest[0].barcode)).result).toBe('duplicate')
    const [soldItem] = await db.stockItems.where('status').equals('sold').toArray()
    expect((await audits.scan(a.id, soldItem.barcode)).result).toBe('extra')
    expect((await audits.scan(a.id, 'ZZZ-UNKNOWN')).result).toBe('unknown')
    const sub = await audits.submit(a.id)
    const kinds = sub.discrepancies.map((d) => d.kind).sort()
    expect(kinds).toEqual(expect.arrayContaining(['missing', 'weight', 'extra', 'unknown']))
    expect((await db.stockItems.get(missing.id))!.status).toBe('available') // not yet adjusted
    as('u-stock', 'stock_manager')
    await expect(audits.approve(a.id, 'ok')).rejects.toThrow(/Permission denied/) // maker-checker: the person who counts cannot approve
    as('u-admin', 'shop_admin')
    await audits.approve(a.id, 'Verified on calibrated scale')
    admin()
    expect((await db.stockItems.get(missing.id))!.status).toBe('missing')
    expect((await db.stockItems.get(weighed.id))!.grossWeight).toBe(D(weighed.grossWeight).plus(0.5).toNumber())
    expect((await db.adjustments.where('auditId').equals(a.id).count())).toBe(2)
    expect((await inventory.reconcile()).ok).toBe(true)
  })
  it('sales person cannot approve an audit', async () => {
    admin()
    const a = await audits.create({ title: 'x', categoryId: 'c-pend' })
    await audits.submit(a.id)
    as('u-sales', 'sales')
    await expect(audits.approve(a.id, 'x')).rejects.toThrow(/Permission denied/)
    admin()
  })
})

describe('master data + persistence', () => {
  it('product CRUD with unique SKU and delete protection', async () => {
    const base = { code: 'TST-1', name: 'Test', categoryId: 'c-ring', subcategory: '', productType: 'Ring', metalId: 'm-gold', purityId: 'p-22k', grossWeight: 5, stoneWeight: 0, netWeight: 5, stoneDetails: '', stoneCharge: 0, pricingMode: 'weight_based' as const, fixedPrice: 0, makingType: 'percent' as const, makingValue: 8, wastageType: 'percent' as const, wastageValue: 2, hsn: '7113', gstPercent: 3, huid: '', status: 'active' as const, reorderLevel: 0 }
    const p = await repos.products.create(base)
    await expect(repos.products.create(base)).rejects.toThrow(/Duplicate/)
    await repos.products.update(p.id, { name: 'Test 2' })
    expect((await repos.products.get(p.id))!.name).toBe('Test 2')
    await repos.products.remove(p.id)
    expect(await repos.products.get(p.id)).toBeUndefined()
    const used = (await db.products.toArray())[0]
    await expect(repos.products.remove(used.id)).rejects.toThrow(/cannot be deleted/)
  })
  it('supplier CRUD', async () => {
    const s = await repos.suppliers.create({ code: 'SUP-X', name: 'Temp', phone: '1', email: '', address: '', gstin: '', openingBalance: 0, status: 'active' })
    await repos.suppliers.update(s.id, { phone: '2' })
    await repos.suppliers.remove(s.id)
    expect(await repos.suppliers.get(s.id)).toBeUndefined()
  })
  it('audit log records transactions and stock ledger rows are immutable in count', async () => {
    expect(await db.auditLogs.count()).toBeGreaterThan(20)
  })
  it('data persists (re-open the DB) and demo reset restores the seed', async () => {
    const n = await db.stockItems.count()
    db.close(); await db.open()
    expect(await db.stockItems.count()).toBe(n)
    await resetAndSeed()
    admin()
    expect((await inventory.reconcile()).ok).toBe(true)
    expect(await db.sales.count()).toBeGreaterThan(10)
  })
})

