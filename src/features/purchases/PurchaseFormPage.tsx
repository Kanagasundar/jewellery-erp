import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import type { Control, Resolver } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Notice, Spinner } from '@/components/ui/Feedback'
import { Bare, Input, Select, Textarea } from '@/components/ui/Form'
import { Card, PageHeader } from '@/components/ui/Layout'
import { D, money, sum } from '@/domain/calculations/decimal'
import { netWeightOf, purchaseLineAmounts } from '@/domain/calculations/pricing'
import { useAction, useList, useMasters } from '@/hooks/useData'
import { erp } from '@/services'
import { fmtMoney, fmtNum, fmtW, todayInput } from '@/utils/format'

const line = z.object({
  id: z.string().optional(),
  productId: z.string().min(1, 'Select product'),
  qty: z.number({ error: 'Qty' }).int('Whole number').min(1, '≥ 1'),
  grossWeight: z.number({ error: 'Weight' }).positive('> 0'),
  stoneWeight: z.number({ error: 'Stone wt' }).min(0),
  purityId: z.string().min(1, 'Purity'),
  stoneDetails: z.string(),
  rate: z.number({ error: 'Rate' }).positive('Rate > 0'),
  makingCharge: z.number({ error: 'Making' }).min(0),
  wastagePercent: z.number({ error: 'Wastage' }).min(0),
  gstPercent: z.number({ error: 'GST' }).min(0),
}).refine((l) => l.stoneWeight < l.grossWeight, { path: ['stoneWeight'], message: 'Stone < gross' })
const schema = z.object({
  supplierId: z.string().min(1, 'Select a supplier'),
  invoiceNo: z.string(),
  date: z.string().min(1),
  expectedDate: z.string(),
  notes: z.string(),
  lines: z.array(line).min(1, 'Add at least one line'),
})
type FV = z.infer<typeof schema>

function Totals({ control }: { control: Control<FV> }) {
  const lines = useWatch({ control, name: 'lines' })
  const calc = (lines ?? []).map((l) => purchaseLineAmounts({ qty: l?.qty || 0, netWeight: netWeightOf(l?.grossWeight || 0, l?.stoneWeight || 0), rate: l?.rate || 0, makingCharge: l?.makingCharge || 0, wastagePercent: l?.wastagePercent || 0, gstPercent: l?.gstPercent || 0 }))
  const taxable = money(sum(calc.map((c) => c.taxable))), gst = money(sum(calc.map((c) => c.gst)))
  return (
    <dl className="ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[13px]">
      <dt>Taxable value</dt><dd className="num">{fmtNum(taxable)}</dd><dt>GST</dt><dd className="num">{fmtNum(gst)}</dd>
      <dt className="border-t border-line pt-1.5 text-[14px] font-semibold">Order total</dt><dd className="num border-t border-line pt-1.5 text-[14px] font-semibold">{fmtMoney(money(D(taxable).plus(gst)))}</dd>
    </dl>
  )
}

