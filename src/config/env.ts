export type AppMode = 'demo' | 'production'

const raw = (import.meta.env.VITE_APP_MODE as string | undefined)?.toLowerCase()
export const APP_MODE: AppMode = raw === 'production' ? 'production' : 'demo'
export const API_BASE_URL: string = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/+$/, '')
export const IS_DEMO = APP_MODE === 'demo'
