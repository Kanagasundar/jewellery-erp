import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Printer, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Resolver } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '@/app/auth'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Badge, EmptyState, Spinner, StatusBadge } from '@/components/ui/Feedback'
import { Input, Select, Textarea } from '@/components/ui/Form'
import { Card, KV, PageHeader, Stat, Tabs } from '@/components/ui/Layout'
import { Modal } from '@/components/ui/Modal'
import { money, D, sum } from '@/domain/calculations/decimal'
import { customerBalance, customerLedger, repairOutstanding, saleOutstanding, supplierBalance, supplierLedger, unallocatedAmount } from '@/domain/calculations/ledger'
import type { LedgerLine } from '@/domain/calculations/ledger'
import { useAction, useList } from '@/hooks/useData'
import { PaymentDialog } from '@/features/payments/PaymentDialog'
import { erp } from '@/services'
import type { Party, Supplier } from '@/types/entities'
import { fmtDate, fmtMoney, fmtNum } from '@/utils/format'

export type Kind = 'customer' | 'supplier'
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  phone: z.string().trim().regex(/^[0-9+\-\s]{7,15}$/, 'Enter a valid phone number'),
  email: z.string().trim().refine((v) => !v || /^\S+@\S+\.\S+$/.test(v), 'Enter a valid email'),
  address: z.string(),
  gstin: z.string().trim().toUpperCase().refine((v) => !v || GSTIN.test(v), 'Invalid GSTIN format'),
  openingBalance: z.number({ error: 'Enter a number (0 if none)' }),
  contactPerson: z.string(),
  status: z.enum(['active', 'inactive']),
  notes: z.string(),
})
type FV = z.infer<typeof schema>

