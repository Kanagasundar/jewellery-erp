import { Ban, Plus, Printer, Undo2, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/app/auth'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Badge, EmptyState, Notice, Spinner, StatusBadge } from '@/components/ui/Feedback'
import { Bare, Select } from '@/components/ui/Form'
import { PageHeader, Stat } from '@/components/ui/Layout'
import { Modal, useConfirm } from '@/components/ui/Modal'
import { money, sum } from '@/domain/calculations/decimal'
import { paidAgainst, saleOutstanding } from '@/domain/calculations/ledger'
import { useAction, useList, useMasters, useSettings } from '@/hooks/useData'
import { PaymentDialog } from '@/features/payments/PaymentDialog'
import { erp } from '@/services'
import type { PaymentMode, Sale } from '@/types/entities'
import { inRange, todayKey } from '@/utils/dates'
import { fmtDate, fmtDateTime, fmtMoney, fmtNum, fmtW, todayInput } from '@/utils/format'
import { rupeesInWords } from '@/utils/words'
import { Textarea } from '@/components/ui/Form'

export function SalesListPage() {
  const nav = useNavigate()
  const { can } = useAuth()
  const sales = useList('sales'), pays = useList('payments')
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [status, setStatus] = useState('')
  const rows = useMemo(() => (sales.data ?? []).filter((s) => inRange(s.date, from, to) && (!status || s.status === status)), [sales.data, from, to, status])
  const live = rows.filter((s) => s.status === 'completed')
  const today = (sales.data ?? []).filter((s) => s.status === 'completed' && inRange(s.date, todayKey(), todayKey()))
  const due = money(sum(live.map((s) => saleOutstanding(s, pays.data ?? []))))
  const cols: Column<Sale>[] = [
    { key: 'inv', header: 'Invoice', value: (s) => s.invoiceNo, render: (s) => <span className="font-mono text-[12px] font-medium">{s.invoiceNo}</span> },
    { key: 'date', header: 'Date', value: (s) => s.date, render: (s) => fmtDateTime(s.date) },
    { key: 'cust', header: 'Customer', value: (s) => s.customerName, render: (s) => <span className="font-medium">{s.customerName}</span> },
    { key: 'items', header: 'Items', num: true, value: (s) => s.lines.length },
    { key: 'total', header: 'Total (₹)', num: true, value: (s) => s.total, render: (s) => fmtNum(s.total), footer: (r) => fmtNum(money(sum(r.filter((x) => x.status === 'completed').map((x) => x.total)))) },
    { key: 'paid', header: 'Paid (₹)', num: true, value: (s) => paidAgainst(pays.data ?? [], 'sale', s.id), render: (s) => fmtNum(paidAgainst(pays.data ?? [], 'sale', s.id)) },
    { key: 'due', header: 'Due (₹)', num: true, value: (s) => saleOutstanding(s, pays.data ?? []), render: (s) => { const d = saleOutstanding(s, pays.data ?? []); return <span className={d > 0 ? 'font-semibold text-bad' : ''}>{fmtNum(d)}</span> } },
    { key: 'st', header: 'Status', value: (s) => s.status, render: (s) => <span className="flex items-center gap-1"><StatusBadge status={s.status} />{s.returnedValue > 0 && <Badge tone="amber">Return</Badge>}</span> },
  ]
  return (
    <div className="fade-in">
      <PageHeader title="Sales & billing" subtitle="Invoices issued at the counter."
        actions={can('sales.create') && <Button variant="gold" icon={<Plus size={15} />} onClick={() => nav('/sales/new')}>New sale</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Today’s invoices" value={today.length} sub={fmtMoney(money(sum(today.map((s) => s.total - s.returnedValue))))} /><Stat label="In filter" value={live.length} sub={fmtMoney(money(sum(live.map((s) => s.total))))} />
        <Stat label="Outstanding" value={fmtMoney(due)} tone={due > 0 ? 'bad' : undefined} /><Stat label="Cancelled" value={rows.filter((s) => s.status === 'cancelled').length} />
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(s) => s.id} loading={sales.isLoading} error={sales.error} initialSort={{ key: 'date', dir: 'desc' }} onRowClick={(s) => nav(`/sales/${s.id}`)} showFooter searchPlaceholder="Search invoice, customer…"
        empty={{ title: 'No invoices yet', action: can('sales.create') ? <Button variant="gold" onClick={() => nav('/sales/new')}>Create first sale</Button> : undefined }}
        toolbar={<><Bare.input aria-label="From" type="date" value={from} max={todayInput()} onChange={(e) => setFrom(e.target.value)} /><span className="text-muted">to</span><Bare.input aria-label="To" type="date" value={to} max={todayInput()} onChange={(e) => setTo(e.target.value)} />
          <Bare.select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></Bare.select></>} />
    </div>
  )
}

export function InvoicePage() {
  const { id = '' } = useParams()
  const [sp, setSp] = useSearchParams()
  const { can } = useAuth()
  const confirm = useConfirm()
  const m = useMasters()
  const settings = useSettings()
  const sales = useList('sales'), pays = useList('payments'), returns = useList('saleReturns')
  const [retOpen, setRetOpen] = useState(false), [pay, setPay] = useState(false)
  const s = sales.data?.find((x) => x.id === id)
  const cancel = useAction((r: string) => erp.commands.sales.cancel(id, r), { success: 'Invoice cancelled — stock restored and payments refunded' })

  useEffect(() => { if (sp.get('print') && s) { const t = setTimeout(() => { sp.delete('print'); setSp(sp, { replace: true }) }, 100); return () => clearTimeout(t) } }, [s, sp, setSp])
  if (sales.isLoading || m.loading) return <Spinner />
  if (!s) return <div className="card"><EmptyState title="Invoice not found" /></div>
  const cfg = settings.data
  const paid = paidAgainst(pays.data ?? [], 'sale', s.id)
  const due = saleOutstanding(s, pays.data ?? [])
  const myPays = (pays.data ?? []).filter((p) => p.allocations.some((a) => a.docId === s.id))
  const myReturns = (returns.data ?? []).filter((r) => r.saleId === s.id)
  const canReturn = s.status === 'completed' && can('sales.return') && s.lines.some((l) => !l.returned)

  return (
    <div className="fade-in">
      <PageHeader back="/sales" title={s.invoiceNo} subtitle={`${s.customerName} · ${fmtDateTime(s.date)}`}
        actions={<>
          <StatusBadge status={s.status} />
          <Button icon={<Printer size={14} />} variant="primary" onClick={() => window.print()}>Print invoice</Button>
          {s.status === 'completed' && due > 0 && s.customerId && can('payments.manage') && <Button variant="gold" icon={<Wallet size={14} />} onClick={() => setPay(true)}>Receive {fmtMoney(due)}</Button>}
          {canReturn && <Button icon={<Undo2 size={14} />} onClick={() => setRetOpen(true)}>Return items</Button>}
          {s.status === 'completed' && can('sales.cancel') && s.returnedValue === 0 && <Button variant="danger" icon={<Ban size={14} />} onClick={async () => { const r = await confirm({ title: `Cancel ${s.invoiceNo}?`, message: 'The invoice is kept as cancelled (never deleted). Items return to stock and received payments are refunded.', reasonLabel: 'Reason for cancellation', confirmLabel: 'Cancel invoice', danger: true }); if (r) cancel.run(r) }}>Cancel invoice</Button>}
        </>} />
      {s.status === 'cancelled' && <div className="mb-3 no-print"><Notice tone="red">Cancelled {fmtDateTime(s.cancelledAt)} — {s.cancelReason}</Notice></div>}

      <article className="print-area card mx-auto max-w-[1000px] bg-white p-5 sm:p-8" aria-label="Tax invoice">
        {s.status === 'cancelled' && <p className="mb-2 text-center text-[22px] font-bold tracking-[0.3em] text-bad uppercase">Cancelled</p>}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-4">
          <div><h2 className="font-display text-[30px] leading-none font-semibold">{cfg?.shopName}</h2><p className="mt-1 text-[11.5px] text-muted">{cfg?.tagline}</p><p className="mt-2 max-w-xs text-[12px]">{cfg?.address}</p><p className="text-[12px]">Ph: {cfg?.phone} · GSTIN: {cfg?.gstin}</p></div>
          <div className="text-right"><p className="font-display text-[22px] font-semibold tracking-wide uppercase">Tax Invoice</p><p className="font-mono text-[13px]">{s.invoiceNo}</p><p className="text-[12px]">{fmtDate(s.date)}</p></div>
        </header>
        <section className="grid gap-4 py-3 text-[12.5px] sm:grid-cols-2"><div><p className="label-xs">Billed to</p><p className="font-medium">{s.customerName}</p>{s.customerPhone && <p>{s.customerPhone}</p>}{s.customerId && <p className="text-muted">{m.customerMap.get(s.customerId)?.address}</p>}{s.customerId && m.customerMap.get(s.customerId)?.gstin && <p>GSTIN: {m.customerMap.get(s.customerId)?.gstin}</p>}</div></section>
        <div className="overflow-x-auto"><table className="grid-table text-[11.5px] [&_td]:px-1.5 [&_td]:py-2 [&_th]:px-1.5">
          <thead><tr><th>#</th><th>Description</th><th>Purity</th><th className="num">Gross / Net g</th><th className="num">Rate</th><th className="num">Metal</th><th className="num">Wastage</th><th className="num">Making</th><th className="num">Stone</th><th className="num">Disc.</th><th className="num">Taxable</th><th className="num">GST</th><th className="num">Amount</th></tr></thead>
          <tbody>{s.lines.map((l, i) => (
            <tr key={l.stockItemId} className={l.returned ? 'text-faint line-through' : ''}><td>{i + 1}</td><td><span className="font-medium">{l.name}</span><div className="font-mono text-[10.5px] text-muted">{l.itemCode} · HSN {l.hsn}{l.huid ? ` · ${l.huid}` : ''}{l.returned ? ' · RETURNED' : ''}</div></td><td>{l.purityLabel}</td>
              <td className="num">{fmtW(l.grossWeight)}<div className="text-muted">{fmtW(l.netWeight)}</div></td><td className="num">{l.pricingMode === 'fixed_price' ? '—' : fmtNum(l.ratePerGram)}</td><td className="num">{fmtNum(l.metalValue)}</td><td className="num">{fmtNum(l.wastageValue)}</td><td className="num">{fmtNum(l.makingValue)}</td><td className="num">{fmtNum(l.stoneCharge)}</td><td className="num">{fmtNum(l.discount)}</td><td className="num">{fmtNum(l.taxable)}</td><td className="num">{fmtNum(l.gst)}<div className="text-muted">{l.gstPercent}%</div></td><td className="num font-medium">{fmtNum(l.amount)}</td></tr>))}</tbody></table></div>
        <div className="mt-4 grid gap-6 sm:grid-cols-[1fr_280px]">
          <div className="text-[12px]"><p className="label-xs">Amount in words</p><p className="font-medium">{rupeesInWords(s.total)}</p>
            <p className="label-xs mt-3">Payments</p>{myPays.length ? <ul>{myPays.map((p) => <li key={p.id} className="flex justify-between gap-3"><span>{p.paymentNo} · {p.mode.toUpperCase()} · {fmtDate(p.date)}{p.reference ? ` · ${p.reference}` : ''}</span><span className="tabular-nums">{p.direction === 'out' ? '−' : ''}{fmtNum(p.allocations.filter((a) => a.docId === s.id).reduce((x, a) => x + a.amount, 0))}</span></li>)}</ul> : <p className="text-muted">No payment received.</p>}
            {s.notes && <><p className="label-xs mt-3">Notes</p><p>{s.notes}</p></>}</div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[12.5px]">
            <dt>Subtotal</dt><dd className="num">{fmtNum(s.subtotal)}</dd><dt>Discount</dt><dd className="num">− {fmtNum(s.discount)}</dd><dt>Taxable</dt><dd className="num">{fmtNum(s.taxable)}</dd>
            <dt>CGST</dt><dd className="num">{fmtNum(s.cgst)}</dd><dt>SGST</dt><dd className="num">{fmtNum(s.sgst)}</dd><dt>Round off</dt><dd className="num">{fmtNum(s.roundOff)}</dd>
            <dt className="border-t border-ink pt-1 text-[14px] font-bold">Total</dt><dd className="num border-t border-ink pt-1 text-[14px] font-bold">{fmtMoney(s.total)}</dd>
            {s.returnedValue > 0 && <><dt>Returned</dt><dd className="num">− {fmtNum(s.returnedValue)}</dd></>}
            <dt>Paid</dt><dd className="num">{fmtNum(paid)}</dd><dt className="font-semibold">Balance</dt><dd className={`num font-semibold ${due > 0 ? 'text-bad' : ''}`}>{fmtMoney(due)}</dd>
          </dl>
        </div>
        <footer className="mt-8 grid grid-cols-2 gap-6 text-[11px] text-muted"><p>Metal rate on this invoice is fixed at the time of billing. Goods once sold can be returned only as per shop policy with this invoice.</p><p className="self-end text-right">Authorised signatory</p></footer>
      </article>

      {myReturns.length > 0 && <div className="no-print mx-auto mt-4 max-w-[900px]"><p className="label-xs mb-1">Returns</p>{myReturns.map((r) => <div key={r.id} className="card mb-2 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]"><span><span className="font-mono text-[12px]">{r.returnNo}</span> · {fmtDate(r.date)} · {r.itemIds.length} item(s) · <span className="text-muted">{r.reason}</span></span><span>Value {fmtMoney(r.value)} · Refund {fmtMoney(r.refund)}</span></div>)}{s.customerId && <Link className="text-[12.5px] text-gold-700 underline" to={`/customers/${s.customerId}`}>Open customer ledger</Link>}</div>}
      <ReturnDialog sale={s} open={retOpen} onClose={() => setRetOpen(false)} />
      {s.customerId && <PaymentDialog open={pay} onClose={() => setPay(false)} partyType="customer" partyId={s.customerId} />}
    </div>
  )
}

function ReturnDialog({ sale, open, onClose }: { sale: Sale; open: boolean; onClose: () => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [reason, setReason] = useState('')
  const [mode, setMode] = useState<PaymentMode>('cash')
  useEffect(() => { if (open) { setSel(new Set()); setReason('') } }, [open])
  const value = money(sum(sale.lines.filter((l) => sel.has(l.stockItemId)).map((l) => l.amount)))
  const save = useAction(() => erp.commands.sales.returnItems({ saleId: sale.id, itemIds: [...sel], reason, refundMode: mode }), { success: (r) => `${r.returnNo} recorded — refund ${fmtMoney(r.refund)}`, onSuccess: onClose })
  return (
    <Modal open={open} onClose={onClose} title={`Return items — ${sale.invoiceNo}`} description="Returned pieces go to ‘Returned’ status and need an inspection before they can be sold again." size="lg"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!sel.size || !reason.trim()} loading={save.pending} onClick={() => save.run()}>Return {sel.size || ''} item(s)</Button></>}>
      <ul className="divide-y divide-line rounded-md border border-line">{sale.lines.map((l) => (
        <li key={l.stockItemId}><label className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 ${l.returned ? 'opacity-50' : ''}`}><span className="flex items-center gap-3"><input type="checkbox" disabled={l.returned} className="h-4 w-4 accent-[#8f6d2f]" checked={sel.has(l.stockItemId)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(l.stockItemId)) n.delete(l.stockItemId); else n.add(l.stockItemId); return n })} />
          <span><span className="block text-[13px] font-medium">{l.name}</span><span className="font-mono text-[11.5px] text-muted">{l.itemCode} · {fmtW(l.netWeight)} g</span></span></span><span className="tabular-nums">{l.returned ? 'Returned' : fmtMoney(l.amount)}</span></label></li>))}</ul>
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><Select label="Refund via" value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank transfer</option></Select>
        <div className="flex items-end text-[13px]">Return value: <strong className="ml-1">{fmtMoney(value)}</strong></div></div>
      <Textarea label="Reason for return" required wrapperClassName="mt-3" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  )
}
