import { useMemo } from 'react'
import { useList } from './useData'

export interface Alert { id: string; tone: 'red' | 'amber' | 'blue'; title: string; detail: string; to: string }

/** Low-stock = active products whose AVAILABLE piece count is at/below reorder level. */
export function useLowStock() {
  const products = useList('products')
  const items = useList('stockItems')
  const data = useMemo(() => {
    const avail = new Map<string, number>()
    for (const i of items.data ?? []) if (i.status === 'available') avail.set(i.productId, (avail.get(i.productId) ?? 0) + 1)
    return (products.data ?? [])
      .filter((p) => p.status === 'active' && p.reorderLevel > 0 && (avail.get(p.id) ?? 0) <= p.reorderLevel)
      .map((p) => ({ product: p, available: avail.get(p.id) ?? 0 }))
      .sort((a, b) => a.available - b.available)
  }, [products.data, items.data])
  return { data, loading: products.isLoading || items.isLoading }
}

export function useAlerts(): Alert[] {
  const low = useLowStock()
  const inwards = useList('inwards')
  const audits = useList('audits')
  const repairs = useList('repairs')
  const polishing = useList('polishing')
  return useMemo(() => {
    const out: Alert[] = []
    const now = new Date().toISOString()
    for (const l of low.data.slice(0, 5)) out.push({ id: 'low-' + l.product.id, tone: l.available === 0 ? 'red' : 'amber', title: `Low stock: ${l.product.name}`, detail: `${l.available} available (reorder level ${l.product.reorderLevel})`, to: '/inventory' })
    const pi = (inwards.data ?? []).filter((i) => i.status === 'pending_approval')
    if (pi.length) out.push({ id: 'inw', tone: 'blue', title: `${pi.length} stock inward awaiting approval`, detail: pi.map((i) => i.inwardNo).join(', '), to: '/inward' })
    const pa = (audits.data ?? []).filter((a) => a.status === 'pending_approval')
    if (pa.length) out.push({ id: 'aud', tone: 'blue', title: `${pa.length} stock audit awaiting approval`, detail: pa.map((a) => a.auditNo).join(', '), to: '/stock-audit' })
    const od = (repairs.data ?? []).filter((r) => !['delivered', 'cancelled'].includes(r.status) && r.expectedDelivery && r.expectedDelivery < now)
    if (od.length) out.push({ id: 'rep', tone: 'red', title: `${od.length} repair job(s) overdue`, detail: od.map((r) => r.jobNo).join(', '), to: '/repairs' })
    const op = (polishing.data ?? []).filter((p) => !['returned'].includes(p.status) && p.expectedDate && p.expectedDate < now)
    if (op.length) out.push({ id: 'pol', tone: 'amber', title: `${op.length} polishing job(s) overdue`, detail: op.map((p) => p.jobNo).join(', '), to: '/polishing' })
    return out
  }, [low.data, inwards.data, audits.data, repairs.data, polishing.data])
}
