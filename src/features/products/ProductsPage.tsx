import { Gem, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/app/auth'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/Feedback'
import { Bare } from '@/components/ui/Form'
import { PageHeader } from '@/components/ui/Layout'
import { useList, useMasters } from '@/hooks/useData'
import type { Product } from '@/types/entities'
import { fmtW } from '@/utils/format'
import { ProductForm } from './ProductForm'

export function ProductThumb({ p, size = 36 }: { p: Pick<Product, 'image' | 'name'>; size?: number }) {
  return p.image
    ? <img src={p.image} alt="" style={{ width: size, height: size }} className="rounded-md border border-line object-cover" />
    : <span style={{ width: size, height: size }} className="grid place-items-center rounded-md bg-gold-50 text-gold-500"><Gem size={size * 0.45} aria-hidden /></span>
}

export default function ProductsPage() {
  const nav = useNavigate()
  const { can } = useAuth()
  const m = useMasters()
  const items = useList('stockItems')
  const [form, setForm] = useState(false)
  const [cat, setCat] = useState('')
  const [metal, setMetal] = useState('')
  const [status, setStatus] = useState('')

  const avail = useMemo(() => {
    const a = new Map<string, number>()
    for (const i of items.data ?? []) if (i.status === 'available') a.set(i.productId, (a.get(i.productId) ?? 0) + 1)
    return a
  }, [items.data])
  const rows = useMemo(() => (m.products.data ?? []).filter((p) => (!cat || p.categoryId === cat) && (!metal || p.metalId === metal) && (!status || p.status === status)), [m.products.data, cat, metal, status])

  const cols: Column<Product>[] = [
    { key: 'img', header: '', render: (p) => <ProductThumb p={p} />, className: 'w-12' },
    { key: 'code', header: 'SKU', value: (p) => p.code, render: (p) => <span className="font-mono text-[12px]">{p.code}</span> },
    { key: 'name', header: 'Product', value: (p) => p.name, render: (p) => <span className="font-medium">{p.name}</span> },
    { key: 'cat', header: 'Category', value: (p) => `${m.categoryMap.get(p.categoryId)?.name ?? ''} ${p.subcategory}`, render: (p) => <>{m.categoryMap.get(p.categoryId)?.name}<span className="text-muted"> · {p.subcategory || p.productType}</span></> },
    { key: 'metal', header: 'Metal / Purity', value: (p) => `${m.metalMap.get(p.metalId)?.name} ${m.purityMap.get(p.purityId)?.label}`, render: (p) => <>{m.metalMap.get(p.metalId)?.name} <span className="text-muted">{m.purityMap.get(p.purityId)?.label}</span></> },
    { key: 'net', header: 'Net wt (g)', num: true, value: (p) => p.netWeight, render: (p) => fmtW(p.netWeight) },
    { key: 'making', header: 'Pricing', value: (p) => p.pricingMode, render: (p) => p.pricingMode === 'fixed_price' ? <span className="text-muted">Fixed ₹{p.fixedPrice}</span> : <span className="text-muted">Making {p.makingType === 'percent' ? `${p.makingValue}%` : p.makingType === 'per_gram' ? `₹${p.makingValue}/g` : `₹${p.makingValue}`}</span> },
    { key: 'stock', header: 'In stock', num: true, value: (p) => avail.get(p.id) ?? 0, render: (p) => { const n = avail.get(p.id) ?? 0; return <span className={n <= p.reorderLevel ? 'font-semibold text-warn' : ''}>{n}</span> } },
    { key: 'status', header: 'Status', value: (p) => p.status, render: (p) => <StatusBadge status={p.status} /> },
  ]

  return (
    <div className="fade-in">
      <PageHeader title="Products" subtitle="Catalogue models. Each physical piece received becomes its own traceable stock item."
        actions={can('products.manage') && <Button variant="primary" icon={<Plus size={15} />} onClick={() => setForm(true)}>New product</Button>} />
      <DataTable rows={rows} columns={cols} rowKey={(p) => p.id} loading={m.loading} error={m.products.error} onRetry={() => m.products.refetch()}
        onRowClick={(p) => nav(`/products/${p.id}`)} searchPlaceholder="Search SKU, name, category…"
        empty={{ title: 'No products yet', hint: 'Create your first product model.', action: can('products.manage') ? <Button variant="primary" onClick={() => setForm(true)}>New product</Button> : undefined }}
        toolbar={<>
          <Bare.select aria-label="Filter category" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{(m.categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Bare.select>
          <Bare.select aria-label="Filter metal" value={metal} onChange={(e) => setMetal(e.target.value)}><option value="">All metals</option>{(m.metals.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Bare.select>
          <Bare.select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option></Bare.select>
        </>} />
      <ProductForm open={form} onClose={() => setForm(false)} />
    </div>
  )
}
