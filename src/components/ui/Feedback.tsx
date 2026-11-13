import clsx from 'clsx'
import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './Button'

const tones: Record<string, string> = {
  green: 'bg-ok-bg text-ok', amber: 'bg-warn-bg text-warn', red: 'bg-bad-bg text-bad', blue: 'bg-info-bg text-info',
  violet: 'bg-violet-bg text-violet', slate: 'bg-stone-100 text-stone-600', gold: 'bg-gold-100 text-gold-700',
}
export function Badge({ tone = 'slate', children, dot }: { tone?: string; children: ReactNode; dot?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap', tones[tone] ?? tones.slate)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}

const STATUS_TONES: Record<string, string> = {
  available: 'green', completed: 'green', delivered: 'green', approved: 'green', posted: 'green', returned: 'amber', received: 'green', active: 'green',
  pending: 'amber', reserved: 'amber', partially_received: 'amber', pending_approval: 'amber', quality_check: 'amber', draft: 'slate',
  in_progress: 'blue', assigned: 'blue', repair: 'blue', polishing: 'violet', sold: 'slate', inactive: 'slate',
  cancelled: 'red', rejected: 'red', damaged: 'red', missing: 'red', void: 'red',
}
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? 'slate'} dot>{status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}</Badge>
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted">
      <Loader2 size={16} className="spin" aria-hidden /> {label}
    </div>
  )
}

export function EmptyState({ title, hint, action, icon }: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-gold-50 text-gold-600">{icon ?? <Inbox size={20} aria-hidden />}</div>
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-sm text-[12.5px] text-muted">{hint}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-bad-bg text-bad"><AlertTriangle size={20} aria-hidden /></div>
      <p className="text-[14px] font-semibold">Couldn’t load this data</p>
      <p className="max-w-md text-[12.5px] text-muted">{msg}</p>
      {onRetry && <Button size="sm" icon={<RefreshCw size={13} />} onClick={onRetry}>Retry</Button>}
    </div>
  )
}

export function Notice({ tone = 'amber', children }: { tone?: 'amber' | 'red' | 'blue' | 'green'; children: ReactNode }) {
  const t = { amber: 'bg-warn-bg text-warn border-[#ecd6a6]', red: 'bg-bad-bg text-bad border-[#efc4bf]', blue: 'bg-info-bg text-info border-[#bfd6ea]', green: 'bg-ok-bg text-ok border-[#bddcc8]' }[tone]
  return <div role={tone === 'red' ? 'alert' : 'note'} className={clsx('rounded-md border px-3 py-2 text-[12.5px]', t)}>{children}</div>
}
