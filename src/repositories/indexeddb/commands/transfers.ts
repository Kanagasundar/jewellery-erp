import type { ErpCommands } from '@/repositories/interfaces'
import type { StockTransfer } from '@/types/entities'
import { db } from '../db'
import { BusinessError, actorName, audit, moveItem, nextNo, nowIso, requireBranch, requirePerm, stampNew, stampUpdate, uid } from '../ctx'
import { tx } from './stock'

/**
 * Two-step inter-branch transfer so stock is never lost between shops:
 *  dispatch (source)  : available -> IN TRANSIT   (ledger OUT at the source branch)
 *  receive (target)   : IN TRANSIT -> available   (ledger IN at the target branch; item.branchId changes)
 */
export const transfers: ErpCommands['transfers'] = {
  create: (input) =>
    tx(async () => {
      requirePerm('transfers.manage')
      const from = await requireBranch(input.fromBranchId, 'source branch')
      const to = await requireBranch(input.toBranchId, 'destination branch')
      if (from.id === to.id) throw new BusinessError('Source and destination branch must be different.')
      if (!input.itemIds.length) throw new BusinessError('Select at least one item to transfer.')
      if (new Set(input.itemIds).size !== input.itemIds.length) throw new BusinessError('The same item is selected twice.')
      const id = uid()
      const transferNo = await nextNo('transfer', 'TRF-', 5)
      for (const itemId of input.itemIds) {
        const item = await db.stockItems.get(itemId)
        if (!item) throw new BusinessError('An item no longer exists.')
        if (item.branchId !== from.id) throw new BusinessError(`${item.itemCode} is not held at ${from.name}.`)
        if (item.status !== 'available') throw new BusinessError(`${item.itemCode} is ${item.status.replace('_', ' ')}; only available items can be transferred.`)
        await moveItem(item, 'in_transit', { reason: `Dispatched ${from.name} to ${to.name}`, ref: { type: 'transfer', id, no: transferNo } })
      }
      const t: StockTransfer = stampNew({
        id, transferNo, fromBranchId: from.id, toBranchId: to.id, fromBranchName: from.name, toBranchName: to.name, itemIds: input.itemIds,
        status: 'in_transit' as const, note: input.note, dispatchedAt: nowIso(),
      })
      await db.transfers.add(t)
      await audit('dispatch', 'transfer', id, `${transferNo}: ${input.itemIds.length} item(s) ${from.name} to ${to.name}`)
      return t
    }),
  receive: (id) =>
    tx(async () => {
      requirePerm('transfers.manage')
      const t = await db.transfers.get(id)
      if (!t) throw new BusinessError('Transfer not found.')
      if (t.status !== 'in_transit') throw new BusinessError(`This transfer is already ${t.status}.`)
      for (const itemId of t.itemIds) {
        const item = await db.stockItems.get(itemId)
        if (!item || item.status !== 'in_transit') throw new BusinessError('An item on this transfer is not in transit.')
        await moveItem(item, 'available', { reason: `Received at ${t.toBranchName} from ${t.fromBranchName}`, ref: { type: 'transfer', id, no: t.transferNo }, extra: { branchId: t.toBranchId } })
      }
      const u: StockTransfer = { ...t, status: 'received', receivedAt: nowIso(), receivedBy: actorName(), ...stampUpdate() }
      await db.transfers.put(u)
      await audit('receive', 'transfer', id, `${t.transferNo} received at ${t.toBranchName}`)
      return u
    }),
  cancel: (id, reason) =>
    tx(async () => {
      requirePerm('transfers.manage')
      if (!reason.trim()) throw new BusinessError('A cancellation reason is required.')
      const t = await db.transfers.get(id)
      if (!t) throw new BusinessError('Transfer not found.')
      if (t.status !== 'in_transit') throw new BusinessError(`Only in-transit transfers can be cancelled (this one is ${t.status}).`)
      for (const itemId of t.itemIds) {
        const item = await db.stockItems.get(itemId)
        if (item && item.status === 'in_transit') await moveItem(item, 'available', { reason: `Transfer ${t.transferNo} cancelled: ${reason}`, ref: { type: 'transfer', id, no: t.transferNo } })
      }
      const u: StockTransfer = { ...t, status: 'cancelled', cancelReason: reason, ...stampUpdate() }
      await db.transfers.put(u)
      await audit('cancel', 'transfer', id, `${t.transferNo} cancelled: ${reason}`)
      return u
    }),
}
