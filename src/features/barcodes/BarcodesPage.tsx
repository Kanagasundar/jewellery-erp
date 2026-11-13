import { Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/app/auth'
import { ScanInput } from '@/components/common/ScanInput'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Badge, Notice, StatusBadge } from '@/components/ui/Feedback'
import { Bare } from '@/components/ui/Form'
import { Card, PageHeader, Tabs } from '@/components/ui/Layout'
import { useAction, useList, useMasters, useSettings } from '@/hooks/useData'
import { erp } from '@/services'
import type { LabelSizeKey, StockItem } from '@/types/entities'
import { fmtDateTime, fmtW } from '@/utils/format'
import { ItemDetail } from './ItemDetail'
import { indicativePrice, Label, LABEL_SIZES } from './LabelSheet'

type Tab = 'labels' | 'scan' | 'registry'

export default function BarcodesPage() {
  const { can } = useAuth()
  const [sp, setSp] = useSearchParams()
  const m = useMasters()
  const items = useList('stockItems'), barcodes = useList('barcodes'), rates = useList('metalRates')
  const settings = useSettings()
  const [tab, setTab] = useState<Tab>((sp.get('tab') as Tab) || (sp.get('q') ? 'scan' : 'labels'))
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [size, setSize] = useState<LabelSizeKey>('medium')
  const [showPrice, setShowPrice] = useState<boolean | null>(null)
  const [onlyUnprinted, setUnprinted] = useState(false)
  const [found, setFound] = useState<StockItem | null>(null)
  const [scanMsg, setScanMsg] = useState('')

  const bcByItem = useMemo(() => new Map((barcodes.data ?? []).filter((b) => b.active).map((b) => [b.stockItemId, b])), [barcodes.data])
  const rows = useMemo(() => (items.data ?? []).filter((i) => !onlyUnprinted || (bcByItem.get(i.id)?.printCount ?? 0) === 0), [items.data, onlyUnprinted, bcByItem])
  const selected = (items.data ?? []).filter((i) => sel.has(i.id))
  const price = showPrice ?? settings.data?.showPriceOnLabel ?? false
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const printed = useAction((ids: string[]) => erp.commands.barcodes.markPrinted(ids))
  const doPrint = async () => { window.print(); await printed.run(selected.map((i) => i.id)) }

  const lookup = async (code: string) => {
    setScanMsg('')
    const r = await erp.commands.barcodes.lookup(code)
    if (!r) { setFound(null); setScanMsg(`No stock item matches “${code}”.`); return }
    setFound(r.item)
    if (r.barcode && !r.barcode.active) setScanMsg(`Note: “${code}” is a replaced (voided) barcode — showing the current item.`)
  }
  const initialQ = sp.get('q')

  const cols: Column<StockItem>[] = [
    { key: 'sel', header: '', className: 'w-8', render: (i) => <input type="checkbox" aria-label={`Select ${i.itemCode}`} className="h-4 w-4 accent-[#8f6d2f]" checked={sel.has(i.id)} onChange={() => toggle(i.id)} /> },
    { key: 'bc', header: 'Barcode', value: (i) => i.barcode, render: (i) => <span className="font-mono text-[12px]">{i.barcode}</span> },
    { key: 'code', header: 'Item code', value: (i) => i.itemCode, render: (i) => <span className="font-mono text-[12px]">{i.itemCode}</span> },
    { key: 'name', header: 'Product', value: (i) => m.productMap.get(i.productId)?.name, render: (i) => <span className="font-medium">{m.productMap.get(i.productId)?.name}</span> },
    { key: 'purity', header: 'Purity', value: (i) => m.purityMap.get(i.purityId)?.label },
    { key: 'net', header: 'Net (g)', num: true, value: (i) => i.netWeight, render: (i) => fmtW(i.netWeight) },
    { key: 'gross', header: 'Gross (g)', num: true, value: (i) => i.grossWeight, render: (i) => fmtW(i.grossWeight) },
    { key: 'pc', header: 'Printed', num: true, value: (i) => bcByItem.get(i.id)?.printCount ?? 0, render: (i) => { const n = bcByItem.get(i.id)?.printCount ?? 0; return n ? `${n}×` : <Badge tone="amber">New</Badge> } },
    { key: 'st', header: 'Status', value: (i) => i.status, render: (i) => <StatusBadge status={i.status} /> },
  ]

  return (
    <div className="fade-in">
      <PageHeader title="Barcode management" subtitle="One barcode = one physical piece. Print, reprint, scan and look up items." />
      <Tabs value={tab} onChange={(t) => { setTab(t); sp.delete('tab'); setSp(sp, { replace: true }) }} tabs={[{ key: 'labels', label: 'Print labels' }, { key: 'scan', label: 'Scan / lookup' }, { key: 'registry', label: 'Barcode registry', count: barcodes.data?.length }]} />

      {tab === 'labels' && (
        <>
          <div className="no-print">
            <DataTable rows={rows} columns={cols} rowKey={(i) => i.id} loading={items.isLoading || m.loading} error={items.error} searchPlaceholder="Search barcode, item, product…" pageSizes={[25, 50, 100]}
              toolbar={<>
                <label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" className="accent-[#8f6d2f]" checked={onlyUnprinted} onChange={(e) => setUnprinted(e.target.checked)} />Never printed</label>
                <Button size="sm" onClick={() => setSel(new Set(rows.map((i) => i.id)))}>Select all shown</Button><Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Clear</Button>
              </>} />
            <Card className="mt-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-2">Label size<Bare.select value={size} onChange={(e) => setSize(e.target.value as LabelSizeKey)}>{Object.entries(LABEL_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Bare.select></label>
                <label className="flex items-center gap-1.5 pb-1.5 text-[13px]"><input type="checkbox" className="accent-[#8f6d2f]" checked={price} onChange={(e) => setShowPrice(e.target.checked)} />Show indicative price</label>
                <div className="ml-auto flex items-center gap-3"><span className="text-[12.5px] text-muted">{selected.length} selected</span>
                  <Button variant="primary" icon={<Printer size={14} />} disabled={!selected.length || !can('barcodes.manage')} loading={printed.pending} onClick={doPrint}>Print {selected.length || ''} label{selected.length === 1 ? '' : 's'}</Button></div>
              </div>
              {!can('barcodes.manage') && <div className="mt-2"><Notice tone="amber">Your role can view barcodes but not print / reprint them.</Notice></div>}
            </Card>
          </div>
          {selected.length > 0 && (
            <div className="mt-3 print-area">
              <p className="no-print label-xs mb-2">Preview — what will print</p>
              <div className="flex flex-wrap gap-2 print:gap-0">{selected.slice(0, 200).map((i) => <Label key={i.id} item={i} size={size} product={m.productMap.get(i.productId)} purity={m.purityMap.get(i.purityId)} settings={settings.data} price={price ? indicativePrice(i, m.productMap.get(i.productId), rates.data ?? []) : null} />)}</div>
            </div>
          )}
        </>
      )}

      {tab === 'scan' && (
        <div className="space-y-3">
          <Card>
            <ScanInput onScan={lookup} />
            <p className="mt-2 text-[12px] text-muted">USB scanners work as a keyboard — keep the box focused and scan. Camera scanning and manual typing also work.</p>
            {initialQ && !found && <Button size="sm" className="mt-2" onClick={() => lookup(initialQ)}>Look up “{initialQ}”</Button>}
            {scanMsg && <div className="mt-2"><Notice tone={found ? 'blue' : 'red'}>{scanMsg}</Notice></div>}
          </Card>
          {found && <ItemDetail key={found.id} item={(items.data ?? []).find((i) => i.id === found.id) ?? found} onPrint={() => { setSel(new Set([found.id])); setTab('labels') }} />}
        </div>
      )}

      {tab === 'registry' && (
        <DataTable rows={barcodes.data} rowKey={(b) => b.id} loading={barcodes.isLoading} error={barcodes.error} initialSort={{ key: 'created', dir: 'desc' }} pageSizes={[25, 50, 100]} empty={{ title: 'No barcodes yet' }}
          columns={[
            { key: 'code', header: 'Barcode', value: (b) => b.code, render: (b) => <span className="font-mono text-[12px]">{b.code}</span> },
            { key: 'item', header: 'Item', value: (b) => (items.data ?? []).find((i) => i.id === b.stockItemId)?.itemCode, render: (b) => <span className="font-mono text-[12px]">{(items.data ?? []).find((i) => i.id === b.stockItemId)?.itemCode}</span> },
            { key: 'active', header: 'Active', value: (b) => (b.active ? 'Active' : 'Voided'), render: (b) => <Badge tone={b.active ? 'green' : 'red'}>{b.active ? 'Active' : 'Voided'}</Badge> },
            { key: 'pc', header: 'Print count', num: true, value: (b) => b.printCount },
            { key: 'lp', header: 'Last printed', value: (b) => b.lastPrintedAt ?? '', render: (b) => fmtDateTime(b.lastPrintedAt) },
            { key: 'created', header: 'Created', value: (b) => b.createdAt, render: (b) => fmtDateTime(b.createdAt) },
            { key: 'why', header: 'Void reason', value: (b) => b.voidedReason ?? '', render: (b) => <span className="text-muted">{b.voidedReason ?? '—'}</span> },
          ]} />
      )}
    </div>
  )
}
