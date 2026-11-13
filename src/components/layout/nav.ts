import {
  Barcode, BookUser, Boxes, ClipboardCheck, CreditCard, FileBarChart, Gem, LayoutDashboard, PackageCheck, Receipt, Settings,
  ShieldCheck, ShoppingCart, Sparkles, Truck, Users, Wallet, Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Permission } from '@/domain/permissions'

export interface NavItem { to: string; label: string; icon: LucideIcon; perm: Permission }
export interface NavGroup { title: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { title: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard.view' }] },
  {
    title: 'Catalogue & Stock',
    items: [
      { to: '/products', label: 'Products', icon: Gem, perm: 'products.view' },
      { to: '/purchases', label: 'Purchases', icon: ShoppingCart, perm: 'purchases.view' },
      { to: '/inward', label: 'Stock Inward', icon: PackageCheck, perm: 'inward.view' },
      { to: '/barcodes', label: 'Barcode Management', icon: Barcode, perm: 'barcodes.view' },
      { to: '/inventory', label: 'Inventory', icon: Boxes, perm: 'inventory.view' },
      { to: '/stock-audit', label: 'Stock Checking', icon: ClipboardCheck, perm: 'audit.view' },
    ],
  },
  { title: 'Sales', items: [{ to: '/sales', label: 'Sales / Billing', icon: Receipt, perm: 'sales.view' }, { to: '/customers', label: 'Customers', icon: BookUser, perm: 'customers.view' }] },
  { title: 'Workshop', items: [{ to: '/repairs', label: 'Repairs', icon: Wrench, perm: 'repairs.view' }, { to: '/polishing', label: 'Polishing', icon: Sparkles, perm: 'polishing.view' }] },
  {
    title: 'Finance',
    items: [
      { to: '/suppliers', label: 'Suppliers', icon: Truck, perm: 'suppliers.view' },
      { to: '/payments', label: 'Payments', icon: CreditCard, perm: 'payments.view' },
      { to: '/expenses', label: 'Expenses', icon: Wallet, perm: 'expenses.view' },
      { to: '/reports', label: 'Reports', icon: FileBarChart, perm: 'reports.view' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/users', label: 'Users & Permissions', icon: Users, perm: 'users.manage' },
      { to: '/settings', label: 'Settings', icon: Settings, perm: 'settings.manage' },
    ],
  },
]

export const LogoMark = ShieldCheck
