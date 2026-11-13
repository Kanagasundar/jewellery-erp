import { BarcodeImage } from '@/components/common/BarcodeImage'
import { priceItem } from '@/domain/calculations/pricing'
import type { LabelSizeKey, MetalRate, Product, Purity, Settings, StockItem } from '@/types/entities'
import { fmtW } from '@/utils/format'

export const LABEL_SIZES: Record<LabelSizeKey, { label: string; w: number; h: number; bar: number; font: number }> = {
  small: { label: 'Small · 50 × 25 mm', w: 50, h: 25, bar: 22, font: 7 },
  medium: { label: 'Medium · 75 × 38 mm', w: 75, h: 38, bar: 38, font: 9 },
  large: { label: 'Large · 100 × 50 mm', w: 100, h: 50, bar: 52, font: 11 },
}

export function indicativePrice(item: StockItem, p: Product | undefined, rates: MetalRate[]): number | null {
  if (!p) return null
  const rate = rates.filter((r) => r.metalId === item.metalId && r.purityId === item.purityId).sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))[0]?.ratePerGram
  if (p.pricingMode !== 'fixed_price' && !rate) return null
  return priceItem({ pricingMode: p.pricingMode, fixedPrice: p.fixedPrice, netWeight: item.netWeight, ratePerGram: rate ?? 0, makingType: p.makingType, makingValue: p.makingValue, wastageType: p.wastageType, wastageValue: p.wastageValue, stoneCharge: p.stoneCharge, gstPercent: p.gstPercent }).amount
}

export function Label({ item, product, purity, settings, size, price }: { item: StockItem; product?: Product; purity?: Purity; settings?: Settings; size: LabelSizeKey; price?: number | null }) {
  const s = LABEL_SIZES[size]
  return (
    <div style={{ width: `${s.w}mm`, height: `${s.h}mm`, fontSize: `${s.font}px`, breakInside: 'avoid' }} className="overflow-hidden border border-dashed border-stone-300 bg-white p-[1.5mm] leading-tight text-black print:border-none">
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate font-bold tracking-wide uppercase">{settings?.shopName ?? 'Jewellers'}</span>
        <span className="font-semibold whitespace-nowrap">{purity?.label}</span>
      </div>
      <div className="truncate font-medium">{product?.name}</div>
      <div className="flex justify-center py-[0.5mm]"><BarcodeImage value={item.barcode} height={s.bar} width={size === 'small' ? 1.1 : size === 'medium' ? 1.5 : 2} /></div>
      <div className="flex items-center justify-between gap-1 font-mono"><span>{item.barcode}</span><span>{item.itemCode}</span></div>
      <div className="flex items-center justify-between gap-1">
        <span>N {fmtW(item.netWeight)}g · G {fmtW(item.grossWeight)}g</span>
        {price != null && <span className="font-bold">₹{Math.round(price).toLocaleString('en-IN')}</span>}
      </div>
    </div>
  )
}
