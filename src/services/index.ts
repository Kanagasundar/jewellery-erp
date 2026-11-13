import { APP_MODE } from '@/config/env'
import { apiProvider } from '@/repositories/api/provider'
import { idbProvider } from '@/repositories/indexeddb/provider'
import { ensureSeeded } from '@/repositories/indexeddb/seed'
import type { DataProvider } from '@/repositories/interfaces'

/**
 * THE data-provider switch. The UI imports `erp` only – never IndexedDB or fetch directly.
 * Demo → IndexedDB. Production → REST API (CodeIgniter 4). Controlled by VITE_APP_MODE.
 */
export const erp: DataProvider = APP_MODE === 'production' ? apiProvider : idbProvider

let booting: Promise<void> | null = null
/** Demo: make sure the IndexedDB database exists and is seeded (once, even if called concurrently). Production: nothing to do. */
export const bootstrap = (): Promise<void> => {
  if (!booting) {
    booting = (APP_MODE !== 'production' ? ensureSeeded() : Promise.resolve()).catch((e) => {
      booting = null
      throw e
    })
  }
  return booting
}
