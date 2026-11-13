import { Pencil, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/app/auth'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { EmptyState, Spinner, StatusBadge } from '@/components/ui/Feedback'
import { Card, KV, PageHeader, Stat, Tabs } from '@/components/ui/Layout'
import { useConfirm } from '@/components/ui/Modal'
import { priceItem } from '@/domain/calculations/pricing'
import { useAction, useList, useMasters } from '@/hooks/useData'
import { erp } from '@/services'
import type { StockItem } from '@/types/entities'
import { fmtMoney, fmtNum, fmtW } from '@/utils/format'
import { ProductForm } from './ProductForm'
import { ProductThumb } from './ProductsPage'

export default function ProductDetailPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { can } = useAuth()
  const confirm = useConfirm()
  const m = useMasters()
  const items = useList('stockItems')
  const rates = useList('metalRates')
  const [tab, setTab] = useState<'stock' | 'pricing' | 'details'>('stock')
  const [edit, setEdit] = useState(false)
  const p = m.productMap.get(id)
  const mine = useMemo(() => (items.data ?? []).filter((i) => i.productId === id), [items.data, id])
  const del = useAction(() => erp.repos.products.remove(id), { success: 'Product deleted', onSuccess: () => nav('/products') })

  const rate = useMemo(() => {
    if (!p) return 0
    return (rates.data ?? []).filter((r) => r.metalId === p.metalId && r.purityId === p.purityId).sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))[0]?.ratePerGram ?? 0
  }, [rates.data, p])

  if (m.loading || items.isLoading) return <Spinner />
  if (!p) return <div className="card"><EmptyState title="Product not found" action={<Link to="/products" className="text-gold-700 underline">Back to products</Link>} /></div>

  const avail = mine.filter((i) => i.status === 'available').length
  const price = priceItem({ pricingMode: p.pricingMode, fixedPrice: p.fixedPrice, netWeight: p.netWeight, ratePerGram: rate, makingType: p.makingType, makingValue: p.makingValue, wastageType: p.wastageType, wastageValue: p.wastageValue, stoneCharge: p.stoneCharge, gstPercent: p.gstPercent })

  const cols: Column<StockItem>[] = [
    { key: 'code', header: 'Item code', value: (i) => i.itemCode, render: (i) => <span className="font-mono text-[12px]">{i.itemCode}</span> },
    { key: 'bc', header: 'Barcode', value: (i) => i.barcode, render: (i) => <Link className="font-mono text-[12px] text-gold-700 hover:underline" to={`/barcodes?q=${i.barcode}`}>{i.barcode}</Link> },
    { key: 'gross', header: 'Gross (g)', num: true, value: (i) => i.grossWeight, render: (i) => fmtW(i.grossWeight) },
    { key: 'stone', header: 'Stone (g)', num: true, value: (i) => i.stoneWeight, render: (i) => fmtW(i.stoneWeight) },
    { key: 'net', header: 'Net (g)', num: true, value: (i) => i.netWeight, render: (i) => fmtW(i.netWeight) },
    { key: 'purity', header: 'Purity', value: (i) => m.purityMap.get(i.purityId)?.label },
    { key: 'cost', header: 'Cost (₹)', num: true, value: (i) => i.costPrice, render: (i) => fmtNum(i.costPrice) },
    { key: 'status', header: 'Status', value: (i) => i.status, render: (i) => <StatusBadge status={i.status} /> },
  ]

  return (
    <div className="fade-in">
      <PageHeader back="/products" title={p.name} subtitle={`${p.code} · ${m.categoryMap.get(p.categoryId)?.name} · ${m.metalMap.get(p.metalId)?.name} ${m.purityMap.get(p.purityId)?.label}`}
        actions={<>
          {can('products.manage') && <Button icon={<Pencil size={14} />} onClick={() => setEdit(true)}>Edit</Button>}
          {can('products.manage') && <Button variant="danger" icon={<Trash2 size={14} />} loading={del.pending} onClick={async () => { if (await confirm({ title: 'Delete product?', message: 'Only products with no stock history can be deleted.', confirmLabel: 'Delete', danger: true })) del.run() }}>Delete</Button>}
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Available pieces" value={avail} tone={avail <= p.reorderLevel ? 'warn' : undefined} sub={`Reorder at ${p.reorderLevel}`} />
        <Stat label="Total pieces ever" value={mine.length} sub={`${mine.filter((i) => i.status === 'sold').length} sold`} />
        <Stat label="Model net weight" value={`${fmtW(p.netWeight)} g`} sub={`Gross ${fmtW(p.grossWeight)} g`} />
        <Stat label="Indicative price today" value={fmtMoney(price.amount)} sub={rate ? `at ₹${fmtNum(rate)}/g` : 'no rate set'} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'stock', label: 'Physical stock pieces', count: mine.length }, { key: 'pricing', label: 'Pricing preview' }, { key: 'details', label: 'Details' }]} />
      {tab === 'stock' && <DataTable rows={mine} columns={cols} rowKey={(i) => i.id} empty={{ title: 'No physical pieces yet', hint: 'Pieces appear after a stock inward is approved.' }} />}
      {tab === 'pricing' && (
        <Card title="Price breakdown for the model weight">
          <p className="mb-3 text-[12.5px] text-muted">Actual invoices use each piece’s own weight and the rate on the invoice date. Formula: {p.pricingMode === 'fixed_price' ? 'fixed price' : 'metal + wastage + making + stone, then GST'}.</p>
          <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-[13px]">
            <dt>{p.pricingMode === 'fixed_price' ? 'Fixed price' : `Metal (${fmtW(p.netWeight)} g × ₹${fmtNum(rate)})`}</dt><dd className="num">{fmtNum(price.metalValue)}</dd>
            <dt>Wastage</dt><dd className="num">{fmtNum(price.wastageValue)}</dd>
            <dt>Making</dt><dd className="num">{fmtNum(price.makingValue)}</dd>
            <dt>Stone charge</dt><dd className="num">{fmtNum(price.stoneCharge)}</dd>
            <dt className="border-t border-line pt-2 font-medium">Taxable</dt><dd className="num border-t border-line pt-2 font-medium">{fmtNum(price.taxable)}</dd>
            <dt>GST @ {p.gstPercent}%</dt><dd className="num">{fmtNum(price.gst)}</dd>
            <dt className="border-t border-line pt-2 font-semibold">Total</dt><dd className="num border-t border-line pt-2 font-semibold">{fmtMoney(price.amount)}</dd>
          </dl>
        </Card>
      )}
      {tab === 'details' && (
        <Card><div className="flex gap-5"><ProductThumb p={p} size={96} />
          <dl className="grid flex-1 grid-cols-2 gap-4 lg:grid-cols-4">
            <KV label="Type">{p.productType}</KV><KV label="Subcategory">{p.subcategory}</KV><KV label="HSN">{p.hsn}</KV><KV label="GST">{p.gstPercent}%</KV>
            <KV label="Stone details">{p.stoneDetails}</KV><KV label="Stone charge">{fmtMoney(p.stoneCharge)}</KV><KV label="HUID">{p.huid}</KV><KV label="Supplier">{m.supplierMap.get(p.supplierId ?? '')?.name}</KV>
            <KV label="Making">{p.makingType === 'percent' ? `${p.makingValue}%` : p.makingType === 'per_gram' ? `₹${p.makingValue}/g` : `₹${p.makingValue} fixed`}</KV>
            <KV label="Wastage">{p.wastageType === 'percent' ? `${p.wastageValue}%` : `${p.wastageValue} g`}</KV>
          </dl></div></Card>
      )}
      <ProductForm open={edit} onClose={() => setEdit(false)} product={p} />
    </div>
  )
}
