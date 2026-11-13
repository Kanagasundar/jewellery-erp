import { Check, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/app/auth'
import { ScanInput } from '@/components/common/ScanInput'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { EmptyState, Notice, Spinner, StatusBadge } from '@/components/ui/Feedback'
import { Bare, Input, Select, Textarea } from '@/components/ui/Form'
import { Card, KV, PageHeader, Stat, Tabs } from '@/components/ui/Layout'
import { Modal } from '@/components/ui/Modal'
import { sellBlockReason, POLISH_FLOW } from '@/domain/workflows/rules'
import { useAction, useIndex, useList, useMasters } from '@/hooks/useData'
import { erp } from '@/services'
import type { PolishingJob, StockItem } from '@/types/entities'
import { fmtDate, fmtDateTime, fmtMoney, fmtW, todayInput } from '@/utils/format'

const POLISH_TYPES = ['Buffing', 'Rhodium / high-shine', 'Matte finish', 'Antique finish', 'Ultrasonic clean', 'Re-plating']

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const m = useMasters()
  const items = useList('stockItems')
  const [item, setItem] = useState<StockItem | null>(null)
  const [err, setErr] = useState('')
  const [f, setF] = useState({ polishType: POLISH_TYPES[0], artisanId: '', labourCharge: '0', expectedDate: '', remarks: '' })
  const [q, setQ] = useState('')
  const artisans = (m.users.data ?? []).filter((u) => u.role === 'artisan' && u.active)
  const matches = useMemo(() => { const n = q.trim().toLowerCase(); return n.length < 2 ? [] : (items.data ?? []).filter((i) => i.status === 'available' && (i.itemCode.toLowerCase().includes(n) || i.barcode.toLowerCase().includes(n) || (m.productMap.get(i.productId)?.name ?? '').toLowerCase().includes(n))).slice(0, 6) }, [q, items.data, m.productMap])
  const choose = (i: StockItem) => { const b = sellBlockReason(i); if (b) { setErr(`Cannot polish: ${b}.`); return } setErr(''); setItem(i); setQ('') }
  const save = useAction(() => erp.commands.polishing.create({ stockItemId: item!.id, polishType: f.polishType, artisanId: f.artisanId || undefined, labourCharge: Number(f.labourCharge) || 0, expectedDate: new Date(f.expectedDate + 'T18:00:00').toISOString(), remarks: f.remarks }),
    { success: (j) => `${j.jobNo} created — item moved out of sellable stock`, onSuccess: (j) => { onClose(); setItem(null); nav(`/polishing/${j.id}`) } })
  return (
    <Modal open={open} onClose={onClose} size="lg" title="New polishing job" description="The item leaves sellable stock until it is returned after quality check."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!item || !f.expectedDate} loading={save.pending} onClick={() => save.run()}>Create job</Button></>}>
      {item ? (
        <div className="mb-3 flex items-center justify-between rounded-md border border-gold-200 bg-gold-50 px-3 py-2 text-[13px]"><span><strong>{m.productMap.get(item.productId)?.name}</strong> · <span className="font-mono text-[12px]">{item.itemCode}</span> · received weight {fmtW(item.grossWeight)} g</span><Button size="sm" variant="ghost" onClick={() => setItem(null)}>Change</Button></div>
      ) : (
        <div className="mb-3 space-y-2"><ScanInput onScan={async (c) => { const r = await erp.commands.barcodes.lookup(c); if (!r) setErr(`No item found for “${c}”.`); else choose(r.item) }} autoFocus={false} />
          <input aria-label="Search item" value={q} onChange={(e) => setQ(e.target.value)} placeholder="…or search available items by name / code" className="h-9 w-full rounded-md border border-line-strong px-3 text-[13px] focus:border-gold-500 focus:ring-2 focus:ring-gold-200 focus:outline-none" />
          {matches.map((i) => <button key={i.id} className="flex w-full justify-between rounded-md border border-line px-3 py-2 text-left text-[13px] hover:bg-canvas" onClick={() => choose(i)}><span>{m.productMap.get(i.productId)?.name}</span><span className="font-mono text-[12px] text-muted">{i.itemCode}</span></button>)}
          {err && <Notice tone="red">{err}</Notice>}</div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Polishing type" value={f.polishType} onChange={(e) => setF({ ...f, polishType: e.target.value })}>{POLISH_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
        <Select label="Assign worker" value={f.artisanId} onChange={(e) => setF({ ...f, artisanId: e.target.value })}><option value="">Assign later</option>{artisans.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        <Input label="Labour charge (₹)" type="number" step="0.01" value={f.labourCharge} onChange={(e) => setF({ ...f, labourCharge: e.target.value })} />
        <Input label="Expected completion" type="date" min={todayInput()} required value={f.expectedDate} onChange={(e) => setF({ ...f, expectedDate: e.target.value })} />
        <Textarea label="Remarks" rows={2} wrapperClassName="sm:col-span-2" value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} />
      </div>
    </Modal>
  )
}

