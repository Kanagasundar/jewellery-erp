import JsBarcode from 'jsbarcode'
import { useEffect, useRef } from 'react'

/** CODE128 barcode rendered as inline SVG (crisp when printed). */
export function BarcodeImage({ value, height = 40, width = 1.6, showText = false, fontSize = 11 }: { value: string; height?: number; width?: number; showText?: boolean; fontSize?: number }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!ref.current || !value) return
    try {
      JsBarcode(ref.current, value, { format: 'CODE128', height, width, displayValue: showText, fontSize, margin: 0, background: 'transparent', lineColor: '#000' })
    } catch {
      /* invalid value – leave blank */
    }
  }, [value, height, width, showText, fontSize])
  return <svg ref={ref} role="img" aria-label={`Barcode ${value}`} />
}
