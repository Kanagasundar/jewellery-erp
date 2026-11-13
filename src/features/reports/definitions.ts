import { D, money, sum, weight } from '@/domain/calculations/decimal'
import { customerBalance, paidAgainst, purchaseOutstanding, supplierBalance } from '@/domain/calculations/ledger'
import type {
  AuditLog, Category, Customer, Expense, Metal, Payment, PolishingJob, Product, PurchaseOrder, Purity, Repair, Sale, SaleReturn, StockAdjustment,
  StockAudit, StockItem, StockLedgerEntry, Supplier, User,
} from '@/types/entities'
import { dayKey, inRange, monthKey } from '@/utils/dates'

export type Kind = 'text' | 'money' | 'weight' | 'int' | 'date'
export interface RCol { key: string; header: string; kind?: Kind; total?: boolean }
export type Row = Record<string, string | number>
export interface ReportResult { columns: RCol[]; rows: Row[]; note?: string }

export interface ReportData {
  sales: Sale[]; returns: SaleReturn[]; purchases: PurchaseOrder[]; payments: Payment[]; items: StockItem[]; ledger: StockLedgerEntry[]
  products: Product[]; categories: Category[]; metals: Metal[]; purities: Purity[]; customers: Customer[]; suppliers: Supplier[]
  repairs: Repair[]; polishing: PolishingJob[]; audits: StockAudit[]; adjustments: StockAdjustment[]; expenses: Expense[]; users: User[]; auditLogs: AuditLog[]
}
export interface ReportDef {
  key: string
  group: string
  title: string
  description: string
  ranged: boolean
  financial?: boolean
  build: (d: ReportData, from?: string, to?: string) => ReportResult
}

const byId = <T extends { id: string }>(l: T[]) => new Map(l.map((x) => [x.id, x]))
const live = (s: Sale) => s.status === 'completed'

