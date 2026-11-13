import type { InwardItem, ItemStatus, PolishStatus, PurchaseOrder, RepairStatus, StockItem } from '@/types/entities'
import { D } from '../calculations/decimal'

/** Why an item can't be sold, or null if it can. Rules 2, 3, 4 of the business-rule list. */
export function sellBlockReason(item: Pick<StockItem, 'status' | 'itemCode'>): string | null {
  const msgs: Record<ItemStatus, string | null> = {
    available: null,
    sold: 'already SOLD – an item cannot be sold twice',
    repair: 'is under REPAIR and cannot be sold',
    polishing: 'is under POLISHING and cannot be sold',
    reserved: 'is RESERVED for a customer',
    damaged: 'is marked DAMAGED',
    returned: 'is a RETURNED item awaiting restock inspection',
    missing: 'is marked MISSING',
  }
  const m = msgs[item.status]
  return m ? `${item.itemCode} ${m}` : null
}

export const STATUS_TONE: Record<string, string> = {
  available: 'green', reserved: 'amber', sold: 'slate', repair: 'blue', polishing: 'violet', damaged: 'red', returned: 'amber', missing: 'red',
}

export interface InwardDiscrepancy {
  weightDiff: number
  purityMismatch: boolean
  stoneProblem: boolean
  damaged: boolean
  any: boolean
}
export function inwardDiscrepancy(i: InwardItem, tolerance = 0.01): InwardDiscrepancy {
  const weightDiff = D(i.receivedGross).minus(i.expectedGross).toDecimalPlaces(3).toNumber()
  const purityMismatch = i.verifiedPurityId !== i.expectedPurityId
  const stoneProblem = !i.stoneOk
  const damaged = i.condition === 'damaged'
  return { weightDiff, purityMismatch, stoneProblem, damaged, any: Math.abs(weightDiff) > tolerance || purityMismatch || stoneProblem || damaged }
}

export function purchaseStatusAfterReceipt(po: PurchaseOrder, fullyPaid: boolean): PurchaseOrder['status'] {
  if (po.status === 'cancelled' || po.status === 'draft') return po.status
  const ordered = po.lines.reduce((s, l) => s + l.qty, 0)
  const received = po.lines.reduce((s, l) => s + l.receivedQty, 0)
  if (received <= 0) return 'pending'
  if (received < ordered) return 'partially_received'
  return fullyPaid ? 'completed' : 'received'
}

export const REPAIR_FLOW: Record<RepairStatus, RepairStatus[]> = {
  received: ['assigned', 'cancelled'],
  assigned: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['delivered'],
  delivered: [],
  cancelled: [],
}
export const POLISH_FLOW: PolishStatus[] = ['pending', 'assigned', 'in_progress', 'quality_check', 'completed', 'returned']

const BARCODE_PREFIX = 'AUR'
export const makeBarcode = (n: number) => `${BARCODE_PREFIX}${String(n).padStart(8, '0')}`
/** Code128-safe: printable ASCII, 6–20 chars. */
export const isValidBarcode = (c: string) => /^[\x20-\x7e]{4,40}$/.test(c)
