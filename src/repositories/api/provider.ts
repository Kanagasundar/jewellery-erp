import type { AuthService, DataProvider, ErpCommands, ReadRepository, Repository, SessionUser } from '@/repositories/interfaces'
import { api, setToken } from './client'

/** Generic REST resource: GET /{resource}, GET /{resource}/{id}, POST, PUT /{id}, DELETE /{id}. */
function rest<T extends { id: string }>(resource: string): Repository<T> {
  return {
    list: () => api<T[]>(`/${resource}`, { query: { limit: 10000 } }),
    get: async (id) => {
      try {
        return await api<T>(`/${resource}/${id}`)
      } catch (e) {
        if ((e as { status?: number }).status === 404) return undefined
        throw e
      }
    },
    create: (data) => api<T>(`/${resource}`, { method: 'POST', body: data }),
    update: (id, patch) => api<T>(`/${resource}/${id}`, { method: 'PUT', body: patch }),
    remove: (id) => api<void>(`/${resource}/${id}`, { method: 'DELETE' }),
  }
}
const ro = <T extends { id: string }>(resource: string): ReadRepository<T> => {
  const { list, get } = rest<T>(resource)
  return { list, get }
}
const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body })

/** Business workflows are SERVER-SIDE transactions: one POST per command (see API_DOCUMENTATION.md). */
const commands: ErpCommands = {
  purchases: {
    save: (i) => (i.id ? api(`/purchases/${i.id}`, { method: 'PUT', body: i }) : post('/purchases', i)),
    submit: (id) => post(`/purchases/${id}/submit`),
    cancel: (id, reason) => post(`/purchases/${id}/cancel`, { reason }),
  },
  inward: {
    save: (i) => (i.id ? api(`/inwards/${i.id}`, { method: 'PUT', body: i }) : post('/inwards', i)),
    submit: (id) => post(`/inwards/${id}/submit`),
    approve: (id) => post(`/inwards/${id}/approve`),
    reject: (id, reason) => post(`/inwards/${id}/reject`, { reason }),
    discardDraft: (id) => api<void>(`/inwards/${id}`, { method: 'DELETE' }),
  },
  barcodes: {
    markPrinted: (itemIds) => post('/barcodes/printed', { itemIds }),
    regenerate: (itemId, reason) => post(`/stock-items/${itemId}/barcode/regenerate`, { reason }),
    lookup: async (code) => {
      try {
        return await api('/barcodes/lookup', { query: { code } })
      } catch (e) {
        if ((e as { status?: number }).status === 404) return undefined
        throw e
      }
    },
  },
  inventory: {
    reserve: (itemId, customerId, note) => post(`/stock-items/${itemId}/reserve`, { customerId, note }),
    release: (itemId) => post(`/stock-items/${itemId}/release`),
    markDamaged: (itemId, reason) => post(`/stock-items/${itemId}/damage`, { reason }),
    restock: (itemId, reason) => post(`/stock-items/${itemId}/restock`, { reason }),
    reconcile: () => api('/stock/reconcile'),
  },
  sales: {
    create: (i) => post('/sales', i),
    cancel: (id, reason) => post(`/sales/${id}/cancel`, { reason }),
    returnItems: (i) => post(`/sales/${i.saleId}/returns`, i),
  },
  payments: { record: (i) => post('/payments', i) },
  repairs: {
    create: (i) => post('/repairs', i),
    assign: (id, artisanId) => post(`/repairs/${id}/assign`, { artisanId }),
    start: (id) => post(`/repairs/${id}/start`),
    complete: (id, labourFinal, note) => post(`/repairs/${id}/complete`, { labourFinal, note }),
    deliver: (id) => post(`/repairs/${id}/deliver`),
    cancel: (id, reason) => post(`/repairs/${id}/cancel`, { reason }),
  },
  polishing: {
    create: (i) => post('/polishing', i),
    assign: (id, artisanId) => post(`/polishing/${id}/assign`, { artisanId }),
    start: (id) => post(`/polishing/${id}/start`),
    submitForQc: (id, afterWeight, remarks) => post(`/polishing/${id}/submit-qc`, { afterWeight, remarks }),
    qc: (id, passed, remarks) => post(`/polishing/${id}/qc`, { passed, remarks }),
    returnToStock: (id) => post(`/polishing/${id}/return`),
  },
  audits: {
    create: (i) => post('/stock-audits', i),
    scan: (id, barcode, physicalWeight) => post(`/stock-audits/${id}/scans`, { barcode, physicalWeight }),
    removeScan: (id, barcode) => api(`/stock-audits/${id}/scans/${encodeURIComponent(barcode)}`, { method: 'DELETE' }),
    submit: (id) => post(`/stock-audits/${id}/submit`),
    approve: (id, note) => post(`/stock-audits/${id}/approve`, { note }),
    reject: (id, note) => post(`/stock-audits/${id}/reject`, { note }),
  },
  system: {
    getSettings: () => api('/settings'),
    saveSettings: (s) => api('/settings', { method: 'PUT', body: s }),
    resetDemo: async () => {
      throw new Error('Demo reset is not available in production mode.')
    },
  },
}

const auth: AuthService = {
  mode: 'production',
  listDemoUsers: async () => [],
  current: async () => {
    try {
      return await api<SessionUser>('/auth/me')
    } catch {
      return null
    }
  },
  loginDemo: async () => {
    throw new Error('Role picker is demo-only.')
  },
  login: async (email, password) => {
    const r = await post<{ token?: string; user: SessionUser }>('/auth/login', { email, password })
    if (r.token) setToken(r.token)
    return r.user
  },
  logout: async () => {
    try {
      await post('/auth/logout')
    } finally {
      setToken(null)
    }
  },
}

export const apiProvider: DataProvider = {
  mode: 'production',
  repos: {
    users: rest('users'), categories: rest('categories'), metals: rest('metals'), purities: rest('purities'),
    metalRates: rest('metal-rates'), taxConfigs: rest('tax-configs'), products: rest('products'), customers: rest('customers'),
    suppliers: rest('suppliers'), expenses: rest('expenses'),
    stockItems: ro('stock-items'), barcodes: ro('barcodes'), purchaseOrders: ro('purchases'), inwards: ro('inwards'),
    ledger: ro('stock-ledger'), sales: ro('sales'), saleReturns: ro('sale-returns'), payments: ro('payments'), repairs: ro('repairs'),
    polishing: ro('polishing'), audits: ro('stock-audits'), adjustments: ro('stock-adjustments'), auditLogs: ro('audit-logs'),
  },
  commands,
  auth,
  setActor: () => {
    /* identity comes from the token/cookie – the server decides who the actor is */
  },
}
