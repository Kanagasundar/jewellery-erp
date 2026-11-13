import { invoiceTotals, netWeightOf, priceItem } from '@/domain/calculations/pricing'
import type { InwardItem, MakingType, Product, RoleKey, Settings, StockItem, WastageType } from '@/types/entities'
import { clock, daysAgo } from '@/utils/clock'
import { audits } from './commands/audits'
import { payments, sales } from './commands/sales'
import { inward, purchases } from './commands/stock'
import { polishing, repairs } from './commands/workshop'
import { getActor, latestRate, nextNo, setActor, uid } from './ctx'
import { db } from './db'

/** deterministic RNG so every demo reset yields the same story */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SUPER = { id: 'u-super', name: 'Meera Krishnan', email: 'owner@demo.example', role: 'super_admin' as RoleKey }

const USERS: [string, string, string, RoleKey][] = [
  ['u-super', 'Meera Krishnan', 'owner@demo.example', 'super_admin'],
  ['u-admin', 'Arjun Nair', 'admin@demo.example', 'shop_admin'],
  ['u-sales', 'Priya Sharma', 'sales@demo.example', 'sales'],
  ['u-stock', 'Karthik Rao', 'stock@demo.example', 'stock_manager'],
  ['u-purchase', 'Sunil Mehta', 'purchase@demo.example', 'purchase_manager'],
  ['u-art1', 'Ramesh (Goldsmith)', 'ramesh@demo.example', 'artisan'],
  ['u-art2', 'Suresh (Polisher)', 'suresh@demo.example', 'artisan'],
  ['u-acc', 'Lakshmi Iyer', 'accounts@demo.example', 'accountant'],
  ['u-view', 'Guest Viewer', 'viewer@demo.example', 'viewer'],
]

const CATS: [string, string, string[]][] = [
  ['c-ring', 'Rings', ['Solitaire', 'Band', 'Fancy', 'Gents']],
  ['c-neck', 'Necklaces', ['Choker', 'Long Haram', 'Short']],
  ['c-ear', 'Earrings', ['Studs', 'Jhumka', 'Hoops']],
  ['c-bang', 'Bangles & Bracelets', ['Plain', 'Kada', 'Stone']],
  ['c-chain', 'Chains', ['Rope', 'Box', 'Curb']],
  ['c-pend', 'Pendants', ['Religious', 'Fancy']],
  ['c-silver', 'Silverware', ['Articles', 'Coins', 'Anklets']],
]

