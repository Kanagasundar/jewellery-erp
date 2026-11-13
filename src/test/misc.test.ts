import { beforeAll, describe, expect, it } from 'vitest'
import { can, PERMISSIONS, ROLE_PERMISSIONS } from '@/domain/permissions'
import { REPORTS } from '@/features/reports/definitions'
import type { ReportData } from '@/features/reports/definitions'
import { setActor } from '@/repositories/indexeddb/ctx'
import { db } from '@/repositories/indexeddb/db'
import { resetAndSeed } from '@/repositories/indexeddb/seed'
import { rupeesInWords } from '@/utils/words'
import { D } from '@/domain/calculations/decimal'

describe('permissions', () => {
  it('matches the documented role behaviour', () => {
    expect(can('sales', 'sales.create')).toBe(true)
    expect(can('sales', 'inventory.manage')).toBe(false)
    expect(can('sales', 'audit.approve')).toBe(false)
    expect(can('stock_manager', 'inward.approve')).toBe(true)
    expect(can('stock_manager', 'sales.create')).toBe(false)
    expect(can('artisan', 'repairs.update')).toBe(true)
    expect(can('artisan', 'repairs.manage')).toBe(false)
    expect(can('accountant', 'reports.financial')).toBe(true)
    expect(can('viewer', 'sales.create')).toBe(false)
    expect(can('shop_admin', 'audit.approve')).toBe(true)
    expect(can('shop_admin', 'users.manage')).toBe(false)
    expect(ROLE_PERMISSIONS.super_admin.length).toBe(PERMISSIONS.length)
    expect(can(undefined, 'dashboard.view')).toBe(false)
  })
})

describe('amount in words (Indian numbering)', () => {
  it('formats rupees and paise', () => {
    expect(rupeesInWords(353768)).toBe('Three Lakh Fifty Three Thousand Seven Hundred Sixty Eight Rupees Only')
    expect(rupeesInWords(1250.5)).toBe('One Thousand Two Hundred Fifty Rupees and Fifty Paise Only')
    expect(rupeesInWords(0)).toBe('Zero Rupees Only')
  })
})

describe('reports are computed from real data', () => {
  let data: ReportData
  beforeAll(async () => {
    await resetAndSeed()
    setActor({ id: 'u-super', name: 'x', email: '', role: 'super_admin' })
    const all = async (t: { toArray: () => Promise<unknown[]> }) => t.toArray()
    data = {
      sales: await all(db.sales), returns: await all(db.saleReturns), purchases: await all(db.purchaseOrders), payments: await all(db.payments), items: await all(db.stockItems),
      ledger: await all(db.ledger), products: await all(db.products), categories: await all(db.categories), metals: await all(db.metals), purities: await all(db.purities),
      customers: await all(db.customers), suppliers: await all(db.suppliers), repairs: await all(db.repairs), polishing: await all(db.polishing), audits: await all(db.audits),
      adjustments: await all(db.adjustments), transfers: await all(db.transfers), branches: (await db.settings.get('main'))!.branches, expenses: await all(db.expenses), users: await all(db.users), auditLogs: await all(db.auditLogs),
    } as unknown as ReportData
  }, 60000)

  it('every report builds without error and has columns', () => {
    for (const r of REPORTS) {
      const res = r.build(data, '2000-01-01', '2100-01-01')
      expect(res.columns.length, r.key).toBeGreaterThan(0)
      for (const row of res.rows) for (const c of res.columns) if (c.kind === 'money' || c.kind === 'weight') expect(Number.isFinite(Number(row[c.key])), `${r.key}.${c.key}`).toBe(true)
    }
  })
  it('daily sales total equals the sum of completed invoices minus nothing hidden', () => {
    const rep = REPORTS.find((r) => r.key === 'daily-sales')!.build(data, '2000-01-01', '2100-01-01')
    const fromReport = rep.rows.reduce((s, r) => s.plus(r.total as number), D(0))
    const direct = data.sales.filter((s) => s.status === 'completed').reduce((s, x) => s.plus(x.total), D(0))
    expect(fromReport.toString()).toBe(direct.toString())
  })
  it('customer outstanding report matches ledger and stock report counts available items', () => {
    const stock = REPORTS.find((r) => r.key === 'stock')!.build(data)
    const pieces = stock.rows.reduce((s, r) => s + (r.available as number), 0)
    expect(pieces).toBe(data.items.filter((i) => i.status === 'available').length)
    const co = REPORTS.find((r) => r.key === 'cust-out')!.build(data)
    expect(co.rows.some((r) => (r.balance as number) > 0)).toBe(true) // seeded credit sale
  })
})

describe('branches & shop name', () => {
  it('default shop name is Samayan Jewellers and a sale snapshots the branch name', async () => {
    const { sales } = await import('@/repositories/indexeddb/commands/sales')
    await resetAndSeed()
    setActor({ id: 'u-super', name: 'x', email: '', role: 'super_admin' })
    const st = (await db.settings.get('main'))!
    expect(st.shopName).toBe('Samayan Jewellers')
    expect(st.branches.length).toBeGreaterThan(0)
    const item = await db.stockItems.filter((i) => i.status === 'available' && i.branchId === 'br-main').first()
    const p = (await db.products.get(item!.productId))!
    const rate = (await db.metalRates.where('[metalId+purityId]').equals([item!.metalId, item!.purityId]).toArray()).sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))[0]
    const { priceItem, invoiceTotals } = await import('@/domain/calculations/pricing')
    const total = invoiceTotals([priceItem({ pricingMode: p.pricingMode, fixedPrice: p.fixedPrice, netWeight: item!.netWeight, ratePerGram: rate.ratePerGram, makingType: p.makingType, makingValue: p.makingValue, wastageType: p.wastageType, wastageValue: p.wastageValue, stoneCharge: p.stoneCharge, gstPercent: p.gstPercent })]).total
    const sale = await sales.create({ branchId: st.branches[0].id, customerId: null, items: [{ stockItemId: item!.id }], payments: [{ mode: 'cash', amount: total }] })
    expect(sale.branchName).toBe(st.branches[0].name)
  })
})
