import { Check, Pencil, Plus, Printer, Send, Trash2, X } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/app/auth'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Badge, EmptyState, Notice, Spinner, StatusBadge } from '@/components/ui/Feedback'
import { Card, KV, PageHeader } from '@/components/ui/Layout'
import { useConfirm } from '@/components/ui/Modal'
import { inwardDiscrepancy } from '@/domain/workflows/rules'
import { useAction, useList, useMasters } from '@/hooks/useData'
import { erp } from '@/services'
import type { StockInward } from '@/types/entities'
import { fmtDate, fmtDateTime, fmtW } from '@/utils/format'

export function InwardListPage() {
  const nav = useNavigate()
  const { can } = useAuth()
  const m = useMasters()
  const inwards = useList('inwards')
  const pos = useList('purchaseOrders')
  const poNo = (id: string) => pos.data?.find((p) => p.id === id)?.poNumber ?? '—'
  const cols: Column<StockInward>[] = [
    { key: 'no', header: 'GRN no.', value: (i) => i.inwardNo, render: (i) => <span className="font-mono text-[12px] font-medium">{i.inwardNo}</span> },
    { key: 'date', header: 'Date', value: (i) => i.date, render: (i) => fmtDate(i.date) },
    { key: 'po', header: 'Purchase order', value: (i) => poNo(i.purchaseOrderId), render: (i) => <Link onClick={(e) => e.stopPropagation()} className="text-gold-700 hover:underline" to={`/purchases/${i.purchaseOrderId}`}>{poNo(i.purchaseOrderId)}</Link> },
    { key: 'sup', header: 'Supplier', value: (i) => m.supplierMap.get(i.supplierId)?.name },
    { key: 'pcs', header: 'Pieces', num: true, value: (i) => i.items.length, render: (i) => `${i.items.filter((x) => x.accepted).length} / ${i.items.length}` },
    { key: 'disc', header: 'Discrepancies', num: true, value: (i) => i.items.filter((x) => inwardDiscrepancy(x).any).length, render: (i) => { const n = i.items.filter((x) => inwardDiscrepancy(x).any).length; return n ? <Badge tone="amber">{n}</Badge> : <span className="text-muted">—</span> } },
    { key: 'st', header: 'Status', value: (i) => i.status, render: (i) => <StatusBadge status={i.status} /> },
  ]
  return (
    <div className="fade-in">
      <PageHeader title="Stock inward" subtitle="Goods received against purchase orders. Stock changes only when an inward is approved."
        actions={can('inward.manage') && <Button variant="primary" icon={<Plus size={15} />} onClick={() => nav('/inward/new')}>New inward</Button>} />
      <DataTable rows={inwards.data} columns={cols} rowKey={(i) => i.id} loading={inwards.isLoading || m.loading} error={inwards.error} initialSort={{ key: 'date', dir: 'desc' }} onRowClick={(i) => nav(`/inward/${i.id}`)} searchPlaceholder="Search GRN, PO, supplier…"
        empty={{ title: 'No stock inward entries', hint: 'Receive goods against a purchase order.' }} />
    </div>
  )
}

