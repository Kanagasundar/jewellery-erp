import clsx from 'clsx'
import { Bell, ChevronDown, LogOut, Menu, Plus, Search, Store } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/app/auth'
import { Badge } from '@/components/ui/Feedback'
import { IS_DEMO } from '@/config/env'
import { ROLE_LABELS } from '@/domain/permissions'
import { useAlerts } from '@/hooks/useAlerts'
import { useList, useSettings } from '@/hooks/useData'
import { erp } from '@/services'
import { useQuery } from '@tanstack/react-query'

function Popover({ button, children, align = 'right', label }: { button: ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; label: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button aria-label={label} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-md p-1.5 text-ink-2 hover:bg-black/5">{button}</button>
      {open && <div role="menu" className={clsx('fade-in absolute top-[calc(100%+6px)] z-40 min-w-[240px] rounded-lg border border-line bg-white p-1.5 shadow-[var(--shadow-pop)]', align === 'right' ? 'right-0' : 'left-0')}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

function GlobalSearch() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const products = useList('products')
  const customers = useList('customers')
  const items = useList('stockItems')
  const sales = useList('sales')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const results = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (n.length < 2) return []
    const out: { key: string; group: string; text: string; sub: string; to: string }[] = []
    for (const i of items.data ?? []) if (i.barcode.toLowerCase().includes(n) || i.itemCode.toLowerCase().includes(n)) out.push({ key: i.id, group: 'Stock item', text: i.itemCode, sub: `${i.barcode} · ${i.status}`, to: `/inventory?q=${encodeURIComponent(i.itemCode)}` })
    for (const p of products.data ?? []) if (p.name.toLowerCase().includes(n) || p.code.toLowerCase().includes(n)) out.push({ key: p.id, group: 'Product', text: p.name, sub: p.code, to: `/products/${p.id}` })
    for (const c of customers.data ?? []) if (c.name.toLowerCase().includes(n) || c.phone.includes(n)) out.push({ key: c.id, group: 'Customer', text: c.name, sub: c.phone, to: `/customers/${c.id}` })
    for (const s of sales.data ?? []) if (s.invoiceNo.toLowerCase().includes(n)) out.push({ key: s.id, group: 'Invoice', text: s.invoiceNo, sub: s.customerName, to: `/sales/${s.id}` })
    return out.slice(0, 9)
  }, [q, items.data, products.data, customers.data, sales.data])
  return (
    <div className="relative hidden max-w-md flex-1 md:block" ref={ref}>
      <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" aria-hidden />
      <input aria-label="Global search" value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        placeholder="Search barcode, item, product, customer, invoice…" className="h-9 w-full rounded-md border border-line bg-white pr-3 pl-9 text-[13px] focus:border-gold-500 focus:ring-2 focus:ring-gold-200 focus:outline-none" />
      {open && q.trim().length >= 2 && (
        <div className="fade-in absolute top-[calc(100%+6px)] z-40 w-full overflow-hidden rounded-lg border border-line bg-white shadow-[var(--shadow-pop)]">
          {results.length ? results.map((r) => (
            <button key={r.group + r.key} onClick={() => { nav(r.to); setOpen(false); setQ('') }} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-canvas">
              <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{r.text}</span><span className="block truncate text-[11.5px] text-muted">{r.sub}</span></span>
              <Badge tone="gold">{r.group}</Badge>
            </button>
          )) : <p className="px-3 py-4 text-center text-[12.5px] text-muted">No results for “{q}”.</p>}
        </div>
      )}
    </div>
  )
}

