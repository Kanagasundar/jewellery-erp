import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorState, Spinner } from '@/components/ui/Feedback'
import { bootstrap } from '@/services'
import { useAuth } from './auth'
import { LoginScreen } from './LoginScreen'
import { appRoutes } from '@/routes'
import { Forbidden } from '@/routes/Forbidden'
import { NAV } from '@/components/layout/nav'

function Gate() {
  const { user, loading, can } = useAuth()
  if (loading) return <Spinner label="Starting…" />
  if (!user) return <LoginScreen />
  const home = NAV.flatMap((g) => g.items).find((i) => can(i.perm))?.to ?? '/'
  return (
    <Routes>
      <Route element={<AppShell />}>
        {appRoutes.map((r) => (
          <Route key={r.path} path={r.path} element={can(r.perm) ? r.element : r.path === '/' && home !== '/' ? <Navigate to={home} replace /> : <Forbidden />} />
        ))}
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  )
}

export function App() {
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  useEffect(() => { bootstrap().then(() => setReady(true)).catch(setErr) }, [])
  if (err) return <ErrorState error={err} onRetry={() => location.reload()} />
  if (!ready) return <Spinner label="Preparing your workspace…" />
  return <Gate />
}
