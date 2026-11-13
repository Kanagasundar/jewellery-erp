import { FileDown, FileSpreadsheet, Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/app/auth'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import type { Column } from '@/components/ui/DataTable'
import { Notice, Spinner } from '@/components/ui/Feedback'
import { Bare } from '@/components/ui/Form'
import { Card, PageHeader } from '@/components/ui/Layout'
import { useToast } from '@/components/ui/Toast'
import { money, sum, weight } from '@/domain/calculations/decimal'
import { useSettings, useList } from '@/hooks/useData'
import { fmtDate, fmtInt, fmtNum, fmtW } from '@/utils/format'
import { REPORTS } from './definitions'
import type { Kind, RCol, ReportData, Row } from './definitions'

const startOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const today = () => new Date().toISOString().slice(0, 10)

function useReportData() {
  const q = {
    sales: useList('sales'), returns: useList('saleReturns'), purchases: useList('purchaseOrders'), payments: useList('payments'), items: useList('stockItems'), ledger: useList('ledger'),
    products: useList('products'), categories: useList('categories'), metals: useList('metals'), purities: useList('purities'), customers: useList('customers'), suppliers: useList('suppliers'),
    repairs: useList('repairs'), polishing: useList('polishing'), audits: useList('audits'), adjustments: useList('adjustments'), expenses: useList('expenses'), users: useList('users'), auditLogs: useList('auditLogs'),
  }
  const all = Object.values(q)
  const loading = all.some((x) => x.isLoading)
  const error = all.find((x) => x.error)?.error
  const data = Object.fromEntries(Object.entries(q).map(([k, v]) => [k, v.data ?? []])) as unknown as ReportData
  return { data, loading, error }
}

const fmtCell = (v: string | number | undefined, k?: Kind) => {
  if (v === undefined || v === '') return ''
  if (k === 'money') return fmtNum(v as number)
  if (k === 'weight') return fmtW(v as number)
  if (k === 'int') return fmtInt(v as number)
  if (k === 'date') return fmtDate(String(v))
  return String(v)
}

export default function ReportsPage() {
  const { can } = useAuth()
  const toast = useToast()
  const settings = useSettings()
  const [sp, setSp] = useSearchParams()
  const { data, loading, error } = useReportData()
  const available = REPORTS.filter((r) => !r.financial || can('reports.financial'))
  const key = sp.get('r') ?? available[0].key
  const def = available.find((r) => r.key === key) ?? available[0]
  const [from, setFrom] = useState(startOfMonth()), [to, setTo] = useState(today())
  const result = useMemo(() => (loading ? null : def.build(data, def.ranged ? from : undefined, def.ranged ? to : undefined)), [def, data, from, to, loading])

  const columns: Column<Row>[] = useMemo(() => (result?.columns ?? []).map((c: RCol) => ({
    key: c.key, header: c.header, num: c.kind === 'money' || c.kind === 'weight' || c.kind === 'int', value: (r: Row) => r[c.key] as string | number,
    render: (r: Row) => fmtCell(r[c.key], c.kind),
    footer: c.total ? (rows: Row[]) => <strong>{fmtCell(c.kind === 'weight' ? weight(sum(rows.map((r) => Number(r[c.key]) || 0))) : money(sum(rows.map((r) => Number(r[c.key]) || 0))), c.kind)}</strong> : undefined,
  })), [result])

  const title = `${def.title}${def.ranged ? ` (${fmtDate(from)} – ${fmtDate(to)})` : ` (as of ${fmtDate(new Date().toISOString())})`}`
  const exportRows = (): (string | number)[][] => [(result?.columns ?? []).map((c) => c.header), ...(result?.rows ?? []).map((r) => (result?.columns ?? []).map((c) => (c.kind === 'money' || c.kind === 'weight' || c.kind === 'int' ? Number(r[c.key]) : fmtCell(r[c.key], c.kind))))]

  const toExcel = async () => {
    if (!result?.rows.length) return toast.info('Nothing to export.')
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([[settings.data?.shopName ?? ''], [title], [], ...exportRows()])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, def.title.slice(0, 28).replace(/[\\/?*[\]:]/g, ' '))
    XLSX.writeFile(wb, `${def.key}-${today()}.xlsx`)
  }
  const toPdf = async () => {
    if (!result?.rows.length) return toast.info('Nothing to export.')
    const [{ jsPDF }, autoTable] = await Promise.all([import('jspdf'), import('jspdf-autotable').then((m) => m.default)])
    const doc = new jsPDF({ orientation: result.columns.length > 7 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
    doc.setFontSize(14); doc.text(settings.data?.shopName ?? '', 40, 38)
    doc.setFontSize(10); doc.text(title.replace(/₹/g, 'Rs.'), 40, 56)
    const [head, ...body] = exportRows()
    autoTable(doc, { startY: 70, head: [head.map((h) => String(h).replace(/₹/g, 'Rs.'))], body: body.map((r) => r.map((v) => (typeof v === 'number' ? v.toLocaleString('en-IN') : String(v).replace(/₹/g, 'Rs.')))), styles: { fontSize: 7.5, cellPadding: 3 }, headStyles: { fillColor: [28, 25, 23] }, margin: { left: 40, right: 40 } })
    doc.save(`${def.key}-${today()}.pdf`)
  }

  return (
    <div className="fade-in">
      <PageHeader title="Reports & analytics" subtitle="Computed live from your transactions. Filter, search, print or export."
        actions={<><Button icon={<Printer size={14} />} onClick={() => window.print()}>Print</Button><Button icon={<FileSpreadsheet size={14} />} onClick={toExcel}>Excel</Button><Button icon={<FileDown size={14} />} onClick={toPdf}>PDF</Button></>} />
      <div className="grid gap-4 lg:grid-cols-[250px_1fr]">
        <nav className="no-print card h-fit p-2" aria-label="Reports">
          {[...new Set(available.map((r) => r.group))].map((g) => (
            <div key={g} className="mb-2"><p className="label-xs px-2.5 py-1.5">{g}</p>
              {available.filter((r) => r.group === g).map((r) => <button key={r.key} onClick={() => { sp.set('r', r.key); setSp(sp, { replace: true }) }} aria-current={r.key === def.key} className={`block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] ${r.key === def.key ? 'bg-gold-50 font-medium text-gold-700' : 'text-ink-2 hover:bg-canvas'}`}>{r.title}</button>)}</div>
          ))}
        </nav>
        <div className="min-w-0 print-area">
          <div className="mb-2 hidden print:block"><h2 className="font-display text-2xl font-semibold">{settings.data?.shopName}</h2><p className="text-sm">{title}</p></div>
          <div className="no-print mb-3 flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="font-display text-[24px] leading-tight font-semibold">{def.title}</h2><p className="text-[12.5px] text-muted">{def.description}</p></div>
            {def.ranged && <div className="flex items-center gap-2"><Bare.input aria-label="From date" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /><span className="text-muted">to</span><Bare.input aria-label="To date" type="date" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} />
              <Button size="sm" onClick={() => { setFrom(today()); setTo(today()) }}>Today</Button><Button size="sm" onClick={() => { setFrom(startOfMonth()); setTo(today()) }}>This month</Button><Button size="sm" onClick={() => { setFrom('2000-01-01'); setTo(today()) }}>All</Button></div>}
          </div>
          {loading ? <Spinner label="Building report…" /> : (
            <>
              {result?.note && <div className="no-print mb-2"><Notice tone="blue">{result.note}</Notice></div>}
              <DataTable rows={result?.rows} columns={columns} rowKey={(r) => JSON.stringify(r)} error={error} showFooter pageSizes={[25, 50, 100]} empty={{ title: 'No data for this report', hint: def.ranged ? 'Try a wider date range.' : undefined }} />
            </>
          )}
          <Card className="no-print mt-3" pad><p className="text-[12px] text-muted">Totals use decimal arithmetic. Excel exports contain raw numbers; PDF is a formatted snapshot.</p></Card>
        </div>
      </div>
    </div>
  )
}
