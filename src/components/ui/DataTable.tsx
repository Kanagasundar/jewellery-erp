import clsx from 'clsx'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { EmptyState, ErrorState, Spinner } from './Feedback'

export interface Column<T> {
  key: string
  header: string
  /** plain value used for sort / search / export */
  value?: (row: T) => string | number | null | undefined
  render?: (row: T) => ReactNode
  num?: boolean
  className?: string
  hidden?: boolean
  footer?: (rows: T[]) => ReactNode
}

interface Props<T> {
  rows: T[] | undefined
  columns: Column<T>[]
  rowKey: (row: T) => string
  loading?: boolean
  error?: unknown
  onRetry?: () => void
  onRowClick?: (row: T) => void
  searchable?: boolean
  searchPlaceholder?: string
  toolbar?: ReactNode
  empty?: { title: string; hint?: string; action?: ReactNode }
  pageSizes?: number[]
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  dense?: boolean
  showFooter?: boolean
  maxHeight?: string
}

const cmp = (a: unknown, b: unknown) => {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' })
}

export function DataTable<T>({
  rows, columns, rowKey, loading, error, onRetry, onRowClick, searchable = true, searchPlaceholder = 'Search…', toolbar, empty,
  pageSizes = [10, 25, 50, 100], initialSort, showFooter, maxHeight,
}: Props<T>) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState(initialSort ?? null)
  const [size, setSize] = useState(pageSizes[1] ?? 25)
  const [page, setPage] = useState(0)
  const cols = columns.filter((c) => !c.hidden)

  const filtered = useMemo(() => {
    if (!rows) return []
    const needle = q.trim().toLowerCase()
    let out = rows
    if (needle) out = rows.filter((r) => cols.some((c) => String(c.value?.(r) ?? '').toLowerCase().includes(needle)))
    if (sort) {
      const col = cols.find((c) => c.key === sort.key)
      if (col?.value) {
        const v = col.value
        out = [...out].sort((a, b) => (sort.dir === 'asc' ? 1 : -1) * cmp(v(a), v(b)))
      }
    }
    return out
  }, [rows, q, sort, cols])

  const pages = size === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / size))
  const cur = Math.min(page, pages - 1)
  const visible = size === 0 ? filtered : filtered.slice(cur * size, cur * size + size)

  return (
    <div className="card overflow-hidden">
      {(searchable || toolbar) && (
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          {searchable && (
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" aria-hidden />
              <input aria-label="Search table" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} placeholder={searchPlaceholder}
                className="h-8 w-full rounded-md border border-line-strong bg-white pr-2 pl-8 text-[13px] focus:border-gold-500 focus:ring-2 focus:ring-gold-200 focus:outline-none" />
            </div>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">{toolbar}</div>
        </div>
      )}
      {error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : loading ? (
        <Spinner />
      ) : !rows?.length ? (
        <EmptyState title={empty?.title ?? 'Nothing here yet'} hint={empty?.hint} action={empty?.action} />
      ) : (
        <>
          <div className="overflow-auto" style={{ maxHeight }}>
            <table className="grid-table">
              <thead>
                <tr>
                  {cols.map((c) => {
                    const active = sort?.key === c.key
                    return (
                      <th key={c.key} className={clsx(c.num && 'num', c.className)} aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                        {c.value ? (
                          <button className={clsx('inline-flex items-center gap-1 uppercase', c.num && 'flex-row-reverse')}
                            onClick={() => setSort(active && sort!.dir === 'asc' ? { key: c.key, dir: 'desc' } : { key: c.key, dir: 'asc' })}>
                            {c.header}
                            {active && (sort!.dir === 'asc' ? <ArrowUp size={11} aria-hidden /> : <ArrowDown size={11} aria-hidden />)}
                          </button>
                        ) : c.header}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={rowKey(r)} className={clsx(onRowClick && 'clickable')} onClick={onRowClick ? () => onRowClick(r) : undefined}
                    tabIndex={onRowClick ? 0 : undefined} onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}>
                    {cols.map((c) => (
                      <td key={c.key} className={clsx(c.num && 'num', c.className)}>{c.render ? c.render(r) : (c.value?.(r) ?? '—')}</td>
                    ))}
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan={cols.length}><EmptyState title="No matching records" hint="Try a different search." /></td></tr>
                )}
              </tbody>
              {showFooter && filtered.length > 0 && (
                <tfoot>
                  <tr>{cols.map((c, i) => <td key={c.key} className={clsx(c.num && 'num')}>{c.footer ? c.footer(filtered) : i === 0 ? 'Total' : ''}</td>)}</tr>
                </tfoot>
              )}
            </table>
          </div>
          <div className="no-print flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-[12px] text-muted">
            <span>{filtered.length} record{filtered.length === 1 ? '' : 's'}{q && rows ? ` (of ${rows.length})` : ''}</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5">Rows
                <select aria-label="Rows per page" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0) }} className="h-7 rounded border border-line-strong bg-white px-1">
                  {pageSizes.map((s) => <option key={s} value={s}>{s}</option>)}
                  <option value={0}>All</option>
                </select>
              </label>
              <div className="flex items-center gap-1">
                <button aria-label="Previous page" disabled={cur === 0} onClick={() => setPage(cur - 1)} className="rounded p-1 hover:bg-black/5 disabled:opacity-30"><ChevronLeft size={16} /></button>
                <span className="tabular-nums">{cur + 1} / {pages}</span>
                <button aria-label="Next page" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} className="rounded p-1 hover:bg-black/5 disabled:opacity-30"><ChevronRight size={16} /></button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
