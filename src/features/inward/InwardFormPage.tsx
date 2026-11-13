import { AlertTriangle, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Badge, Notice, Spinner } from '@/components/ui/Feedback'
import { Bare, Input, Select } from '@/components/ui/Form'
import { Card, PageHeader } from '@/components/ui/Layout'
import { netWeightOf } from '@/domain/calculations/pricing'
import { inwardDiscrepancy } from '@/domain/workflows/rules'
import { useBranch } from '@/hooks/useBranch'
import { useAction, useList, useMasters } from '@/hooks/useData'
import { erp } from '@/services'
import type { InwardItem } from '@/types/entities'
import { fmtDate, fmtW, todayInput } from '@/utils/format'

const rid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

export default function InwardFormPage() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const m = useMasters()
  const pos = useList('purchaseOrders')
  const inwards = useList('inwards')
  const existing = id ? inwards.data?.find((i) => i.id === id) : undefined
  const [poId, setPoId] = useState(sp.get('po') ?? '')
  const [date, setDate] = useState(todayInput())
  const [notes, setNotes] = useState('')
  const { branches, operating } = useBranch()
  const [branchId, setBranchId] = useState('')
  useEffect(() => { if (!branchId && operating) setBranchId(operating.id) }, [operating, branchId])
  const [items, setItems] = useState<InwardItem[]>([])
  const [recvQty, setRecvQty] = useState<Record<string, number>>({})

  useEffect(() => {
    if (existing) { setPoId(existing.purchaseOrderId); setDate(existing.date.slice(0, 10)); setNotes(existing.notes ?? ''); setItems(existing.items); setBranchId(existing.branchId) }
  }, [existing])

  const po = pos.data?.find((p) => p.id === poId)
  const receivable = (pos.data ?? []).filter((p) => ['pending', 'partially_received'].includes(p.status))
  const pendingOf = (lineId: string) => { const l = po?.lines.find((x) => x.id === lineId); return l ? l.qty - l.receivedQty : 0 }
  const usedByOthers = useMemo(() => {
    // pieces already sitting in other (not completed / not rejected) inward drafts for this PO
    const u = new Map<string, number>()
    for (const i of inwards.data ?? []) if (i.purchaseOrderId === poId && i.id !== id && ['draft', 'pending_approval'].includes(i.status)) for (const it of i.items) u.set(it.poLineId, (u.get(it.poLineId) ?? 0) + 1)
    return u
  }, [inwards.data, poId, id])

  const generate = () => {
    if (!po) return
    const out: InwardItem[] = []
    for (const l of po.lines) {
      const n = Math.min(recvQty[l.id] ?? 0, pendingOf(l.id))
      for (let k = 0; k < n; k++) out.push({ id: rid(), poLineId: l.id, productId: l.productId, expectedGross: l.grossWeight, expectedPurityId: l.purityId, receivedGross: l.grossWeight, receivedStone: l.stoneWeight, receivedNet: l.netWeight, verifiedPurityId: l.purityId, stoneOk: true, condition: 'ok', accepted: true, remarks: '' })
    }
    setItems(out)
  }
  const upd = (i: number, patch: Partial<InwardItem>) => setItems((s) => s.map((x, k) => (k === i ? { ...x, ...patch, receivedNet: netWeightOf(patch.receivedGross ?? x.receivedGross, patch.receivedStone ?? x.receivedStone) } : x)))

  const save = useAction(async (submit: boolean) => {
    const inw = await erp.commands.inward.save({ id, branchId, purchaseOrderId: poId, date: new Date(date + 'T12:00:00').toISOString(), notes, items })
    return submit ? erp.commands.inward.submit(inw.id) : inw
  }, { success: (i) => `${i.inwardNo} ${i.status === 'pending_approval' ? 'submitted for approval' : 'saved as draft — stock is not updated yet'}`, onSuccess: (i) => nav(`/inward/${i.id}`) })

  if (m.loading || pos.isLoading || inwards.isLoading) return <Spinner />
  if (existing && !['draft', 'rejected'].includes(existing.status)) return <Notice tone="amber">This entry is {existing.status.replace('_', ' ')} and can’t be edited.</Notice>
  const flagged = items.filter((i) => inwardDiscrepancy(i).any).length

  return (
    <div className="fade-in">
      <PageHeader back="/inward" title={existing ? `Edit ${existing.inwardNo}` : 'New stock inward'} subtitle="Verify each physical piece. Stock and barcodes are created only when an authorised user approves the entry." />
      <div className="space-y-4">
        <Card title="1 · Purchase order & receipt">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select label="Purchase order" required value={poId} disabled={!!existing} onChange={(e) => { setPoId(e.target.value); setItems([]); setRecvQty({}) }}>
              <option value="">Select…</option>{receivable.map((p) => <option key={p.id} value={p.id}>{p.poNumber} · {m.supplierMap.get(p.supplierId)?.name}</option>)}
            </Select>
            <Input label="Supplier" value={po ? (m.supplierMap.get(po.supplierId)?.name ?? '') : ''} readOnly />
            <Input label="Received on" type="date" max={todayInput()} value={date} onChange={(e) => setDate(e.target.value)} />
            <Input label="Delivery notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Select label="Receiving branch" required value={branchId} onChange={(e) => setBranchId(e.target.value)} hint="Stock is created in this branch">{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
          </div>
          {po && !existing && (
            <div className="mt-4 overflow-x-auto rounded-md border border-line">
              <table className="grid-table"><thead><tr><th>Product</th><th className="num">Ordered</th><th className="num">Already received</th><th className="num">In other drafts</th><th className="num">Receive now (pcs)</th></tr></thead>
                <tbody>{po.lines.map((l) => { const free = pendingOf(l.id) - (usedByOthers.get(l.id) ?? 0); return (
                  <tr key={l.id}><td className="font-medium">{m.productMap.get(l.productId)?.name}</td><td className="num">{l.qty}</td><td className="num">{l.receivedQty}</td><td className="num">{usedByOthers.get(l.id) ?? 0}</td>
                    <td className="num"><Bare.input aria-label={`Receive qty for ${m.productMap.get(l.productId)?.name}`} type="number" min={0} max={Math.max(free, 0)} className="w-20 text-right" value={recvQty[l.id] ?? 0} onChange={(e) => setRecvQty((q) => ({ ...q, [l.id]: Math.max(0, Math.min(Number(e.target.value) || 0, free)) }))} /></td></tr>) })}</tbody></table>
            </div>
          )}
          {po && !existing && <div className="mt-3"><Button variant="primary" disabled={!Object.values(recvQty).some((v) => v > 0)} onClick={generate}>Create piece-by-piece entries</Button><span className="ml-3 text-[12px] text-muted">Each physical piece is verified individually, then gets its own barcode.</span></div>}
        </Card>

        {items.length > 0 && (
          <Card title={`2 · Verify received pieces (${items.length})`} pad={false} actions={flagged ? <Badge tone="amber"><AlertTriangle size={11} />{flagged} with discrepancy</Badge> : <Badge tone="green">No discrepancies</Badge>}>
            <div className="overflow-x-auto">
              <table className="grid-table min-w-[1100px]">
                <thead><tr><th>#</th><th>Product</th><th className="num">Expected (g)</th><th className="num">Gross (g)</th><th className="num">Stone (g)</th><th className="num">Net (g)</th><th>Purity</th><th>Stone OK</th><th>Condition</th><th>Accept</th><th>Remarks</th><th>Flags</th><th /></tr></thead>
                <tbody>{items.map((it, i) => { const d = inwardDiscrepancy(it); return (
                  <tr key={it.id} className={d.any ? 'bg-warn-bg/40' : ''}>
                    <td className="text-muted">{i + 1}</td><td className="font-medium">{m.productMap.get(it.productId)?.name}</td><td className="num">{fmtW(it.expectedGross)}</td>
                    <td className="num"><Bare.input aria-label={`Gross weight piece ${i + 1}`} type="number" step="0.001" className="w-24 text-right" value={it.receivedGross} onChange={(e) => upd(i, { receivedGross: Number(e.target.value) })} /></td>
                    <td className="num"><Bare.input aria-label={`Stone weight piece ${i + 1}`} type="number" step="0.001" className="w-20 text-right" value={it.receivedStone} onChange={(e) => upd(i, { receivedStone: Number(e.target.value) })} /></td>
                    <td className="num">{fmtW(it.receivedNet)}</td>
                    <td><Bare.select aria-label={`Verified purity piece ${i + 1}`} value={it.verifiedPurityId} onChange={(e) => upd(i, { verifiedPurityId: e.target.value })}>{(m.purities.data ?? []).filter((p) => p.metalId === m.productMap.get(it.productId)?.metalId).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Bare.select></td>
                    <td><input aria-label={`Stone verified piece ${i + 1}`} type="checkbox" className="h-4 w-4 accent-[#8f6d2f]" checked={it.stoneOk} onChange={(e) => upd(i, { stoneOk: e.target.checked })} /></td>
                    <td><Bare.select aria-label={`Condition piece ${i + 1}`} value={it.condition} onChange={(e) => upd(i, { condition: e.target.value as 'ok' | 'damaged' })}><option value="ok">OK</option><option value="damaged">Damaged</option></Bare.select></td>
                    <td><input aria-label={`Accept piece ${i + 1}`} type="checkbox" className="h-4 w-4 accent-[#8f6d2f]" checked={it.accepted} onChange={(e) => upd(i, { accepted: e.target.checked })} /></td>
                    <td><Bare.input aria-label={`Remarks piece ${i + 1}`} className="w-36" value={it.remarks} onChange={(e) => upd(i, { remarks: e.target.value })} placeholder={d.any ? 'Explain discrepancy' : ''} /></td>
                    <td className="space-x-1 whitespace-nowrap">{Math.abs(d.weightDiff) > 0.01 && <Badge tone="amber">Δ {d.weightDiff > 0 ? '+' : ''}{d.weightDiff.toFixed(3)}g</Badge>}{d.purityMismatch && <Badge tone="red">Purity</Badge>}{d.stoneProblem && <Badge tone="red">Stone</Badge>}{d.damaged && <Badge tone="red">Damaged</Badge>}</td>
                    <td><button aria-label={`Remove piece ${i + 1}`} className="rounded p-1 text-faint hover:bg-bad-bg hover:text-bad" onClick={() => setItems((s) => s.filter((_, k) => k !== i))}><Trash2 size={14} /></button></td>
                  </tr>) })}</tbody>
              </table>
            </div>
            <div className="border-t border-line px-4 py-3 text-[12.5px] text-muted">Unticked “Accept” pieces are rejected and will not enter stock. Damaged accepted pieces enter stock with status <strong>Damaged</strong>.</div>
          </Card>
        )}
        {po && <p className="text-[12px] text-muted">Order {po.poNumber} dated {fmtDate(po.date)}.</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={() => nav('/inward')}>Cancel</Button>
          <Button disabled={!items.length} loading={save.pending} onClick={() => save.run(false)}>Save draft</Button>
          <Button variant="primary" disabled={!items.length} loading={save.pending} onClick={() => save.run(true)}>Submit for approval</Button>
        </div>
      </div>
    </div>
  )
}
