import { useSyncExternalStore } from 'react'
import { useSettings } from './useData'

const KEY = 'aurum.branch'
const subs = new Set<() => void>()
const read = () => { try { return localStorage.getItem(KEY) ?? '' } catch { return '' } }
export const setActiveBranch = (id: string) => {
  try { localStorage.setItem(KEY, id) } catch { /* private mode: not persisted */ }
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

/** Currently selected branch (falls back to the first configured branch). */
export function useBranch() {
  const stored = useSyncExternalStore(subscribe, read, () => '')
  const settings = useSettings()
  const branches = settings.data?.branches ?? []
  const active = branches.find((b) => b.id === stored) ?? branches[0]
  return { branches, active, setActive: setActiveBranch }
}
