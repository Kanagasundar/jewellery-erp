import { zodResolver } from '@hookform/resolvers/zod'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Resolver } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { Notice } from '@/components/ui/Feedback'
import { D } from '@/domain/calculations/decimal'
import { netWeightOf } from '@/domain/calculations/pricing'
import { useAction, useMasters } from '@/hooks/useData'
import { erp } from '@/services'
import type { Product } from '@/types/entities'
import { fileToDataUrl } from '@/utils/image'

const num = (label: string, min = 0) => z.number({ error: `${label} is required` }).min(min, `${label} must be ≥ ${min}`)
const schema = z.object({
  code: z.string().trim().min(2, 'SKU is required'),
  name: z.string().trim().min(2, 'Name is required'),
  categoryId: z.string().min(1, 'Select a category'),
  subcategory: z.string(),
  productType: z.string().trim().min(1, 'Product type is required'),
  metalId: z.string().min(1, 'Select a metal'),
  purityId: z.string().min(1, 'Select a purity'),
  grossWeight: num('Gross weight'),
  stoneWeight: num('Stone weight'),
  stoneDetails: z.string(),
  stoneCharge: num('Stone charge'),
  pricingMode: z.enum(['weight_based', 'fixed_price']),
  fixedPrice: num('Fixed price'),
  makingType: z.enum(['percent', 'per_gram', 'fixed']),
  makingValue: num('Making charge'),
  wastageType: z.enum(['percent', 'weight']),
  wastageValue: num('Wastage'),
  hsn: z.string().trim().min(4, 'HSN code is required'),
  gstPercent: num('GST %').max(40),
  huid: z.string(),
  supplierId: z.string(),
  status: z.enum(['active', 'inactive']),
  reorderLevel: num('Reorder level'),
}).refine((v) => v.stoneWeight < v.grossWeight || v.grossWeight === 0, { path: ['stoneWeight'], message: 'Stone weight must be less than gross weight' })
  .refine((v) => v.pricingMode !== 'fixed_price' || v.fixedPrice > 0, { path: ['fixedPrice'], message: 'Enter the fixed price' })
type FormValues = z.infer<typeof schema>

const blank: FormValues = {
  code: '', name: '', categoryId: '', subcategory: '', productType: '', metalId: '', purityId: '', grossWeight: 0, stoneWeight: 0, stoneDetails: '', stoneCharge: 0,
  pricingMode: 'weight_based', fixedPrice: 0, makingType: 'percent', makingValue: 8, wastageType: 'percent', wastageValue: 2, hsn: '7113', gstPercent: 3, huid: '',
  supplierId: '', status: 'active', reorderLevel: 1,
}

