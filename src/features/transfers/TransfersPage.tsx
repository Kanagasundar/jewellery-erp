import { ArrowRight, Check, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAuth } from '@/app/auth'
import { ScanInput } from '@/components/common/ScanInput'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Notice, StatusBadge } from '@/components/ui/Feedback'
import { Input, Select } from '@/components/ui/Form'
import { PageHeader, Stat } from '@/components/ui/Layout'
import { Modal, useConfirm } from '@/components/ui/Modal'
import { useBranch } from '@/hooks/useBranch'
import { useAction, useIndex, useList, useMasters } from '@/hooks/useData'
import { erp } from '@/services'
import type { StockItem, StockTransfer } from '@/types/entities'
import { fmtDateTime, fmtW } from '@/utils/format'

function NewTransfer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const m = useMasters()
  const items = useList('stockItems')
  const { branches, operating, nameOf } = useBranch()
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [note, setNote] = useState('')
  const [sel, setSel] = useState<StockItem[]>([])
  const [q, setQ] = useState(''), [err, setErr] = useState('')
  const src = from || operating?.id || ''
  const dst = to || branches.find((b) => b.id !== src)?.id || ''
  const matches = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (n.length < 2) return []
    return (items.data ?? []).filter((i) => i.branchId === src && i.status === 'available' && !sel.some((s) => s.id === i.id) && (i.itemCode.toLowerCase().includes(n) || i.barcode.toLowerCase().includes(n) || (m.productMap.get(i.productId)?.name ?? '').toLowerCase().includes(n))).slice(0, 8)
  }, [q, items.data, src, sel, m.productMap])
  const add = (i: StockItem) => {
    if (i.branchId !== src) { setErr(`${i.itemCode} is held at ${nameOf(i.branchId)}, not ${nameOf(src)}.`); return }
    if (i.status !== 'available') { setErr(`${i.itemCode} is ${i.status.replace('_', ' ')} — only available items can be transferred.`); return }
    if (sel.some((s) => s.id === i.id)) { setErr(`${i.itemCode} is already on the list.`); return }
    setErr(''); setSel((s) => [...s, i]); setQ('')
  }
  const save = useAction(() => erp.commands.transfers.create({ fromBranchId: src, toBranchId: dst, itemIds: sel.map((i) => i.id), note }), {
    success: (t) => `${t.transferNo} dispatched — ${t.itemIds.length} item(s) now in transit`, onSuccess: () => { setSel([]); setNote(''); onClose() },
  })
  return (
    <Modal open={open} onClose={onClose} size="lg" title="New stock transfer" description="Items leave the source branch now and appear at the destination only when it confirms receipt."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!sel.length || !dst || src === dst} loading={save.pending} icon={<ArrowRight size={14} />} onClick={() => save.run()}>Dispatch {sel.length || ''} item(s)</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="From branch" required value={src} onChange={(e) => { setFrom(e.target.value); setSel([]); if (e.target.value === dst) setTo('') }}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
        <Select label="To branch" required value={dst} onChange={(e) => setTo(e.target.value)} error={src === dst ? 'Choose a different branch' : undefined}>{branches.filter((b) => b.id !== src).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
      </div>
      <div className="mt-3 space-y-2">
        <ScanInput autoFocus={false} placeholder={`Scan an item held at ${nameOf(src)}…`} onScan={async (c) => { const r = await erp.commands.barcodes.lookup(c); if (!r) setErr(`No item found for “${c}”.`); else add(r.item) }} />
        <input aria-label="Search items to transfer" value={q} onChange={(e) => setQ(e.target.value)} placeholder="…or search available items at the source branch" className="h-9 w-full rounded-md border border-line-strong px-3 text-[13px] focus:border-gold-500 focus:ring-2 focus:ring-gold-200 focus:outline-none" />
        {matches.map((i) => <button key={i.id} className="flex w-full justify-between rounded-md border border-line px-3 py-2 text-left text-[13px] hover:bg-canvas" onClick={() => add(i)}><span>{m.productMap.get(i.productId)?.name}</span><span className="font-mono text-[12px] text-muted">{i.itemCode} · {fmtW(i.netWeight)}g</span></button>)}
        {err && <Notice tone="red">{err}</Notice>}
      </div>
      <div className="mt-3 overflow-hidden rounded-md border border-line">
        <table className="grid-table"><thead><tr><th>Item</th><th>Product</th><th className="num">Net (g)</th><th /></tr></thead>
          <tbody>{sel.map((i) => <tr key={i.id}><td className="font-mono text-[12px]">{i.itemCode}</td><td>{m.productMap.get(i.productId)?.name}</td><td className="num">{fmtW(i.netWeight)}</td><td><button aria-label={`Remove ${i.itemCode}`} className="rounded p-1 text-faint hover:text-bad" onClick={() => setSel((s) => s.filter((x) => x.id !== i.id))}><Trash2 size={13} /></button></td></tr>)}
            {!sel.length && <tr><td colSpan={4} className="py-5 text-center text-muted">No items selected yet.</td></tr>}</tbody></table>
      </div>
      <Input label="Note" wrapperClassName="mt-3" value={note} onChange={(e) => setNote(e.target.value)} />
    </Modal>
  )
}

