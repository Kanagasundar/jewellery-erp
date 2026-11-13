import clsx from 'clsx'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: string; actions?: ReactNode; back?: boolean | string }) {
  const nav = useNavigate()
  return (
    <div className="no-print mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-start gap-2">
        {back && (
          <button aria-label="Go back" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))} className="mt-1 rounded-md border border-line-strong bg-white p-1.5 text-ink-2 hover:bg-canvas">
            <ArrowLeft size={15} />
          </button>
        )}
        <div>
          <h1 className="font-display text-[30px] leading-none font-semibold text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={clsx('card', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-[13.5px] font-semibold text-ink">{title}</h2>
          {actions}
        </div>
      )}
      <div className={clsx(pad && 'p-4')}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, sub, tone, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'gold' | 'warn' | 'bad'; icon?: ReactNode }) {
  return (
    <div className="card flex items-start justify-between gap-3 px-4 py-3.5">
      <div className="min-w-0">
        <p className="label-xs">{label}</p>
        <p className={clsx('mt-1 truncate text-[22px] leading-tight font-semibold tabular-nums', tone === 'warn' && 'text-warn', tone === 'bad' && 'text-bad')}>{value}</p>
        {sub && <p className="mt-0.5 truncate text-[12px] text-muted">{sub}</p>}
      </div>
      {icon && <div className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-lg', tone === 'warn' ? 'bg-warn-bg text-warn' : tone === 'bad' ? 'bg-bad-bg text-bad' : 'bg-gold-50 text-gold-600')}>{icon}</div>}
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string; count?: number }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div role="tablist" className="no-print mb-3 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}
          className={clsx('-mb-px border-b-2 px-3 py-2 text-[13px] font-medium whitespace-nowrap', value === t.key ? 'border-gold-500 text-ink' : 'border-transparent text-muted hover:text-ink')}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 py-0.5 text-[11px] text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="label-xs">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-ink">{children || '—'}</dd>
    </div>
  )
}
