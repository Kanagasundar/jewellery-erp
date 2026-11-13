import { Search, Trash2, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScanInput } from '@/components/common/ScanInput'
import { Button } from '@/components/ui/Button'
import { Notice, Spinner } from '@/components/ui/Feedback'
import { Bare, Input, Select } from '@/components/ui/Form'
import { Card, PageHeader } from '@/components/ui/Layout'
import { useToast } from '@/components/ui/Toast'
import { D, money, sum } from '@/domain/calculations/decimal'
import { unallocatedAmount } from '@/domain/calculations/ledger'
import { invoiceTotals, priceItem } from '@/domain/calculations/pricing'
import { sellBlockReason } from '@/domain/workflows/rules'
import { useAction, useIndex, useList, useMasters } from '@/hooks/useData'
import { useBranch } from '@/hooks/useBranch'
import { erp } from '@/services'
import type { PaymentMode, StockItem } from '@/types/entities'
import { fmtMoney, fmtNum, fmtW } from '@/utils/format'

interface Pay { id: number; mode: PaymentMode; amount: string; reference: string }
let payId = 1

/** Fast jewellery POS: scan/search → cart → customer → payments → invoice. Pricing is previewed with the same pure functions the server-side command uses; the command re-prices authoritatively. */
export default function PosPage() {
  const nav = useNavigate()
  const toast = useToast()
  const { active: branch } = useBranch()
  const m = useMasters()
  const items = useList('stockItems'), rates = useList('metalRates'), pays = useList('payments')
  const itemMap = useIndex(items.data)
  const [cart, setCart] = useState<{ id: string; discount: string }[]>([])
  const [customerId, setCustomerId] = useState('')
  const [walkName, setWalkName] = useState(''), [walkPhone, setWalkPhone] = useState('')
  const [payments, setPayments] = useState<Pay[]>([])
  const [useAdvance, setUseAdvance] = useState(false)
  const [notes, setNotes] = useState('')
  const [q, setQ] = useState('')
  const [scanErr, setScanErr] = useState('')

  const rateFor = (i: StockItem) => (rates.data ?? []).filter((r) => r.metalId === i.metalId && r.purityId === i.purityId).sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))[0]?.ratePerGram ?? 0
  const lines = useMemo(() => cart.flatMap((c) => {
    const item = itemMap.get(c.id); const p = item && m.productMap.get(item.productId)
    if (!item || !p) return []
    const rate = rateFor(item)
    const price = priceItem({ pricingMode: p.pricingMode, fixedPrice: p.fixedPrice, netWeight: item.netWeight, ratePerGram: rate, makingType: p.makingType, makingValue: p.makingValue, wastageType: p.wastageType, wastageValue: p.wastageValue, stoneCharge: p.stoneCharge, discount: Number(c.discount) || 0, gstPercent: p.gstPercent })
    return [{ item, p, rate, price, discountRaw: c.discount, missingRate: p.pricingMode !== 'fixed_price' && !rate }]
  }), [cart, itemMap, m.productMap, rates.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const totals = invoiceTotals(lines.map((l) => l.price))
  const customer = customerId ? m.customerMap.get(customerId) : undefined
  const advanceAvail = customer ? Math.max(0, unallocatedAmount(pays.data ?? [], 'customer', customer.id)) : 0
  const advanceUsed = useAdvance ? Math.min(advanceAvail, totals.total) : 0
  const paidNow = money(sum(payments.map((p) => Number(p.amount) || 0)))
  const paid = money(D(paidNow).plus(advanceUsed))
  const balance = money(D(totals.total).minus(paid))
  const overpaid = D(paid).gt(totals.total)
  const walkIn = !customer
  const problems: string[] = []
  if (!lines.length) problems.push('Add at least one item.')
  if (lines.some((l) => l.missingRate)) problems.push('A metal rate is missing for an item (Settings → Metal rates).')
  if (overpaid) problems.push('Payments exceed the invoice total.')
  if (walkIn && lines.length && balance > 0) problems.push('Walk-in customers must pay in full — select a customer to bill on credit.')
  if (lines.some((l) => D(l.price.discount).gt(D(l.price.metalValue).plus(l.price.wastageValue).plus(l.price.makingValue).plus(l.price.stoneCharge)))) problems.push('A discount exceeds the item value.')

  const addItem = (item: StockItem): boolean => {
    const block = sellBlockReason(item)
    if (block) { setScanErr(`Cannot add: ${block}.`); return false }
    if (cart.some((c) => c.id === item.id)) { setScanErr(`${item.itemCode} is already on this bill.`); return false }
    setScanErr(''); setCart((c) => [...c, { id: item.id, discount: '' }]); return true
  }
  const onScan = async (code: string) => {
    const r = await erp.commands.barcodes.lookup(code)
    if (!r) { setScanErr(`No item found for “${code}”.`); return }
    if (addItem(r.item)) toast.info(`Added ${r.item.itemCode}`)
  }
  const matches = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (n.length < 2) return []
    return (items.data ?? []).filter((i) => i.status === 'available' && !cart.some((c) => c.id === i.id) && (i.itemCode.toLowerCase().includes(n) || i.barcode.toLowerCase().includes(n) || (m.productMap.get(i.productId)?.name ?? '').toLowerCase().includes(n))).slice(0, 8)
  }, [q, items.data, cart, m.productMap])

  const quickPay = (mode: PaymentMode) => setPayments((p) => [...p, { id: payId++, mode, amount: String(Math.max(balance, 0)), reference: '' }])
  const save = useAction(() => erp.commands.sales.create({
    branchId: branch?.id, customerId: customer?.id ?? null, walkInName: walkName, walkInPhone: walkPhone, notes,
    items: cart.map((c) => ({ stockItemId: c.id, discount: Number(c.discount) || 0 })),
    payments: payments.filter((p) => Number(p.amount) > 0).map((p) => ({ mode: p.mode, amount: Number(p.amount), reference: p.reference })), advanceAdjust: advanceUsed,
  }), { success: (s) => `Invoice ${s.invoiceNo} issued`, onSuccess: (s) => nav(`/sales/${s.id}?print=1`) })

  if (m.loading || items.isLoading || rates.isLoading) return <Spinner />
  const todayRates = (m.purities.data ?? []).map((p) => ({ p, r: (rates.data ?? []).filter((x) => x.purityId === p.id).sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))[0] })).filter((x) => x.r)

  return (
    <div className="fade-in">
      <PageHeader back="/sales" title="New sale" subtitle={`Branch: ${branch?.name ?? "—"} · scan or search items, choose the customer, collect payment, issue the invoice.`} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="min-w-0 space-y-3">
          <Card>
            <ScanInput onScan={onScan} />
            {scanErr && <div className="mt-2"><Notice tone="red">{scanErr}</Notice></div>}
            <div className="relative mt-3">
              <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" aria-hidden />
              <input aria-label="Search items manually" value={q} onChange={(e) => setQ(e.target.value)} placeholder="…or search available items by name / code" className="h-9 w-full rounded-md border border-line-strong bg-white pr-3 pl-8 text-[13px] focus:border-gold-500 focus:ring-2 focus:ring-gold-200 focus:outline-none" />
              {matches.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-line bg-white shadow-[var(--shadow-pop)]">
                  {matches.map((i) => <li key={i.id}><button className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-canvas" onClick={() => { if (addItem(i)) { setQ('') } }}>
                    <span><span className="block text-[13px] font-medium">{m.productMap.get(i.productId)?.name}</span><span className="block font-mono text-[11.5px] text-muted">{i.itemCode} · {i.barcode}</span></span>
                    <span className="text-[12px] text-muted">{m.purityMap.get(i.purityId)?.label} · {fmtW(i.netWeight)}g</span></button></li>)}
                </ul>
              )}
            </div>
          </Card>
          <Card title={`Bill items (${lines.length})`} pad={false}>
            {lines.length === 0 ? <p className="px-4 py-12 text-center text-[13px] text-muted">The bill is empty. Scan a barcode to begin.</p> : (
              <div className="overflow-x-auto"><table className="grid-table min-w-[900px]">
                <thead><tr><th>Item</th><th className="num">Gross</th><th className="num">Net</th><th className="num">Rate/g</th><th className="num">Metal</th><th className="num">Wastage</th><th className="num">Making</th><th className="num">Stone</th><th className="num">Discount</th><th className="num">GST</th><th className="num">Amount</th><th /></tr></thead>
                <tbody>{lines.map((l, idx) => (
                  <tr key={l.item.id}>
                    <td className="min-w-[190px]"><span className="font-medium">{l.p.name}</span><div className="font-mono text-[11.5px] text-muted">{l.item.itemCode} · {m.purityMap.get(l.item.purityId)?.label}{l.item.huid ? ` · ${l.item.huid}` : ''}</div></td>
                    <td className="num">{fmtW(l.item.grossWeight)}</td><td className="num">{fmtW(l.item.netWeight)}</td>
                    <td className="num">{l.missingRate ? <span className="text-bad">no rate</span> : l.p.pricingMode === 'fixed_price' ? 'fixed' : fmtNum(l.rate)}</td>
                    <td className="num">{fmtNum(l.price.metalValue)}</td><td className="num">{fmtNum(l.price.wastageValue)}</td><td className="num">{fmtNum(l.price.makingValue)}</td><td className="num">{fmtNum(l.price.stoneCharge)}</td>
                    <td className="num"><Bare.input aria-label={`Discount for ${l.item.itemCode}`} type="number" min="0" step="0.01" className="w-20 text-right" value={l.discountRaw} onChange={(e) => setCart((c) => c.map((x, k) => (k === idx ? { ...x, discount: e.target.value } : x)))} /></td>
                    <td className="num">{fmtNum(l.price.gst)}<div className="text-[10.5px] text-muted">{l.p.gstPercent}%</div></td>
                    <td className="num font-semibold">{fmtNum(l.price.amount)}</td>
                    <td><button aria-label={`Remove ${l.item.itemCode}`} onClick={() => setCart((c) => c.filter((_, k) => k !== idx))} className="rounded p-1 text-faint hover:bg-bad-bg hover:text-bad"><Trash2 size={14} /></button></td>
                  </tr>))}</tbody></table></div>
            )}
          </Card>
          <Card title="Today’s metal rates (₹ / gram)">
            <div className="flex flex-wrap gap-2">{todayRates.map(({ p, r }) => <div key={p.id} className="rounded-md border border-line bg-canvas px-3 py-1.5 text-[12.5px]"><span className="text-muted">{m.metalMap.get(p.metalId)?.name} {p.label}</span> <strong className="tabular-nums">{fmtNum(r!.ratePerGram)}</strong></div>)}</div>
            <p className="mt-2 text-[11.5px] text-muted">The rate in force is saved on each invoice and never changes afterwards.</p>
          </Card>
        </div>

        <div className="space-y-3 xl:sticky xl:top-[70px] xl:self-start">
          <Card title={<span className="flex items-center gap-2"><UserRound size={14} />Customer</span>}>
            <Select label="Customer" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setUseAdvance(false) }}><option value="">Walk-in customer</option>{(m.customers.data ?? []).filter((c) => c.status === 'active').map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</Select>
            {walkIn ? <div className="mt-2 grid grid-cols-2 gap-2"><Input label="Name (optional)" value={walkName} onChange={(e) => setWalkName(e.target.value)} /><Input label="Phone (optional)" value={walkPhone} onChange={(e) => setWalkPhone(e.target.value)} /></div>
              : advanceAvail > 0 && <label className="mt-3 flex items-center justify-between gap-2 rounded-md bg-gold-50 px-3 py-2 text-[12.5px]"><span className="flex items-center gap-2"><input type="checkbox" className="accent-[#8f6d2f]" checked={useAdvance} onChange={(e) => setUseAdvance(e.target.checked)} />Adjust advance</span><strong>{fmtMoney(advanceAvail)}</strong></label>}
          </Card>
          <Card title="Totals">
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[13px]">
              <dt className="text-muted">Items value</dt><dd className="num">{fmtNum(totals.subtotal)}</dd>
              <dt className="text-muted">Discount</dt><dd className="num">− {fmtNum(totals.discount)}</dd>
              <dt className="text-muted">Taxable value</dt><dd className="num">{fmtNum(totals.taxable)}</dd>
              <dt className="text-muted">CGST</dt><dd className="num">{fmtNum(totals.cgst)}</dd><dt className="text-muted">SGST</dt><dd className="num">{fmtNum(totals.sgst)}</dd>
              <dt className="text-muted">Round off</dt><dd className="num">{totals.roundOff > 0 ? '+' : ''}{fmtNum(totals.roundOff)}</dd>
              <dt className="mt-1 border-t border-line pt-2 text-[15px] font-semibold">Total</dt><dd className="num mt-1 border-t border-line pt-2 font-display text-[26px] leading-none font-semibold">{fmtMoney(totals.total)}</dd>
            </dl>
          </Card>
          <Card title="Payment">
            <div className="flex flex-wrap gap-1.5">{(['cash', 'upi', 'card', 'bank'] as const).map((md) => <Button key={md} size="sm" disabled={balance <= 0} onClick={() => quickPay(md)}>+ {md.toUpperCase()}</Button>)}</div>
            {payments.length > 0 && <ul className="mt-3 space-y-2">{payments.map((p) => (
              <li key={p.id} className="grid grid-cols-[84px_1fr_auto] items-center gap-2">
                <Bare.select aria-label="Payment mode" value={p.mode} onChange={(e) => setPayments((s) => s.map((x) => (x.id === p.id ? { ...x, mode: e.target.value as PaymentMode } : x)))}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option></Bare.select>
                <Bare.input aria-label="Payment amount" type="number" step="0.01" min="0" className="text-right" value={p.amount} onChange={(e) => setPayments((s) => s.map((x) => (x.id === p.id ? { ...x, amount: e.target.value } : x)))} />
                <button aria-label="Remove payment" className="rounded p-1 text-faint hover:text-bad" onClick={() => setPayments((s) => s.filter((x) => x.id !== p.id))}><Trash2 size={14} /></button>
                {p.mode !== 'cash' && <Bare.input aria-label="Payment reference" placeholder="Ref / UTR / last 4" className="col-span-3" value={p.reference} onChange={(e) => setPayments((s) => s.map((x) => (x.id === p.id ? { ...x, reference: e.target.value } : x)))} />}
              </li>))}</ul>}
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1 border-t border-line pt-3 text-[13px]">
              {advanceUsed > 0 && <><dt className="text-muted">Advance adjusted</dt><dd className="num">{fmtNum(advanceUsed)}</dd></>}
              <dt className="text-muted">Paid</dt><dd className="num">{fmtNum(paid)}</dd>
              <dt className="font-semibold">{balance >= 0 ? 'Balance due' : 'Over-paid'}</dt><dd className={`num font-semibold ${balance > 0 ? 'text-bad' : balance < 0 ? 'text-warn' : 'text-ok'}`}>{fmtMoney(Math.abs(balance))}</dd>
            </dl>
            <Input label="Bill notes" wrapperClassName="mt-3" value={notes} onChange={(e) => setNotes(e.target.value)} />
            {problems.length > 0 && lines.length > 0 && <div className="mt-3 space-y-1.5">{problems.map((p) => <Notice key={p} tone="amber">{p}</Notice>)}</div>}
            <Button variant="gold" size="lg" className="mt-3 w-full" disabled={problems.length > 0} loading={save.pending} onClick={() => save.run()}>Complete sale · {fmtMoney(totals.total)}</Button>
            {customer && balance > 0 && <p className="mt-2 text-center text-[11.5px] text-muted">{fmtMoney(balance)} will be added to {customer.name}’s outstanding.</p>}
          </Card>
        </div>
      </div>
    </div>
  )
}
