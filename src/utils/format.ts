import { D } from '@/domain/calculations/decimal'

const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

export const fmtMoney = (v: number | string | null | undefined) => `₹${inr.format(D(v).toNumber())}`
export const fmtMoney0 = (v: number | string | null | undefined) => `₹${inr0.format(D(v).toNumber())}`
export const fmtNum = (v: number | string | null | undefined) => inr.format(D(v).toNumber())
export const fmtWeight = (v: number | string | null | undefined) => `${D(v).toFixed(3)} g`
export const fmtW = (v: number | string | null | undefined) => D(v).toFixed(3)
export const fmtInt = (v: number | string | null | undefined) => inr0.format(D(v).toNumber())

export const fmtDate = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
export const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
export const toDateInput = (iso?: string) => (iso ? iso.slice(0, 10) : '')
export const todayInput = () => new Date().toISOString().slice(0, 10)
export const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
