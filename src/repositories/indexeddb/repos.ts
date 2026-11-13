import type { Permission } from '@/domain/permissions'
import type { NewEntity, ReadRepository, Repository } from '@/repositories/interfaces'
import type { EntityTable } from 'dexie'
import { BusinessError, audit, requirePerm, stampNew, stampUpdate, uid } from './ctx'
import { db } from './db'

type Row = { id: string }

function friendly(e: unknown, entity: string): never {
  if (e instanceof BusinessError) throw e
  const err = e as { name?: string; message?: string }
  if (err?.name === 'ConstraintError') throw new BusinessError(`Duplicate value: another ${entity} already uses that code / unique field.`)
  throw e
}

export function readRepo<T extends Row>(table: EntityTable<T, 'id'>): ReadRepository<T> {
  return {
    list: () => table.toArray() as unknown as Promise<T[]>,
    get: (id) => table.get(id as never) as Promise<T | undefined>,
  }
}

export function writeRepo<T extends Row>(
  table: EntityTable<T, 'id'>, entity: string, perm: Permission, guardRemove?: (id: string) => Promise<string | null>,
): Repository<T> {
  return {
    ...readRepo(table),
    create: async (data: NewEntity<T>) => {
      requirePerm(perm)
      const row = stampNew({ ...data, id: data.id ?? uid() }) as unknown as T
      try {
        await table.add(row as never)
      } catch (e) {
        friendly(e, entity)
      }
      await audit('create', entity, row.id, `${entity} created`)
      return row
    },
    update: async (id, patch) => {
      requirePerm(perm)
      const cur = (await table.get(id as never)) as T | undefined
      if (!cur) throw new BusinessError(`${entity} not found.`)
      const row = { ...cur, ...patch, id, ...stampUpdate() } as T
      try {
        await table.put(row as never)
      } catch (e) {
        friendly(e, entity)
      }
      await audit('update', entity, id, `${entity} updated`)
      return row
    },
    remove: async (id) => {
      requirePerm(perm)
      const why = guardRemove ? await guardRemove(id) : null
      if (why) throw new BusinessError(why)
      await table.delete(id as never)
      await audit('delete', entity, id, `${entity} deleted`)
    },
  }
}

export const repos = {
  users: writeRepo(db.users, 'user', 'users.manage'),
  categories: writeRepo(db.categories, 'category', 'settings.manage', async (id) =>
    (await db.products.where('categoryId').equals(id).count()) ? 'Products use this category. Deactivate products first.' : null),
  metals: writeRepo(db.metals, 'metal', 'settings.manage', async (id) =>
    (await db.products.where('metalId').equals(id).count()) ? 'Products use this metal.' : null),
  purities: writeRepo(db.purities, 'purity', 'settings.manage', async (id) =>
    (await db.products.filter((p) => p.purityId === id).count()) ? 'Products use this purity.' : null),
  metalRates: writeRepo(db.metalRates, 'metal rate', 'rates.manage'),
  taxConfigs: writeRepo(db.taxConfigs, 'tax', 'settings.manage'),
  products: writeRepo(db.products, 'product', 'products.manage', async (id) =>
    (await db.stockItems.where('productId').equals(id).count()) ? 'This product has physical stock history and cannot be deleted. Mark it inactive instead.' : null),
  customers: writeRepo(db.customers, 'customer', 'customers.manage', async (id) =>
    (await db.sales.where('customerId').equals(id).count()) || (await db.repairs.where('customerId').equals(id).count()) || (await db.payments.where('partyId').equals(id).count())
      ? 'This customer has transaction history and cannot be deleted. Mark inactive instead.' : null),
  suppliers: writeRepo(db.suppliers, 'supplier', 'suppliers.manage', async (id) =>
    (await db.purchaseOrders.where('supplierId').equals(id).count()) ? 'This supplier has purchase history and cannot be deleted. Mark inactive instead.' : null),
  expenses: writeRepo(db.expenses, 'expense', 'expenses.manage'),
  stockItems: readRepo(db.stockItems),
  barcodes: readRepo(db.barcodes),
  purchaseOrders: readRepo(db.purchaseOrders),
  inwards: readRepo(db.inwards),
  ledger: readRepo(db.ledger),
  sales: readRepo(db.sales),
  saleReturns: readRepo(db.saleReturns),
  payments: readRepo(db.payments),
  repairs: readRepo(db.repairs),
  polishing: readRepo(db.polishing),
  audits: readRepo(db.audits),
  adjustments: readRepo(db.adjustments),
  auditLogs: readRepo(db.auditLogs),
}