type P = [code: string, name: string, cat: string, sub: string, type: string, metal: 'G' | 'S', purity: string, gross: number, stone: number, stoneDetails: string, stoneCharge: number, making: MakingType, makingVal: number, wast: WastageType, wastVal: number, supplier: number, reorder: number, fixed?: number]
const PRODUCTS: P[] = [
  ['RNG-001', 'Classic Gold Band Ring', 'c-ring', 'Band', 'Ring', 'G', '22K', 4.2, 0, '', 0, 'percent', 9, 'percent', 2, 0, 2],
  ['RNG-002', 'Solitaire Diamond Ring', 'c-ring', 'Solitaire', 'Ring', 'G', '18K', 3.8, 0.4, 'CZ 0.20 ct', 1800, 'fixed', 3200, 'percent', 1.5, 1, 1],
  ['RNG-003', 'Gents Signet Ring', 'c-ring', 'Gents', 'Ring', 'G', '22K', 9.6, 0, '', 0, 'percent', 8, 'percent', 2, 0, 1],
  ['NCK-001', 'Temple Haram', 'c-neck', 'Long Haram', 'Necklace', 'G', '22K', 38.5, 1.2, 'Ruby & pearl', 3500, 'percent', 11, 'percent', 3, 1, 1],
  ['NCK-002', 'Bridal Choker', 'c-neck', 'Choker', 'Necklace', 'G', '22K', 52.0, 3.0, 'Kemp stones', 4200, 'percent', 12, 'percent', 3.5, 1, 1],
  ['NCK-003', 'Light Short Necklace', 'c-neck', 'Short', 'Necklace', 'G', '22K', 18.4, 0.6, 'CZ', 900, 'percent', 10, 'percent', 2.5, 0, 2],
  ['EAR-001', 'Stud Earrings', 'c-ear', 'Studs', 'Earring', 'G', '22K', 3.2, 0.2, 'CZ', 300, 'percent', 10, 'percent', 2, 0, 3],
  ['EAR-002', 'Antique Jhumka', 'c-ear', 'Jhumka', 'Earring', 'G', '22K', 11.8, 0.8, 'Pearl drops', 600, 'percent', 11, 'percent', 3, 1, 2],
  ['EAR-003', 'Diamond Hoops', 'c-ear', 'Hoops', 'Earring', 'G', '18K', 6.4, 0.5, 'Diamond 0.15 ct', 5200, 'fixed', 3800, 'percent', 1.5, 2, 1],
  ['BNG-001', 'Plain Gold Bangle (Pair)', 'c-bang', 'Plain', 'Bangle', 'G', '22K', 28.0, 0, '', 0, 'percent', 8, 'percent', 2, 0, 2],
  ['BNG-002', 'Kada with Stones', 'c-bang', 'Kada', 'Bangle', 'G', '22K', 21.4, 1.1, 'Coloured stones', 1200, 'percent', 10, 'percent', 2.5, 1, 1],
  ['CHN-001', 'Rope Chain 20"', 'c-chain', 'Rope', 'Chain', 'G', '22K', 14.6, 0, '', 0, 'per_gram', 420, 'percent', 2, 0, 3],
  ['CHN-002', 'Box Chain 18"', 'c-chain', 'Box', 'Chain', 'G', '22K', 10.2, 0, '', 0, 'per_gram', 380, 'percent', 2, 0, 3],
  ['CHN-003', 'Curb Chain 22"', 'c-chain', 'Curb', 'Chain', 'G', '22K', 19.8, 0, '', 0, 'per_gram', 400, 'percent', 2, 2, 2],
  ['PND-001', 'Lakshmi Pendant', 'c-pend', 'Religious', 'Pendant', 'G', '22K', 6.4, 0.3, 'Ruby', 250, 'percent', 12, 'percent', 3, 0, 2],
  ['PND-002', 'Heart Pendant', 'c-pend', 'Fancy', 'Pendant', 'G', '18K', 2.9, 0.2, 'CZ', 150, 'percent', 12, 'percent', 2, 2, 2],
  ['PND-003', 'Om Pendant', 'c-pend', 'Religious', 'Pendant', 'G', '24K', 5.0, 0, '', 0, 'percent', 6, 'percent', 1, 0, 1],
  ['SLV-001', 'Silver Anklet (Pair)', 'c-silver', 'Anklets', 'Anklet', 'S', '925', 48.0, 0, '', 0, 'per_gram', 12, 'percent', 3, 3, 3],
  ['SLV-002', 'Silver Pooja Plate', 'c-silver', 'Articles', 'Utensil', 'S', '925', 120.0, 0, '', 0, 'per_gram', 18, 'percent', 2, 3, 2],
  ['SLV-003', 'Silver Coin 10 g', 'c-silver', 'Coins', 'Coin', 'S', '999', 10.0, 0, '', 0, 'fixed', 60, 'percent', 0, 3, 5],
  ['SLV-004', 'Silver Kada', 'c-silver', 'Articles', 'Bangle', 'S', '925', 36.0, 0, '', 0, 'per_gram', 14, 'percent', 3, 3, 2],
  ['GLD-001', 'Gold Coin 5 g (24K)', 'c-pend', 'Fancy', 'Coin', 'G', '24K', 5.0, 0, '', 0, 'fixed', 450, 'percent', 0, 0, 3],
]

const SUPPLIERS: [string, string, string, string][] = [
  ['Sri Balaji Gold Works', '9840011122', '33AABCS1234F1Z2', 'Sowcarpet, Chennai'],
  ['Mehta Bullion & Jewels', '9820033344', '27AAECM5678K1Z9', 'Zaveri Bazaar, Mumbai'],
  ['Diamond House Surat', '9898055566', '24AAFCD9012L1Z4', 'Varachha Road, Surat'],
  ['Rajasthan Silver Crafts', '9414077788', '08AAGCR3456M1Z1', 'Johari Bazaar, Jaipur'],
]
const CUSTOMERS: [string, string, string][] = [
  ['Lakshmi Venkatesh', '9841100011', 'Anna Nagar, Chennai'],
  ['Rahul Deshmukh', '9822200022', 'Kothrud, Pune'],
  ['Ananya Reddy', '9848300033', 'Jubilee Hills, Hyderabad'],
  ['Mohammed Irfan', '9884400044', 'Mylapore, Chennai'],
  ['Kavitha Subramanian', '9841500055', 'T. Nagar, Chennai'],
  ['Deepak Agarwal', '9811600066', 'Karol Bagh, Delhi'],
  ['Sneha Kulkarni', '9822700077', 'Aundh, Pune'],
  ['Vijay Anand', '9840800088', 'Adyar, Chennai'],
]