export default function TransfersPage() {
  const { can } = useAuth()
  const confirm = useConfirm()
  const m = useMasters()
  const { scopeId } = useBranch()
  const transfers = useList('transfers'), items = useList('stockItems')
  const itemMap = useIndex(items.data)
  const [dlg, setDlg] = useState(false)
  const [view, setView] = useState<StockTransfer | null>(null)
  const rows = useMemo(() => (transfers.data ?? []).filter((t) => !scopeId || t.fromBranchId === scopeId || t.toBranchId === scopeId), [transfers.data, scopeId])
  const receive = useAction((id: string) => erp.commands.transfers.receive(id), { success: (t) => `${t.transferNo} received at ${t.toBranchName}` })
  const cancel = useAction((id: string, r: string) => erp.commands.transfers.cancel(id, r), { success: 'Transfer cancelled — items returned to the source branch' })
  const manage = can('transfers.manage')

  const cols: Column<StockTransfer>[] = [
    { key: 'no', header: 'Transfer', value: (t) => t.transferNo, render: (t) => <span className="font-mono text-[12px] font-medium">{t.transferNo}</span> },
    { key: 'date', header: 'Dispatched', value: (t) => t.dispatchedAt, render: (t) => fmtDateTime(t.dispatchedAt) },
    { key: 'route', header: 'From → To', value: (t) => `${t.fromBranchName} ${t.toBranchName}`, render: (t) => <span className="inline-flex items-center gap-1.5">{t.fromBranchName}<ArrowRight size={12} className="text-gold-600" />{t.toBranchName}</span> },
    { key: 'n', header: 'Items', num: true, value: (t) => t.itemIds.length },
    { key: 'st', header: 'Status', value: (t) => t.status, render: (t) => <StatusBadge status={t.status === 'in_transit' ? 'in_transit' : t.status} /> },
    { key: 'rcv', header: 'Received', value: (t) => t.receivedAt ?? '', render: (t) => (t.receivedAt ? <span className="text-muted">{fmtDateTime(t.receivedAt)} · {t.receivedBy}</span> : '—') },
    { key: 'act', header: '', render: (t) => t.status === 'in_transit' && manage ? (
      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" variant="primary" icon={<Check size={13} />} loading={receive.pending} onClick={async () => { if (await confirm({ title: `Receive ${t.transferNo} at ${t.toBranchName}?`, message: `${t.itemIds.length} item(s) become available stock at ${t.toBranchName}.`, confirmLabel: 'Confirm receipt' })) receive.run(t.id) }}>Receive</Button>
        <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={async () => { const r = await confirm({ title: `Cancel ${t.transferNo}?`, message: 'Items go back to available stock at the source branch.', reasonLabel: 'Reason', confirmLabel: 'Cancel transfer', danger: true }); if (r) cancel.run(t.id, r) }}>Cancel</Button>
      </div>) : null },
  ]
  const transit = (transfers.data ?? []).filter((t) => t.status === 'in_transit')
  return (
    <div className="fade-in">
      <PageHeader title="Stock transfers" subtitle="Move pieces between branches. Each transfer is traced through the stock ledger of both branches."
        actions={manage && <Button variant="primary" icon={<Plus size={15} />} onClick={() => setDlg(true)}>New transfer</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="In transit" value={transit.length} tone={transit.length ? 'warn' : undefined} sub={`${transit.reduce((s, t) => s + t.itemIds.length, 0)} piece(s)`} />
        <Stat label="Received" value={(transfers.data ?? []).filter((t) => t.status === 'received').length} /><Stat label="Cancelled" value={(transfers.data ?? []).filter((t) => t.status === 'cancelled').length} /><Stat label="Total" value={transfers.data?.length ?? 0} />
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(t) => t.id} loading={transfers.isLoading} error={transfers.error} initialSort={{ key: 'no', dir: 'desc' }} onRowClick={setView} searchPlaceholder="Search transfer, branch…"
        empty={{ title: 'No transfers yet', hint: 'Dispatch stock from one branch to another.', action: manage ? <Button variant="primary" onClick={() => setDlg(true)}>New transfer</Button> : undefined }} />
      <NewTransfer open={dlg} onClose={() => setDlg(false)} />
      <Modal open={!!view} onClose={() => setView(null)} size="lg" title={view ? `${view.transferNo} · ${view.fromBranchName} → ${view.toBranchName}` : ''}>
        {view && (
          <div className="space-y-3">
            <p className="text-[13px]"><StatusBadge status={view.status} /> <span className="ml-2 text-muted">Dispatched {fmtDateTime(view.dispatchedAt)}{view.receivedAt ? ` · received ${fmtDateTime(view.receivedAt)} by ${view.receivedBy}` : ''}</span></p>
            {view.note && <p className="text-[13px]">Note: {view.note}</p>}
            {view.cancelReason && <Notice tone="red">Cancelled: {view.cancelReason}</Notice>}
            <table className="grid-table"><thead><tr><th>Item</th><th>Product</th><th>Barcode</th><th className="num">Net (g)</th><th>Now</th></tr></thead>
              <tbody>{view.itemIds.map((id) => { const i = itemMap.get(id); return <tr key={id}><td className="font-mono text-[12px]">{i?.itemCode}</td><td>{m.productMap.get(i?.productId ?? '')?.name}</td><td className="font-mono text-[12px] text-muted">{i?.barcode}</td><td className="num">{fmtW(i?.netWeight ?? 0)}</td><td>{i && <StatusBadge status={i.status} />}</td></tr> })}</tbody></table>
          </div>
        )}
      </Modal>
    </div>
  )
}
