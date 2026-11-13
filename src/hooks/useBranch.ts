import { useSyncExternalStore } from 'react'
import { useSettings } from './useData'

const KEY = 'aurum.branch'
export const ALL_BRANCHES = '__all__'
const subs = new Set<() => void>()
const read = () => { try { return localStorage.getItem(KEY) ?? '' } catch { return '' } }
export const setActiveBranch = (id: string) => {
  try { localStorage.setItem(KEY, id) } catch { /* private mode: not persisted */ }
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

/**
 * Branch context.
 *  - `scopeId`   : branch used to FILTER views (dashboard, inventory, reports …). undefined = "All branches".
 *  - `operating` : a concrete branch for TRANSACTIONS (billing, inward, audits). Falls back to the first branch when "All" is selected.
 */
export function useBranch() {
  const stored = useSyncExternalStore(subscribe, read, () => '')
  const settings = useSettings()
  const branches = settings.data?.branches ?? []
  const isAll = stored === ALL_BRANCHES
  const found = branches.find((b) => b.id === stored)
  const active = isAll ? undefined : (found ?? branches[0])
  const operating = active ?? branches[0]
  const nameOf = (id?: string) => branches.find((b) => b.id === id)?.name ?? '—'
  return { branches, active, isAll, operating, scopeId: active?.id, setActive: setActiveBranch, nameOf }
}
