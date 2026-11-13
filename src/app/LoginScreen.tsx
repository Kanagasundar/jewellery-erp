import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Form'
import { Notice, Spinner } from '@/components/ui/Feedback'
import { IS_DEMO } from '@/config/env'
import { ROLE_LABELS } from '@/domain/permissions'
import { erp } from '@/services'
import { errMsg } from '@/hooks/useData'
import { useAuth } from './auth'

const ROLE_ORDER = Object.keys(ROLE_LABELS)
const ROLE_BLURB: Record<string, string> = {
  super_admin: 'Full control, configuration and users',
  shop_admin: 'Approvals, cancellations, all operations',
  sales: 'POS billing, customers, repairs intake',
  stock_manager: 'Inward, barcodes, inventory, stock audits',
  purchase_manager: 'Purchase orders and supplier dealings',
  artisan: 'Update assigned repair & polishing jobs',
  accountant: 'Payments, expenses and financial reports',
  viewer: 'Read-only access',
}

export function LoginScreen() {
  const { loginDemo, login } = useAuth()
  const users = useQuery({ queryKey: ['demo-users'], queryFn: () => erp.auth.listDemoUsers(), enabled: IS_DEMO })
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)

  const go = async (fn: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await fn() } catch (e) { setError(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden flex-col justify-between bg-side p-10 text-stone-300 lg:flex">
        <div className="flex items-center gap-3"><Logo size={38} /><span className="font-display text-3xl font-semibold tracking-wide text-gold-300">Aurum</span></div>
        <div>
          <h1 className="font-display text-[46px] leading-[1.05] font-semibold text-white">Every piece,<br />individually accounted for.</h1>
          <p className="mt-4 max-w-md text-[14px] leading-relaxed text-stone-400">Item-level barcodes, an auditable stock ledger, weight-accurate billing and a workshop you can trace — built for the jewellery counter.</p>
        </div>
        <p className="text-[11px] tracking-wide text-stone-500">Aurum Jewellery ERP · {IS_DEMO ? 'Demonstration build' : 'Production'}</p>
      </div>
      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-lg">
          {IS_DEMO ? (
            <>
              <h2 className="font-display text-[32px] font-semibold">Choose a demo role</h2>
              <p className="mt-1 text-[13px] text-muted">Explore the ERP as different staff. Data is stored only in this browser.</p>
              <div className="mt-3"><Notice tone="amber">Demo sign-in is not secure authentication. In production, users sign in with credentials verified by the server.</Notice></div>
              {error && <div className="mt-3"><Notice tone="red">{error}</Notice></div>}
              {users.isLoading ? <Spinner label="Preparing demo data…" /> : (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {[...(users.data ?? [])].filter((u) => u.active).sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)).map((u) => (
                    <button key={u.id} disabled={busy} onClick={() => go(() => loginDemo(u.id))} className="card group p-3 text-left transition hover:border-gold-400 hover:shadow-md">
                      <p className="text-[13.5px] font-semibold">{ROLE_LABELS[u.role]}</p>
                      <p className="text-[12px] text-ink-2">{u.name}</p>
                      <p className="mt-1 text-[11.5px] text-muted">{ROLE_BLURB[u.role]}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); go(() => login(email, pw)) }} className="space-y-3">
              <h2 className="font-display text-[32px] font-semibold">Sign in</h2>
              {error && <Notice tone="red">{error}</Notice>}
              <Input label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Input label="Password" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
              <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">Sign in</Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
