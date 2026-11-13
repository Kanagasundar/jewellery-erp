/** Overridable clock so the demo seeder can back-date transactions through the real command layer. */
let override: Date | null = null
export const clock = {
  now: (): Date => (override ? new Date(override) : new Date()),
  iso: (): string => clock.now().toISOString(),
  set: (d: Date | null) => {
    override = d
  },
}
export const daysAgo = (n: number, hour = 11): Date => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, 0, 0, 0)
  return d
}
