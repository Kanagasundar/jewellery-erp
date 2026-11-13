import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useToast } from '@/components/ui/Toast'
import type { DataProvider, ReadRepository } from '@/repositories/interfaces'
import { erp } from '@/services'

type Repos = DataProvider['repos']
type RowOf<K extends keyof Repos> = Repos[K] extends ReadRepository<infer T> ? T : never

/** Every list is a cached query keyed by repository name. Commands invalidate everything (modules are interconnected). */
export function useList<K extends keyof Repos>(name: K) {
  return useQuery<RowOf<K>[]>({
    queryKey: ['repo', name],
    queryFn: () => (erp.repos[name] as unknown as ReadRepository<RowOf<K>>).list(),
    staleTime: 5_000,
  })
}

export function useIndex<T extends { id: string }>(rows: T[] | undefined): Map<string, T> {
  return useMemo(() => new Map((rows ?? []).map((r) => [r.id, r])), [rows])
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.')

interface ActionOpts<R> {
  success?: string | ((r: R) => string)
  onSuccess?: (r: R) => void
}

/**
 * Wrap a command. `run()` resolves to the result, or `undefined` if the command failed
 * (the failure is always shown to the user as an error toast – never silent).
 */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>, opts: ActionOpts<R> = {}) {
  const qc = useQueryClient()
  const toast = useToast()
  const m = useMutation({
    mutationFn: (args: A) => fn(...args),
    onSuccess: async (r) => {
      await qc.invalidateQueries()
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(r) : opts.success)
      opts.onSuccess?.(r)
    },
    onError: (e) => toast.error(errMsg(e)),
  })
  return {
    run: async (...args: A): Promise<R | undefined> => {
      try {
        return await m.mutateAsync(args)
      } catch {
        return undefined
      }
    },
    pending: m.isPending,
    error: m.error ? errMsg(m.error) : null,
  }
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => erp.commands.system.getSettings(), staleTime: 30_000 })
}

/** Frequently co-used master lists + id → record maps. */
export function useMasters() {
  const products = useList('products')
  const customers = useList('customers')
  const suppliers = useList('suppliers')
  const categories = useList('categories')
  const metals = useList('metals')
  const purities = useList('purities')
  const users = useList('users')
  const productMap = useIndex(products.data)
  const customerMap = useIndex(customers.data)
  const supplierMap = useIndex(suppliers.data)
  const categoryMap = useIndex(categories.data)
  const metalMap = useIndex(metals.data)
  const purityMap = useIndex(purities.data)
  const userMap = useIndex(users.data)
  const loading = [products, customers, suppliers, categories, metals, purities].some((q) => q.isLoading)
  return { products, customers, suppliers, categories, metals, purities, users, productMap, customerMap, supplierMap, categoryMap, metalMap, purityMap, userMap, loading }
}

export const purityLabel = (m: Map<string, { label: string }>, id?: string) => (id ? m.get(id)?.label ?? '—' : '—')
