import { Ban, PackageCheck, Pencil, Printer, Send, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/app/auth'
import { Button } from '@/components/ui/Button'
import { EmptyState, Notice, Spinner, StatusBadge } from '@/components/ui/Feedback'
import { Card, KV, PageHeader, Stat } from '@/components/ui/Layout'
import { useConfirm } from '@/components/ui/Modal'
import { paidAgainst, purchaseOutstanding } from '@/domain/calculations/ledger'
import { useAction, useList, useMasters } from '@/hooks/useData'
import { PaymentDialog } from '@/features/payments/PaymentDialog'
import { erp } from '@/services'
import { fmtDate, fmtMoney, fmtNum, fmtW } from '@/utils/format'

export default function PurchaseDetailPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { can } = useAuth()
  const confirm = useConfirm()
  const m = useMasters()
  const pos = useList('purchaseOrders'), inwards = useList('inwards'), pays = useList('payments')
  const [pay, setPay] = useState(false)
  const po = pos.data?.find((p) => p.id === id)
  const submit = useAction(() => erp.commands.purchases.submit(id), { success: 'Order placed' })
  const cancel = useAction((reason: string) => erp.commands.purchases.cancel(id, reason), { success: 'Order cancelled' })
  if (pos.isLoading || m.loading) return <Spinner />
  if (!po) return <div className="card"><EmptyState title="Purchase order not found" /></div>
  const sup = m.supplierMap.get(po.supplierId)
  const paid = paidAgainst(pays.data ?? [], 'purchase', po.id)
  const due = purchaseOutstanding(po, pays.data ?? [])
  const myInwards = (inwards.data ?? []).filter((i) => i.purchaseOrderId === po.id)
  const myPays = (pays.data ?? []).filter((p) => p.allocations.some((a) => a.docId === po.id))
  const canReceive = ['pending', 'partially_received'].includes(po.status) && can('inward.manage')

  return (
    <div className="fade-in">
      <PageHeader back="/purchases" title={po.poNumber} subtitle={`${sup?.name ?? ''} · ${fmtDate(po.date)}${po.invoiceNo ? ` · Inv ${po.invoiceNo}` : ''}`}
        actions={<>
          <StatusBadge status={po.status} />
          <Button icon={<Printer size={14} />} onClick={() => window.print()}>Print</Button>
          {['draft', 'pending'].includes(po.status) && can('purchases.manage') && <Button icon={<Pencil size={14} />} onClick={() => nav(`/purchases/${po.id}/edit`)}>Edit</Button>}
          {po.status === 'draft' && can('purchases.manage') && <Button variant="gold" icon={<Send size={14} />} loading={submit.pending} onClick={() => submit.run()}>Place order</Button>}
          {canReceive && <Button variant="primary" icon={<PackageCheck size={14} />} onClick={() => nav(`/inward/new?po=${po.id}`)}>Receive stock</Button>}
          {can('payments.manage') && !['draft', 'cancelled'].includes(po.status) && <Button icon={<Wallet size={14} />} onClick={() => setPay(true)}>Pay supplier</Button>}
          {can('purchases.manage') && po.status !== 'cancelled' && !po.lines.some((l) => l.receivedQty > 0) && <Button variant="danger" icon={<Ban size={14} />} onClick={async () => { const r = await confirm({ title: `Cancel ${po.poNumber}?`, reasonLabel: 'Reason for cancellation', confirmLabel: 'Cancel order', danger: true }); if (r) cancel.run(r) }}>Cancel</Button>}
        </>} />
      {po.status === 'cancelled' && <div className="mb-3"><Notice tone="red">Cancelled: {po.cancelReason}</Notice></div>}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Order total" value={fmtMoney(po.total)} sub={`Taxable ${fmtNum(po.taxable)} + GST ${fmtNum(po.gst)}`} /><Stat label="Paid" value={fmtMoney(paid)} />
        <Stat label="Balance" value={fmtMoney(due)} tone={due > 0 ? 'bad' : undefined} /><Stat label="Received" value={`${po.lines.reduce((s, l) => s + l.receivedQty, 0)} / ${po.lines.reduce((s, l) => s + l.qty, 0)} pcs`} />
      </div>
      <Card title="Order lines" pad={false} className="mb-4 print-area">
        <div className="overflow-x-auto"><table className="grid-table"><thead><tr><th>Product</th><th>Purity</th><th className="num">Qty</th><th className="num">Received</th><th className="num">Pending</th><th className="num">Gross (g)</th><th className="num">Net (g)</th><th className="num">Rate</th><th className="num">Making</th><th className="num">GST %</th><th className="num">Amount ₹</th></tr></thead>
          <tbody>{po.lines.map((l) => { const p = m.productMap.get(l.productId); return (
            <tr key={l.id}><td><span className="font-medium">{p?.name}</span><div className="text-[11.5px] text-muted">{p?.code}{l.stoneDetails ? ` · ${l.stoneDetails}` : ''}</div></td><td>{m.purityMap.get(l.purityId)?.label}</td>
              <td className="num">{l.qty}</td><td className="num">{l.receivedQty}</td><td className={`num ${l.qty - l.receivedQty > 0 ? 'font-medium text-warn' : ''}`}>{l.qty - l.receivedQty}</td>
              <td className="num">{fmtW(l.grossWeight)}</td><td className="num">{fmtW(l.netWeight)}</td><td className="num">{fmtNum(l.rate)}</td><td className="num">{fmtNum(l.makingCharge)}</td><td className="num">{l.gstPercent}</td><td className="num font-medium">{fmtNum(l.amount)}</td></tr>) })}</tbody></table></div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Goods received (stock inward)" pad={false}>
          {myInwards.length ? <table className="grid-table"><tbody>{myInwards.map((i) => <tr key={i.id}><td><Link to={`/inward/${i.id}`} className="font-medium text-gold-700 hover:underline">{i.inwardNo}</Link><div className="text-[11.5px] text-muted">{fmtDate(i.date)}</div></td><td className="num">{i.items.filter((x) => x.accepted).length} pcs</td><td><StatusBadge status={i.status} /></td></tr>)}</tbody></table> : <p className="px-4 py-6 text-center text-[13px] text-muted">Nothing received yet.</p>}
        </Card>
        <Card title="Supplier payments" pad={false}>
          {myPays.length ? <table className="grid-table"><tbody>{myPays.map((p) => <tr key={p.id}><td><span className="font-mono text-[12px]">{p.paymentNo}</span><div className="text-[11.5px] text-muted">{fmtDate(p.date)} · {p.mode.toUpperCase()}</div></td><td className="num">{fmtNum(p.allocations.filter((a) => a.docId === po.id).reduce((s, a) => s + a.amount, 0))}</td></tr>)}</tbody></table> : <p className="px-4 py-6 text-center text-[13px] text-muted">No payments recorded.</p>}
        </Card>
      </div>
      {po.notes && <Card className="mt-4"><KV label="Notes">{po.notes}</KV></Card>}
      <PaymentDialog open={pay} onClose={() => setPay(false)} partyType="supplier" partyId={po.supplierId} />
    </div>
  )
}
