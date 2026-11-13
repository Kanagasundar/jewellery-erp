export const dayKey = (iso: string | Date): string => {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
export const todayKey = () => dayKey(new Date())
export const monthKey = (iso: string | Date) => dayKey(iso).slice(0, 7)
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const inRange = (iso: string, from?: string, to?: string) => {
  const k = dayKey(iso)
  return (!from || k >= from) && (!to || k <= to)
}
export const shortDay = (key: string) => new Date(key + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
