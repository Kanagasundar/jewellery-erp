import type { RoleKey } from '@/types/entities'

/**
 * Permission matrix. In DEMO mode this is enforced client-side (and inside the IndexedDB
 * command layer) purely to demonstrate workflows. In PRODUCTION the CodeIgniter 4 API must
 * enforce the same matrix server-side – frontend checks are a UX convenience, not security.
 */
export const PERMISSIONS = [
  'dashboard.view', 'products.view', 'products.manage', 'purchases.view', 'purchases.manage',
  'inward.view', 'inward.manage', 'inward.approve', 'barcodes.view', 'barcodes.manage',
  'inventory.view', 'inventory.manage', 'transfers.manage', 'sales.view', 'sales.create', 'sales.cancel', 'sales.return',
  'repairs.view', 'repairs.manage', 'repairs.update', 'polishing.view', 'polishing.manage', 'polishing.update',
  'audit.view', 'audit.manage', 'audit.approve', 'customers.view', 'customers.manage',
  'suppliers.view', 'suppliers.manage', 'payments.view', 'payments.manage', 'expenses.view', 'expenses.manage',
  'reports.view', 'reports.financial', 'users.manage', 'settings.manage', 'rates.manage', 'demo.reset',
] as const
export type Permission = (typeof PERMISSIONS)[number]

const views: Permission[] = [
  'dashboard.view', 'products.view', 'purchases.view', 'inward.view', 'barcodes.view', 'inventory.view',
  'sales.view', 'repairs.view', 'polishing.view', 'audit.view', 'customers.view', 'suppliers.view',
]
const ALL: Permission[] = [...PERMISSIONS]

export const ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  super_admin: ALL,
  shop_admin: ALL.filter((p) => p !== 'users.manage'),
  sales: [
    'dashboard.view', 'products.view', 'inventory.view', 'barcodes.view', 'sales.view', 'sales.create', 'sales.return',
    'repairs.view', 'repairs.manage', 'customers.view', 'customers.manage', 'payments.view', 'payments.manage',
  ],
  stock_manager: [
    ...views, 'products.manage', 'inward.manage', 'inward.approve', 'barcodes.manage', 'inventory.manage', 'transfers.manage',
    'audit.manage', 'polishing.manage', 'repairs.manage', 'reports.view',
  ],
  purchase_manager: [
    'dashboard.view', 'products.view', 'products.manage', 'purchases.view', 'purchases.manage', 'inward.view', 'inward.manage',
    'inventory.view', 'suppliers.view', 'suppliers.manage', 'payments.view', 'payments.manage', 'reports.view', 'barcodes.view',
  ],
  artisan: ['repairs.view', 'repairs.update', 'polishing.view', 'polishing.update'],
  accountant: [
    'dashboard.view', 'purchases.view', 'sales.view', 'customers.view', 'suppliers.view', 'payments.view', 'payments.manage',
    'expenses.view', 'expenses.manage', 'reports.view', 'reports.financial', 'inventory.view',
  ],
  viewer: [...views, 'payments.view', 'expenses.view', 'reports.view'],
}

export const ROLE_LABELS: Record<RoleKey, string> = {
  super_admin: 'Super Admin',
  shop_admin: 'Shop Admin',
  sales: 'Sales Person',
  stock_manager: 'Stock Manager',
  purchase_manager: 'Purchase Manager',
  artisan: 'Workshop / Artisan',
  accountant: 'Accountant',
  viewer: 'Viewer',
}

export const can = (role: RoleKey | undefined, perm: Permission): boolean =>
  !!role && ROLE_PERMISSIONS[role].includes(perm)
