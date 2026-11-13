import type { MakingType, PricingMode, WastageType } from '@/types/entities'
import { D, money, sum, weight, type Num } from './decimal'

/**
 * Configurable jewellery pricing. Every product carries its own formula parameters,
 * so different items can follow different rules:
 *
 *  weight_based:  metal = net × rate/g
 *                 wastage = (percent of net | fixed grams) × rate/g
 *                 making  = % of (metal+wastage) | per-gram × net | fixed amount
 *                 taxable = metal + wastage + making + stone charge − discount
 *  fixed_price:   taxable = fixed price (coins, silverware …) − discount
 *  GST is applied on taxable at the product's GST %.
 */
export interface PricingInput {
  pricingMode: PricingMode
  fixedPrice?: number
  netWeight: number
  ratePerGram: number
  makingType: MakingType
  makingValue: number
  wastageType: WastageType
  wastageValue: number
  stoneCharge: number
  discount?: number
  gstPercent: number
}
export interface PricingResult {
  metalValue: number
  wastageValue: number
  makingValue: number
  stoneCharge: number
  discount: number
  taxable: number
  gst: number
  amount: number
}

export function priceItem(i: PricingInput): PricingResult {
  const discount = D(i.discount)
  let metal = D(0)
  let wastage = D(0)
  let making = D(0)
  let stone = D(0)
  if (i.pricingMode === 'fixed_price') {
    metal = D(i.fixedPrice)
  } else {
    metal = D(i.netWeight).times(i.ratePerGram)
    wastage =
      i.wastageType === 'percent'
        ? D(i.netWeight).times(D(i.wastageValue).div(100)).times(i.ratePerGram)
        : D(i.wastageValue).times(i.ratePerGram)
    const base = metal.plus(wastage)
    making =
      i.makingType === 'percent'
        ? base.times(D(i.makingValue).div(100))
        : i.makingType === 'per_gram'
          ? D(i.netWeight).times(i.makingValue)
          : D(i.makingValue)
    stone = D(i.stoneCharge)
  }
  const m = money(metal), w = money(wastage), mk = money(making), s = money(stone), dsc = money(discount)
  const taxable = money(D(m).plus(w).plus(mk).plus(s).minus(dsc))
  const gst = money(D(taxable).times(D(i.gstPercent).div(100)))
  return { metalValue: m, wastageValue: w, makingValue: mk, stoneCharge: s, discount: dsc, taxable, gst, amount: money(D(taxable).plus(gst)) }
}

export interface InvoiceTotals {
  subtotal: number
  discount: number
  taxable: number
  cgst: number
  sgst: number
  gst: number
  roundOff: number
  total: number
}
/** Totals from priced lines. GST is split equally CGST/SGST (intra-state). Total is rounded to the rupee; the round-off is stored. */
export function invoiceTotals(lines: Pick<PricingResult, 'metalValue' | 'wastageValue' | 'makingValue' | 'stoneCharge' | 'discount' | 'taxable' | 'gst'>[]): InvoiceTotals {
  const subtotal = money(sum(lines.map((l) => D(l.metalValue).plus(l.wastageValue).plus(l.makingValue).plus(l.stoneCharge))))
  const discount = money(sum(lines.map((l) => l.discount)))
  const taxable = money(sum(lines.map((l) => l.taxable)))
  const gst = money(sum(lines.map((l) => l.gst)))
  const cgst = money(D(gst).div(2))
  const sgst = money(D(gst).minus(cgst))
  const exact = D(taxable).plus(gst)
  const total = exact.toDecimalPlaces(0).toNumber()
  return { subtotal, discount, taxable, cgst, sgst, gst, roundOff: money(D(total).minus(exact)), total }
}

export interface PurchaseLineInput {
  qty: number
  netWeight: number
  rate: number
  makingCharge: number
  wastagePercent: number
  gstPercent: number
  stoneCharge?: number
}
export function purchaseLineAmounts(l: PurchaseLineInput) {
  const per = D(l.netWeight).times(l.rate)
  const wastage = D(l.netWeight).times(D(l.wastagePercent).div(100)).times(l.rate)
  const taxablePer = per.plus(wastage).plus(l.makingCharge).plus(l.stoneCharge ?? 0)
  const taxable = money(taxablePer.times(l.qty))
  const gst = money(D(taxable).times(D(l.gstPercent).div(100)))
  return { taxable, gst, amount: money(D(taxable).plus(gst)) }
}
export const netWeightOf = (gross: Num, stone: Num) => weight(D(gross).minus(stone))