export function InwardDetailPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { can } = useAuth()
  const confirm = useConfirm()
  const m = useMasters()
  const inwards = useList('inwards'), pos = useList('purchaseOrders'), items = useList('stockItems')
  const inw = inwards.data?.find((i) => i.id === id)
  const submit = useAction(() => erp.commands.inward.submit(id), { success: 'Submitted for approval' })
  const approve = useAction(() => erp.commands.inward.approve(id), { success: (i) => `${i.inwardNo} completed — stock and barcodes created` })
  const reject = useAction((r: string) => erp.commands.inward.reject(id, r), { success: 'Entry rejected — no stock changed' })
  const discard = useAction(() => erp.commands.inward.discardDraft(id), { success: 'Draft discarded', onSuccess: () => nav('/inward') })
  if (inwards.isLoading || m.loading) return <Spinner />
  if (!inw) return <div className="card"><EmptyState title="Inward entry not found" /></div>
  const po = pos.data?.find((p) => p.id === inw.purchaseOrderId)
  const itemMap = new Map((items.data ?? []).map((i) => [i.id, i]))

  return (
    <div className="fade-in">
      <PageHeader back="/inward" title={inw.inwardNo} subtitle={`${m.supplierMap.get(inw.supplierId)?.name} · ${fmtDate(inw.date)}`}
        actions={<>
          <StatusBadge status={inw.status} />
          <Button icon={<Printer size={14} />} onClick={() => window.print()}>Print</Button>
          {['draft', 'rejected'].includes(inw.status) && can('inward.manage') && <Button icon={<Pencil size={14} />} onClick={() => nav(`/inward/${inw.id}/edit`)}>Edit</Button>}
          {inw.status === 'draft' && can('inward.manage') && <Button icon={<Trash2 size={14} />} variant="ghost" onClick={async () => { if (await confirm({ title: 'Discard this draft?', confirmLabel: 'Discard', danger: true })) discard.run() }}>Discard</Button>}
          {['draft', 'rejected'].includes(inw.status) && can('inward.manage') && <Button variant="gold" icon={<Send size={14} />} loading={submit.pending} onClick={() => submit.run()}>Submit for approval</Button>}
          {inw.status === 'pending_approval' && can('inward.approve') && <>
            <Button variant="danger" icon={<X size={14} />} onClick={async () => { const r = await confirm({ title: 'Reject this inward?', reasonLabel: 'Reason for rejection', confirmLabel: 'Reject', danger: true }); if (r) reject.run(r) }}>Reject</Button>
            <Button variant="primary" icon={<Check size={14} />} loading={approve.pending} onClick={async () => { if (await confirm({ title: 'Approve & complete inward?', message: `This creates ${inw.items.filter((i) => i.accepted).length} individual stock item(s), generates their barcodes and posts the stock ledger. It cannot be undone.`, confirmLabel: 'Approve & add to stock' })) approve.run() }}>Approve & complete</Button>
          </>}
        </>} />
      {inw.status === 'pending_approval' && !can('inward.approve') && <div className="mb-3"><Notice tone="blue">Waiting for an authorised approver. Stock has not been updated.</Notice></div>}
      {inw.status === 'draft' && <div className="mb-3"><Notice tone="amber">Draft — stock has <strong>not</strong> been updated. Submit it for approval to proceed.</Notice></div>}
      {inw.status === 'rejected' && <div className="mb-3"><Notice tone="red">Rejected: {inw.rejectReason}</Notice></div>}
      {inw.status === 'completed' && <div className="mb-3"><Notice tone="green">Completed {fmtDateTime(inw.approvedAt)} by {inw.approvedBy}. Stock items and barcodes were created.</Notice></div>}
      <Card className="mb-4"><dl className="grid grid-cols-2 gap-4 lg:grid-cols-4"><KV label="Purchase order">{po && <Link className="text-gold-700 hover:underline" to={`/purchases/${po.id}`}>{po.poNumber}</Link>}</KV><KV label="Supplier invoice">{po?.invoiceNo}</KV><KV label="Pieces accepted">{inw.items.filter((i) => i.accepted).length} of {inw.items.length}</KV><KV label="Notes">{inw.notes}</KV></dl></Card>
      <Card title="Pieces" pad={false} className="print-area">
        <div className="overflow-x-auto"><table className="grid-table">
          <thead><tr><th>#</th><th>Product</th><th className="num">Expected (g)</th><th className="num">Gross (g)</th><th className="num">Stone (g)</th><th className="num">Net (g)</th><th>Purity</th><th>Condition</th><th>Result</th><th>Flags</th><th>Item / barcode</th></tr></thead>
          <tbody>{inw.items.map((it, i) => { const d = inwardDiscrepancy(it); const si = it.stockItemId ? itemMap.get(it.stockItemId) : undefined; return (
            <tr key={it.id}><td className="text-muted">{i + 1}</td><td className="font-medium">{m.productMap.get(it.productId)?.name}</td><td className="num">{fmtW(it.expectedGross)}</td><td className="num">{fmtW(it.receivedGross)}</td><td className="num">{fmtW(it.receivedStone)}</td><td className="num">{fmtW(it.receivedNet)}</td>
              <td>{m.purityMap.get(it.verifiedPurityId)?.label}</td><td>{it.condition === 'ok' ? 'OK' : <Badge tone="red">Damaged</Badge>}</td><td>{it.accepted ? <Badge tone="green">Accepted</Badge> : <Badge tone="red">Rejected</Badge>}</td>
              <td className="space-x-1">{Math.abs(d.weightDiff) > 0.01 && <Badge tone="amber">Δ {d.weightDiff.toFixed(3)}g</Badge>}{d.purityMismatch && <Badge tone="red">Purity</Badge>}{d.stoneProblem && <Badge tone="red">Stone</Badge>}{it.remarks && <span className="text-[11.5px] text-muted">{it.remarks}</span>}</td>
              <td>{si ? <Link className="font-mono text-[12px] text-gold-700 hover:underline" to={`/barcodes?q=${si.barcode}`}>{si.itemCode} · {si.barcode}</Link> : <span className="text-muted">—</span>}</td></tr>) })}</tbody></table></div>
      </Card>
    </div>
  )
}
