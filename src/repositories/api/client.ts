import { API_BASE_URL } from '@/config/env'

/** Normalised API failure. `status` 0 = network error / timeout. */
export class ApiError extends Error {
  status: number
  code?: string
  fieldErrors?: Record<string, string>
  constructor(message: string, status: number, code?: string, fieldErrors?: Record<string, string>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }
  get retryable() {
    return this.status === 0 || this.status >= 500 || this.status === 429
  }
}

/**
 * Token storage. The token lives in memory (and sessionStorage as a convenience across reloads).
 * Prefer an HttpOnly, SameSite cookie issued by the API in production – then no token handling is needed here.
 */
let token: string | null = null
try { token = sessionStorage.getItem('aurum.token') } catch { /* ignore */ }
export const setToken = (t: string | null) => {
  token = t
  try {
    if (t) sessionStorage.setItem('aurum.token', t)
    else sessionStorage.removeItem('aurum.token')
  } catch { /* ignore */ }
}
export const hasToken = () => !!token

let onUnauthorized: (() => void) | null = null
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | undefined>
  timeoutMs?: number
  /** GET requests are retried (exponential backoff) on network errors / 5xx / 429. Writes are never auto-retried. */
  retries?: number
}

interface Envelope<T> {
  success?: boolean
  data?: T
  error?: { code?: string; message?: string; fields?: Record<string, string> }
}

/** Response envelope: { success: boolean, data?: T, error?: { code, message, fields? } } – see API_DOCUMENTATION.md */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  if (!API_BASE_URL) throw new ApiError('VITE_API_BASE_URL is not configured for production mode.', 0, 'NO_API_URL')
  const method = opts.method ?? 'GET'
  const url = new URL(API_BASE_URL + path, window.location.origin)
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  const attempts = method === 'GET' ? (opts.retries ?? 2) + 1 : 1
  let last: ApiError | null = null
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000)
    try {
      const res = await fetch(url, {
        method,
        signal: ctrl.signal,
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      })
      let json: Envelope<T> | null = null
      try { json = (await res.json()) as Envelope<T> } catch { /* non-JSON body */ }
      if (res.status === 401) onUnauthorized?.()
      if (!res.ok || json?.success === false) {
        throw new ApiError(json?.error?.message ?? `Request failed (${res.status})`, res.status, json?.error?.code, json?.error?.fields)
      }
      return (json?.data ?? (json as unknown)) as T
    } catch (e) {
      last = e instanceof ApiError
        ? e
        : new ApiError(e instanceof DOMException && e.name === 'AbortError' ? 'The request timed out.' : 'Cannot reach the server. Check your connection.', 0, 'NETWORK')
      if (!last.retryable || i === attempts - 1) throw last
      await sleep(400 * 2 ** i)
    } finally {
      clearTimeout(timer)
    }
  }
  throw last ?? new ApiError('Unknown error', 0)
}
