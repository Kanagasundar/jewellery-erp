import clsx from 'clsx'
import { X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import { Textarea } from './Form'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}
const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-5xl' }

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus(), 30)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      clearTimeout(t)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={clsx('fade-in flex max-h-[92vh] w-full flex-col rounded-t-xl bg-surface shadow-[var(--shadow-pop)] sm:rounded-xl', widths[size])}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-[22px] leading-tight font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>}
          </div>
          <button aria-label="Close dialog" onClick={onClose} className="rounded p-1 text-muted hover:bg-black/5"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ---------- promise-based confirm / reason prompt ---------- */
interface ConfirmOpts {
  title: string
  message?: ReactNode
  confirmLabel?: string
  danger?: boolean
  /** show a required reason box; the resolved value is the reason text (non-empty). Without it the dialog resolves to 'confirmed'. Cancel resolves to null. */
  reasonLabel?: string
}
type ConfirmFn = (o: ConfirmOpts) => Promise<string | null>
const DialogCtx = createContext<ConfirmFn>(async () => null)
export const useConfirm = () => useContext(DialogCtx)

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ o: ConfirmOpts; resolve: (v: string | null) => void } | null>(null)
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const confirm = useCallback<ConfirmFn>((o) => new Promise((resolve) => { setReason(''); setTouched(false); setState({ o, resolve }) }), [])
  const close = (v: string | null) => { state?.resolve(v); setState(null) }
  const needsReason = !!state?.o.reasonLabel
  return (
    <DialogCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!state} onClose={() => close(null)} title={state?.o.title ?? ''} size="sm"
        footer={<>
          <Button onClick={() => close(null)}>Cancel</Button>
          <Button variant={state?.o.danger ? 'danger' : 'primary'} onClick={() => { if (needsReason && !reason.trim()) { setTouched(true); return } close(needsReason ? reason.trim() : 'confirmed') }}>
            {state?.o.confirmLabel ?? 'Confirm'}
          </Button>
        </>}
      >
        {state?.o.message && <div className="mb-3 text-[13px] text-ink-2">{state.o.message}</div>}
        {needsReason && <Textarea label={state!.o.reasonLabel!} value={reason} onChange={(e) => setReason(e.target.value)} error={touched && !reason.trim() ? 'This is required.' : undefined} required />}
      </Modal>
    </DialogCtx.Provider>
  )
}
