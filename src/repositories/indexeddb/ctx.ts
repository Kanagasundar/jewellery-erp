import { D, money, weight } from '@/domain/calculations/decimal'
import { can, type Permission } from '@/domain/permissions'
import type { SessionUser } from '@/repositories/interfaces'
import type { ID, ItemStatus, LedgerRef, MetalRate, StockItem, StockLedgerEntry } from '@/types/entities'
import { clock } from '@/utils/clock'
import { db } from './db'

/** Business-rule violation. Always surfaced to the user – never swallowed. */
export class BusinessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BusinessError'
  }
}

let actor: SessionUser | null = null
export const setActor = (u: SessionUser | null) => {
  actor = u
}
export const getActor = () => actor
export const actorName = () => actor?.name ?? 'System'
export const actorId = () => actor?.id ?? 'system'

/** Command-level authorization (demo). Production: enforced by the API. */
export function requirePerm(p: Permission) {
  if (!actor) throw new BusinessError('You are not signed in.')
  if (!can(actor.role, p)) throw new BusinessError(`Permission denied: your role (${actor.role.replace(/_/g, ' ')}) cannot perform “${p}”.`)
}
export const hasPerm = (p: Permission) => !!actor && can(actor.role, p)

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export const nowIso = () => clock.iso()

export const stampNew = <T extends object>(o: T) => ({
  ...o,
  createdAt: nowIso(),
  updatedAt: nowIso(),
  createdBy: actorId(),
  updatedBy: actorId(),
})
export const stampUpdate = () => ({ updatedAt: nowIso(), updatedBy: actorId() })

/** Atomic, gap-free-within-transaction document numbering. */
export async function nextNo(key: string, prefix: string, pad = 5): Promise<string> {
  const c = await db.counters.get(key)
  const value = (c?.value ?? 0) + 1
  await db.counters.put({ id: key, value })
  return `${prefix}${String(value).padStart(pad, '0')}`
}

export async function nextSeq(key: string): Promise<number> {
  const c = await db.counters.get(key)
  const value = (c?.value ?? 0) + 1
  await db.counters.put({ id: key, value })
  return value
}

export async function audit(action: string, entity: string, entityId: string, details: string) {
  await db.auditLogs.add({ id: uid(), at: nowIso(), userId: actorId(), userName: actorName(), action, entity, entityId, details })
}

export async function latestRate(metalId: ID, purityId: ID, at?: string): Promise<MetalRate> {
  const all = await db.metalRates.where('[metalId+purityId]').equals([metalId, purityId]).toArray()
  const upTo = at ?? nowIso()
  const eligible = all.filter((r) => r.effectiveAt <= upTo).sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))
  const r = eligible[0] ?? all.sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))[0]
  if (!r) throw new BusinessError('No metal rate configured for this metal/purity. Add a rate in Settings → Metal Rates.')
  return r
}

async function availableTotals(productId: ID) {
  const items = await db.stockItems.where('productId').equals(productId).and((i) => i.status === 'available').toArray()
  return { qty: items.length, weight: weight(items.reduce((s, i) => s.plus(i.netWeight), D(0))) }
}

export interface MoveOpts {
  reason: string
  ref: { type: LedgerRef; id: ID; no: string }
  /** new weights to apply to the item as part of the movement (polishing / audit) */
  newGross?: number
  newNet?: number
  extra?: Partial<StockItem>
}

/**
 * The single choke-point for ANY change of a stock item's status or weight.
 * Writes an immutable ledger row (never updated or deleted) containing before/after
 * balances of the product's available stock, then updates the item.
 */
export async function moveItem(item: StockItem, to: ItemStatus | null, o: MoveOpts): Promise<StockItem> {
  const from = item.status
  const target = to ?? from
  const before = await availableTotals(item.productId)
  const wasAvail = from === 'available'
  const willAvail = target === 'available'
  const oldNet = item.netWeight
  const newNet = o.newNet ?? oldNet
  let qtyIn = 0, qtyOut = 0, wIn = D(0), wOut = D(0)
  if (wasAvail && !willAvail) { qtyOut = 1; wOut = D(oldNet) }
  else if (!wasAvail && willAvail) { qtyIn = 1; wIn = D(newNet) }
  else if (wasAvail && willAvail) {
    const delta = D(newNet).minus(oldNet)
    if (delta.gt(0)) wIn = delta
    else wOut = delta.abs()
  }
  const updated: StockItem = {
    ...item,
    ...(o.extra ?? {}),
    status: target,
    grossWeight: o.newGross ?? item.grossWeight,
    netWeight: newNet,
    ...stampUpdate(),
  }
  const afterQty = before.qty + qtyIn - qtyOut
  const afterWeight = weight(D(before.weight).plus(wIn).minus(wOut))
  const txnNo = await nextNo('ledger', 'SL-', 6)
  const entry: StockLedgerEntry = {
    id: uid(), txnNo, date: nowIso(), stockItemId: item.id, productId: item.productId,
    refType: o.ref.type, refId: o.ref.id, refNo: o.ref.no, statusFrom: from,
    statusTo: target, qtyIn, qtyOut, weightIn: weight(wIn), weightOut: weight(wOut),
    prevQty: before.qty, prevWeight: before.weight, resultQty: afterQty, resultWeight: afterWeight,
    userId: actorId(), userName: actorName(), reason: o.reason,
  }
  await db.stockItems.put(updated)
  await db.ledger.add(entry)
  return updated
}

/** Ledger row for a brand-new item (created by inward). Item must already be written with its status. */
export async function ledgerForNewItem(item: StockItem, o: { reason: string; ref: { type: LedgerRef; id: ID; no: string } }) {
  const totals = await availableTotals(item.productId) // item already counted if available
  const isAvail = item.status === 'available'
  const prevQty = totals.qty - (isAvail ? 1 : 0)
  const prevW = weight(D(totals.weight).minus(isAvail ? item.netWeight : 0))
  const txnNo = await nextNo('ledger', 'SL-', 6)
  await db.ledger.add({
    id: uid(), txnNo, date: nowIso(), stockItemId: item.id, productId: item.productId,
    refType: o.ref.type, refId: o.ref.id, refNo: o.ref.no, statusFrom: null, statusTo: item.status,
    qtyIn: isAvail ? 1 : 0, qtyOut: 0, weightIn: isAvail ? item.netWeight : 0, weightOut: 0,
    prevQty, prevWeight: prevW, resultQty: totals.qty, resultWeight: totals.weight,
    userId: actorId(), userName: actorName(), reason: o.reason,
  })
}

export { D, money, weight }
