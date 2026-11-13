import { CheckCircle2, ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/app/auth'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Badge, Notice, StatusBadge } from '@/components/ui/Feedback'
import { Bare, Select } from '@/components/ui/Form'
import { Card, PageHeader, Stat, Tabs } from '@/components/ui/Layout'
import { Modal, useConfirm } from '@/components/ui/Modal'
import { D, money, sum, weight } from '@/domain/calculations/decimal'
import { useAction, useIndex, useList, useMasters } from '@/hooks/useData'
import { ItemDetail } from '@/features/barcodes/ItemDetail'
import { erp } from '@/services'
import type { ItemStatus, StockItem, StockLedgerEntry } from '@/types/entities'
import { fmtDateTime, fmtInt, fmtMoney, fmtNum, fmtW } from '@/utils/format'
import { useQuery } from '@tanstack/react-query'

const STATUSES: ItemStatus[] = ['available', 'reserved', 'sold', 'repair', 'polishing', 'damaged', 'returned', 'missing']
type Tab = 'items' | 'summary' | 'ledger'

export default function InventoryPage() {
  const { can } = useAuth()
  const confirm = useConfirm()
  const [sp] = useSearchParams()
  const m = useMasters()
  const items = useList('stockItems'), ledger = useList('ledger'), customers = useList('customers')
  const [tab, setTab] = useState<Tab>((sp.get('tab') as Tab) || 'items')
  const [status, setStatus] = useState(sp.get('status') ?? '')
  const [cat, setCat] = useState(''), [metal, setMetal] = useState(''), [purity, setPurity] = useState('')
  const [detail, setDetail] = useState<StockItem | null>(null)
  const [reserve, setReserve] = useState<StockItem | null>(null)
  const [reserveFor, setReserveFor] = useState('')
  const itemMap = useIndex(items.data)

  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const i of items.data ?? []) c[i.status] = (c[i.status] ?? 0) + 1; return c }, [items.data])
  const rows = useMemo(() => (items.data ?? []).filter((i) => (!status || i.status === status) && (!metal || i.metalId === metal) && (!purity || i.purityId === purity) && (!cat || m.productMap.get(i.productId)?.categoryId === cat)), [items.data, status, metal, purity, cat, m.productMap])

  const act = {
    release: useAction((id: string) => erp.commands.inventory.release(id), { success: 'Reservation released' }),
    damage: useAction((id: string, r: string) => erp.commands.inventory.markDamaged(id, r), { success: 'Marked damaged' }),
    restock: useAction((id: string, r: string) => erp.commands.inventory.restock(id, r), { success: 'Returned to available stock' }),
    reserve: useAction((id: string, c: string) => erp.commands.inventory.reserve(id, c, 'Reserved from inventory'), { success: 'Item reserved', onSuccess: () => setReserve(null) }),
  }
  const recon = useQuery({ queryKey: ['reconcile', items.dataUpdatedAt, ledger.dataUpdatedAt], queryFn: () => erp.commands.inventory.reconcile(), enabled: tab === 'ledger' })

  const cols: Column<StockItem>[] = [
    { key: 'code', header: 'Item code', value: (i) => i.itemCode, render: (i) => <span className="font-mono text-[12px]">{i.itemCode}</span> },
    { key: 'bc', header: 'Barcode', value: (i) => i.barcode, render: (i) => <span className="font-mono text-[12px] text-muted">{i.barcode}</span> },
    { key: 'name', header: 'Product', value: (i) => m.productMap.get(i.productId)?.name, render: (i) => <span className="font-medium">{m.productMap.get(i.productId)?.name}</span> },
    { key: 'cat', header: 'Category', value: (i) => m.categoryMap.get(m.productMap.get(i.productId)?.categoryId ?? '')?.name },
    { key: 'metal', header: 'Metal', value: (i) => `${m.metalMap.get(i.metalId)?.name} ${m.purityMap.get(i.purityId)?.label}`, render: (i) => <>{m.metalMap.get(i.metalId)?.name} <span className="text-muted">{m.purityMap.get(i.purityId)?.label}</span></> },
    { key: 'gross', header: 'Gross (g)', num: true, value: (i) => i.grossWeight, render: (i) => fmtW(i.grossWeight) },
    { key: 'net', header: 'Net (g)', num: true, value: (i) => i.netWeight, render: (i) => fmtW(i.netWeight) },
    { key: 'cost', header: 'Cost (₹)', num: true, value: (i) => i.costPrice, render: (i) => fmtNum(i.costPrice) },
    { key: 'st', header: 'Status', value: (i) => i.status, render: (i) => <StatusBadge status={i.status} /> },
    { key: 'act', header: '', render: (i) => (
      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        {i.status === 'available' && can('sales.create') && <Button size="sm" variant="ghost" onClick={() => { setReserve(i); setReserveFor('') }}>Reserve</Button>}
        {i.status === 'reserved' && can('sales.create') && <Button size="sm" variant="ghost" onClick={() => act.release.run(i.id)}>Release</Button>}
        {['available', 'returned'].includes(i.status) && can('inventory.manage') && <Button size="sm" variant="ghost" onClick={async () => { const r = await confirm({ title: `Mark ${i.itemCode} damaged?`, reasonLabel: 'Describe the damage', confirmLabel: 'Mark damaged', danger: true }); if (r) act.damage.run(i.id, r) }}>Damaged</Button>}
        {['returned', 'damaged', 'missing'].includes(i.status) && can('inventory.manage') && <Button size="sm" variant="ghost" onClick={async () => { const r = await confirm({ title: `Restock ${i.itemCode}?`, message: 'The item returns to available stock after inspection.', reasonLabel: 'Inspection note / reason', confirmLabel: 'Restock' }); if (r) act.restock.run(i.id, r) }}>Restock</Button>}
      </div>) },
  ]

  /* category / metal / purity / weight summary of AVAILABLE stock */
  const summary = useMemo(() => {
    const avail = (items.data ?? []).filter((i) => i.status === 'available')
    const group = (key: (i: StockItem) => string) => {
      const g = new Map<string, { qty: number; net: number; gross: number; cost: number }>()
      for (const i of avail) { const k = key(i); const c = g.get(k) ?? { qty: 0, net: 0, gross: 0, cost: 0 }; c.qty++; c.net = weight(D(c.net).plus(i.netWeight)); c.gross = weight(D(c.gross).plus(i.grossWeight)); c.cost = money(D(c.cost).plus(i.costPrice)); g.set(k, c) }
      return [...g].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.cost - a.cost)
    }
    return {
      cat: group((i) => m.categoryMap.get(m.productMap.get(i.productId)?.categoryId ?? '')?.name ?? 'Other'),
      metal: group((i) => m.metalMap.get(i.metalId)?.name ?? '—'),
      purity: group((i) => `${m.metalMap.get(i.metalId)?.name} ${m.purityMap.get(i.purityId)?.label}`),
      total: { qty: avail.length, net: weight(sum(avail.map((i) => i.netWeight))), cost: money(sum(avail.map((i) => i.costPrice))) },
    }
  }, [items.data, m.categoryMap, m.productMap, m.metalMap, m.purityMap])

  const ledgerCols: Column<StockLedgerEntry>[] = [
    { key: 'txn', header: 'Txn', value: (e) => e.txnNo, render: (e) => <span className="font-mono text-[12px]">{e.txnNo}</span> },
    { key: 'date', header: 'Date', value: (e) => e.date, render: (e) => fmtDateTime(e.date) },
    { key: 'ref', header: 'Reference', value: (e) => e.refNo, render: (e) => <span className="font-mono text-[12px]">{e.refNo}</span> },
    { key: 'item', header: 'Item', value: (e) => itemMap.get(e.stockItemId)?.itemCode, render: (e) => <span className="font-mono text-[12px]">{itemMap.get(e.stockItemId)?.itemCode}</span> },
    { key: 'prod', header: 'Product', value: (e) => m.productMap.get(e.productId)?.name },
    { key: 'move', header: 'Status', value: (e) => e.statusTo, render: (e) => <>{e.statusFrom ? e.statusFrom : 'new'} → <strong>{e.statusTo}</strong></> },
    { key: 'prev', header: 'Prev qty', num: true, value: (e) => e.prevQty },
    { key: 'in', header: 'In', num: true, value: (e) => e.qtyIn, render: (e) => (e.qtyIn || e.weightIn ? `${e.qtyIn} · ${fmtW(e.weightIn)}g` : '') },
    { key: 'out', header: 'Out', num: true, value: (e) => e.qtyOut, render: (e) => (e.qtyOut || e.weightOut ? `${e.qtyOut} · ${fmtW(e.weightOut)}g` : '') },
    { key: 'res', header: 'Result qty / wt', num: true, value: (e) => e.resultQty, render: (e) => `${e.resultQty} · ${fmtW(e.resultWeight)}g` },
    { key: 'user', header: 'User', value: (e) => e.userName },
    { key: 'why', header: 'Reason', value: (e) => e.reason, render: (e) => <span className="text-muted">{e.reason}</span> },
  ]

  return (
    <div className="fade-in">
      <PageHeader title="Inventory" subtitle="Every piece, its status and its full audit trail." />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => { setStatus(status === s ? '' : s); setTab('items') }} className={`card px-3 py-2.5 text-left transition ${status === s ? 'border-gold-500 ring-2 ring-gold-200' : 'hover:border-gold-300'}`} aria-pressed={status === s}>
            <p className="label-xs capitalize">{s}</p><p className="text-[20px] font-semibold tabular-nums">{fmtInt(counts[s] ?? 0)}</p>
          </button>
        ))}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'items', label: 'Stock items', count: rows.length }, { key: 'summary', label: 'Category / metal / purity summary' }, { key: 'ledger', label: 'Stock ledger', count: ledger.data?.length }]} />

      {tab === 'items' && (
        <DataTable rows={rows} columns={cols} rowKey={(i) => i.id} loading={items.isLoading || m.loading} error={items.error} onRowClick={setDetail} searchPlaceholder="Search code, barcode, product…" pageSizes={[25, 50, 100]}
          initialSort={{ key: 'code', dir: 'asc' }} showFooter
          toolbar={<>
            <Bare.select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{(m.categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Bare.select>
            <Bare.select aria-label="Metal" value={metal} onChange={(e) => { setMetal(e.target.value); setPurity('') }}><option value="">All metals</option>{(m.metals.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Bare.select>
            <Bare.select aria-label="Purity" value={purity} onChange={(e) => setPurity(e.target.value)}><option value="">All purities</option>{(m.purities.data ?? []).filter((p) => !metal || p.metalId === metal).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Bare.select>
            <Bare.select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Bare.select>
          </>} />
      )}

      {tab === 'summary' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3"><Stat label="Available pieces" value={summary.total.qty} /><Stat label="Net weight" value={`${fmtW(summary.total.net)} g`} /><Stat label="Stock value (cost)" value={fmtMoney(summary.total.cost)} /></div>
          <div className="grid gap-4 lg:grid-cols-3">
            {([['Category-wise', summary.cat], ['Metal-wise', summary.metal], ['Purity-wise', summary.purity]] as const).map(([title, g]) => (
              <Card key={title} title={title} pad={false}><table className="grid-table"><thead><tr><th>Group</th><th className="num">Pcs</th><th className="num">Net (g)</th><th className="num">Cost (₹)</th></tr></thead>
                <tbody>{g.map((r) => <tr key={r.k}><td>{r.k}</td><td className="num">{r.qty}</td><td className="num">{fmtW(r.net)}</td><td className="num">{fmtNum(r.cost)}</td></tr>)}</tbody></table></Card>
            ))}
          </div>
        </div>
      )}

      {tab === 'ledger' && (
        <div className="space-y-3">
          {recon.data && (recon.data.ok
            ? <Notice tone="green"><CheckCircle2 size={14} className="mr-1 inline" />Ledger reconciled: all {recon.data.checkedItems} items match their last ledger status, and every product’s available quantity & weight equals the ledger balance.</Notice>
            : <Notice tone="red"><ShieldAlert size={14} className="mr-1 inline" />Reconciliation found {recon.data.problems.length + recon.data.productBalances.filter((p) => !p.ok).length} issue(s): {recon.data.problems.slice(0, 3).map((p) => `${p.itemCode}: ${p.problem}`).join('; ')}</Notice>)}
          <DataTable rows={ledger.data} columns={ledgerCols} rowKey={(e) => e.id} loading={ledger.isLoading} error={ledger.error} initialSort={{ key: 'txn', dir: 'desc' }} pageSizes={[25, 50, 100]} searchPlaceholder="Search txn, item, reference, reason…" empty={{ title: 'No stock movements' }}
            toolbar={recon.data ? <Badge tone={recon.data.ok ? 'green' : 'red'}>{recon.data.ok ? 'Reconciled' : 'Mismatch'}</Badge> : undefined} />
          <p className="text-[12px] text-muted">The ledger is append-only: rows are never edited or deleted. Corrections are posted as new movements.</p>
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} size="xl" title="Stock item">{detail && <ItemDetail item={itemMap.get(detail.id) ?? detail} />}</Modal>
      <Modal open={!!reserve} onClose={() => setReserve(null)} size="sm" title={`Reserve ${reserve?.itemCode}`} footer={<><Button onClick={() => setReserve(null)}>Cancel</Button><Button variant="primary" disabled={!reserveFor} loading={act.reserve.pending} onClick={() => reserve && act.reserve.run(reserve.id, reserveFor)}>Reserve</Button></>}>
        <Select label="Reserve for customer" required value={reserveFor} onChange={(e) => setReserveFor(e.target.value)}><option value="">Select…</option>{(customers.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <p className="mt-2 text-[12px] text-muted">A reserved item cannot be sold to anyone else until released.</p>
      </Modal>
    </div>
  )
}
