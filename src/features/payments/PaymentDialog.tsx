import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Feedback'
import { Bare, Input, Select } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { D, Decimal, money, sum } from '@/domain/calculations/decimal'
import { purchaseOutstanding, repairOutstanding, saleOutstanding, unallocatedAmount } from '@/domain/calculations/ledger'
import { useAction, useList } from '@/hooks/useData'
import { erp } from '@/services'
import type { PaymentMode } from '@/types/entities'
import { fmtDate, fmtMoney, fmtNum, todayInput } from '@/utils/format'

interface OpenDoc { docType: 'sale' | 'purchase' | 'repair'; docId: string; docNo: string; date: string; outstanding: number; label: string }

/**
 * Record a receipt (customer) or a payment (supplier). Money can be allocated to open documents
 * (oldest first by default); anything left unallocated becomes an advance on the party's account.
 */
export function PaymentDialog({ open, onClose, partyType, partyId: fixedParty }: { open: boolean; onClose: () => void; partyType: 'customer' | 'supplier'; partyId?: string }) {
  const customers = useList('customers'), suppliers = useList('suppliers'), sales = useList('sales'), pos = useList('purchaseOrders'), repairs = useList('repairs'), pays = useList('payments')
  const [partyId, setPartyId] = useState(fixedParty ?? '')
  const [mode, setMode] = useState<PaymentMode>('cash')
  const [amount, setAmount] = useState('')
  const [reference, setRef] = useState('')
  const [date, setDate] = useState(todayInput())
  const [alloc, setAlloc] = useState<Record<string, string>>({})
  const [asAdvance, setAsAdvance] = useState(false)

  useEffect(() => { if (open) { setPartyId(fixedParty ?? ''); setAmount(''); setAlloc({}); setRef(''); setMode('cash'); setDate(todayInput()); setAsAdvance(false) } }, [open, fixedParty])

  const isCustomer = partyType === 'customer'
  const docs: OpenDoc[] = useMemo(() => {
    if (!partyId) return []
    const p = pays.data ?? []
    const out: OpenDoc[] = []
    if (isCustomer) {
      for (const s of sales.data ?? []) if (s.customerId === partyId) out.push({ docType: 'sale', docId: s.id, docNo: s.invoiceNo, date: s.date, outstanding: saleOutstanding(s, p), label: `Invoice · total ${fmtNum(s.total)}` })
      for (const r of repairs.data ?? []) if (r.customerId === partyId) out.push({ docType: 'repair', docId: r.id, docNo: r.jobNo, date: r.createdAt, outstanding: repairOutstanding(r, p), label: `Repair · ${r.description}` })
    } else {
      for (const po of pos.data ?? []) if (po.supplierId === partyId) out.push({ docType: 'purchase', docId: po.id, docNo: po.poNumber, date: po.date, outstanding: purchaseOutstanding(po, p), label: `Purchase · ${po.invoiceNo || 'no invoice'}` })
    }
    return out.filter((d) => d.outstanding > 0).sort((a, b) => a.date.localeCompare(b.date))
  }, [partyId, isCustomer, sales.data, repairs.data, pos.data, pays.data])

  const amt = money(amount || 0)
  const allocated = money(sum(Object.values(alloc).map((v) => v || 0)))
  const unalloc = money(D(amt).minus(allocated))
  const party = (isCustomer ? customers.data : suppliers.data)?.find((x) => x.id === partyId)
  const advanceHeld = partyId ? unallocatedAmount(pays.data ?? [], partyType, partyId) : 0

  const autoFill = (total: number) => {
    let left = D(total)
    const next: Record<string, string> = {}
    for (const d of docs) { if (left.lte(0)) break; const take = Decimal.min(left, d.outstanding); next[d.docId] = take.toFixed(2); left = left.minus(take) }
    setAlloc(next)
  }

  const save = useAction(async () => {
    const allocations = asAdvance ? [] : docs.filter((d) => D(alloc[d.docId] || 0).gt(0)).map((d) => ({ docType: d.docType, docId: d.docId, amount: money(alloc[d.docId]) }))
    return erp.commands.payments.record({
      direction: isCustomer ? 'in' : 'out', partyType, partyId, mode, amount: amt, kind: isCustomer ? (asAdvance || !allocations.length ? 'advance' : 'receipt') : 'supplier_payment',
      allocations, reference, date: new Date(date + 'T12:00:00').toISOString(),
    })
  }, { success: (p) => `${p.paymentNo} recorded — ${fmtMoney(p.amount)}`, onSuccess: onClose })

  const overAlloc = D(allocated).gt(amt)
  const canSave = !!partyId && amt > 0 && !overAlloc && !save.pending

  return (
    <Modal open={open} onClose={onClose} size="lg" title={isCustomer ? 'Receive payment' : 'Pay supplier'} description={isCustomer ? 'Receipts, advances and part-payments against invoices.' : 'Supplier payments against purchase orders.'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!canSave} loading={save.pending} onClick={() => save.run()}>Record {fmtMoney(amt)}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {!fixedParty && (
          <Select label={isCustomer ? 'Customer' : 'Supplier'} required wrapperClassName="sm:col-span-2" value={partyId} onChange={(e) => { setPartyId(e.target.value); setAlloc({}) }}>
            <option value="">Select…</option>{(isCustomer ? customers.data : suppliers.data)?.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.phone}</option>)}
          </Select>
        )}
        {party && <div className="sm:col-span-2 text-[12.5px] text-muted">{party.name} {advanceHeld > 0 && <>· advance on account <strong className="text-ok">{fmtMoney(advanceHeld)}</strong></>}</div>}
        <Select label="Mode" value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank transfer</option></Select>
        <Input label="Amount (₹)" type="number" step="0.01" min="0" required value={amount} onChange={(e) => { setAmount(e.target.value); if (!asAdvance) autoFill(Number(e.target.value) || 0) }} />
        <Input label="Reference / UTR / cheque no." value={reference} onChange={(e) => setRef(e.target.value)} />
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayInput()} />
      </div>
      {partyId && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="label-xs">Allocate to open documents</p>
            {isCustomer && <label className="flex items-center gap-1.5 text-[12px]"><input type="checkbox" className="accent-[#8f6d2f]" checked={asAdvance} onChange={(e) => { setAsAdvance(e.target.checked); if (e.target.checked) setAlloc({}); else autoFill(amt) }} />Keep as advance (no allocation)</label>}
          </div>
          {docs.length === 0 ? <p className="rounded-md bg-canvas px-3 py-3 text-[12.5px] text-muted">No open documents — the full amount will be held as an advance on the account.</p> : (
            <div className="overflow-hidden rounded-md border border-line">
              <table className="grid-table"><thead><tr><th>Document</th><th>Date</th><th className="num">Outstanding</th><th className="num">Allocate</th></tr></thead>
                <tbody>{docs.map((d) => (
                  <tr key={d.docId}><td><span className="font-mono text-[12px]">{d.docNo}</span><div className="text-[11.5px] text-muted">{d.label}</div></td><td>{fmtDate(d.date)}</td><td className="num">{fmtNum(d.outstanding)}</td>
                    <td className="num"><Bare.input aria-label={`Allocate to ${d.docNo}`} disabled={asAdvance} type="number" step="0.01" min="0" max={d.outstanding} className="w-28 text-right" value={alloc[d.docId] ?? ''} onChange={(e) => setAlloc((a) => ({ ...a, [d.docId]: e.target.value }))} /></td></tr>
                ))}</tbody></table>
            </div>
          )}
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-[12.5px]"><span>Allocated <strong>{fmtMoney(allocated)}</strong></span><span className={unalloc > 0 ? 'text-ok' : ''}>{unalloc > 0 ? `${fmtMoney(unalloc)} will be held as advance` : ''}</span></div>
          {overAlloc && <div className="mt-2"><Notice tone="red">Allocated amount exceeds the payment amount.</Notice></div>}
        </div>
      )}
    </Modal>
  )
}
