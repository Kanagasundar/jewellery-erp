import type { Customer, Payment, PurchaseOrder, Repair, Sale, SaleReturn, Supplier } from '@/types/entities'
import { D, money } from './decimal'

/** Net amount allocated to a document: receipts in minus refunds out (void payments ignored). */
export function paidAgainst(payments: Payment[], docType: 'sale' | 'purchase' | 'repair', docId: string): number {
  let t = D(0)
  for (const p of payments) {
    if (p.status === 'void') continue
    for (const a of p.allocations) {
      if (a.docType !== docType || a.docId !== docId) continue
      const inbound = p.direction === 'in'
      // customer docs: in = money received, out = refund. supplier docs: out = money paid, in = supplier refund.
      const positive = docType === 'purchase' ? !inbound : inbound
      t = positive ? t.plus(a.amount) : t.minus(a.amount)
    }
  }
  return money(t)
}

export const saleNet = (s: Sale) => money(D(s.total).minus(s.returnedValue))
export const saleOutstanding = (s: Sale, payments: Payment[]) =>
  s.status === 'cancelled' ? 0 : money(D(saleNet(s)).minus(paidAgainst(payments, 'sale', s.id)))
export const purchaseOutstanding = (po: PurchaseOrder, payments: Payment[]) =>
  po.status === 'cancelled' || po.status === 'draft' ? 0 : money(D(po.total).minus(paidAgainst(payments, 'purchase', po.id)))

export const repairCharge = (r: Repair) =>
  r.status === 'completed' || r.status === 'delivered' ? r.labourFinal : r.status === 'cancelled' ? 0 : r.labourEstimate
export const repairOutstanding = (r: Repair, payments: Payment[]) =>
  r.status === 'cancelled' ? 0 : Math.max(0, money(D(repairCharge(r)).minus(paidAgainst(payments, 'repair', r.id))))

/** Money received/paid that has not been allocated to any document (customer advance / supplier advance). */
export function unallocatedAmount(payments: Payment[], partyType: 'customer' | 'supplier', partyId: string): number {
  let t = D(0)
  for (const p of payments) {
    if (p.status === 'void' || p.partyType !== partyType || p.partyId !== partyId) continue
    const free = D(p.amount).minus(p.allocations.reduce((s, a) => s.plus(a.amount), D(0)))
    const advancePositive = partyType === 'customer' ? p.direction === 'in' : p.direction === 'out'
    t = advancePositive ? t.plus(free) : t.minus(free)
  }
  return money(t)
}

export interface LedgerLine {
  date: string
  ref: string
  type: string
  description: string
  debit: number
  credit: number
  balance: number
}

/** Customer ledger. Balance > 0 → customer owes; < 0 → customer holds an advance / credit. */
export function customerLedger(
  c: Customer, sales: Sale[], returns: SaleReturn[], payments: Payment[], repairs: Repair[],
): LedgerLine[] {
  const rows: Omit<LedgerLine, 'balance'>[] = []
  for (const s of sales) {
    if (s.customerId !== c.id || s.status === 'cancelled') continue
    rows.push({ date: s.date, ref: s.invoiceNo, type: 'Invoice', description: `${s.lines.length} item(s)`, debit: s.total, credit: 0 })
  }
  for (const r of returns) {
    const s = sales.find((x) => x.id === r.saleId)
    if (!s || s.customerId !== c.id || s.status === 'cancelled') continue
    rows.push({ date: r.date, ref: r.returnNo, type: 'Sales return', description: `Against ${r.invoiceNo}`, debit: 0, credit: r.value })
  }
  for (const r of repairs) {
    if (r.customerId !== c.id) continue
    if (r.status === 'completed' || r.status === 'delivered')
      rows.push({ date: r.deliveredAt ?? r.updatedAt, ref: r.jobNo, type: 'Repair charge', description: r.description, debit: r.labourFinal, credit: 0 })
  }
  for (const p of payments) {
    if (p.partyType !== 'customer' || p.partyId !== c.id || p.status === 'void') continue
    const isIn = p.direction === 'in'
    rows.push({
      date: p.date, ref: p.paymentNo, type: isIn ? (p.kind === 'advance' ? 'Advance' : 'Receipt') : 'Refund',
      description: p.mode.toUpperCase() + (p.allocations.length ? ` → ${p.allocations.map((a) => a.docNo).join(', ')}` : ''),
      debit: isIn ? 0 : p.amount, credit: isIn ? p.amount : 0,
    })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date))
  let bal = D(c.openingBalance)
  const out: LedgerLine[] = []
  if (!D(c.openingBalance).isZero())
    out.push({ date: c.createdAt, ref: 'OPEN', type: 'Opening', description: 'Opening balance', debit: money(c.openingBalance), credit: 0, balance: money(c.openingBalance) })
  for (const r of rows) {
    bal = bal.plus(r.debit).minus(r.credit)
    out.push({ ...r, balance: money(bal) })
  }
  return out
}

/** Supplier ledger. Balance > 0 → we owe the supplier. */
export function supplierLedger(s: Supplier, pos: PurchaseOrder[], payments: Payment[]): LedgerLine[] {
  const rows: Omit<LedgerLine, 'balance'>[] = []
  for (const po of pos) {
    if (po.supplierId !== s.id || po.status === 'cancelled' || po.status === 'draft') continue
    rows.push({ date: po.date, ref: po.poNumber, type: 'Purchase', description: po.invoiceNo ? `Inv ${po.invoiceNo}` : '', debit: 0, credit: po.total })
  }
  for (const p of payments) {
    if (p.partyType !== 'supplier' || p.partyId !== s.id || p.status === 'void') continue
    const out = p.direction === 'out'
    rows.push({
      date: p.date, ref: p.paymentNo, type: out ? 'Payment' : 'Refund received',
      description: p.mode.toUpperCase() + (p.allocations.length ? ` → ${p.allocations.map((a) => a.docNo).join(', ')}` : ''),
      debit: out ? p.amount : 0, credit: out ? 0 : p.amount,
    })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date))
  // payable view: credit increases what we owe
  let bal = D(s.openingBalance)
  const out: LedgerLine[] = []
  if (!D(s.openingBalance).isZero())
    out.push({ date: s.createdAt, ref: 'OPEN', type: 'Opening', description: 'Opening balance', debit: 0, credit: money(s.openingBalance), balance: money(s.openingBalance) })
  for (const r of rows) {
    bal = bal.plus(r.credit).minus(r.debit)
    out.push({ ...r, balance: money(bal) })
  }
  return out
}

export const customerBalance = (c: Customer, sales: Sale[], returns: SaleReturn[], payments: Payment[], repairs: Repair[]) => {
  const l = customerLedger(c, sales, returns, payments, repairs)
  return l.length ? l[l.length - 1].balance : money(c.openingBalance)
}
export const supplierBalance = (s: Supplier, pos: PurchaseOrder[], payments: Payment[]) => {
  const l = supplierLedger(s, pos, payments)
  return l.length ? l[l.length - 1].balance : money(s.openingBalance)
}
