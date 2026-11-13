import { ArrowDownLeft, ArrowUpRight, Plus, Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/app/auth'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Feedback'
import { Bare } from '@/components/ui/Form'
import { PageHeader, Stat } from '@/components/ui/Layout'
import { D, money, sum } from '@/domain/calculations/decimal'
import { useIndex, useList } from '@/hooks/useData'
import type { Payment } from '@/types/entities'
import { inRange } from '@/utils/dates'
import { fmtDate, fmtMoney, fmtNum, todayInput } from '@/utils/format'
import { PaymentDialog } from './PaymentDialog'

export default function PaymentsPage() {
  const { can } = useAuth()
  const [sp, setSp] = useSearchParams()
  const pays = useList('payments'), customers = useList('customers'), suppliers = useList('suppliers')
  const cm = useIndex(customers.data), sm = useIndex(suppliers.data)
  const [dlg, setDlg] = useState<'customer' | 'supplier' | null>(sp.get('new') ? 'customer' : null)
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [mode, setMode] = useState(''), [dir, setDir] = useState('')

  const rows = useMemo(() => (pays.data ?? []).filter((p) => p.status === 'posted' && inRange(p.date, from, to) && (!mode || p.mode === mode) && (!dir || p.direction === dir)), [pays.data, from, to, mode, dir])
  const party = (p: Payment) => (p.partyType === 'customer' ? (cm.get(p.partyId)?.name ?? (p.partyId === 'walk-in' ? 'Walk-in customers' : '—')) : (sm.get(p.partyId)?.name ?? '—'))
  const totalIn = money(sum(rows.filter((r) => r.direction === 'in').map((r) => r.amount)))
  const totalOut = money(sum(rows.filter((r) => r.direction === 'out').map((r) => r.amount)))
  const byMode = (['cash', 'upi', 'card', 'bank'] as const).map((m) => ({ m, v: money(sum(rows.filter((r) => r.mode === m).map((r) => (r.direction === 'in' ? r.amount : -r.amount)))) }))

  const cols: Column<Payment>[] = [
    { key: 'no', header: 'Receipt / voucher', value: (p) => p.paymentNo, render: (p) => <span className="font-mono text-[12px]">{p.paymentNo}</span> },
    { key: 'date', header: 'Date', value: (p) => p.date, render: (p) => fmtDate(p.date) },
    { key: 'party', header: 'Party', value: party, render: (p) => <>{party(p)} <span className="text-[11px] text-muted">({p.partyType})</span></> },
    { key: 'kind', header: 'Type', value: (p) => p.kind, render: (p) => <Badge tone={p.direction === 'in' ? 'green' : 'amber'}>{p.direction === 'in' ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}{p.kind.replace('_', ' ')}</Badge> },
    { key: 'mode', header: 'Mode', value: (p) => p.mode, render: (p) => p.mode.toUpperCase() },
    { key: 'ref', header: 'Reference', value: (p) => p.reference ?? '', render: (p) => <span className="text-muted">{p.reference || '—'}</span> },
    { key: 'alloc', header: 'Against', value: (p) => p.allocations.map((a) => a.docNo).join(' '), render: (p) => <span className="text-muted">{p.allocations.map((a) => a.docNo).join(', ') || (p.kind === 'advance' || D(p.amount).gt(0) ? 'Advance' : '')}</span> },
    { key: 'amt', header: 'Amount (₹)', num: true, value: (p) => (p.direction === 'in' ? p.amount : -p.amount), render: (p) => <span className={p.direction === 'in' ? 'text-ok' : 'text-bad'}>{p.direction === 'in' ? '+' : '−'}{fmtNum(p.amount)}</span>, footer: () => fmtNum(totalIn - totalOut) },
  ]
  return (
    <div className="fade-in">
      <PageHeader title="Payments & receipts" subtitle="Every rupee in and out — customer receipts, advances, refunds and supplier payments."
        actions={<>
          <Button icon={<Printer size={14} />} onClick={() => window.print()}>Print</Button>
          {can('payments.manage') && <><Button icon={<Plus size={14} />} onClick={() => setDlg('supplier')}>Pay supplier</Button><Button variant="primary" icon={<Plus size={14} />} onClick={() => setDlg('customer')}>Receive payment</Button></>}
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Money in" value={fmtMoney(totalIn)} /><Stat label="Money out" value={fmtMoney(totalOut)} />
        {byMode.map((b) => <Stat key={b.m} label={`${b.m.toUpperCase()} (net)`} value={fmtMoney(b.v)} />)}
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(p) => p.id} loading={pays.isLoading} error={pays.error} initialSort={{ key: 'date', dir: 'desc' }} showFooter searchPlaceholder="Search party, reference, document…"
        empty={{ title: 'No payments in this view' }}
        toolbar={<>
          <Bare.input aria-label="From date" type="date" value={from} max={todayInput()} onChange={(e) => setFrom(e.target.value)} /><span className="text-muted">to</span><Bare.input aria-label="To date" type="date" value={to} max={todayInput()} onChange={(e) => setTo(e.target.value)} />
          <Bare.select aria-label="Mode" value={mode} onChange={(e) => setMode(e.target.value)}><option value="">All modes</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option></Bare.select>
          <Bare.select aria-label="Direction" value={dir} onChange={(e) => setDir(e.target.value)}><option value="">In & out</option><option value="in">In</option><option value="out">Out</option></Bare.select>
        </>} />
      {dlg && <PaymentDialog open onClose={() => { setDlg(null); sp.delete('new'); setSp(sp) }} partyType={dlg} />}
    </div>
  )
}
