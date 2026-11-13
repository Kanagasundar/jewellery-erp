import Decimal from 'decimal.js'

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

export { Decimal }
export type Num = Decimal.Value
export const D = (v: Num | null | undefined): Decimal => {
  if (v === null || v === undefined || v === '') return new Decimal(0)
  try {
    const d = new Decimal(v)
    return d.isFinite() ? d : new Decimal(0)
  } catch {
    return new Decimal(0)
  }
}
/** Round to 2 dp (money) and return a JS number for storage. */
export const money = (v: Num): number => D(v).toDecimalPlaces(2).toNumber()
/** Round to 3 dp (weights in grams). */
export const weight = (v: Num): number => D(v).toDecimalPlaces(3).toNumber()
export const sum = (values: Num[]): Decimal => values.reduce<Decimal>((a, b) => a.plus(D(b)), new Decimal(0))
export const eq = (a: Num, b: Num, dp = 2) => D(a).toDecimalPlaces(dp).equals(D(b).toDecimalPlaces(dp))
