import { lazy, Suspense } from 'react'
import type { ReactElement } from 'react'
import { Spinner } from '@/components/ui/Feedback'
import type { Permission } from '@/domain/permissions'

const Dashboard = lazy(() => import('@/features/dashboard/DashboardPage'))
const Products = lazy(() => import('@/features/products/ProductsPage'))
const ProductDetail = lazy(() => import('@/features/products/ProductDetailPage'))
const Purchases = lazy(() => import('@/features/purchases/PurchasesPage'))
const PurchaseForm = lazy(() => import('@/features/purchases/PurchaseFormPage'))
const PurchaseDetail = lazy(() => import('@/features/purchases/PurchaseDetailPage'))
const InwardList = lazy(() => import('@/features/inward/InwardPages').then((m) => ({ default: m.InwardListPage })))
const InwardDetail = lazy(() => import('@/features/inward/InwardPages').then((m) => ({ default: m.InwardDetailPage })))
const InwardForm = lazy(() => import('@/features/inward/InwardFormPage'))
const Barcodes = lazy(() => import('@/features/barcodes/BarcodesPage'))
const Inventory = lazy(() => import('@/features/inventory/InventoryPage'))
const Transfers = lazy(() => import('@/features/transfers/TransfersPage'))
const SalesList = lazy(() => import('@/features/sales/SalesPages').then((m) => ({ default: m.SalesListPage })))
const Invoice = lazy(() => import('@/features/sales/SalesPages').then((m) => ({ default: m.InvoicePage })))
const Pos = lazy(() => import('@/features/sales/PosPage'))
const RepairsList = lazy(() => import('@/features/repairs/RepairsPages').then((m) => ({ default: m.RepairsListPage })))
const RepairDetail = lazy(() => import('@/features/repairs/RepairsPages').then((m) => ({ default: m.RepairDetailPage })))
const PolishList = lazy(() => import('@/features/polishing/PolishingPages').then((m) => ({ default: m.PolishingListPage })))
const PolishDetail = lazy(() => import('@/features/polishing/PolishingPages').then((m) => ({ default: m.PolishingDetailPage })))
const AuditList = lazy(() => import('@/features/stock-audit/StockAuditPages').then((m) => ({ default: m.AuditListPage })))
const AuditDetail = lazy(() => import('@/features/stock-audit/StockAuditPages').then((m) => ({ default: m.AuditDetailPage })))
const Customers = lazy(() => import('@/features/customers/parties').then((m) => ({ default: () => <m.PartyListPage kind="customer" /> })))
const CustomerDetail = lazy(() => import('@/features/customers/parties').then((m) => ({ default: () => <m.PartyDetailPage kind="customer" /> })))
const Suppliers = lazy(() => import('@/features/customers/parties').then((m) => ({ default: () => <m.PartyListPage kind="supplier" /> })))
const SupplierDetail = lazy(() => import('@/features/customers/parties').then((m) => ({ default: () => <m.PartyDetailPage kind="supplier" /> })))
const Payments = lazy(() => import('@/features/payments/PaymentsPage'))
const Expenses = lazy(() => import('@/features/expenses/ExpensesPage'))
const Reports = lazy(() => import('@/features/reports/ReportsPage'))
const Users = lazy(() => import('@/features/users/UsersPage'))
const Settings = lazy(() => import('@/features/settings/SettingsPage'))

const w = (el: ReactElement) => <Suspense fallback={<Spinner />}>{el}</Suspense>

export interface AppRoute { path: string; perm: Permission; element: ReactElement }

export const appRoutes: AppRoute[] = [
  { path: '/', perm: 'dashboard.view', element: w(<Dashboard />) },
  { path: '/products', perm: 'products.view', element: w(<Products />) },
  { path: '/products/:id', perm: 'products.view', element: w(<ProductDetail />) },
  { path: '/purchases', perm: 'purchases.view', element: w(<Purchases />) },
  { path: '/purchases/new', perm: 'purchases.manage', element: w(<PurchaseForm />) },
  { path: '/purchases/:id', perm: 'purchases.view', element: w(<PurchaseDetail />) },
  { path: '/purchases/:id/edit', perm: 'purchases.manage', element: w(<PurchaseForm />) },
  { path: '/inward', perm: 'inward.view', element: w(<InwardList />) },
  { path: '/inward/new', perm: 'inward.manage', element: w(<InwardForm />) },
  { path: '/inward/:id', perm: 'inward.view', element: w(<InwardDetail />) },
  { path: '/inward/:id/edit', perm: 'inward.manage', element: w(<InwardForm />) },
  { path: '/barcodes', perm: 'barcodes.view', element: w(<Barcodes />) },
  { path: '/inventory', perm: 'inventory.view', element: w(<Inventory />) },
  { path: '/transfers', perm: 'inventory.view', element: w(<Transfers />) },
  { path: '/sales', perm: 'sales.view', element: w(<SalesList />) },
  { path: '/sales/new', perm: 'sales.create', element: w(<Pos />) },
  { path: '/sales/:id', perm: 'sales.view', element: w(<Invoice />) },
  { path: '/repairs', perm: 'repairs.view', element: w(<RepairsList />) },
  { path: '/repairs/:id', perm: 'repairs.view', element: w(<RepairDetail />) },
  { path: '/polishing', perm: 'polishing.view', element: w(<PolishList />) },
  { path: '/polishing/:id', perm: 'polishing.view', element: w(<PolishDetail />) },
  { path: '/stock-audit', perm: 'audit.view', element: w(<AuditList />) },
  { path: '/stock-audit/:id', perm: 'audit.view', element: w(<AuditDetail />) },
  { path: '/customers', perm: 'customers.view', element: w(<Customers />) },
  { path: '/customers/:id', perm: 'customers.view', element: w(<CustomerDetail />) },
  { path: '/suppliers', perm: 'suppliers.view', element: w(<Suppliers />) },
  { path: '/suppliers/:id', perm: 'suppliers.view', element: w(<SupplierDetail />) },
  { path: '/payments', perm: 'payments.view', element: w(<Payments />) },
  { path: '/expenses', perm: 'expenses.view', element: w(<Expenses />) },
  { path: '/reports', perm: 'reports.view', element: w(<Reports />) },
  { path: '/users', perm: 'users.manage', element: w(<Users />) },
  { path: '/settings', perm: 'settings.manage', element: w(<Settings />) },
]