export const REPORTS: ReportDef[] = [
  {
    key: 'daily-sales', group: 'Sales', title: 'Daily sales', description: 'Invoices per day, with GST and returns.', ranged: true,
    build: (d, from, to) => {
      const g = new Map<string, Row>()
      for (const s of d.sales.filter((x) => live(x) && inRange(x.date, from, to))) {
        const k = dayKey(s.date)
        const r = g.get(k) ?? { date: k, invoices: 0, items: 0, taxable: 0, gst: 0, total: 0, returns: 0, net: 0 }
        r.invoices = +r.invoices + 1; r.items = +r.items + s.lines.length
        r.taxable = money(D(r.taxable).plus(s.taxable)); r.gst = money(D(r.gst).plus(s.gst)); r.total = money(D(r.total).plus(s.total))
        r.returns = money(D(r.returns).plus(s.returnedValue)); r.net = money(D(r.total).minus(r.returns))
        g.set(k, r)
      }
      return { columns: [{ key: 'date', header: 'Date', kind: 'date' }, { key: 'invoices', header: 'Invoices', kind: 'int', total: true }, { key: 'items', header: 'Items sold', kind: 'int', total: true }, { key: 'taxable', header: 'Taxable (₹)', kind: 'money', total: true }, { key: 'gst', header: 'GST (₹)', kind: 'money', total: true }, { key: 'total', header: 'Invoice total (₹)', kind: 'money', total: true }, { key: 'returns', header: 'Returns (₹)', kind: 'money', total: true }, { key: 'net', header: 'Net sales (₹)', kind: 'money', total: true }], rows: [...g.values()].sort((a, b) => String(b.date).localeCompare(String(a.date))) }
    },
  },
  {
    key: 'monthly-sales', group: 'Sales', title: 'Monthly sales', description: 'Month-wise sales totals.', ranged: true,
    build: (d, from, to) => {
      const g = new Map<string, Row>()
      for (const s of d.sales.filter((x) => live(x) && inRange(x.date, from, to))) {
        const k = monthKey(s.date)
        const r = g.get(k) ?? { month: k, invoices: 0, taxable: 0, gst: 0, total: 0, returns: 0, net: 0 }
        r.invoices = +r.invoices + 1; r.taxable = money(D(r.taxable).plus(s.taxable)); r.gst = money(D(r.gst).plus(s.gst)); r.total = money(D(r.total).plus(s.total))
        r.returns = money(D(r.returns).plus(s.returnedValue)); r.net = money(D(r.total).minus(r.returns)); g.set(k, r)
      }
      return { columns: [{ key: 'month', header: 'Month' }, { key: 'invoices', header: 'Invoices', kind: 'int', total: true }, { key: 'taxable', header: 'Taxable (₹)', kind: 'money', total: true }, { key: 'gst', header: 'GST (₹)', kind: 'money', total: true }, { key: 'total', header: 'Invoice total (₹)', kind: 'money', total: true }, { key: 'returns', header: 'Returns (₹)', kind: 'money', total: true }, { key: 'net', header: 'Net sales (₹)', kind: 'money', total: true }], rows: [...g.values()].sort((a, b) => String(b.month).localeCompare(String(a.month))) }
    },
  },
  {
    key: 'sales-register', group: 'Sales', title: 'Sales register', description: 'Every invoice with payment status.', ranged: true,
    build: (d, from, to) => {
      const rows = d.sales.filter((s) => inRange(s.date, from, to)).map((s) => {
        const paid = paidAgainst(d.payments, 'sale', s.id)
        return { date: dayKey(s.date), invoice: s.invoiceNo, customer: s.customerName, items: s.lines.length, taxable: s.taxable, gst: s.gst, total: s.total, paid, due: s.status === 'cancelled' ? 0 : money(D(s.total).minus(s.returnedValue).minus(paid)), status: s.status }
      }).sort((a, b) => b.invoice.localeCompare(a.invoice))
      return { columns: [{ key: 'date', header: 'Date', kind: 'date' }, { key: 'invoice', header: 'Invoice' }, { key: 'customer', header: 'Customer' }, { key: 'items', header: 'Items', kind: 'int', total: true }, { key: 'taxable', header: 'Taxable (₹)', kind: 'money', total: true }, { key: 'gst', header: 'GST (₹)', kind: 'money', total: true }, { key: 'total', header: 'Total (₹)', kind: 'money', total: true }, { key: 'paid', header: 'Paid (₹)', kind: 'money', total: true }, { key: 'due', header: 'Due (₹)', kind: 'money', total: true }, { key: 'status', header: 'Status' }], rows }
    },
  },
  {
    key: 'purchases', group: 'Purchases', title: 'Purchase report', description: 'Purchase orders with received quantity and balance payable.', ranged: true,
    build: (d, from, to) => {
      const sm = byId(d.suppliers)
      const rows = d.purchases.filter((p) => p.status !== 'draft' && inRange(p.date, from, to)).map((p) => ({ date: dayKey(p.date), po: p.poNumber, supplier: sm.get(p.supplierId)?.name ?? '', invoice: p.invoiceNo, ordered: p.lines.reduce((s, l) => s + l.qty, 0), received: p.lines.reduce((s, l) => s + l.receivedQty, 0), total: p.total, paid: paidAgainst(d.payments, 'purchase', p.id), balance: purchaseOutstanding(p, d.payments), status: p.status }))
      return { columns: [{ key: 'date', header: 'Date', kind: 'date' }, { key: 'po', header: 'PO' }, { key: 'supplier', header: 'Supplier' }, { key: 'invoice', header: 'Invoice' }, { key: 'ordered', header: 'Ordered', kind: 'int', total: true }, { key: 'received', header: 'Received', kind: 'int', total: true }, { key: 'total', header: 'Total (₹)', kind: 'money', total: true }, { key: 'paid', header: 'Paid (₹)', kind: 'money', total: true }, { key: 'balance', header: 'Balance (₹)', kind: 'money', total: true }, { key: 'status', header: 'Status' }], rows }
    },
  },
  {
    key: 'stock', group: 'Stock', title: 'Stock report (product-wise)', description: 'Available pieces, weight and cost value per product (as of now).', ranged: false,
    build: (d) => {
      const rows = d.products.map((p) => {
        const a = d.items.filter((i) => i.productId === p.id && i.status === 'available')
        return { sku: p.code, product: p.name, category: d.categories.find((c) => c.id === p.categoryId)?.name ?? '', available: a.length, reserved: d.items.filter((i) => i.productId === p.id && i.status === 'reserved').length, gross: weight(sum(a.map((i) => i.grossWeight))), net: weight(sum(a.map((i) => i.netWeight))), cost: money(sum(a.map((i) => i.costPrice))) }
      }).filter((r) => r.available || r.reserved).sort((a, b) => b.cost - a.cost)
      return { columns: [{ key: 'sku', header: 'SKU' }, { key: 'product', header: 'Product' }, { key: 'category', header: 'Category' }, { key: 'available', header: 'Available', kind: 'int', total: true }, { key: 'reserved', header: 'Reserved', kind: 'int', total: true }, { key: 'gross', header: 'Gross (g)', kind: 'weight', total: true }, { key: 'net', header: 'Net (g)', kind: 'weight', total: true }, { key: 'cost', header: 'Cost value (₹)', kind: 'money', total: true }], rows }
    },
  },
  {
    key: 'metal-purity', group: 'Stock', title: 'Metal-wise & purity-wise inventory', description: 'Available stock grouped by metal and purity.', ranged: false,
    build: (d) => {
      const g = new Map<string, Row>()
      for (const i of d.items.filter((x) => x.status === 'available')) {
        const metal = d.metals.find((m) => m.id === i.metalId)?.name ?? '', pur = d.purities.find((p) => p.id === i.purityId)?.label ?? ''
        const k = `${metal}|${pur}`
        const r = g.get(k) ?? { metal, purity: pur, pieces: 0, gross: 0, stone: 0, net: 0, cost: 0 }
        r.pieces = +r.pieces + 1; r.gross = weight(D(r.gross).plus(i.grossWeight)); r.stone = weight(D(r.stone).plus(i.stoneWeight)); r.net = weight(D(r.net).plus(i.netWeight)); r.cost = money(D(r.cost).plus(i.costPrice)); g.set(k, r)
      }
      return { columns: [{ key: 'metal', header: 'Metal' }, { key: 'purity', header: 'Purity' }, { key: 'pieces', header: 'Pieces', kind: 'int', total: true }, { key: 'gross', header: 'Gross (g)', kind: 'weight', total: true }, { key: 'stone', header: 'Stone (g)', kind: 'weight', total: true }, { key: 'net', header: 'Net metal (g)', kind: 'weight', total: true }, { key: 'cost', header: 'Cost value (₹)', kind: 'money', total: true }], rows: [...g.values()].sort((a, b) => String(a.metal).localeCompare(String(b.metal)) || String(a.purity).localeCompare(String(b.purity))) }
    },
  },
  {
    key: 'weight-summary', group: 'Stock', title: 'Weight summary (category-wise)', description: 'Gross, stone and net weight of available stock per category.', ranged: false,
    build: (d) => {
      const pm = byId(d.products), cm = byId(d.categories)
      const g = new Map<string, Row>()
      for (const i of d.items.filter((x) => x.status === 'available')) {
        const c = cm.get(pm.get(i.productId)?.categoryId ?? '')?.name ?? 'Other'
        const r = g.get(c) ?? { category: c, pieces: 0, gross: 0, stone: 0, net: 0 }
        r.pieces = +r.pieces + 1; r.gross = weight(D(r.gross).plus(i.grossWeight)); r.stone = weight(D(r.stone).plus(i.stoneWeight)); r.net = weight(D(r.net).plus(i.netWeight)); g.set(c, r)
      }
      return { columns: [{ key: 'category', header: 'Category' }, { key: 'pieces', header: 'Pieces', kind: 'int', total: true }, { key: 'gross', header: 'Gross (g)', kind: 'weight', total: true }, { key: 'stone', header: 'Stone (g)', kind: 'weight', total: true }, { key: 'net', header: 'Net (g)', kind: 'weight', total: true }], rows: [...g.values()] }
    },
  },
  {
    key: 'movements', group: 'Stock', title: 'Stock movements', description: 'The append-only stock ledger.', ranged: true,
    build: (d, from, to) => {
      const im = byId(d.items)
      const rows = d.ledger.filter((e) => inRange(e.date, from, to)).sort((a, b) => b.txnNo.localeCompare(a.txnNo)).map((e) => ({ txn: e.txnNo, date: dayKey(e.date), ref: e.refNo, item: im.get(e.stockItemId)?.itemCode ?? '', from: e.statusFrom ?? 'new', to: e.statusTo, qtyIn: e.qtyIn, qtyOut: e.qtyOut, wIn: e.weightIn, wOut: e.weightOut, balQty: e.resultQty, user: e.userName, reason: e.reason }))
      return { columns: [{ key: 'txn', header: 'Txn' }, { key: 'date', header: 'Date', kind: 'date' }, { key: 'ref', header: 'Reference' }, { key: 'item', header: 'Item' }, { key: 'from', header: 'From' }, { key: 'to', header: 'To' }, { key: 'qtyIn', header: 'Qty in', kind: 'int', total: true }, { key: 'qtyOut', header: 'Qty out', kind: 'int', total: true }, { key: 'wIn', header: 'Wt in (g)', kind: 'weight', total: true }, { key: 'wOut', header: 'Wt out (g)', kind: 'weight', total: true }, { key: 'balQty', header: 'Balance qty', kind: 'int' }, { key: 'user', header: 'User' }, { key: 'reason', header: 'Reason' }], rows }
    },
  },
  {
    key: 'repairs', group: 'Workshop', title: 'Repair report', description: 'Repair jobs with charges and status.', ranged: true,
    build: (d, from, to) => {
      const cm = byId(d.customers), um = byId(d.users)
      const rows = d.repairs.filter((r) => inRange(r.createdAt, from, to)).map((r) => ({ date: dayKey(r.createdAt), job: r.jobNo, customer: cm.get(r.customerId)?.name ?? '', item: r.description, type: r.repairType, artisan: um.get(r.artisanId ?? '')?.name ?? '', expected: dayKey(r.expectedDelivery), estimate: r.labourEstimate, final: r.labourFinal, paid: paidAgainst(d.payments, 'repair', r.id), status: r.status }))
      return { columns: [{ key: 'date', header: 'Received', kind: 'date' }, { key: 'job', header: 'Job' }, { key: 'customer', header: 'Customer' }, { key: 'item', header: 'Item' }, { key: 'type', header: 'Type' }, { key: 'artisan', header: 'Artisan' }, { key: 'expected', header: 'Expected', kind: 'date' }, { key: 'estimate', header: 'Estimate (₹)', kind: 'money', total: true }, { key: 'final', header: 'Final (₹)', kind: 'money', total: true }, { key: 'paid', header: 'Paid (₹)', kind: 'money', total: true }, { key: 'status', header: 'Status' }], rows }
    },
  },
  {
    key: 'polishing', group: 'Workshop', title: 'Polishing report', description: 'Polishing jobs and weight loss.', ranged: true,
    build: (d, from, to) => {
      const im = byId(d.items), um = byId(d.users)
      const rows = d.polishing.filter((j) => inRange(j.createdAt, from, to)).map((j) => ({ date: dayKey(j.createdAt), job: j.jobNo, item: im.get(j.stockItemId)?.itemCode ?? '', type: j.polishType, worker: um.get(j.artisanId ?? '')?.name ?? '', before: j.beforeWeight, after: j.afterWeight, loss: j.weightDiff, labour: j.labourCharge, status: j.status }))
      return { columns: [{ key: 'date', header: 'Date', kind: 'date' }, { key: 'job', header: 'Job' }, { key: 'item', header: 'Item' }, { key: 'type', header: 'Type' }, { key: 'worker', header: 'Worker' }, { key: 'before', header: 'Before (g)', kind: 'weight', total: true }, { key: 'after', header: 'After (g)', kind: 'weight', total: true }, { key: 'loss', header: 'Loss (g)', kind: 'weight', total: true }, { key: 'labour', header: 'Labour (₹)', kind: 'money', total: true }, { key: 'status', header: 'Status' }], rows }
    },
  },
  {
    key: 'discrepancy', group: 'Stock', title: 'Stock discrepancy report', description: 'Variances found in physical stock audits and the adjustments posted.', ranged: true,
    build: (d, from, to) => {
      const rows: Row[] = []
      for (const a of d.audits.filter((x) => x.status !== 'in_progress' && inRange(x.createdAt, from, to)))
        for (const x of a.discrepancies) rows.push({ date: dayKey(a.createdAt), audit: a.auditNo, type: x.kind, item: x.itemCode ?? x.barcode, product: x.name ?? '', system: x.systemWeight ?? 0, physical: x.physicalWeight ?? 0, audit_status: a.status, adjusted: d.adjustments.some((j) => j.auditId === a.id && j.stockItemId === x.stockItemId) ? 'Yes' : 'No' })
      return { columns: [{ key: 'date', header: 'Date', kind: 'date' }, { key: 'audit', header: 'Audit' }, { key: 'type', header: 'Type' }, { key: 'item', header: 'Item' }, { key: 'product', header: 'Product' }, { key: 'system', header: 'System (g)', kind: 'weight' }, { key: 'physical', header: 'Physical (g)', kind: 'weight' }, { key: 'audit_status', header: 'Audit status' }, { key: 'adjusted', header: 'Adjusted' }], rows }
    },
  },
  {
    key: 'cust-out', group: 'Finance', title: 'Customer outstanding', description: 'Amounts owed by customers (and advances held).', ranged: false,
    build: (d) => {
      const rows = d.customers.map((c) => ({ code: c.code, customer: c.name, phone: c.phone, balance: customerBalance(c, d.sales, d.returns, d.payments, d.repairs) })).filter((r) => r.balance !== 0).sort((a, b) => b.balance - a.balance)
      return { columns: [{ key: 'code', header: 'Code' }, { key: 'customer', header: 'Customer' }, { key: 'phone', header: 'Phone' }, { key: 'balance', header: 'Balance (₹) (+ owed / − advance)', kind: 'money', total: true }], rows }
    },
  },
  {
    key: 'sup-out', group: 'Finance', title: 'Supplier outstanding', description: 'Amounts payable to suppliers.', ranged: false,
    build: (d) => {
      const rows = d.suppliers.map((s) => ({ code: s.code, supplier: s.name, phone: s.phone, balance: supplierBalance(s, d.purchases, d.payments) })).filter((r) => r.balance !== 0).sort((a, b) => b.balance - a.balance)
      return { columns: [{ key: 'code', header: 'Code' }, { key: 'supplier', header: 'Supplier' }, { key: 'phone', header: 'Phone' }, { key: 'balance', header: 'Payable (₹)', kind: 'money', total: true }], rows }
    },
  },
  {
    key: 'payments', group: 'Finance', title: 'Payment report', description: 'Receipts and payments by mode.', ranged: true,
    build: (d, from, to) => {
      const cm = byId(d.customers), sm = byId(d.suppliers)
      const rows = d.payments.filter((p) => p.status === 'posted' && inRange(p.date, from, to)).sort((a, b) => b.paymentNo.localeCompare(a.paymentNo)).map((p) => ({ date: dayKey(p.date), no: p.paymentNo, party: (p.partyType === 'customer' ? cm.get(p.partyId)?.name : sm.get(p.partyId)?.name) ?? 'Walk-in', direction: p.direction === 'in' ? 'Received' : 'Paid', type: p.kind.replace('_', ' '), mode: p.mode.toUpperCase(), against: p.allocations.map((a) => a.docNo).join(', '), received: p.direction === 'in' ? p.amount : 0, paid: p.direction === 'out' ? p.amount : 0 }))
      return { columns: [{ key: 'date', header: 'Date', kind: 'date' }, { key: 'no', header: 'No.' }, { key: 'party', header: 'Party' }, { key: 'direction', header: 'Direction' }, { key: 'type', header: 'Type' }, { key: 'mode', header: 'Mode' }, { key: 'against', header: 'Against' }, { key: 'received', header: 'Received (₹)', kind: 'money', total: true }, { key: 'paid', header: 'Paid (₹)', kind: 'money', total: true }], rows }
    },
  },
  {
    key: 'expenses', group: 'Finance', title: 'Expense report', description: 'Shop expenses by entry.', ranged: true,
    build: (d, from, to) => ({ columns: [{ key: 'date', header: 'Date', kind: 'date' }, { key: 'no', header: 'No.' }, { key: 'category', header: 'Category' }, { key: 'to', header: 'Paid to' }, { key: 'mode', header: 'Mode' }, { key: 'amount', header: 'Amount (₹)', kind: 'money', total: true }], rows: d.expenses.filter((e) => inRange(e.date, from, to)).sort((a, b) => b.date.localeCompare(a.date)).map((e) => ({ date: dayKey(e.date), no: e.expenseNo, category: e.category, to: e.paidTo, mode: e.mode.toUpperCase(), amount: e.amount })) }),
  },
  {
    key: 'profit', group: 'Finance', title: 'Profit report (item-wise)', description: 'Taxable sale value minus purchase cost of the sold piece.', ranged: true, financial: true,
    build: (d, from, to) => {
      const rows: Row[] = []
      for (const s of d.sales.filter((x) => live(x) && inRange(x.date, from, to)))
        for (const l of s.lines) {
          if (l.returned) continue
          rows.push({ date: dayKey(s.date), invoice: s.invoiceNo, item: l.itemCode, product: l.name, sale: l.taxable, cost: l.costPrice, profit: money(D(l.taxable).minus(l.costPrice)), margin: l.taxable ? money(D(l.taxable).minus(l.costPrice).div(l.taxable).times(100)) : 0 })
        }
      return { columns: [{ key: 'date', header: 'Date', kind: 'date' }, { key: 'invoice', header: 'Invoice' }, { key: 'item', header: 'Item' }, { key: 'product', header: 'Product' }, { key: 'sale', header: 'Sale value ex-GST (₹)', kind: 'money', total: true }, { key: 'cost', header: 'Purchase cost ex-GST (₹)', kind: 'money', total: true }, { key: 'profit', header: 'Gross profit (₹)', kind: 'money', total: true }, { key: 'margin', header: 'Margin %', kind: 'money' }], rows, note: 'Cost is the piece’s purchase taxable value (metal at purchase rate + wastage + making). Shop expenses, labour for repairs/polishing and returns of unsold stock are not allocated.' }
    },
  },
]
