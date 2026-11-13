import { zodResolver } from '@hookform/resolvers/zod'
import { Check, ImagePlus, Plus, Play, Truck, UserCheck, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Resolver } from 'react-hook-form'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '@/app/auth'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Badge, EmptyState, Notice, Spinner, StatusBadge } from '@/components/ui/Feedback'
import { Bare, Input, Select, Textarea } from '@/components/ui/Form'
import { Card, KV, PageHeader, Stat, Tabs } from '@/components/ui/Layout'
import { Modal, useConfirm } from '@/components/ui/Modal'
import { paidAgainst, repairOutstanding } from '@/domain/calculations/ledger'
import { useAction, useIndex, useList, useMasters } from '@/hooks/useData'
import { PaymentDialog } from '@/features/payments/PaymentDialog'
import { erp } from '@/services'
import type { PaymentMode, Repair } from '@/types/entities'
import { fileToDataUrl } from '@/utils/image'
import { fmtDate, fmtDateTime, fmtMoney, fmtNum, fmtW, todayInput } from '@/utils/format'

const schema = z.object({
  customerId: z.string().min(1, 'Select a customer'),
  description: z.string().trim().min(3, 'Describe the item'),
  repairType: z.string().min(1, 'Choose a repair type'),
  receivedWeight: z.number({ error: 'Enter the received weight' }).positive('Must be > 0'),
  damage: z.string(), instructions: z.string(),
  expectedDelivery: z.string().min(1, 'Set an expected delivery date'),
  artisanId: z.string(),
  labourEstimate: z.number({ error: 'Enter an estimate (0 if unknown)' }).min(0),
  advanceAmount: z.number({ error: 'Enter 0 if none' }).min(0),
  advanceMode: z.enum(['cash', 'upi', 'card', 'bank']),
})
type FV = z.infer<typeof schema>
export const REPAIR_TYPES = ['Soldering', 'Resize', 'Stone setting', 'Clasp / hook', 'Polish', 'Re-plating', 'Chain repair', 'Other']

function RepairForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const m = useMasters()
  const { can } = useAuth()
  const [photos, setPhotos] = useState<string[]>([])
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FV>({ resolver: zodResolver(schema) as Resolver<FV> })
  useEffect(() => { if (open) { reset({ customerId: '', description: '', repairType: '', damage: '', instructions: '', expectedDelivery: '', artisanId: '', labourEstimate: 0, advanceAmount: 0, advanceMode: 'cash' } as unknown as FV); setPhotos([]) } }, [open, reset])
  const artisans = (m.users.data ?? []).filter((u) => u.role === 'artisan' && u.active)
  const save = useAction((v: FV) => erp.commands.repairs.create({ customerId: v.customerId, description: v.description, repairType: v.repairType, receivedWeight: v.receivedWeight, damage: v.damage, instructions: v.instructions, expectedDelivery: new Date(v.expectedDelivery + 'T18:00:00').toISOString(), artisanId: v.artisanId || undefined, labourEstimate: v.labourEstimate, photos, advance: v.advanceAmount > 0 ? { amount: v.advanceAmount, mode: v.advanceMode as PaymentMode } : undefined }),
    { success: (r) => `Repair job ${r.jobNo} created`, onSuccess: (r) => { onClose(); nav(`/repairs/${r.id}`) } })
  return (
    <Modal open={open} onClose={onClose} size="lg" title="New repair receipt" description="Customer jewellery received for repair. It stays separate from sales stock."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.pending} onClick={handleSubmit((v) => save.run(v))}>Create job</Button></>}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <Select label="Customer" required wrapperClassName="sm:col-span-2" {...register('customerId')} error={errors.customerId?.message}><option value="">Select…</option>{(m.customers.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</Select>
        {can('customers.manage') && <p className="-mt-1 text-[11.5px] text-muted sm:col-span-2">New customer? <Link className="text-gold-700 underline" to="/customers">Add them in Customers</Link> first.</p>}
        <Input label="Jewellery description" required wrapperClassName="sm:col-span-2" placeholder="e.g. Gold chain 22K, broken link" {...register('description')} error={errors.description?.message} />
        <Select label="Repair type" required {...register('repairType')} error={errors.repairType?.message}><option value="">Select…</option>{REPAIR_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
        <Input label="Received weight (g)" type="number" step="0.001" required {...register('receivedWeight', { valueAsNumber: true })} error={errors.receivedWeight?.message} />
        <Textarea label="Existing damage" rows={2} {...register('damage')} /><Textarea label="Repair instructions" rows={2} {...register('instructions')} />
        <Input label="Expected delivery" type="date" min={todayInput()} required {...register('expectedDelivery')} error={errors.expectedDelivery?.message} />
        <Select label="Assign artisan" {...register('artisanId')}><option value="">Assign later</option>{artisans.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <Input label="Labour estimate (₹)" type="number" step="0.01" {...register('labourEstimate', { valueAsNumber: true })} error={errors.labourEstimate?.message} />
        <div className="grid grid-cols-2 gap-2"><Input label="Advance (₹)" type="number" step="0.01" {...register('advanceAmount', { valueAsNumber: true })} error={errors.advanceAmount?.message} /><Select label="Advance via" {...register('advanceMode')}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option></Select></div>
        <div className="sm:col-span-2"><p className="text-[12px] font-medium text-ink-2">Photographs</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">{photos.map((p, i) => <div key={i} className="relative"><img src={p} alt={`Item ${i + 1}`} className="h-16 w-16 rounded-md border border-line object-cover" /><button type="button" aria-label="Remove photo" onClick={() => setPhotos((s) => s.filter((_, k) => k !== i))} className="absolute -top-1.5 -right-1.5 rounded-full bg-ink p-0.5 text-white"><X size={11} /></button></div>)}
            <label className="grid h-16 w-16 cursor-pointer place-items-center rounded-md border border-dashed border-line-strong text-faint hover:bg-canvas"><ImagePlus size={18} /><span className="sr-only">Add photo</span><input type="file" accept="image/*" multiple className="sr-only" onChange={async (e) => { const fs = [...(e.target.files ?? [])].slice(0, 4); const out = await Promise.all(fs.map((f) => fileToDataUrl(f, 800))); setPhotos((s) => [...s, ...out].slice(0, 4)) }} /></label></div></div>
      </form>
    </Modal>
  )
}

export function RepairsListPage() {
  const nav = useNavigate()
  const { can, user } = useAuth()
  const [sp, setSp] = useSearchParams()
  const m = useMasters()
  const repairs = useList('repairs'), pays = useList('payments')
  const [tab, setTab] = useState('open')
  const [form, setForm] = useState(!!sp.get('new'))
  const mine = user?.role === 'artisan'
  const base = useMemo(() => (repairs.data ?? []).filter((r) => !mine || r.artisanId === user?.id), [repairs.data, mine, user?.id])
  const rows = base.filter((r) => (tab === 'open' ? !['delivered', 'cancelled'].includes(r.status) : tab === 'done' ? ['delivered', 'cancelled'].includes(r.status) : true))
  const now = new Date().toISOString()
  const cols: Column<Repair>[] = [
    { key: 'job', header: 'Job no.', value: (r) => r.jobNo, render: (r) => <span className="font-mono text-[12px] font-medium">{r.jobNo}</span> },
    { key: 'cust', header: 'Customer', value: (r) => m.customerMap.get(r.customerId)?.name },
    { key: 'desc', header: 'Item', value: (r) => r.description, render: (r) => <><span className="font-medium">{r.description}</span><div className="text-[11.5px] text-muted">{r.repairType} · {fmtW(r.receivedWeight)} g{r.stockItemId ? ' · shop item' : ''}</div></> },
    { key: 'art', header: 'Artisan', value: (r) => m.userMap.get(r.artisanId ?? '')?.name, render: (r) => m.userMap.get(r.artisanId ?? '')?.name ?? <span className="text-muted">Unassigned</span> },
    { key: 'due', header: 'Expected', value: (r) => r.expectedDelivery, render: (r) => <span className={!['delivered', 'cancelled'].includes(r.status) && r.expectedDelivery < now ? 'font-medium text-bad' : ''}>{fmtDate(r.expectedDelivery)}</span> },
    { key: 'bal', header: 'Balance (₹)', num: true, value: (r) => repairOutstanding(r, pays.data ?? []), render: (r) => fmtNum(repairOutstanding(r, pays.data ?? [])) },
    { key: 'st', header: 'Status', value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
  ]
  return (
    <div className="fade-in">
      <PageHeader title="Repairs" subtitle={mine ? 'Jobs assigned to you.' : 'Receive, assign, track and deliver customer repairs.'} actions={can('repairs.manage') && <Button variant="primary" icon={<Plus size={15} />} onClick={() => setForm(true)}>New repair</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(['received', 'assigned', 'in_progress', 'completed'] as const).map((s) => <Stat key={s} label={s.replace('_', ' ')} value={base.filter((r) => r.status === s).length} />)}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'open', label: 'Open jobs', count: base.filter((r) => !['delivered', 'cancelled'].includes(r.status)).length }, { key: 'done', label: 'Delivered / cancelled' }, { key: 'all', label: 'All' }]} />
      <DataTable rows={rows} columns={cols} rowKey={(r) => r.id} loading={repairs.isLoading || m.loading} error={repairs.error} initialSort={{ key: 'job', dir: 'desc' }} onRowClick={(r) => nav(`/repairs/${r.id}`)} searchPlaceholder="Search job, customer, item…" empty={{ title: 'No repair jobs here' }} />
      <RepairForm open={form} onClose={() => { setForm(false); sp.delete('new'); setSp(sp, { replace: true }) }} />
    </div>
  )
}