function PartyForm({ kind, open, onClose, party, existing }: { kind: Kind; open: boolean; onClose: () => void; party?: Party; existing: Party[] }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FV>({ resolver: zodResolver(schema) as Resolver<FV> })
  useEffect(() => {
    if (open) reset({ name: '', phone: '', email: '', address: '', gstin: '', openingBalance: 0, contactPerson: '', status: 'active', notes: '', ...(party as Partial<FV> | undefined) })
  }, [open, party, reset])
  const repo = kind === 'customer' ? erp.repos.customers : erp.repos.suppliers
  const save = useAction(async (v: FV) => {
    if (party) return repo.update(party.id, v as Partial<Supplier>)
    const n = existing.reduce((mx, p) => Math.max(mx, Number(p.code.replace(/\D/g, '')) || 0), 0) + 1
    const code = kind === 'customer' ? `CUS-${String(n).padStart(4, '0')}` : `SUP-${String(n).padStart(3, '0')}`
    return repo.create({ ...v, code } as Omit<Supplier, 'id'>)
  }, { success: party ? 'Saved' : `${kind === 'customer' ? 'Customer' : 'Supplier'} created`, onSuccess: onClose })
  const label = kind === 'customer' ? 'customer' : 'supplier'
  return (
    <Modal open={open} onClose={onClose} size="lg" title={party ? `Edit ${party.name}` : `New ${label}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.pending} onClick={handleSubmit((v) => save.run(v))}>Save</Button></>}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <Input label="Name" required {...register('name')} error={errors.name?.message} />
        <Input label="Phone" required inputMode="tel" {...register('phone')} error={errors.phone?.message} />
        <Input label="Email" type="email" {...register('email')} error={errors.email?.message} />
        <Input label="GSTIN" placeholder="Optional" {...register('gstin')} error={errors.gstin?.message} />
        {kind === 'supplier' && <Input label="Contact person" {...register('contactPerson')} />}
        <Input label={kind === 'customer' ? 'Opening balance (₹, owed by customer)' : 'Opening balance (₹, owed to supplier)'} type="number" step="0.01" {...register('openingBalance', { valueAsNumber: true })} error={errors.openingBalance?.message} />
        <Select label="Status" {...register('status')}><option value="active">Active</option><option value="inactive">Inactive</option></Select>
        <Textarea label="Address" wrapperClassName="sm:col-span-2" {...register('address')} />
        <Textarea label="Notes" wrapperClassName="sm:col-span-2" rows={2} {...register('notes')} />
      </form>
    </Modal>
  )
}

function useBalances(kind: Kind) {
  const customers = useList('customers'), suppliers = useList('suppliers'), sales = useList('sales'), returns = useList('saleReturns')
  const pays = useList('payments'), repairs = useList('repairs'), pos = useList('purchaseOrders')
  const loading = [customers, suppliers, sales, returns, pays, repairs, pos].some((q) => q.isLoading)
  const error = [customers, suppliers, sales, returns, pays, repairs, pos].find((q) => q.error)?.error
  return { customers, suppliers, sales, returns, pays, repairs, pos, loading, error, kind }
}

export function PartyListPage({ kind }: { kind: Kind }) {
  const nav = useNavigate()
  const { can } = useAuth()
  const b = useBalances(kind)
  const [form, setForm] = useState(false)
  const list = (kind === 'customer' ? b.customers.data : b.suppliers.data) as Party[] | undefined
  const base = kind === 'customer' ? '/customers' : '/suppliers'
  const rows = useMemo(() => (list ?? []).map((p) => ({
    p,
    balance: kind === 'customer'
      ? customerBalance(p, b.sales.data ?? [], b.returns.data ?? [], b.pays.data ?? [], b.repairs.data ?? [])
      : supplierBalance(p as Supplier, b.pos.data ?? [], b.pays.data ?? []),
  })), [list, b.sales.data, b.returns.data, b.pays.data, b.repairs.data, b.pos.data, kind])
  type Row = (typeof rows)[number]
  const cols: Column<Row>[] = [
    { key: 'code', header: 'Code', value: (r) => r.p.code, render: (r) => <span className="font-mono text-[12px]">{r.p.code}</span> },
    { key: 'name', header: 'Name', value: (r) => r.p.name, render: (r) => <span className="font-medium">{r.p.name}</span> },
    { key: 'phone', header: 'Phone', value: (r) => r.p.phone },
    { key: 'addr', header: 'Address', value: (r) => r.p.address, render: (r) => <span className="text-muted">{r.p.address || '—'}</span> },
    { key: 'gst', header: 'GSTIN', value: (r) => r.p.gstin, render: (r) => <span className="font-mono text-[12px]">{r.p.gstin || '—'}</span> },
    { key: 'bal', header: kind === 'customer' ? 'Balance (₹)' : 'Payable (₹)', num: true, value: (r) => r.balance, render: (r) => (
      <span className={r.balance > 0 ? 'font-semibold text-bad' : r.balance < 0 ? 'font-semibold text-ok' : ''}>{fmtNum(Math.abs(r.balance))}{r.balance < 0 ? (kind === 'customer' ? ' Cr' : ' Adv') : r.balance > 0 ? ' Dr' : ''}</span>) },
    { key: 'status', header: 'Status', value: (r) => r.p.status, render: (r) => <StatusBadge status={r.p.status} /> },
  ]
  const total = money(sum(rows.filter((r) => r.balance > 0).map((r) => r.balance)))
  return (
    <div className="fade-in">
      <PageHeader title={kind === 'customer' ? 'Customers' : 'Suppliers'} subtitle={`${kind === 'customer' ? 'Outstanding from customers' : 'Outstanding payable to suppliers'}: ${fmtMoney(total)}`}
        actions={can(kind === 'customer' ? 'customers.manage' : 'suppliers.manage') && <Button variant="primary" icon={<Plus size={15} />} onClick={() => setForm(true)}>New {kind}</Button>} />
      <DataTable rows={rows} columns={cols} rowKey={(r) => r.p.id} loading={b.loading} error={b.error} onRowClick={(r) => nav(`${base}/${r.p.id}`)} searchPlaceholder="Search name, phone, GSTIN…" empty={{ title: `No ${kind}s yet` }} />
      <PartyForm kind={kind} open={form} onClose={() => setForm(false)} existing={list ?? []} />
    </div>
  )
}

export function PartyDetailPage({ kind }: { kind: Kind }) {
  const { id = '' } = useParams()
  const { can } = useAuth()
  const b = useBalances(kind)
  const [tab, setTab] = useState('ledger')
  const [edit, setEdit] = useState(false)
  const [pay, setPay] = useState(false)
  const list = (kind === 'customer' ? b.customers.data : b.suppliers.data) as Party[] | undefined
  const p = list?.find((x) => x.id === id)
  const ledger: LedgerLine[] = useMemo(() => {
    if (!p) return []
    return kind === 'customer'
      ? customerLedger(p, b.sales.data ?? [], b.returns.data ?? [], b.pays.data ?? [], b.repairs.data ?? [])
      : supplierLedger(p as Supplier, b.pos.data ?? [], b.pays.data ?? [])
  }, [p, kind, b.sales.data, b.returns.data, b.pays.data, b.repairs.data, b.pos.data])

  if (b.loading) return <Spinner />
  if (!p) return <div className="card"><EmptyState title={`${kind === 'customer' ? 'Customer' : 'Supplier'} not found`} action={<Link className="underline" to={kind === 'customer' ? '/customers' : '/suppliers'}>Back to list</Link>} /></div>
  const balance = ledger.length ? ledger[ledger.length - 1].balance : money(p.openingBalance)
  const advance = unallocatedAmount(b.pays.data ?? [], kind, p.id)
  const mySales = (b.sales.data ?? []).filter((s) => s.customerId === p.id)
  const myRepairs = (b.repairs.data ?? []).filter((r) => r.customerId === p.id)
  const myPos = (b.pos.data ?? []).filter((x) => x.supplierId === p.id)
  const myPays = (b.pays.data ?? []).filter((x) => x.partyId === p.id)
  const canPay = can('payments.manage')

  const ledgerCols: Column<LedgerLine>[] = [
    { key: 'date', header: 'Date', value: (l) => l.date, render: (l) => fmtDate(l.date) },
    { key: 'ref', header: 'Reference', value: (l) => l.ref, render: (l) => <span className="font-mono text-[12px]">{l.ref}</span> },
    { key: 'type', header: 'Type', value: (l) => l.type },
    { key: 'd', header: 'Details', value: (l) => l.description, render: (l) => <span className="text-muted">{l.description}</span> },
    { key: 'debit', header: 'Debit (₹)', num: true, value: (l) => l.debit, render: (l) => (l.debit ? fmtNum(l.debit) : '') },
    { key: 'credit', header: 'Credit (₹)', num: true, value: (l) => l.credit, render: (l) => (l.credit ? fmtNum(l.credit) : '') },
    { key: 'bal', header: 'Balance (₹)', num: true, value: (l) => l.balance, render: (l) => <span className="font-medium">{fmtNum(l.balance)}</span> },
  ]

  return (
    <div className="fade-in">
      <PageHeader back={kind === 'customer' ? '/customers' : '/suppliers'} title={p.name} subtitle={`${p.code} · ${p.phone}`}
        actions={<>
          <Button icon={<Printer size={14} />} onClick={() => window.print()}>Print ledger</Button>
          {canPay && <Button variant="gold" icon={<Wallet size={14} />} onClick={() => setPay(true)}>{kind === 'customer' ? 'Receive payment' : 'Pay supplier'}</Button>}
          {can(kind === 'customer' ? 'customers.manage' : 'suppliers.manage') && <Button icon={<Pencil size={14} />} onClick={() => setEdit(true)}>Edit</Button>}
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={kind === 'customer' ? 'Outstanding' : 'Payable'} value={fmtMoney(Math.max(balance, 0))} tone={balance > 0 ? 'bad' : undefined} />
        <Stat label={kind === 'customer' ? 'Advance / credit' : 'Advance paid'} value={fmtMoney(Math.max(advance, 0))} />
        <Stat label={kind === 'customer' ? 'Invoices' : 'Purchase orders'} value={kind === 'customer' ? mySales.filter((s) => s.status === 'completed').length : myPos.filter((x) => !['draft', 'cancelled'].includes(x.status)).length} />
        <Stat label={kind === 'customer' ? 'Lifetime purchases' : 'Lifetime purchases'} value={fmtMoney(money(sum(kind === 'customer' ? mySales.filter((s) => s.status === 'completed').map((s) => s.total) : myPos.filter((x) => !['draft', 'cancelled'].includes(x.status)).map((x) => x.total))))} />
      </div>
      <Card className="mb-4"><dl className="grid grid-cols-2 gap-4 lg:grid-cols-4"><KV label="Email">{p.email}</KV><KV label="GSTIN">{p.gstin}</KV><KV label="Address">{p.address}</KV><KV label="Status"><StatusBadge status={p.status} /></KV></dl></Card>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'ledger', label: 'Ledger', count: ledger.length }, { key: 'docs', label: kind === 'customer' ? 'Invoices' : 'Purchases' }, ...(kind === 'customer' ? [{ key: 'repairs', label: 'Repairs', count: myRepairs.length }] : []), { key: 'pay', label: 'Payments', count: myPays.length }]} />
      {tab === 'ledger' && <DataTable rows={ledger} columns={ledgerCols} rowKey={(l) => l.ref + l.date + l.type} pageSizes={[25, 50, 100]} empty={{ title: 'No transactions yet' }} />}
      {tab === 'docs' && kind === 'customer' && (
        <DataTable rows={mySales} rowKey={(s) => s.id} initialSort={{ key: 'date', dir: 'desc' }} empty={{ title: 'No invoices' }} columns={[
          { key: 'inv', header: 'Invoice', value: (s) => s.invoiceNo, render: (s) => <Link className="font-medium text-gold-700 hover:underline" to={`/sales/${s.id}`}>{s.invoiceNo}</Link> },
          { key: 'date', header: 'Date', value: (s) => s.date, render: (s) => fmtDate(s.date) },
          { key: 'total', header: 'Total (₹)', num: true, value: (s) => s.total, render: (s) => fmtNum(s.total) },
          { key: 'due', header: 'Due (₹)', num: true, value: (s) => saleOutstanding(s, b.pays.data ?? []), render: (s) => fmtNum(saleOutstanding(s, b.pays.data ?? [])) },
          { key: 'st', header: 'Status', value: (s) => s.status, render: (s) => <StatusBadge status={s.status} /> },
        ]} />
      )}
      {tab === 'docs' && kind === 'supplier' && (
        <DataTable rows={myPos} rowKey={(x) => x.id} initialSort={{ key: 'date', dir: 'desc' }} empty={{ title: 'No purchases' }} columns={[
          { key: 'po', header: 'PO', value: (x) => x.poNumber, render: (x) => <Link className="font-medium text-gold-700 hover:underline" to={`/purchases/${x.id}`}>{x.poNumber}</Link> },
          { key: 'inv', header: 'Invoice', value: (x) => x.invoiceNo },
          { key: 'date', header: 'Date', value: (x) => x.date, render: (x) => fmtDate(x.date) },
          { key: 'total', header: 'Total (₹)', num: true, value: (x) => x.total, render: (x) => fmtNum(x.total) },
          { key: 'st', header: 'Status', value: (x) => x.status, render: (x) => <StatusBadge status={x.status} /> },
        ]} />
      )}
      {tab === 'repairs' && (
        <DataTable rows={myRepairs} rowKey={(r) => r.id} empty={{ title: 'No repair jobs' }} columns={[
          { key: 'job', header: 'Job', value: (r) => r.jobNo, render: (r) => <Link className="font-medium text-gold-700 hover:underline" to={`/repairs/${r.id}`}>{r.jobNo}</Link> },
          { key: 'desc', header: 'Item', value: (r) => r.description },
          { key: 'due', header: 'Due (₹)', num: true, value: (r) => repairOutstanding(r, b.pays.data ?? []), render: (r) => fmtNum(repairOutstanding(r, b.pays.data ?? [])) },
          { key: 'st', header: 'Status', value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
        ]} />
      )}
      {tab === 'pay' && (
        <DataTable rows={myPays} rowKey={(x) => x.id} initialSort={{ key: 'date', dir: 'desc' }} empty={{ title: 'No payments' }} columns={[
          { key: 'no', header: 'No.', value: (x) => x.paymentNo, render: (x) => <span className="font-mono text-[12px]">{x.paymentNo}</span> },
          { key: 'date', header: 'Date', value: (x) => x.date, render: (x) => fmtDate(x.date) },
          { key: 'dir', header: 'Direction', value: (x) => x.direction, render: (x) => <Badge tone={x.direction === 'in' ? 'green' : 'amber'}>{x.direction === 'in' ? 'In' : 'Out'} · {x.kind.replace('_', ' ')}</Badge> },
          { key: 'mode', header: 'Mode', value: (x) => x.mode, render: (x) => x.mode.toUpperCase() },
          { key: 'amt', header: 'Amount (₹)', num: true, value: (x) => x.amount, render: (x) => fmtNum(x.amount) },
          { key: 'alloc', header: 'Allocated to', value: (x) => x.allocations.map((a) => a.docNo).join(', '), render: (x) => <span className="text-muted">{x.allocations.map((a) => a.docNo).join(', ') || (D(x.amount).gt(0) ? 'Unallocated (advance)' : '')}</span> },
        ]} />
      )}
      <PartyForm kind={kind} open={edit} onClose={() => setEdit(false)} party={p} existing={list ?? []} />
      <PaymentDialog open={pay} onClose={() => setPay(false)} partyType={kind} partyId={p.id} />
    </div>
  )
}