export function PolishingListPage() {
  const nav = useNavigate()
  const { can, user } = useAuth()
  const [sp, setSp] = useSearchParams()
  const m = useMasters()
  const jobs = useList('polishing'), items = useList('stockItems')
  const itemMap = useIndex(items.data)
  const [tab, setTab] = useState('open')
  const [dlg, setDlg] = useState(!!sp.get('new'))
  const mine = user?.role === 'artisan'
  const base = (jobs.data ?? []).filter((j) => !mine || j.artisanId === user?.id)
  const rows = base.filter((j) => (tab === 'open' ? j.status !== 'returned' : tab === 'done' ? j.status === 'returned' : true))
  const now = new Date().toISOString()
  const cols: Column<PolishingJob>[] = [
    { key: 'job', header: 'Job no.', value: (j) => j.jobNo, render: (j) => <span className="font-mono text-[12px] font-medium">{j.jobNo}</span> },
    { key: 'item', header: 'Item', value: (j) => itemMap.get(j.stockItemId)?.itemCode, render: (j) => { const i = itemMap.get(j.stockItemId); return <><span className="font-medium">{m.productMap.get(i?.productId ?? '')?.name}</span><div className="font-mono text-[11.5px] text-muted">{i?.itemCode}</div></> } },
    { key: 'type', header: 'Type', value: (j) => j.polishType },
    { key: 'art', header: 'Worker', value: (j) => m.userMap.get(j.artisanId ?? '')?.name, render: (j) => m.userMap.get(j.artisanId ?? '')?.name ?? <span className="text-muted">Unassigned</span> },
    { key: 'bw', header: 'Before (g)', num: true, value: (j) => j.beforeWeight, render: (j) => fmtW(j.beforeWeight) },
    { key: 'diff', header: 'Loss (g)', num: true, value: (j) => j.weightDiff, render: (j) => (j.afterWeight ? fmtW(j.weightDiff) : '—') },
    { key: 'exp', header: 'Expected', value: (j) => j.expectedDate, render: (j) => <span className={j.status !== 'returned' && j.expectedDate < now ? 'font-medium text-bad' : ''}>{fmtDate(j.expectedDate)}</span> },
    { key: 'st', header: 'Status', value: (j) => j.status, render: (j) => <StatusBadge status={j.status} /> },
  ]
  return (
    <div className="fade-in">
      <PageHeader title="Polishing" subtitle={mine ? 'Jobs assigned to you.' : 'In-house finishing jobs, tracked against the original stock item.'} actions={can('polishing.manage') && <Button variant="primary" icon={<Plus size={15} />} onClick={() => setDlg(true)}>New polishing job</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">{POLISH_FLOW.slice(0, 5).map((s) => <Stat key={s} label={s.replace('_', ' ')} value={base.filter((j) => j.status === s).length} />)}</div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'open', label: 'Open', count: base.filter((j) => j.status !== 'returned').length }, { key: 'done', label: 'Returned to stock' }, { key: 'all', label: 'All' }]} />
      <DataTable rows={rows} columns={cols} rowKey={(j) => j.id} loading={jobs.isLoading || m.loading} error={jobs.error} initialSort={{ key: 'job', dir: 'desc' }} onRowClick={(j) => nav(`/polishing/${j.id}`)} searchPlaceholder="Search job, item…" empty={{ title: 'No polishing jobs here' }} />
      <CreateDialog open={dlg} onClose={() => { setDlg(false); sp.delete('new'); setSp(sp, { replace: true }) }} />
    </div>
  )
}

export function PolishingDetailPage() {
  const { id = '' } = useParams()
  const { can, user } = useAuth()
  const m = useMasters()
  const jobs = useList('polishing'), items = useList('stockItems')
  const j = jobs.data?.find((x) => x.id === id)
  const item = items.data?.find((i) => i.id === j?.stockItemId)
  const [artisan, setArtisan] = useState('')
  const [after, setAfter] = useState('')
  const [remarks, setRemarks] = useState('')
  const [qcNote, setQcNote] = useState('')
  const a = {
    assign: useAction((x: string) => erp.commands.polishing.assign(id, x), { success: 'Worker assigned' }),
    start: useAction(() => erp.commands.polishing.start(id), { success: 'Polishing started' }),
    submit: useAction(() => erp.commands.polishing.submitForQc(id, Number(after), remarks), { success: 'Sent for quality check' }),
    qc: useAction((ok: boolean) => erp.commands.polishing.qc(id, ok, qcNote), { success: (x) => (x.qcPassed ? 'Quality check passed' : 'Quality check failed — job returned to the worker') }),
    ret: useAction(() => erp.commands.polishing.returnToStock(id), { success: 'Item returned to available stock with its new weight' }),
  }
  if (jobs.isLoading || m.loading) return <Spinner />
  if (!j) return <div className="card"><EmptyState title="Polishing job not found" /></div>
  const artisans = (m.users.data ?? []).filter((u) => u.role === 'artisan' && u.active)
  const isMine = user?.role !== 'artisan' || j.artisanId === user.id
  const stepIdx = POLISH_FLOW.indexOf(j.status)
  const loss = after ? j.beforeWeight - Number(after) : 0

  return (
    <div className="fade-in">
      <PageHeader back="/polishing" title={j.jobNo} subtitle={`${m.productMap.get(item?.productId ?? '')?.name ?? ''} · ${item?.itemCode ?? ''}`} actions={<StatusBadge status={j.status} />} />
      <ol className="no-print mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Job progress">
        {POLISH_FLOW.map((s, i) => <li key={s} className={`rounded-md border px-2 py-2 text-center text-[11.5px] font-medium capitalize ${i < stepIdx ? 'border-ok/30 bg-ok-bg text-ok' : i === stepIdx ? 'border-gold-400 bg-gold-50 text-gold-700' : 'border-line bg-white text-faint'}`}>{i < stepIdx && <Check size={11} className="mr-1 inline" />}{s.replace('_', ' ')}</li>)}
      </ol>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Before polishing" value={`${fmtW(j.beforeWeight)} g`} /><Stat label="After polishing" value={j.afterWeight ? `${fmtW(j.afterWeight)} g` : '—'} /><Stat label="Weight difference" value={j.afterWeight ? `${fmtW(j.weightDiff)} g` : '—'} tone={j.weightDiff > 0.1 ? 'warn' : undefined} /><Stat label="Labour charge" value={fmtMoney(j.labourCharge)} /></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Next step">
            {j.status === 'returned' ? <Notice tone="green">Returned to inventory. The item is back in available stock with weight {fmtW(item?.grossWeight ?? 0)} g.</Notice>
              : !isMine ? <Notice tone="amber">This job is assigned to another worker.</Notice>
              : (
                <div className="space-y-3">
                  {['pending', 'assigned'].includes(j.status) && can('polishing.manage') && <div className="flex flex-wrap items-end gap-2"><label className="flex flex-col gap-1 text-[12px] font-medium">Worker<Bare.select value={artisan || j.artisanId || ''} onChange={(e) => setArtisan(e.target.value)}><option value="">Select…</option>{artisans.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Bare.select></label><Button disabled={!(artisan || j.artisanId)} loading={a.assign.pending} onClick={() => a.assign.run(artisan || j.artisanId!)}>{j.status === 'pending' ? 'Assign worker' : 'Reassign'}</Button></div>}
                  {j.status === 'assigned' && can('polishing.update') && <Button variant="primary" loading={a.start.pending} onClick={() => a.start.run()}>Start polishing</Button>}
                  {j.status === 'in_progress' && can('polishing.update') && <div className="grid gap-3 sm:grid-cols-2">
                    {j.qcPassed === false && <div className="sm:col-span-2"><Notice tone="red">Failed QC: {j.qcRemarks}</Notice></div>}
                    <Input label="Weight after polishing (g)" type="number" step="0.001" value={after} onChange={(e) => setAfter(e.target.value)} hint={after ? `Loss ${loss.toFixed(3)} g` : `Before: ${fmtW(j.beforeWeight)} g`} />
                    <Input label="Worker remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                    <div className="sm:col-span-2"><Button variant="primary" disabled={!after} loading={a.submit.pending} onClick={() => a.submit.run()}>Submit for quality check</Button></div></div>}
                  {j.status === 'quality_check' && can('polishing.manage') && <div className="space-y-2"><Textarea label="Inspection notes" rows={2} value={qcNote} onChange={(e) => setQcNote(e.target.value)} /><div className="flex gap-2"><Button variant="primary" loading={a.qc.pending} onClick={() => a.qc.run(true)}>Pass</Button><Button variant="danger" disabled={!qcNote.trim()} onClick={() => a.qc.run(false)}>Fail (send back)</Button></div></div>}
                  {j.status === 'quality_check' && !can('polishing.manage') && <Notice tone="blue">Awaiting quality inspection by a supervisor.</Notice>}
                  {j.status === 'completed' && can('polishing.manage') && <Button variant="gold" loading={a.ret.pending} onClick={() => a.ret.run()}>Return item to inventory</Button>}
                </div>)}
          </Card>
          <Card title="Details"><dl className="grid grid-cols-2 gap-4 sm:grid-cols-3"><KV label="Item">{item && <Link className="font-mono text-[12px] text-gold-700 hover:underline" to={`/barcodes?q=${item.barcode}`}>{item.itemCode}</Link>}</KV><KV label="Polishing type">{j.polishType}</KV><KV label="Worker">{m.userMap.get(j.artisanId ?? '')?.name}</KV><KV label="Expected">{fmtDate(j.expectedDate)}</KV><KV label="Created">{fmtDateTime(j.createdAt)}</KV><KV label="Remarks">{j.remarks}</KV></dl></Card>
        </div>
        <Card title="History"><ol className="space-y-3">{j.history.map((h, i) => <li key={i} className="relative border-l-2 border-gold-200 pl-3"><span className="absolute top-1 -left-[5px] h-2 w-2 rounded-full bg-gold-500" aria-hidden /><p className="text-[13px] font-medium capitalize">{h.status.replace('_', ' ')}</p><p className="text-[11.5px] text-muted">{fmtDateTime(h.at)} · {h.by}</p>{h.note && <p className="text-[12px]">{h.note}</p>}</li>)}</ol></Card>
      </div>
    </div>
  )
}
