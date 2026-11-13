import { AlertTriangle, Boxes, CircleDollarSign, Gem, Package, Scale, ShoppingBag, TrendingUp, Wrench } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, ErrorState, Spinner, StatusBadge } from '@/components/ui/Feedback'
import { Card, PageHeader, Stat } from '@/components/ui/Layout'
import { D, money, sum, weight } from '@/domain/calculations/decimal'
import { useLowStock } from '@/hooks/useAlerts'
import { useIndex, useList, useMasters } from '@/hooks/useData'
import { addDays, dayKey, monthKey, shortDay, todayKey } from '@/utils/dates'
import { fmtDateTime, fmtMoney, fmtMoney0, fmtNum, fmtW } from '@/utils/format'

const GOLD = '#b08a3e'
const MODE_COLORS: Record<string, string> = { cash: '#8f6d2f', upi: '#c9a45c', card: '#44403c', bank: '#a8a29e' }

export default function DashboardPage() {
  const sales = useList('sales')
  const pos = useList('purchaseOrders')
  const items = useList('stockItems')
  const repairs = useList('repairs')
  const polishing = useList('polishing')
  const payments = useList('payments')
  const ledger = useList('ledger')
  const m = useMasters()
  const low = useLowStock()
  const itemMap = useIndex(items.data)

  const d = useMemo(() => {
    const today = todayKey()
    const month = monthKey(new Date())
    const live = (sales.data ?? []).filter((s) => s.status === 'completed')
    const net = (s: { total: number; returnedValue: number }) => money(D(s.total).minus(s.returnedValue))
    const todaySales = money(sum(live.filter((s) => dayKey(s.date) === today).map(net)))
    const monthSales = money(sum(live.filter((s) => monthKey(s.date) === month).map(net)))
    const todayPurchase = money(sum((pos.data ?? []).filter((p) => dayKey(p.date) === today && !['draft', 'cancelled'].includes(p.status)).map((p) => p.total)))
    const avail = (items.data ?? []).filter((i) => i.status === 'available')
    const stockValue = money(sum(avail.map((i) => i.costPrice)))
    const wBy = (metalName: string) => {
      const id = m.metals.data?.find((x) => x.name === metalName)?.id
      return weight(sum(avail.filter((i) => i.metalId === id).map((i) => i.netWeight)))
    }
    const byStatus: Record<string, number> = {}
    for (const i of items.data ?? []) byStatus[i.status] = (byStatus[i.status] ?? 0) + 1
    const trend = Array.from({ length: 14 }, (_, k) => {
      const key = dayKey(addDays(new Date(), k - 13))
      return { key, label: shortDay(key), sales: money(sum(live.filter((s) => dayKey(s.date) === key).map(net))) }
    })
    const catTotals = new Map<string, number>()
    for (const s of live) for (const l of s.lines) {
      if (l.returned) continue
      const cat = m.categoryMap.get(m.productMap.get(l.productId)?.categoryId ?? '')?.name ?? 'Other'
      catTotals.set(cat, money(D(catTotals.get(cat) ?? 0).plus(l.taxable)))
    }
    const byCategory = [...catTotals].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 7)
    const modeTotals: Record<string, number> = {}
    const todayIn = (payments.data ?? []).filter((p) => p.status === 'posted' && dayKey(p.date) === today)
    for (const p of (payments.data ?? []).filter((p) => p.status === 'posted' && p.direction === 'in' && monthKey(p.date) === month)) modeTotals[p.mode] = money(D(modeTotals[p.mode] ?? 0).plus(p.amount))
    const receivedToday = money(sum(todayIn.filter((p) => p.direction === 'in').map((p) => p.amount)))
    const paidToday = money(sum(todayIn.filter((p) => p.direction === 'out').map((p) => p.amount)))
    return {
      todaySales, monthSales, todayPurchase, stockValue, qty: avail.length, gold: wBy('Gold'), silver: wBy('Silver'), byStatus, trend, byCategory, modeTotals, receivedToday, paidToday,
      pendingRepairs: (repairs.data ?? []).filter((r) => !['delivered', 'cancelled'].includes(r.status)).length,
      pendingPolish: (polishing.data ?? []).filter((p) => p.status !== 'returned').length,
      recentSales: [...(sales.data ?? [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6),
      recentPos: [...(pos.data ?? [])].filter((p) => p.status !== 'draft').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
      recentMoves: [...(ledger.data ?? [])].sort((a, b) => b.txnNo.localeCompare(a.txnNo)).slice(0, 7),
    }
  }, [sales.data, pos.data, items.data, repairs.data, polishing.data, payments.data, ledger.data, m.metals.data, m.categoryMap, m.productMap])

  const err = [sales, pos, items, repairs, polishing, payments, ledger].find((q) => q.error)?.error
  if (err) return <ErrorState error={err} onRetry={() => location.reload()} />
  if ([sales, pos, items, ledger].some((q) => q.isLoading) || m.loading) return <Spinner />

  const modePie = Object.entries(d.modeTotals).map(([name, value]) => ({ name, value }))
  return (
    <div className="fade-in">
      <PageHeader title="Dashboard" subtitle={`Live view of the shop — ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Today’s sales" value={fmtMoney0(d.todaySales)} sub="Net of returns" icon={<TrendingUp size={18} />} />
        <Stat label="Monthly sales" value={fmtMoney0(d.monthSales)} sub="Month to date" icon={<CircleDollarSign size={18} />} />
        <Stat label="Today’s purchases" value={fmtMoney0(d.todayPurchase)} sub="Orders raised today" icon={<ShoppingBag size={18} />} />
        <Stat label="Stock value (cost)" value={fmtMoney0(d.stockValue)} sub={`${d.qty} pieces available`} icon={<Gem size={18} />} />
        <Stat label="Available pieces" value={d.qty} sub={`${d.byStatus.sold ?? 0} sold · ${d.byStatus.reserved ?? 0} reserved`} icon={<Boxes size={18} />} />
        <Stat label="Gold in stock" value={`${fmtW(d.gold)} g`} sub="Net metal weight" icon={<Scale size={18} />} />
        <Stat label="Silver in stock" value={`${fmtW(d.silver)} g`} sub="Net metal weight" icon={<Scale size={18} />} />
        <Stat label="Pending workshop" value={`${d.pendingRepairs + d.pendingPolish}`} sub={`${d.pendingRepairs} repairs · ${d.pendingPolish} polishing`} tone={d.pendingRepairs + d.pendingPolish > 6 ? 'warn' : undefined} icon={<Wrench size={18} />} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Sales — last 14 days" className="xl:col-span-2">
          <div className="h-[250px]" role="img" aria-label="Bar chart of daily net sales for the last 14 days">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#eee8dc" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} axisLine={{ stroke: '#e8e3d9' }} interval={1} />
                <YAxis tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip cursor={{ fill: '#f3ead2', opacity: 0.5 }} formatter={(v) => [fmtMoney(Number(v)), 'Sales']} contentStyle={{ borderRadius: 8, border: '1px solid #e8e3d9', fontSize: 12 }} />
                <Bar dataKey="sales" fill={GOLD} radius={[3, 3, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Receipts by mode — this month">
          {modePie.length ? (
            <div className="flex items-center gap-4">
              <div className="h-[170px] w-[170px] shrink-0" role="img" aria-label="Donut chart of receipts by payment mode">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={modePie} dataKey="value" innerRadius={46} outerRadius={78} paddingAngle={2} stroke="none">{modePie.map((e) => <Cell key={e.name} fill={MODE_COLORS[e.name] ?? '#d6d3d1'} />)}</Pie><Tooltip formatter={(v) => fmtMoney(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 12 }} /></PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-1.5 text-[12.5px]">
                {modePie.map((e) => <li key={e.name} className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: MODE_COLORS[e.name] }} aria-hidden />{e.name.toUpperCase()}</span><span className="tabular-nums">{fmtMoney0(e.value)}</span></li>)}
              </ul>
            </div>
          ) : <p className="py-10 text-center text-[13px] text-muted">No receipts this month.</p>}
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-[12.5px]">
            <div><p className="label-xs">Received today</p><p className="font-semibold tabular-nums">{fmtMoney0(d.receivedToday)}</p></div>
            <div><p className="label-xs">Paid out today</p><p className="font-semibold tabular-nums">{fmtMoney0(d.paidToday)}</p></div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Sales by category (taxable value)">
          {d.byCategory.length ? (
            <div style={{ height: 28 * d.byCategory.length + 20 }} role="img" aria-label="Horizontal bar chart of sales by category">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.byCategory} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 11.5, fill: '#44403c' }} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: '#f3ead2', opacity: 0.4 }} formatter={(v) => fmtMoney(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" fill={GOLD} radius={[0, 3, 3, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="py-8 text-center text-[13px] text-muted">No sales yet.</p>}
        </Card>
        <Card title={<span className="flex items-center gap-2"><AlertTriangle size={14} className="text-warn" />Low-stock alerts</span>} actions={<Link to="/inventory" className="text-[12px] text-gold-600 hover:underline">Inventory →</Link>} pad={false}>
          {low.data.length ? (
            <ul className="divide-y divide-line">
              {low.data.slice(0, 7).map((l) => (
                <li key={l.product.id} className="flex items-center justify-between gap-2 px-4 py-2 text-[13px]">
                  <span className="min-w-0"><span className="block truncate font-medium">{l.product.name}</span><span className="text-[11.5px] text-muted">{l.product.code} · reorder at {l.product.reorderLevel}</span></span>
                  <Badge tone={l.available === 0 ? 'red' : 'amber'}>{l.available} left</Badge>
                </li>
              ))}
            </ul>
          ) : <p className="px-4 py-8 text-center text-[13px] text-muted">All products are above reorder level.</p>}
        </Card>
        <Card title="Recent stock movements" actions={<Link to="/inventory?tab=ledger" className="text-[12px] text-gold-600 hover:underline">Ledger →</Link>} pad={false}>
          <ul className="divide-y divide-line">
            {d.recentMoves.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 px-4 py-2 text-[12.5px]">
                <span className="min-w-0"><span className="block truncate font-medium">{itemMap.get(e.stockItemId)?.itemCode ?? '—'} <span className="font-normal text-muted">· {e.refNo}</span></span><span className="block truncate text-[11.5px] text-muted">{e.reason}</span></span>
                <StatusBadge status={e.statusTo} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Recent sales" actions={<Link to="/sales" className="text-[12px] text-gold-600 hover:underline">All sales →</Link>} pad={false}>
          <table className="grid-table"><tbody>
            {d.recentSales.map((s) => (
              <tr key={s.id}><td><Link to={`/sales/${s.id}`} className="font-medium text-gold-700 hover:underline">{s.invoiceNo}</Link><div className="text-[11.5px] text-muted">{fmtDateTime(s.date)}</div></td><td>{s.customerName}</td><td className="num">{fmtNum(s.total)}</td><td><StatusBadge status={s.status} /></td></tr>
            ))}
          </tbody></table>
        </Card>
        <Card title="Recent purchases" actions={<Link to="/purchases" className="text-[12px] text-gold-600 hover:underline">All purchases →</Link>} pad={false}>
          <table className="grid-table"><tbody>
            {d.recentPos.map((p) => (
              <tr key={p.id}><td><Link to={`/purchases/${p.id}`} className="font-medium text-gold-700 hover:underline">{p.poNumber}</Link><div className="text-[11.5px] text-muted">{fmtDateTime(p.date)}</div></td><td>{m.supplierMap.get(p.supplierId)?.name}</td><td className="num">{fmtNum(p.total)}</td><td><StatusBadge status={p.status} /></td></tr>
            ))}
          </tbody></table>
        </Card>
      </div>
      <p className="mt-4 flex items-center gap-2 text-[11.5px] text-muted"><Package size={13} />All figures are computed live from the application data.</p>
    </div>
  )
}
