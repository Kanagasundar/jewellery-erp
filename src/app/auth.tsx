import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { can as canRole } from '@/domain/permissions'
import type { Permission } from '@/domain/permissions'
import type { SessionUser } from '@/repositories/interfaces'
import { erp } from '@/services'

interface AuthState {
  user: SessionUser | null
  loading: boolean
  can: (p: Permission) => boolean
  loginDemo: (userId: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}
const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const qc = useQueryClient()

  const apply = useCallback((u: SessionUser | null) => {
    erp.setActor(u)
    setUser(u)
  }, [])

  useEffect(() => {
    erp.auth.current().then(apply).finally(() => setLoading(false))
  }, [apply])

  const value: AuthState = {
    user,
    loading,
    can: (p) => canRole(user?.role, p),
    loginDemo: async (id) => { apply(await erp.auth.loginDemo(id)); qc.clear() },
    login: async (email, pw) => { apply(await erp.auth.login(email, pw)); qc.clear() },
    logout: async () => { await erp.auth.logout(); apply(null); qc.clear() },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