// Demo-only market rates (₹/g). Editable under Settings → Metal Rates.
const RATE: Record<string, number> = { '24K': 12150, '22K': 11140, '18K': 9110, '999': 168, '925': 156 }
const DRIFT = [0.93, 0.95, 0.97, 0.985, 1]

const SETTINGS: Settings = {
  id: 'main', shopName: 'Aurum Jewellers', tagline: 'Fine jewellery since 1987', address: '12, Jewellers Row, Demo City – 600 001', phone: '+91 98400 00000',
  gstin: '33AAAAA0000A1Z5 (sample)', defaultGstPercent: 3, invoicePrefix: 'INV', labelSize: 'medium', allowNegativeStock: false,
  showPriceOnLabel: false, weightTolerance: 0.01, branches: [{ id: 'br-main', name: 'Main Showroom' }, { id: 'br-2', name: 'Branch 2 (demo)' }],
}

export async function isSeeded() {
  return !!(await db.meta.get('seeded'))
}

export async function resetAndSeed() {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
  })
  await seedMaster()
  await seedTransactions()
  await db.meta.put({ id: 'seeded', value: new Date().toISOString() })
}

export async function ensureSeeded() {
  if (!(await isSeeded())) await resetAndSeed()
}

async function seedMaster() {
  clock.set(daysAgo(60))
  await db.settings.put(SETTINGS)
  await db.users.bulkAdd(USERS.map(([id, name, email, role]) => ({ id, name, email, role, active: true, isArtisan: role === 'artisan', createdAt: clock.iso(), updatedAt: clock.iso() })))
  await db.categories.bulkAdd(CATS.map(([id, name, subs]) => ({ id, name, code: id.replace('c-', '').toUpperCase(), subcategories: subs, createdAt: clock.iso(), updatedAt: clock.iso() })))
  await db.metals.bulkAdd([
    { id: 'm-gold', name: 'Gold', code: 'AU', createdAt: clock.iso(), updatedAt: clock.iso() },
    { id: 'm-silver', name: 'Silver', code: 'AG', createdAt: clock.iso(), updatedAt: clock.iso() },
  ])
  const pur: [string, string, string, number][] = [
    ['p-24k', 'm-gold', '24K', 999], ['p-22k', 'm-gold', '22K', 916], ['p-18k', 'm-gold', '18K', 750], ['p-999', 'm-silver', '999', 999], ['p-925', 'm-silver', '925', 925],
  ]
  await db.purities.bulkAdd(pur.map(([id, metalId, label, fineness]) => ({ id, metalId, label, fineness, createdAt: clock.iso(), updatedAt: clock.iso() })))
  const rates: import('@/types/entities').MetalRate[] = []
  const offs = [50, 30, 14, 5, 0]
  for (const [id, metalId, label] of pur)
    offs.forEach((o, i) => rates.push({ id: uid(), metalId, purityId: id, ratePerGram: Math.round(RATE[label] * DRIFT[i]), effectiveAt: daysAgo(o, 9).toISOString(), createdAt: clock.iso(), updatedAt: clock.iso() }))
  await db.metalRates.bulkAdd(rates)
  await db.taxConfigs.bulkAdd([
    { id: 't-3', name: 'GST 3% (Jewellery)', percent: 3, hsn: '7113', createdAt: clock.iso(), updatedAt: clock.iso() },
    { id: 't-5', name: 'GST 5% (Making / Labour)', percent: 5, hsn: '9988', createdAt: clock.iso(), updatedAt: clock.iso() },
    { id: 't-12', name: 'GST 12% (Others)', percent: 12, createdAt: clock.iso(), updatedAt: clock.iso() },
  ])
  const supplierIds: string[] = []
  await db.suppliers.bulkAdd(SUPPLIERS.map(([name, phone, gstin, address], i) => {
    const id = `s-${i + 1}`; supplierIds.push(id)
    return { id, code: `SUP-${String(i + 1).padStart(3, '0')}`, name, phone, email: `accounts@${name.split(' ')[0].toLowerCase()}.example`, address, gstin, openingBalance: 0, status: 'active' as const, contactPerson: ['Balaji', 'Sunil', 'Hiren', 'Mahesh'][i], createdAt: clock.iso(), updatedAt: clock.iso() }
  }))
  await db.customers.bulkAdd(CUSTOMERS.map(([name, phone, address], i) => ({ id: `cu-${i + 1}`, code: `CUS-${String(i + 1).padStart(4, '0')}`, name, phone, email: `${name.split(' ')[0].toLowerCase()}@mail.example`, address, gstin: '', openingBalance: 0, status: 'active' as const, createdAt: clock.iso(), updatedAt: clock.iso() })))
  const purityByLabel = (metal: string, label: string) => pur.find((p) => p[1] === (metal === 'G' ? 'm-gold' : 'm-silver') && p[2] === label)![0]
  await db.products.bulkAdd(PRODUCTS.map((p, i): Product => {
    const [code, name, cat, sub, type, metal, purity, gross, stone, stoneDetails, stoneCharge, making, makingVal, wast, wastVal, sup, reorder] = p
    return {
      id: `pr-${i + 1}`, code, name, categoryId: cat, subcategory: sub, productType: type, metalId: metal === 'G' ? 'm-gold' : 'm-silver', purityId: purityByLabel(metal, purity),
      grossWeight: gross, stoneWeight: stone, netWeight: netWeightOf(gross, stone), stoneDetails, stoneCharge, pricingMode: 'weight_based', fixedPrice: 0,
      makingType: making, makingValue: makingVal, wastageType: wast, wastageValue: wastVal, hsn: '7113', gstPercent: 3,
      huid: metal === 'G' && purity !== '24K' ? 'HUID-' + code.replace('-', '') : '', supplierId: supplierIds[sup], status: 'active', reorderLevel: reorder,
      createdAt: clock.iso(), updatedAt: clock.iso(),
    }
  }))
  clock.set(null)
}