export default function PurchaseFormPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const m = useMasters()
  const rates = useList('metalRates')
  const pos = useList('purchaseOrders')
  const existing = id ? pos.data?.find((p) => p.id === id) : undefined
  const { register, control, handleSubmit, reset, setValue, getValues, formState: { errors } } = useForm<FV>({
    resolver: zodResolver(schema) as Resolver<FV>,
    defaultValues: { supplierId: '', invoiceNo: '', date: todayInput(), expectedDate: '', notes: '', lines: [] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const lines = useWatch({ control, name: 'lines' })

  useEffect(() => {
    if (existing) reset({ supplierId: existing.supplierId, invoiceNo: existing.invoiceNo, date: existing.date.slice(0, 10), expectedDate: existing.expectedDate?.slice(0, 10) ?? '', notes: existing.notes ?? '', lines: existing.lines.map((l) => ({ ...l })) })
  }, [existing, reset])

  const latestRate = (metalId: string, purityId: string) => (rates.data ?? []).filter((r) => r.metalId === metalId && r.purityId === purityId).sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))[0]?.ratePerGram ?? 0

  const pick = (i: number, productId: string) => {
    const p = m.productMap.get(productId)
    if (!p) return
    const rate = Math.round(latestRate(p.metalId, p.purityId) * 0.98)
    const net = netWeightOf(p.grossWeight, p.stoneWeight)
    const making = p.makingType === 'fixed' ? p.makingValue * 0.5 : p.makingType === 'per_gram' ? net * p.makingValue * 0.5 : net * rate * 0.04
    setValue(`lines.${i}`, { id: getValues(`lines.${i}.id`), productId, qty: 1, grossWeight: p.grossWeight, stoneWeight: p.stoneWeight, purityId: p.purityId, stoneDetails: p.stoneDetails, rate, makingCharge: Math.round(making), wastagePercent: p.wastageType === 'percent' ? p.wastageValue : 1, gstPercent: p.gstPercent })
  }

  const save = useAction((v: FV, submit: boolean) => erp.commands.purchases.save({
    id, supplierId: v.supplierId, invoiceNo: v.invoiceNo, date: new Date(v.date + 'T10:00:00').toISOString(), expectedDate: v.expectedDate ? new Date(v.expectedDate + 'T10:00:00').toISOString() : undefined, notes: v.notes,
    lines: v.lines.map((l) => ({ ...l })), submit,
  }), { success: (p) => `${p.poNumber} saved as ${p.status}`, onSuccess: (p) => nav(`/purchases/${p.id}`) })

  if (m.loading || pos.isLoading) return <Spinner />
  if (id && !existing) return <Notice tone="red">Purchase order not found.</Notice>
  if (existing && !['draft', 'pending'].includes(existing.status)) return <Notice tone="amber">This order is {existing.status.replace('_', ' ')} and can no longer be edited.</Notice>
  const products = (m.products.data ?? []).filter((p) => p.status === 'active')
  const lineErr = (i: number, k: string) => (errors.lines?.[i] as Record<string, { message?: string }> | undefined)?.[k]?.message

  return (
    <div className="fade-in">
      <PageHeader back="/purchases" title={existing ? `Edit ${existing.poNumber}` : 'New purchase order'} subtitle="Stock is not added until the goods are received through a Stock Inward." />
      <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
        <Card title="Order details">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select label="Supplier" required {...register('supplierId')} error={errors.supplierId?.message}><option value="">Select…</option>{(m.suppliers.data ?? []).filter((s) => s.status === 'active').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            <Input label="Supplier invoice no." {...register('invoiceNo')} />
            <Input label="Order date" type="date" required {...register('date')} error={errors.date?.message} />
            <Input label="Expected delivery" type="date" {...register('expectedDate')} />
            <Textarea label="Notes" wrapperClassName="sm:col-span-2 lg:col-span-4" rows={2} {...register('notes')} />
          </div>
        </Card>
        <Card title="Items" actions={<Button size="sm" icon={<Plus size={13} />} onClick={() => append({ productId: '', qty: 1, grossWeight: 0, stoneWeight: 0, purityId: '', stoneDetails: '', rate: 0, makingCharge: 0, wastagePercent: 0, gstPercent: 3 })}>Add line</Button>} pad={false}>
          {errors.lines?.message && <div className="p-3"><Notice tone="red">{errors.lines.message}</Notice></div>}
          <div className="overflow-x-auto">
            <table className="grid-table min-w-[1380px]">
              <thead><tr><th className="w-[22%]">Product</th><th className="num">Qty</th><th className="num">Gross (g)</th><th className="num">Stone (g)</th><th className="num">Net (g)</th><th>Purity</th><th className="num">Rate ₹/g</th><th className="num">Making ₹/pc</th><th className="num">Wastage %</th><th className="num">GST %</th><th className="num">Amount ₹</th><th /></tr></thead>
              <tbody>
                {fields.map((f, i) => {
                  const l = lines?.[i]
                  const a = purchaseLineAmounts({ qty: l?.qty || 0, netWeight: netWeightOf(l?.grossWeight || 0, l?.stoneWeight || 0), rate: l?.rate || 0, makingCharge: l?.makingCharge || 0, wastagePercent: l?.wastagePercent || 0, gstPercent: l?.gstPercent || 0 })
                  const cell = (k: Exclude<keyof FV['lines'][number], 'id' | 'productId' | 'purityId' | 'stoneDetails'>, step = '0.001') => (
                    <td className="num"><Bare.input aria-label={k} type="number" step={step} className="w-[104px] text-right" {...register(`lines.${i}.${k}`, { valueAsNumber: true })} title={lineErr(i, k)} aria-invalid={!!lineErr(i, k)} style={lineErr(i, k) ? { borderColor: 'var(--color-bad)' } : undefined} />{lineErr(i, k) && <div className="text-[10.5px] text-bad">{lineErr(i, k)}</div>}</td>
                  )
                  return (
                    <tr key={f.id}>
                      <td><Bare.select aria-label="Product" className="w-full" {...register(`lines.${i}.productId`, { onChange: (e) => pick(i, e.target.value) })}><option value="">Select product…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</Bare.select>{lineErr(i, 'productId') && <div className="text-[10.5px] text-bad">{lineErr(i, 'productId')}</div>}</td>
                      {cell('qty', '1')}{cell('grossWeight')}{cell('stoneWeight')}
                      <td className="num">{fmtW(netWeightOf(l?.grossWeight || 0, l?.stoneWeight || 0))}</td>
                      <td><Bare.select aria-label="Purity" {...register(`lines.${i}.purityId`)}><option value="">—</option>{(m.purities.data ?? []).map((p) => <option key={p.id} value={p.id}>{m.metalMap.get(p.metalId)?.name} {p.label}</option>)}</Bare.select></td>
                      {cell('rate', '0.01')}{cell('makingCharge', '0.01')}{cell('wastagePercent', '0.01')}{cell('gstPercent', '0.01')}
                      <td className="num font-medium">{fmtNum(a.amount)}</td>
                      <td><button aria-label="Remove line" className="rounded p-1 text-faint hover:bg-bad-bg hover:text-bad" onClick={() => remove(i)}><Trash2 size={14} /></button></td>
                    </tr>
                  )
                })}
                {!fields.length && <tr><td colSpan={12} className="py-8 text-center text-muted">No lines yet — click “Add line”.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line p-4"><Totals control={control} /></div>
        </Card>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => nav('/purchases')}>Cancel</Button>
          <Button loading={save.pending} onClick={handleSubmit((v) => save.run(v, false))}>Save as draft</Button>
          <Button variant="primary" loading={save.pending} onClick={handleSubmit((v) => save.run(v, true))}>Place order</Button>
        </div>
      </form>
    </div>
  )
}
