import { Printer, RefreshCcw } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/app/auth'
import { BarcodeImage } from '@/components/common/BarcodeImage'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Feedback'
import { Card, KV } from '@/components/ui/Layout'
import { useConfirm } from '@/components/ui/Modal'
import { sellBlockReason } from '@/domain/workflows/rules'
import { useAction, useList, useMasters } from '@/hooks/useData'
import { erp } from '@/services'
import type { StockItem } from '@/types/entities'
import { fmtDateTime, fmtMoney, fmtW } from '@/utils/format'

/** Full detail for one physical piece: identity, current status and complete movement history. */
export function ItemDetail({ item, onPrint }: { item: StockItem; onPrint?: () => void }) {
  const { can } = useAuth()
  const confirm = useConfirm()
  const m = useMasters()
  const ledger = useList('ledger')
  const p = m.productMap.get(item.productId)
  const history = useMemo(() => (ledger.data ?? []).filter((e) => e.stockItemId === item.id).sort((a, b) => b.txnNo.localeCompare(a.txnNo)), [ledger.data, item.id])
  const regen = useAction((r: string) => erp.commands.barcodes.regenerate(item.id, r), { success: (b) => `New barcode ${b.code} issued` })
  const block = sellBlockReason(item)
  return (
    <Card title={<span className="flex items-center gap-2">{item.itemCode} <StatusBadge status={item.status} /></span>}
      actions={<div className="flex gap-2">
        {onPrint && <Button size="sm" icon={<Printer size={13} />} onClick={onPrint}>Print label</Button>}
        {can('barcodes.manage') && <Button size="sm" icon={<RefreshCcw size={13} />} loading={regen.pending} onClick={async () => { const r = await confirm({ title: 'Replace barcode?', message: 'The current barcode is voided (kept for history) and a new unique barcode is issued for this piece.', reasonLabel: 'Reason (e.g. label damaged)', confirmLabel: 'Issue new barcode' }); if (r) regen.run(r) }}>Replace barcode</Button>}
      </div>}>
      <div className="grid gap-5 lg:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center rounded-lg border border-line bg-white p-4"><BarcodeImage value={item.barcode} height={56} width={2} showText /><p className="mt-2 text-[11px] text-muted">CODE128 · identifies this one piece</p></div>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <KV label="Product">{p && <Link className="text-gold-700 hover:underline" to={`/products/${p.id}`}>{p.name}</Link>}</KV>
          <KV label="SKU">{p?.code}</KV><KV label="Metal / purity">{m.metalMap.get(item.metalId)?.name} {m.purityMap.get(item.purityId)?.label}</KV><KV label="HUID">{item.huid}</KV>
          <KV label="Gross">{fmtW(item.grossWeight)} g</KV><KV label="Stone">{fmtW(item.stoneWeight)} g</KV><KV label="Net metal">{fmtW(item.netWeight)} g</KV><KV label="Cost price">{fmtMoney(item.costPrice)}</KV>
        </dl>
      </div>
      <p className={`mt-3 rounded-md px-3 py-2 text-[12.5px] ${block ? 'bg-warn-bg text-warn' : 'bg-ok-bg text-ok'}`}>{block ? `Not sellable — ${block.replace(item.itemCode + ' ', '')}.` : 'Available for sale.'}</p>
      <p className="label-xs mt-4 mb-1.5">Movement history</p>
      <div className="overflow-x-auto rounded-md border border-line"><table className="grid-table"><thead><tr><th>Txn</th><th>Date</th><th>Reference</th><th>Status change</th><th>Reason</th><th>User</th></tr></thead>
        <tbody>{history.map((e) => <tr key={e.id}><td className="font-mono text-[12px]">{e.txnNo}</td><td>{fmtDateTime(e.date)}</td><td className="font-mono text-[12px]">{e.refNo}</td><td>{e.statusFrom ? <StatusBadge status={e.statusFrom} /> : <span className="text-muted">new</span>} → <StatusBadge status={e.statusTo} /></td><td className="text-muted">{e.reason}</td><td>{e.userName}</td></tr>)}</tbody></table></div>
    </Card>
  )
}
