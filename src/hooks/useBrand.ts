import { useEffect } from 'react'
import { useSettings } from './useData'

export const DEFAULT_SHOP_NAME = 'Samayan Jewellers'

/** Shop name comes from Settings; falls back to the default before sign-in / when unavailable. */
export function useBrand() {
  const q = useSettings()
  const name = q.data?.shopName?.trim() || DEFAULT_SHOP_NAME
  useEffect(() => { document.title = `${name} – Jewellery ERP` }, [name])
  return { name, tagline: q.data?.tagline ?? '' }
}
