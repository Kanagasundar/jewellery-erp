import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/app/auth'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/Feedback'
import { Bare } from '@/components/ui/Form'
import { PageHeader, Stat } from '@/components/ui/Layout'
import { money, sum } from '@/domain/calculations/decimal'
import { paidAgainst, purchaseOutstanding } from '@/domain/calculations/ledger'
import { useList, useMasters } from '@/hooks/useData'
import type { PurchaseOrder } from '@/types/entities'
import { fmtDate, fmtMoney, fmtNum } from '@/utils/format'

export default function PurchasesPage() {
  const nav = useNavigate()
  const { can } = useAuth()
  const m = useMasters()
  const pos = useList('purchaseOrders')
  const pays = useList('payments')
  const [status, setStatus] = useState(''), [sup, setSup] = useState('')
  const rows = useMemo(() => (pos.data ?? []).filter((p) => (!status || p.status === status) && (!sup || p.supplierId === sup)), [pos.data, status, sup])
  const live = (pos.data ?? []).filter((p) => !['draft', 'cancelled'].includes(p.status))
  const outstanding = money(sum(live.map((p) => purchaseOutstanding(p, pays.data ?? []))))
  const pending = (pos.data ?? []).filter((p) => ['pending', 'partially_received'].includes(p.status)).length

  const cols: Column<PurchaseOrder>[] = [
    { key: 'po', header: 'PO no.', value: (p) => p.poNumber, render: (p) => <span className="font-mono text-[12px] font-medium">{p.poNumber}</span> },
    { key: 'date', header: 'Date', value: (p) => p.date, render: (p) => fmtDate(p.date) },
    { key: 'sup', header: 'Supplier', value: (p) => m.supplierMap.get(p.supplierId)?.name, render: (p) => <span className="font-medium">{m.supplierMap.get(p.supplierId)?.name}</span> },
    { key: 'inv', header: 'Invoice', value: (p) => p.invoiceNo, render: (p) => <span className="text-muted">{p.invoiceNo || '—'}</span> },
    { key: 'qty', header: 'Recvd / Ordered', num: true, value: (p) => p.lines.reduce((s, l) => s + l.qty, 0), render: (p) => `${p.lines.reduce((s, l) => s + l.receivedQty, 0)} / ${p.lines.reduce((s, l) => s + l.qty, 0)}` },
    { key: 'total', header: 'Total (₹)', num: true, value: (p) => p.total, render: (p) => fmtNum(p.total) },
    { key: 'paid', header: 'Paid (₹)', num: true, value: (p) => paidAgainst(pays.data ?? [], 'purchase', p.id), render: (p) => fmtNum(paidAgainst(pays.data ?? [], 'purchase', p.id)) },
    { key: 'due', header: 'Balance (₹)', num: true, value: (p) => purchaseOutstanding(p, pays.data ?? []), render: (p) => { const d = purchaseOutstanding(p, pays.data ?? []); return <span className={d > 0 ? 'font-medium text-bad' : ''}>{fmtNum(d)}</span> } },
    { key: 'st', header: 'Status', value: (p) => p.status, render: (p) => <StatusBadge status={p.status} /> },
  ]
  return (
    <div className="fade-in">
      <PageHeader title="Purchases" subtitle="Purchase orders to suppliers. Stock arrives through Stock Inward."
        actions={can('purchases.manage') && <Button variant="primary" icon={<Plus size={15} />} onClick={() => nav('/purchases/new')}>New purchase</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Orders" value={pos.data?.length ?? 0} /><Stat label="Awaiting goods" value={pending} tone={pending ? 'warn' : undefined} />
        <Stat label="Purchase value" value={fmtMoney(money(sum(live.map((p) => p.total))))} /><Stat label="Payable to suppliers" value={fmtMoney(outstanding)} tone={outstanding > 0 ? 'bad' : undefined} />
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(p) => p.id} loading={pos.isLoading || m.loading} error={pos.error} initialSort={{ key: 'date', dir: 'desc' }} onRowClick={(p) => nav(`/purchases/${p.id}`)} searchPlaceholder="Search PO, supplier, invoice…"
        empty={{ title: 'No purchase orders yet', action: can('purchases.manage') ? <Button variant="primary" onClick={() => nav('/purchases/new')}>Create purchase</Button> : undefined }}
        toolbar={<>
          <Bare.select aria-label="Supplier" value={sup} onChange={(e) => setSup(e.target.value)}><option value="">All suppliers</option>{(m.suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Bare.select>
          <Bare.select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['draft', 'pending', 'partially_received', 'received', 'completed', 'cancelled'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</Bare.select>
        </>} />
    </div>
  )
}
