import { AlertTriangle, CheckCircle2, Plus, ScanLine, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/app/auth'
import { ScanInput } from '@/components/common/ScanInput'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Badge, EmptyState, Notice, Spinner, StatusBadge } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/Form'
import { Card, PageHeader, Stat, Tabs } from '@/components/ui/Layout'
import { Modal, useConfirm } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useBranch } from '@/hooks/useBranch'
import { useAction, useIndex, useList, useMasters } from '@/hooks/useData'
import { erp } from '@/services'
import type { AuditDiscrepancy, StockAudit } from '@/types/entities'
import { fmtDateTime, fmtW } from '@/utils/format'

export function AuditListPage() {
  const nav = useNavigate()
  const { can } = useAuth()
  const m = useMasters()
  const { branches, operating, nameOf } = useBranch()
  const audits = useList('audits'), adj = useList('adjustments')
  const [dlg, setDlg] = useState(false)
  const [title, setTitle] = useState(''), [cat, setCat] = useState(''), [br, setBr] = useState('')
  const [tab, setTab] = useState('audits')
  const create = useAction(() => erp.commands.audits.create({ title, branchId: br, categoryId: cat || undefined }), { success: (a) => `${a.auditNo} started — ${a.expectedItemIds.length} items expected`, onSuccess: (a) => { setDlg(false); nav(`/stock-audit/${a.id}`) } })
  const cols: Column<StockAudit>[] = [
    { key: 'no', header: 'Audit no.', value: (a) => a.auditNo, render: (a) => <span className="font-mono text-[12px] font-medium">{a.auditNo}</span> },
    { key: 'title', header: 'Title', value: (a) => a.title, render: (a) => <span className="font-medium">{a.title}</span> },
    { key: 'br', header: 'Branch', value: (a) => nameOf(a.branchId) },
    { key: 'scope', header: 'Scope', value: (a) => m.categoryMap.get(a.categoryId ?? '')?.name ?? 'Whole shop' },
    { key: 'date', header: 'Started', value: (a) => a.createdAt, render: (a) => fmtDateTime(a.createdAt) },
    { key: 'exp', header: 'Expected', num: true, value: (a) => a.expectedItemIds.length },
    { key: 'scan', header: 'Scanned', num: true, value: (a) => a.scans.length },
    { key: 'disc', header: 'Discrepancies', num: true, value: (a) => a.discrepancies.length, render: (a) => (a.status === 'in_progress' ? '—' : a.discrepancies.length ? <Badge tone="amber">{a.discrepancies.length}</Badge> : <Badge tone="green">0</Badge>) },
    { key: 'st', header: 'Status', value: (a) => a.status, render: (a) => <StatusBadge status={a.status} /> },
  ]
  return (
    <div className="fade-in">
      <PageHeader title="Stock checking" subtitle="Physical verification against system stock. Nothing changes until an approver posts the adjustment." actions={can('audit.manage') && <Button variant="primary" icon={<Plus size={15} />} onClick={() => { setTitle(`Stock check ${new Date().toLocaleDateString('en-IN')}`); setCat(''); setBr(operating?.id ?? ''); setDlg(true) }}>New audit session</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'audits', label: 'Audit sessions', count: audits.data?.length }, { key: 'adj', label: 'Stock adjustments', count: adj.data?.length }]} />
      {tab === 'audits' ? <DataTable rows={audits.data} columns={cols} rowKey={(a) => a.id} loading={audits.isLoading} error={audits.error} initialSort={{ key: 'no', dir: 'desc' }} onRowClick={(a) => nav(`/stock-audit/${a.id}`)} empty={{ title: 'No audits yet', hint: 'Start a session and scan the items on the shelf.' }} />
        : <DataTable rows={adj.data} rowKey={(a) => a.id} loading={adj.isLoading} initialSort={{ key: 'date', dir: 'desc' }} empty={{ title: 'No stock adjustments posted' }} columns={[
          { key: 'date', header: 'Date', value: (a) => a.createdAt, render: (a) => fmtDateTime(a.createdAt) }, { key: 'audit', header: 'Audit', value: (a) => a.auditNo, render: (a) => <span className="font-mono text-[12px]">{a.auditNo}</span> },
          { key: 'kind', header: 'Adjustment', value: (a) => a.kind, render: (a) => <Badge tone={a.kind === 'found' ? 'green' : 'red'}>{a.kind === 'weight' ? 'Weight correction' : a.kind === 'found' ? 'Found' : 'Written off as missing'}</Badge> },
          { key: 'ow', header: 'Old (g)', num: true, value: (a) => a.oldWeight, render: (a) => fmtW(a.oldWeight) }, { key: 'nw', header: 'New (g)', num: true, value: (a) => a.newWeight, render: (a) => fmtW(a.newWeight) },
          { key: 'by', header: 'Approved by', value: (a) => a.approvedBy }, { key: 'why', header: 'Reason', value: (a) => a.reason, render: (a) => <span className="text-muted">{a.reason}</span> }]} />}
      <Modal open={dlg} onClose={() => setDlg(false)} size="sm" title="New audit session" footer={<><Button onClick={() => setDlg(false)}>Cancel</Button><Button variant="primary" disabled={!title.trim() || !br} loading={create.pending} onClick={() => create.run()}>Start</Button></>}>
        <div className="space-y-3"><Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required /><Select label="Branch to audit" required value={br} onChange={(e) => setBr(e.target.value)} hint="Only items held at this branch are expected">{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select><Select label="Scope" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{(m.categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
      </Modal>
    </div>
  )
}

const KIND: Record<AuditDiscrepancy['kind'], { label: string; tone: string; effect: string }> = {
  missing: { label: 'Missing', tone: 'red', effect: 'On approval: item marked MISSING and removed from available stock.' },
  extra: { label: 'Extra / unexpected', tone: 'amber', effect: 'Found in shop but not expected. If it was marked missing it is restocked; otherwise flagged for review.' },
  weight: { label: 'Weight variance', tone: 'amber', effect: 'On approval: item weight corrected to the physical weight.' },
  unknown: { label: 'Unknown barcode', tone: 'red', effect: 'Barcode not in the system — investigate. No automatic adjustment.' },
}

export function AuditDetailPage() {
  const { id = '' } = useParams()
  const { can } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const m = useMasters()
  const { nameOf } = useBranch()
  const audits = useList('audits'), items = useList('stockItems'), adj = useList('adjustments')
  const itemMap = useIndex(items.data)
  const au = audits.data?.find((a) => a.id === id)
  const [weigh, setWeigh] = useState(false)
  const [lastScan, setLastScan] = useState<{ text: string; tone: 'green' | 'amber' | 'red' } | null>(null)
  const [tab, setTab] = useState('scanned')
  const scanBox = useRef<HTMLDivElement>(null)

  const act = {
    submit: useAction(() => erp.commands.audits.submit(id), { success: 'Submitted for approval' }),
    approve: useAction((n: string) => erp.commands.audits.approve(id, n), { success: 'Approved — adjustments posted to the stock ledger' }),
    reject: useAction((n: string) => erp.commands.audits.reject(id, n), { success: 'Audit rejected — no stock changed' }),
    remove: useAction((c: string) => erp.commands.audits.removeScan(id, c)),
  }
  const onScan = async (code: string) => {
    if (!au) return
    let w: number | undefined
    if (weigh) { const v = window.prompt(`Physical gross weight for ${code} (g)`); if (v === null) return; w = Number(v) || undefined }
    try {
      const { result } = await erp.commands.audits.scan(id, code, w)
      await audits.refetch()
      const msg = { matched: ['Matched', 'green'], extra: ['Not expected in this audit (extra)', 'amber'], unknown: ['Unknown barcode', 'red'], duplicate: ['Already scanned', 'amber'] } as const
      setLastScan({ text: `${code} — ${msg[result][0]}`, tone: msg[result][1] })
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Scan failed') }
  }
  const progress = useMemo(() => {
    if (!au) return { matched: 0, expected: 0 }
    const sc = new Set(au.scans.map((s) => s.stockItemId))
    return { matched: au.expectedItemIds.filter((i) => sc.has(i)).length, expected: au.expectedItemIds.length }
  }, [au])
  if (audits.isLoading || m.loading) return <Spinner />
  if (!au) return <div className="card"><EmptyState title="Audit not found" /></div>

  const open = au.status === 'in_progress'
  const remaining = au.expectedItemIds.filter((i) => !au.scans.some((s) => s.stockItemId === i))
  const myAdj = (adj.data ?? []).filter((a) => a.auditId === au.id)
  const dCols: Column<AuditDiscrepancy>[] = [
    { key: 'kind', header: 'Type', value: (d) => d.kind, render: (d) => <Badge tone={KIND[d.kind].tone}>{KIND[d.kind].label}</Badge> },
    { key: 'item', header: 'Item', value: (d) => d.itemCode ?? d.barcode, render: (d) => <><span className="font-mono text-[12px]">{d.itemCode ?? d.barcode}</span><div className="text-[11.5px] text-muted">{d.name}</div></> },
    { key: 'sw', header: 'System (g)', num: true, value: (d) => d.systemWeight ?? 0, render: (d) => (d.systemWeight ? fmtW(d.systemWeight) : '—') },
    { key: 'pw', header: 'Physical (g)', num: true, value: (d) => d.physicalWeight ?? 0, render: (d) => (d.physicalWeight ? fmtW(d.physicalWeight) : '—') },
    { key: 'note', header: 'Note', value: (d) => d.note, render: (d) => <span className="text-muted">{d.note}</span> },
    { key: 'fx', header: 'Effect of approval', render: (d) => <span className="text-[11.5px] text-muted">{KIND[d.kind].effect}</span> },
  ]

  return (
    <div className="fade-in">
      <PageHeader back="/stock-audit" title={`${au.auditNo} · ${au.title}`} subtitle={`${nameOf(au.branchId)} · ${m.categoryMap.get(au.categoryId ?? '')?.name ?? 'All categories'} · started ${fmtDateTime(au.createdAt)}`}
        actions={<><StatusBadge status={au.status} />
          {open && can('audit.manage') && <Button variant="primary" loading={act.submit.pending} onClick={async () => { if (!remaining.length || (await confirm({ title: 'Submit with unscanned items?', message: `${remaining.length} expected item(s) were not scanned and will be reported as MISSING.`, confirmLabel: 'Submit audit' }))) act.submit.run() }}>Finish & submit</Button>}
          {au.status === 'pending_approval' && can('audit.approve') && <><Button variant="danger" onClick={async () => { const n = await confirm({ title: 'Reject audit?', reasonLabel: 'Reason', confirmLabel: 'Reject', danger: true }); if (n) act.reject.run(n) }}>Reject</Button><Button variant="gold" loading={act.approve.pending} onClick={async () => { const n = await confirm({ title: 'Approve & post stock adjustments?', message: `${au.discrepancies.filter((d) => ['missing', 'weight', 'extra'].includes(d.kind)).length} discrepancy item(s) will be adjusted through the stock ledger.`, reasonLabel: 'Adjustment reason', confirmLabel: 'Approve & adjust' }); if (n) act.approve.run(n) }}>Approve & adjust stock</Button></>}</>} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Expected" value={progress.expected} /><Stat label="Matched" value={progress.matched} sub={`${progress.expected ? Math.round((progress.matched / progress.expected) * 100) : 0}% complete`} /><Stat label="Still to find" value={open ? remaining.length : au.discrepancies.filter((d) => d.kind === 'missing').length} tone={remaining.length ? 'warn' : undefined} /><Stat label="Scans recorded" value={au.scans.length} /></div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={progress.matched} aria-valuemax={progress.expected} aria-label="Audit progress"><div className="h-full bg-gold-500 transition-all" style={{ width: `${progress.expected ? (progress.matched / progress.expected) * 100 : 0}%` }} /></div>

      {open && can('audit.manage') && (
        <Card className="mb-4 border-gold-300 bg-gold-50/40"><div ref={scanBox}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 text-[13px] font-semibold"><ScanLine size={16} className="text-gold-600" />Scan items on the shelf</p>
            <label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" className="accent-[#8f6d2f]" checked={weigh} onChange={(e) => setWeigh(e.target.checked)} />Record physical weight with each scan</label></div>
          <ScanInput onScan={onScan} />
          {lastScan && <div className={`mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium ${lastScan.tone === 'green' ? 'bg-ok-bg text-ok' : lastScan.tone === 'amber' ? 'bg-warn-bg text-warn' : 'bg-bad-bg text-bad'}`} role="status">{lastScan.tone === 'green' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}{lastScan.text}</div>}
        </div></Card>
      )}
      {au.status === 'approved' && <div className="mb-3"><Notice tone="green">Approved by {au.approvedBy}: “{au.approvalNote}”. {myAdj.length} adjustment(s) posted to the stock ledger.</Notice></div>}
      {au.status === 'rejected' && <div className="mb-3"><Notice tone="red">Rejected: {au.approvalNote}. No stock was changed.</Notice></div>}

      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'scanned', label: 'Scanned', count: au.scans.length }, ...(open ? [{ key: 'remaining', label: 'Not yet found', count: remaining.length }] : [{ key: 'disc', label: 'Variance report', count: au.discrepancies.length }]), ...(myAdj.length ? [{ key: 'adj', label: 'Adjustments', count: myAdj.length }] : [])]} />
      {tab === 'scanned' && <DataTable rows={[...au.scans].reverse()} rowKey={(s) => s.barcode} searchable pageSizes={[25, 50, 100]} empty={{ title: 'Nothing scanned yet' }} columns={[
        { key: 'bc', header: 'Barcode', value: (s) => s.barcode, render: (s) => <span className="font-mono text-[12px]">{s.barcode}</span> },
        { key: 'item', header: 'Item', value: (s) => itemMap.get(s.stockItemId ?? '')?.itemCode, render: (s) => { const i = itemMap.get(s.stockItemId ?? ''); return i ? <>{m.productMap.get(i.productId)?.name} <span className="font-mono text-[11.5px] text-muted">{i.itemCode}</span></> : <Badge tone="red">Unknown</Badge> } },
        { key: 'res', header: 'Result', render: (s) => (!s.stockItemId ? <Badge tone="red">Unknown</Badge> : au.expectedItemIds.includes(s.stockItemId) ? <Badge tone="green">Matched</Badge> : <Badge tone="amber">Extra</Badge>) },
        { key: 'sw', header: 'System (g)', num: true, value: (s) => itemMap.get(s.stockItemId ?? '')?.grossWeight ?? 0, render: (s) => { const i = itemMap.get(s.stockItemId ?? ''); return i ? fmtW(i.grossWeight) : '—' } },
        { key: 'pw', header: 'Physical (g)', num: true, value: (s) => s.physicalWeight ?? 0, render: (s) => (s.physicalWeight ? fmtW(s.physicalWeight) : '—') },
        { key: 'at', header: 'Scanned', value: (s) => s.at, render: (s) => fmtDateTime(s.at) },
        ...(open ? [{ key: 'x', header: '', render: (s: { barcode: string }) => <button aria-label={`Remove scan ${s.barcode}`} className="rounded p-1 text-faint hover:bg-bad-bg hover:text-bad" onClick={() => act.remove.run(s.barcode)}><Trash2 size={14} /></button> }] : []),
      ]} />}
      {tab === 'remaining' && <DataTable rows={remaining} rowKey={(i) => i} pageSizes={[25, 50, 100]} empty={{ title: 'Every expected item has been scanned 🎉' }} columns={[
        { key: 'code', header: 'Item', value: (i) => itemMap.get(i)?.itemCode, render: (i) => <span className="font-mono text-[12px]">{itemMap.get(i)?.itemCode}</span> },
        { key: 'name', header: 'Product', value: (i) => m.productMap.get(itemMap.get(i)?.productId ?? '')?.name }, { key: 'bc', header: 'Barcode', value: (i) => itemMap.get(i)?.barcode, render: (i) => <span className="font-mono text-[12px] text-muted">{itemMap.get(i)?.barcode}</span> },
        { key: 'w', header: 'Gross (g)', num: true, value: (i) => itemMap.get(i)?.grossWeight ?? 0, render: (i) => fmtW(itemMap.get(i)?.grossWeight ?? 0) }]} />}
      {tab === 'disc' && <DataTable rows={au.discrepancies} columns={dCols} rowKey={(d) => d.kind + d.barcode} empty={{ title: 'No discrepancies — physical stock matches the system.' }} />}
      {tab === 'adj' && <DataTable rows={myAdj} rowKey={(a) => a.id} columns={[{ key: 'k', header: 'Adjustment', value: (a) => a.kind, render: (a) => <Badge tone={a.kind === 'found' ? 'green' : 'red'}>{a.kind}</Badge> }, { key: 'i', header: 'Item', value: (a) => itemMap.get(a.stockItemId)?.itemCode, render: (a) => <span className="font-mono text-[12px]">{itemMap.get(a.stockItemId)?.itemCode}</span> }, { key: 'o', header: 'Old (g)', num: true, value: (a) => a.oldWeight, render: (a) => fmtW(a.oldWeight) }, { key: 'n', header: 'New (g)', num: true, value: (a) => a.newWeight, render: (a) => fmtW(a.newWeight) }, { key: 'b', header: 'Approved by', value: (a) => a.approvedBy }]} />}
    </div>
  )
}