export function Header({ onMenu }: { onMenu: () => void }) {
  const { user, can, loginDemo, logout } = useAuth()
  const nav = useNavigate()
  const alerts = useAlerts()
  const settings = useSettings()
  const demoUsers = useQuery({ queryKey: ['demo-users'], queryFn: () => erp.auth.listDemoUsers(), enabled: IS_DEMO })
  const [branch, setBranch] = useState(() => { try { return localStorage.getItem('aurum.branch') ?? 'br-main' } catch { return 'br-main' } })
  const branches = settings.data?.branches ?? []
  const actions = [
    { label: 'New Sale', to: '/sales/new', perm: 'sales.create' as const },
    { label: 'New Purchase', to: '/purchases/new', perm: 'purchases.manage' as const },
    { label: 'Scan / Lookup Barcode', to: '/barcodes?tab=scan', perm: 'barcodes.view' as const },
    { label: 'New Repair', to: '/repairs?new=1', perm: 'repairs.manage' as const },
    { label: 'New Polishing Job', to: '/polishing?new=1', perm: 'polishing.manage' as const },
    { label: 'Record Payment', to: '/payments?new=1', perm: 'payments.manage' as const },
  ].filter((a) => can(a.perm))

  return (
    <header className="app-header no-print sticky top-0 z-30 flex h-[54px] items-center gap-2 border-b border-line bg-white/90 px-3 backdrop-blur sm:px-5">
      <button aria-label="Open menu" onClick={onMenu} className="rounded-md p-1.5 hover:bg-black/5 lg:hidden"><Menu size={19} /></button>
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        {IS_DEMO && <span title="Data lives in this browser only (IndexedDB)"><Badge tone="gold" dot>DEMO MODE</Badge></span>}
        {!IS_DEMO && <Badge tone="green" dot>PRODUCTION</Badge>}
        {actions.length > 0 && (
          <Popover label="Quick actions" button={<><span className="hidden items-center gap-1 rounded-md bg-ink px-2.5 py-1 text-[12.5px] font-medium text-white sm:inline-flex"><Plus size={14} />Quick action</span><Plus size={18} className="sm:hidden" /></>}>
            {(close) => actions.map((a) => <button key={a.to} role="menuitem" onClick={() => { nav(a.to); close() }} className="block w-full rounded px-3 py-2 text-left text-[13px] hover:bg-canvas">{a.label}</button>)}
          </Popover>
        )}
        <Popover label={`Notifications (${alerts.length})`} button={<span className="relative"><Bell size={18} />{alerts.length > 0 && <span className="absolute -top-1.5 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-semibold text-white">{alerts.length}</span>}</span>}>
          {(close) => (
            <div className="w-[320px] max-w-[84vw]">
              <p className="label-xs px-3 py-2">Notifications</p>
              {alerts.length === 0 && <p className="px-3 py-5 text-center text-[12.5px] text-muted">All clear — nothing needs attention.</p>}
              {alerts.map((a) => (
                <button key={a.id} role="menuitem" onClick={() => { nav(a.to); close() }} className="flex w-full items-start gap-2 rounded px-3 py-2 text-left hover:bg-canvas">
                  <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', a.tone === 'red' ? 'bg-bad' : a.tone === 'amber' ? 'bg-warn' : 'bg-info')} aria-hidden />
                  <span><span className="block text-[13px] font-medium">{a.title}</span><span className="block text-[11.5px] text-muted">{a.detail}</span></span>
                </button>
              ))}
            </div>
          )}
        </Popover>
        {branches.length > 0 && (
          <label className="hidden items-center gap-1.5 text-[12.5px] text-ink-2 xl:flex"><Store size={15} aria-hidden />
            <select aria-label="Shop / branch" value={branch} onChange={(e) => { setBranch(e.target.value); try { localStorage.setItem('aurum.branch', e.target.value) } catch { /* ignore */ } }} className="h-8 rounded-md border border-line bg-white px-1.5">
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        <Popover label="User menu" button={<><span className="grid h-7 w-7 place-items-center rounded-full bg-gold-100 text-[12px] font-semibold text-gold-700">{user?.name.slice(0, 1)}</span><span className="hidden text-left leading-tight sm:block"><span className="block text-[12.5px] font-medium">{user?.name}</span><span className="block text-[11px] text-muted">{user ? ROLE_LABELS[user.role] : ''}</span></span><ChevronDown size={14} className="hidden sm:block" /></>}>
          {(close) => (
            <div className="w-[270px] max-w-[84vw]">
              {IS_DEMO && (
                <>
                  <p className="label-xs px-3 py-2">Switch demo role</p>
                  <p className="px-3 pb-2 text-[11px] text-muted">Demo only — not real authentication.</p>
                  <div className="max-h-64 overflow-y-auto">
                    {(demoUsers.data ?? []).filter((u) => u.active).map((u) => (
                      <button key={u.id} role="menuitem" onClick={async () => { await loginDemo(u.id); close(); nav('/') }} className={clsx('flex w-full items-center justify-between gap-2 rounded px-3 py-1.5 text-left hover:bg-canvas', u.id === user?.id && 'bg-gold-50')}>
                        <span className="text-[13px]">{u.name}</span><span className="text-[11px] text-muted">{ROLE_LABELS[u.role]}</span>
                      </button>
                    ))}
                  </div>
                  <div className="my-1 border-t border-line" />
                </>
              )}
              <button role="menuitem" onClick={async () => { await logout(); close() }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-[13px] hover:bg-canvas"><LogOut size={14} /> Sign out</button>
            </div>
          )}
        </Popover>
      </div>
    </header>
  )
}