async function seedTransactions() {
  const prev = getActor()
  setActor(SUPER)
  const rnd = rng(7)
  const products = await db.products.toArray()
  const byCode = (c: string) => products.find((p) => p.code === c)!
  const rateOf = (label: string, d: number) => Math.round(RATE[label] * DRIFT[d <= 5 ? 3 : d <= 14 ? 2 : d <= 30 ? 1 : 0])
  const purLabel = async (id: string) => (await db.purities.get(id))!.label

  /** create + receive + approve a purchase, optionally partially */
  async function buy(daysBack: number, supplierId: string, plan: [string, number][], opts: { invoice: string; receive: 'all' | 'partial' | 'none'; payPct?: number }) {
    clock.set(daysAgo(daysBack, 10))
    const lines = []
    for (const [code, qty] of plan) {
      const p = byCode(code)
      const label = await purLabel(p.purityId)
      const makingAbs = p.makingType === 'fixed' ? p.makingValue * 0.5 : p.netWeight * (p.makingType === 'per_gram' ? p.makingValue * 0.5 : RATE[label] * 0.04)
      lines.push({ productId: p.id, qty, grossWeight: p.grossWeight, stoneWeight: p.stoneWeight, purityId: p.purityId, stoneDetails: p.stoneDetails, rate: Math.round(rateOf(label, daysBack) * 0.98), makingCharge: Math.round(makingAbs), wastagePercent: p.wastageType === 'percent' ? p.wastageValue : 1, gstPercent: p.gstPercent })
    }
    const po = await purchases.save({ supplierId, invoiceNo: opts.invoice, date: daysAgo(daysBack, 10).toISOString(), expectedDate: daysAgo(daysBack - 3, 10).toISOString(), lines, submit: true })
    if (opts.receive !== 'none') {
      clock.set(daysAgo(daysBack - 2 >= 0 ? daysBack - 2 : 0, 12))
      const items: InwardItem[] = []
      for (const l of po.lines) {
        const take = opts.receive === 'partial' ? Math.max(1, Math.floor(l.qty / 2)) : l.qty
        for (let k = 0; k < take; k++) {
          const jitter = Math.round((rnd() - 0.5) * 40) / 1000
          const gross = Math.round((l.grossWeight + jitter) * 1000) / 1000
          items.push({ id: uid(), poLineId: l.id, productId: l.productId, expectedGross: l.grossWeight, expectedPurityId: l.purityId, receivedGross: gross, receivedStone: l.stoneWeight, receivedNet: netWeightOf(gross, l.stoneWeight), verifiedPurityId: l.purityId, stoneOk: true, condition: 'ok', accepted: true, remarks: '' })
        }
      }
      const inw = await inward.save({ purchaseOrderId: po.id, date: clock.iso(), items, notes: opts.receive === 'partial' ? 'First consignment – balance to follow' : '' })
      await inward.submit(inw.id)
      await inward.approve(inw.id)
    }
    if (opts.payPct) {
      clock.set(daysAgo(Math.max(daysBack - 3, 0), 15))
      await payments.record({ direction: 'out', partyType: 'supplier', partyId: supplierId, mode: 'bank', amount: Math.round(po.total * opts.payPct), kind: 'supplier_payment', autoAllocate: true, reference: 'NEFT-DEMO-' + daysBack, date: clock.iso() })
    }
    return po
  }

  await buy(45, 's-1', [['RNG-001', 5], ['CHN-001', 4], ['CHN-002', 4], ['BNG-001', 3], ['EAR-001', 6], ['PND-001', 4], ['RNG-003', 3]], { invoice: 'SBG/2411/001', receive: 'all', payPct: 1 })
  await buy(38, 's-4', [['SLV-001', 6], ['SLV-002', 3], ['SLV-003', 12], ['SLV-004', 4]], { invoice: 'RSC/118', receive: 'all', payPct: 1 })
  await buy(28, 's-2', [['NCK-001', 3], ['NCK-002', 2], ['NCK-003', 4], ['EAR-002', 4], ['BNG-002', 3], ['PND-003', 4], ['GLD-001', 6]], { invoice: 'MBJ-7741', receive: 'all', payPct: 0.7 })
  await buy(18, 's-3', [['RNG-002', 4], ['EAR-003', 4], ['PND-002', 5]], { invoice: 'DHS/2210', receive: 'all', payPct: 0.5 })
  await buy(9, 's-1', [['CHN-003', 6], ['RNG-001', 4], ['EAR-001', 4]], { invoice: 'SBG/2411/044', receive: 'partial', payPct: 0.3 })
  await buy(2, 's-2', [['NCK-001', 2], ['BNG-001', 2]], { invoice: 'MBJ-7790', receive: 'none' })

  // ---- sales over the last 30 days ----
  const itemsByProduct = async (code: string, n = 1) =>
    (await db.stockItems.where('productId').equals(byCode(code).id).and((i: StockItem) => i.status === 'available').toArray()).slice(0, n)
  async function sell(daysBack: number, hour: number, customer: string | null, picks: [string, number][], pay: { mode: 'cash' | 'upi' | 'card' | 'bank'; pct: number }[], extra: { discount?: number; advance?: number; walkIn?: string } = {}) {
    clock.set(daysAgo(daysBack, hour))
    const items: { stockItemId: string; discount?: number }[] = []
    for (const [code, n] of picks) for (const it of await itemsByProduct(code, n)) items.push({ stockItemId: it.id, discount: extra.discount })
    if (!items.length) return null
    // estimate total via a dry run is unnecessary: pay percentages are applied after a draft price
    const probe = await priceProbe(items)
    const advance = extra.advance ?? 0
    const payable = probe - advance
    let allocated = 0
    const payments_ = pay.map((p, i) => {
      const amt = i === pay.length - 1 && p.pct === 1 ? payable - allocated : Math.round(payable * p.pct)
      allocated += amt
      return { mode: p.mode, amount: amt, reference: p.mode === 'upi' ? 'UPI' + (900000 + daysBack * 111) : undefined }
    }).filter((p) => p.amount > 0)
    return sales.create({ customerId: customer, walkInName: customer ? undefined : extra.walkIn ?? 'Walk-in Customer', items, payments: payments_, advanceAdjust: advance, date: clock.iso() })
  }
  async function priceProbe(items: { stockItemId: string; discount?: number }[]) {
    const lines = []
    for (const i of items) {
      const it = (await db.stockItems.get(i.stockItemId))!
      const p = (await db.products.get(it.productId))!
      const rate = p.pricingMode === 'fixed_price' ? 0 : (await latestRate(it.metalId, it.purityId, clock.iso())).ratePerGram
      lines.push(priceItem({ pricingMode: p.pricingMode, fixedPrice: p.fixedPrice, netWeight: it.netWeight, ratePerGram: rate, makingType: p.makingType, makingValue: p.makingValue, wastageType: p.wastageType, wastageValue: p.wastageValue, stoneCharge: p.stoneCharge, discount: i.discount ?? 0, gstPercent: p.gstPercent }))
    }
    return invoiceTotals(lines).total
  }

  await sell(27, 11, 'cu-1', [['RNG-001', 1], ['EAR-001', 1]], [{ mode: 'cash', pct: 1 }])
  await sell(26, 17, null, [['SLV-003', 2]], [{ mode: 'upi', pct: 1 }])
  await sell(24, 12, 'cu-2', [['CHN-001', 1]], [{ mode: 'card', pct: 1 }])
  await sell(22, 18, 'cu-3', [['PND-001', 1]], [{ mode: 'upi', pct: 1 }], { discount: 100 })
  await sell(20, 11, 'cu-4', [['SLV-001', 1]], [{ mode: 'cash', pct: 1 }])
  await sell(17, 13, null, [['BNG-001', 1]], [{ mode: 'cash', pct: 0.5 }, { mode: 'upi', pct: 1 }]) // split payment
  await sell(14, 16, 'cu-5', [['NCK-001', 1]], [{ mode: 'bank', pct: 0.6 }])                           // credit sale: customer owes
  await sell(12, 12, 'cu-6', [['EAR-002', 1]], [{ mode: 'card', pct: 1 }])
  await sell(10, 11, null, [['CHN-002', 1], ['SLV-003', 1]], [{ mode: 'cash', pct: 1 }])
  await sell(8, 15, 'cu-7', [['RNG-002', 1]], [{ mode: 'upi', pct: 1 }])
  await sell(6, 12, 'cu-1', [['PND-003', 1]], [{ mode: 'cash', pct: 1 }])
  await sell(5, 17, 'cu-8', [['BNG-002', 1]], [{ mode: 'cash', pct: 0.5 }, { mode: 'upi', pct: 1 }])
  await sell(3, 11, 'cu-2', [['GLD-001', 2]], [{ mode: 'upi', pct: 1 }])
  await sell(2, 14, null, [['EAR-001', 1]], [{ mode: 'card', pct: 1 }])
  await sell(1, 12, 'cu-3', [['CHN-003', 1]], [{ mode: 'cash', pct: 1 }])
  await sell(0, 10, 'cu-4', [['SLV-004', 1], ['SLV-003', 1]], [{ mode: 'upi', pct: 1 }])

  // a customer advance (booking) and later part-settlement of the credit sale
  clock.set(daysAgo(11, 14))
  await payments.record({ direction: 'in', partyType: 'customer', partyId: 'cu-6', mode: 'upi', amount: 15000, kind: 'advance', reference: 'UPI-BOOK-1', date: clock.iso(), notes: 'Booking advance for bridal set' })
  clock.set(daysAgo(4, 13))
  await payments.record({ direction: 'in', partyType: 'customer', partyId: 'cu-5', mode: 'cash', amount: 20000, kind: 'receipt', autoAllocate: true, date: clock.iso() })

  // ---- repairs ----
  clock.set(daysAgo(9, 11))
  const r1 = await repairs.create({ customerId: 'cu-4', description: 'Gold chain – broken link', repairType: 'Soldering', receivedWeight: 12.4, damage: 'Link snapped near clasp', instructions: 'Re-solder, keep weight loss minimal', expectedDelivery: daysAgo(-3).toISOString(), artisanId: 'u-art1', labourEstimate: 600, photos: [], advance: { amount: 200, mode: 'cash' } })
  clock.set(daysAgo(8, 12)); await repairs.start(r1.id)  // as super admin (not artisan-restricted)
  clock.set(daysAgo(7, 16)); await repairs.complete(r1.id, 550, 'Re-soldered and polished')
  clock.set(daysAgo(7, 18)); await payments.record({ direction: 'in', partyType: 'customer', partyId: 'cu-4', mode: 'cash', amount: 350, kind: 'receipt', allocations: [{ docType: 'repair', docId: r1.id, amount: 350 }], date: clock.iso() })
  await repairs.deliver(r1.id)
  clock.set(daysAgo(3, 11))
  const r2 = await repairs.create({ customerId: 'cu-7', description: 'Diamond ring – loose stone', repairType: 'Stone setting', receivedWeight: 4.1, damage: 'Centre stone loose', instructions: 'Reset prongs', expectedDelivery: daysAgo(-2).toISOString(), artisanId: 'u-art1', labourEstimate: 800, photos: [], advance: { amount: 300, mode: 'upi' } })
  clock.set(daysAgo(2, 12)); await repairs.start(r2.id)
  clock.set(daysAgo(1, 11))
  await repairs.create({ customerId: 'cu-3', description: 'Silver anklet – clasp replacement', repairType: 'Clasp', receivedWeight: 22.5, damage: 'Clasp broken', instructions: '', expectedDelivery: daysAgo(-4).toISOString(), labourEstimate: 250, photos: [] })

  // ---- polishing ----
  clock.set(daysAgo(6, 10))
  const [pItem] = await itemsByProduct('NCK-003', 1)
  const pj = await polishing.create({ stockItemId: pItem.id, polishType: 'Rhodium / high-shine', artisanId: 'u-art2', labourCharge: 400, expectedDate: daysAgo(-1).toISOString(), remarks: 'Dull after storage' })
  clock.set(daysAgo(5, 11)); await polishing.start(pj.id)
  clock.set(daysAgo(4, 15)); await polishing.submitForQc(pj.id, Math.round((pItem.grossWeight - 0.04) * 1000) / 1000, 'Finished')
  clock.set(daysAgo(4, 17)); await polishing.qc(pj.id, true, 'Excellent finish')
  await polishing.returnToStock(pj.id)
  clock.set(daysAgo(1, 10))
  const [pItem2] = await itemsByProduct('RNG-001', 1)
  await polishing.create({ stockItemId: pItem2.id, polishType: 'Buffing', artisanId: 'u-art2', labourCharge: 150, expectedDate: daysAgo(-2).toISOString(), remarks: '' })

  // ---- a small completed audit (one weight variance) ----
  clock.set(daysAgo(7, 9))
  const a = await audits.create({ title: 'Weekly check – Chains', categoryId: 'c-chain' })
  const aItems = (await db.stockItems.filter((i) => a.expectedItemIds.includes(i.id)).toArray())
  for (let i = 0; i < aItems.length; i++) await audits.scan(a.id, aItems[i].barcode, i === 0 ? Math.round((aItems[i].grossWeight - 0.08) * 1000) / 1000 : undefined)
  await audits.submit(a.id)
  clock.set(daysAgo(7, 11)); await audits.approve(a.id, 'Weight variance verified on calibrated scale')

  // ---- expenses ----
  clock.set(daysAgo(30, 10))
  const exp: [number, string, number, 'cash' | 'upi' | 'bank', string][] = [
    [30, 'Rent', 45000, 'bank', 'Landlord'], [28, 'Electricity', 6200, 'upi', 'TNEB'], [20, 'Salaries', 78000, 'bank', 'Staff payroll'],
    [14, 'Packaging', 3400, 'cash', 'Box supplier'], [9, 'Marketing', 8000, 'upi', 'Local print ads'], [5, 'Insurance', 12500, 'bank', 'Showroom cover'], [2, 'Repairs & Maintenance', 1800, 'cash', 'Electrician'],
  ]
  for (const [d, category, amount, mode, paidTo] of exp) {
    clock.set(daysAgo(d, 10))
    await db.expenses.add({ id: uid(), expenseNo: await nextNo('expense', 'EXP-', 5), date: clock.iso(), category, amount, mode, paidTo, notes: '', createdAt: clock.iso(), updatedAt: clock.iso(), createdBy: SUPER.id })
  }
  clock.set(null)
  setActor(prev)
}