export function ProductForm({ open, onClose, product }: { open: boolean; onClose: () => void; product?: Product }) {
  const m = useMasters()
  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) as Resolver<FormValues>, defaultValues: blank })
  const [imgState, setImg] = useState<string | undefined>(product?.image)
  useEffect(() => { if (open) { reset(product ? { ...blank, ...product, supplierId: product.supplierId ?? '' } : blank); setImg(product?.image) } }, [open, product, reset, setImg])

  const metalId = watch('metalId')
  const purities = useMemo(() => (m.purities.data ?? []).filter((p) => p.metalId === metalId), [m.purities.data, metalId])
  const cat = m.categoryMap.get(watch('categoryId'))
  const gross = watch('grossWeight'), stone = watch('stoneWeight')
  const net = netWeightOf(gross || 0, stone || 0)
  const mode = watch('pricingMode'), makingType = watch('makingType')

  const save = useAction(
    async (v: FormValues) => {
      const data = { ...v, netWeight: net, supplierId: v.supplierId || undefined, image: imgState }
      return product ? erp.repos.products.update(product.id, data) : erp.repos.products.create(data as Omit<Product, 'id' | 'createdAt' | 'updatedAt'>)
    },
    { success: product ? 'Product updated' : 'Product created', onSuccess: onClose },
  )

  const E = (k: keyof FormValues) => errors[k]?.message as string | undefined
  const n = (k: keyof FormValues) => register(k, { valueAsNumber: true })
  return (
    <Modal open={open} onClose={onClose} size="xl" title={product ? `Edit ${product.name}` : 'New product'} description="A product is the catalogue model. Individual physical pieces are created when stock is received."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.pending} onClick={handleSubmit((v) => save.run(v))}>{product ? 'Save changes' : 'Create product'}</Button></>}>
      <form className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => e.preventDefault()}>
        <Input label="SKU / Product code" required {...register('code')} error={E('code')} />
        <Input label="Product name" required wrapperClassName="lg:col-span-2" {...register('name')} error={E('name')} />
        <Select label="Status" {...register('status')}><option value="active">Active</option><option value="inactive">Inactive</option></Select>

        <Select label="Category" required {...register('categoryId')} error={E('categoryId')}><option value="">Select…</option>{(m.categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select label="Subcategory" {...register('subcategory')}><option value="">—</option>{(cat?.subcategories ?? []).map((s) => <option key={s}>{s}</option>)}</Select>
        <Input label="Product type" required placeholder="Ring, Chain, Bangle…" {...register('productType')} error={E('productType')} />
        <Select label="Supplier (default)" {...register('supplierId')}><option value="">—</option>{(m.suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>

        <Select label="Metal" required {...register('metalId', { onChange: () => setValue('purityId', '') })} error={E('metalId')}><option value="">Select…</option>{(m.metals.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
        <Select label="Purity" required {...register('purityId')} error={E('purityId')}><option value="">Select…</option>{purities.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.fineness})</option>)}</Select>
        <Input label="HSN code" required {...register('hsn')} error={E('hsn')} />
        <Input label="GST %" type="number" step="0.01" required {...n('gstPercent')} error={E('gstPercent')} />

        <Input label="Gross weight (g)" type="number" step="0.001" required {...n('grossWeight')} error={E('grossWeight')} />
        <Input label="Stone weight (g)" type="number" step="0.001" {...n('stoneWeight')} error={E('stoneWeight')} />
        <Input label="Net metal weight (g)" value={D(net).toFixed(3)} readOnly hint="Gross − stone (calculated)" />
        <Input label="HUID / hallmark" placeholder="6-char HUID" {...register('huid')} />

        <Input label="Stone details" wrapperClassName="sm:col-span-2" placeholder="e.g. CZ 0.20 ct" {...register('stoneDetails')} />
        <Input label="Stone charge (₹)" type="number" step="0.01" {...n('stoneCharge')} error={E('stoneCharge')} />
        <Input label="Reorder level (pieces)" type="number" {...n('reorderLevel')} error={E('reorderLevel')} />

        <div className="sm:col-span-2 lg:col-span-4"><p className="label-xs mt-1 border-t border-line pt-3">Pricing formula (per product)</p></div>
        <Select label="Pricing mode" {...register('pricingMode')} hint={mode === 'fixed_price' ? 'Price ignores weight & rate (coins, silverware)' : 'Metal rate × net weight + wastage + making'}>
          <option value="weight_based">Weight based</option><option value="fixed_price">Fixed price</option>
        </Select>
        {mode === 'fixed_price' ? (
          <Input label="Fixed price (₹, before GST)" type="number" step="0.01" {...n('fixedPrice')} error={E('fixedPrice')} />
        ) : (
          <>
            <Select label="Making charge type" {...register('makingType')}><option value="percent">% of metal value</option><option value="per_gram">₹ per gram</option><option value="fixed">Fixed ₹ per piece</option></Select>
            <Input label={makingType === 'percent' ? 'Making charge (%)' : makingType === 'per_gram' ? 'Making (₹/g)' : 'Making (₹)'} type="number" step="0.01" {...n('makingValue')} error={E('makingValue')} />
            <Select label="Wastage type" {...register('wastageType')}><option value="percent">% of net weight</option><option value="weight">Grams</option></Select>
            <Input label={watch('wastageType') === 'percent' ? 'Wastage (%)' : 'Wastage (g)'} type="number" step="0.001" {...n('wastageValue')} error={E('wastageValue')} />
          </>
        )}

        <div className="sm:col-span-2 lg:col-span-4">
          <p className="label-xs border-t border-line pt-3">Product image</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-lg border border-line bg-canvas">{imgState ? <img src={imgState} alt="Product" className="h-full w-full object-cover" /> : <ImagePlus className="text-faint" />}</div>
            <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-line-strong bg-white px-3 text-[13px] hover:bg-canvas">
              Upload<input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImg(await fileToDataUrl(f)) }} />
            </label>
            {imgState && <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => setImg(undefined)}>Remove</Button>}
          </div>
        </div>
      </form>
      {Object.keys(errors).length > 0 && <div className="mt-3"><Notice tone="red">Please fix the highlighted fields.</Notice></div>}
    </Modal>
  )
}