export function RepairDetailPage() {
  const { id = '' } = useParams()
  const { can, user } = useAuth()
  const confirm = useConfirm()
  const m = useMasters()
  const repairs = useList('repairs'), pays = useList('payments'), items = useList('stockItems')
  const itemMap = useIndex(items.data)
  const r = repairs.data?.find((x) => x.id === id)
  const [pay, setPay] = useState(false)
  const [done, setDone] = useState<{ labour: string; note: string } | null>(null)
  const [artisan, setArtisan] = useState('')
  const a = {
    assign: useAction((aid: string) => erp.commands.repairs.assign(id, aid), { success: 'Artisan assigned' }),
    start: useAction(() => erp.commands.repairs.start(id), { success: 'Work started' }),
    complete: useAction((l: number, n: string) => erp.commands.repairs.complete(id, l, n), { success: 'Marked completed', onSuccess: () => setDone(null) }),
    deliver: useAction(() => erp.commands.repairs.deliver(id), { success: 'Delivered to customer' }),
    cancel: useAction((reason: string) => erp.commands.repairs.cancel(id, reason), { success: 'Repair cancelled' }),
  }
  if (repairs.isLoading || m.loading) return <Spinner />
  if (!r) return <div className="card"><EmptyState title="Repair job not found" /></div>
  const cust = m.customerMap.get(r.customerId)
  const due = repairOutstanding(r, pays.data ?? [])
  const paid = paidAgainst(pays.data ?? [], 'repair', r.id)
  const artisans = (m.users.data ?? []).filter((u) => u.role === 'artisan' && u.active)
  const isMine = user?.role !== 'artisan' || r.artisanId === user.id
  const next = r.status

  return (
    <div className="fade-in">
      <PageHeader back="/repairs" title={r.jobNo} subtitle={`${cust?.name ?? ''} · ${r.description}`}
        actions={<>
          <StatusBadge status={r.status} />
          {next === 'received' && can('repairs.manage') && <><Bare.select aria-label="Artisan" value={artisan} onChange={(e) => setArtisan(e.target.value)}><option value="">Select artisan…</option>{artisans.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Bare.select><Button icon={<UserCheck size={14} />} disabled={!artisan} loading={a.assign.pending} onClick={() => a.assign.run(artisan)}>Assign</Button></>}
          {next === 'assigned' && can('repairs.update') && isMine && <Button variant="primary" icon={<Play size={14} />} loading={a.start.pending} onClick={() => a.start.run()}>Start work</Button>}
          {next === 'in_progress' && can('repairs.update') && isMine && <Button variant="primary" icon={<Check size={14} />} onClick={() => setDone({ labour: String(r.labourEstimate), note: '' })}>Complete work</Button>}
          {next === 'completed' && due > 0 && can('payments.manage') && <Button variant="gold" onClick={() => setPay(true)}>Collect {fmtMoney(due)}</Button>}
          {next === 'completed' && can('repairs.manage') && <Button variant="primary" icon={<Truck size={14} />} loading={a.deliver.pending} onClick={() => a.deliver.run()}>Deliver to customer</Button>}
          {!['delivered', 'cancelled'].includes(next) && can('repairs.manage') && <Button variant="danger" onClick={async () => { const x = await confirm({ title: `Cancel ${r.jobNo}?`, reasonLabel: 'Reason', confirmLabel: 'Cancel job', danger: true }); if (x) a.cancel.run(x) }}>Cancel</Button>}
        </>} />
      {next === 'completed' && due > 0 && <div className="mb-3"><Notice tone="amber">Collect the outstanding {fmtMoney(due)} before delivery.</Notice></div>}
      {user?.role === 'artisan' && !isMine && <div className="mb-3"><Notice tone="amber">This job is assigned to another artisan.</Notice></div>}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Labour estimate" value={fmtMoney(r.labourEstimate)} /><Stat label="Final charge" value={r.labourFinal ? fmtMoney(r.labourFinal) : '—'} /><Stat label="Paid (advance + final)" value={fmtMoney(paid)} /><Stat label="Balance" value={fmtMoney(due)} tone={due > 0 ? 'bad' : undefined} /></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Job details" className="lg:col-span-2"><dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KV label="Customer">{cust && <Link to={`/customers/${cust.id}`} className="text-gold-700 hover:underline">{cust.name}</Link>}</KV><KV label="Phone">{cust?.phone}</KV><KV label="Repair type">{r.repairType}</KV>
          <KV label="Received weight">{fmtW(r.receivedWeight)} g</KV><KV label="Expected delivery">{fmtDate(r.expectedDelivery)}</KV><KV label="Artisan">{m.userMap.get(r.artisanId ?? '')?.name}</KV>
          <KV label="Existing damage">{r.damage}</KV><KV label="Instructions">{r.instructions}</KV>{r.stockItemId && <KV label="Shop stock item"><span className="font-mono text-[12px]">{itemMap.get(r.stockItemId)?.itemCode}</span> <Badge tone="blue">Not for sale</Badge></KV>}
        </dl>
          {r.photos.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{r.photos.map((p, i) => <img key={i} src={p} alt={`Received item ${i + 1}`} className="h-24 w-24 rounded-md border border-line object-cover" />)}</div>}
        </Card>
        <Card title="Timeline"><ol className="space-y-3">{r.history.map((h, i) => <li key={i} className="relative border-l-2 border-gold-200 pl-3"><span className="absolute top-1 -left-[5px] h-2 w-2 rounded-full bg-gold-500" aria-hidden /><p className="text-[13px] font-medium capitalize">{h.status.replace('_', ' ')}</p><p className="text-[11.5px] text-muted">{fmtDateTime(h.at)} · {h.by}</p>{h.note && <p className="text-[12px] text-ink-2">{h.note}</p>}</li>)}</ol></Card>
      </div>
      <Modal open={!!done} onClose={() => setDone(null)} size="sm" title="Complete repair" footer={<><Button onClick={() => setDone(null)}>Cancel</Button><Button variant="primary" loading={a.complete.pending} onClick={() => done && a.complete.run(Number(done.labour), done.note)}>Mark completed</Button></>}>
        {done && <div className="space-y-3"><Input label="Final labour charge (₹)" type="number" step="0.01" value={done.labour} onChange={(e) => setDone({ ...done, labour: e.target.value })} /><Textarea label="Work notes" rows={2} value={done.note} onChange={(e) => setDone({ ...done, note: e.target.value })} /></div>}
      </Modal>
      <PaymentDialog open={pay} onClose={() => setPay(false)} partyType="customer" partyId={r.customerId} />
    </div>
  )
}
