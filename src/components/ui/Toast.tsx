import clsx from 'clsx'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'

type Kind = 'success' | 'error' | 'info'
interface Toast { id: number; kind: Kind; message: string }
interface Api { success: (m: string) => void; error: (m: string) => void; info: (m: string) => void }

const Ctx = createContext<Api>({ success: () => {}, error: () => {}, info: () => {} })
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const n = useRef(0)
  const push = useCallback((kind: Kind, message: string) => {
    const id = ++n.current
    setItems((s) => [...s.slice(-3), { id, kind, message }])
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), kind === 'error' ? 8000 : 4000)
  }, [])
  const api: Api = { success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }
  const icons = { success: <CheckCircle2 size={16} />, error: <AlertCircle size={16} />, info: <Info size={16} /> }
  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="no-print fixed right-4 bottom-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={clsx('fade-in flex items-start gap-2.5 rounded-lg border bg-white px-3.5 py-3 text-[13px] shadow-[var(--shadow-pop)]',
            t.kind === 'success' && 'border-[#bddcc8]', t.kind === 'error' && 'border-[#efc4bf]', t.kind === 'info' && 'border-line-strong')}>
            <span className={clsx('mt-0.5', t.kind === 'success' && 'text-ok', t.kind === 'error' && 'text-bad', t.kind === 'info' && 'text-info')}>{icons[t.kind]}</span>
            <p className="flex-1 text-ink-2">{t.message}</p>
            <button aria-label="Dismiss" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} className="text-faint hover:text-ink"><X size={14} /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
