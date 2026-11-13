import type { AuthService, DataProvider, SessionUser } from '@/repositories/interfaces'
import { audits } from './commands/audits'
import { payments, sales } from './commands/sales'
import { barcodes, inventory, inward, purchases, tx } from './commands/stock'
import { transfers } from './commands/transfers'
import { polishing, repairs } from './commands/workshop'
import { BusinessError, nextNo, requirePerm, setActor } from './ctx'
import { db } from './db'
import { repos } from './repos'
import { resetAndSeed } from './seed'

const SESSION_KEY = 'aurum.demo.session'

/**
 * DEMO authentication: pick a role/user from a list. Nothing here is secure – any visitor can
 * become any role. Production must use real server-side authentication (see PRODUCTION_MIGRATION_GUIDE.md).
 */
const demoAuth: AuthService = {
  mode: 'demo',
  listDemoUsers: () => db.users.toArray(),
  current: async () => {
    try {
      const id = localStorage.getItem(SESSION_KEY)
      if (!id) return null
      const u = await db.users.get(id)
      return u && u.active ? { id: u.id, name: u.name, email: u.email, role: u.role } : null
    } catch {
      return null
    }
  },
  loginDemo: async (userId) => {
    const u = await db.users.get(userId)
    if (!u || !u.active) throw new BusinessError('User not found or inactive.')
    try { localStorage.setItem(SESSION_KEY, u.id) } catch { /* private mode: session is in-memory only */ }
    return { id: u.id, name: u.name, email: u.email, role: u.role }
  },
  login: async () => {
    throw new BusinessError('Password login is only available in production mode. Use the demo role picker.')
  },
  logout: async () => {
    try { localStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
  },
}

export const idbProvider: DataProvider = {
  mode: 'demo',
  repos: {
    ...repos,
    expenses: {
      ...repos.expenses,
      create: (data) =>
        tx(async () => {
          requirePerm('expenses.manage')
          if (!(data.amount > 0)) throw new BusinessError('Enter an expense amount greater than zero.')
          return repos.expenses.create({ ...data, expenseNo: await nextNo('expense', 'EXP-', 5) })
        }),
    },
  },
  commands: {
    purchases, inward, barcodes, inventory, sales, payments, transfers, repairs, polishing, audits,
    system: {
      getSettings: async () => (await db.settings.get('main'))!,
      saveSettings: async (s) => {
        requirePerm('settings.manage')
        const cur = await db.settings.get('main')
        const kept = new Set(s.branches.map((b) => b.id))
        if (!s.branches.length) throw new BusinessError('At least one branch is required.')
        for (const b of cur?.branches ?? []) {
          if (kept.has(b.id)) continue
          if ((await db.stockItems.where('branchId').equals(b.id).count()) > 0) throw new BusinessError(`${b.name} still holds stock (or has stock in transit) - transfer it out before removing the branch.`)
        }
        await db.settings.put(s)
        return s
      },
      resetDemo: async () => {
        requirePerm('demo.reset')
        await resetAndSeed()
      },
    },
  },
  auth: demoAuth,
  setActor: (u: SessionUser | null) => setActor(u),
}
