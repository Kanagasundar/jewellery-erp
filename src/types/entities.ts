/**
 * Domain entities. These mirror the MySQL tables documented in DATABASE_SCHEMA.md.
 * Money is stored with 2 decimals, weights with 3 decimals (grams). All arithmetic goes
 * through decimal.js (see domain/calculations/decimal.ts) – never raw JS floats.
 */

export type ID = string

export interface Audited {
  createdAt: string
  updatedAt: string
  createdBy?: string
  updatedBy?: string
}

export type RoleKey =
  | 'super_admin'
  | 'shop_admin'
  | 'sales'
  | 'stock_manager'
  | 'purchase_manager'
  | 'artisan'
  | 'accountant'
  | 'viewer'

export interface User extends Audited {
  id: ID
  name: string
  email: string
  role: RoleKey
  active: boolean
  isArtisan?: boolean
}

export interface Category extends Audited {
  id: ID
  name: string
  code: string
  subcategories: string[]
}
export interface Metal extends Audited {
  id: ID
  name: string
  code: string
}
export interface Purity extends Audited {
  id: ID
  metalId: ID
  label: string // 22K, 925 …
  fineness: number // 916, 925 …
}
export interface MetalRate extends Audited {
  id: ID
  metalId: ID
  purityId: ID
  ratePerGram: number
  effectiveAt: string
}
export interface TaxConfig extends Audited {
  id: ID
  name: string
  percent: number
  hsn?: string
}

export type MakingType = 'percent' | 'per_gram' | 'fixed'
export type WastageType = 'percent' | 'weight'
export type PricingMode = 'weight_based' | 'fixed_price'

export interface Product extends Audited {
  id: ID
  code: string // SKU
  name: string
  categoryId: ID
  subcategory: string
  productType: string
  metalId: ID
  purityId: ID
  grossWeight: number
  stoneWeight: number
  netWeight: number
  stoneDetails: string
  stoneCharge: number
  pricingMode: PricingMode
  fixedPrice: number
  makingType: MakingType
  makingValue: number
  wastageType: WastageType
  wastageValue: number
  hsn: string
  gstPercent: number
  huid: string
  supplierId?: ID
  image?: string
  status: 'active' | 'inactive'
  reorderLevel: number
}

export interface Party extends Audited {
  id: ID
  code: string
  name: string
  phone: string
  email: string
  address: string
  gstin: string
  openingBalance: number
  notes?: string
  status: 'active' | 'inactive'
}
export type Customer = Party
export interface Supplier extends Party {
  contactPerson?: string
}

export type ItemStatus =
  | 'available'
  | 'reserved'
  | 'sold'
  | 'repair'
  | 'polishing'
  | 'damaged'
  | 'returned'
  | 'missing'

/** One physical jewellery piece. */
export interface StockItem extends Audited {
  id: ID
  itemCode: string
  barcode: string // current active barcode (unique)
  productId: ID
  metalId: ID
  purityId: ID
  grossWeight: number
  stoneWeight: number
  netWeight: number
  costPrice: number
  status: ItemStatus
  purchaseOrderId?: ID
  inwardId?: ID
  huid?: string
  reservedFor?: ID
  note?: string
}

export interface Barcode extends Audited {
  id: ID
  code: string
  stockItemId: ID
  active: boolean
  printCount: number
  lastPrintedAt?: string
  voidedReason?: string
}

export type PurchaseStatus =
  | 'draft'
  | 'pending'
  | 'partially_received'
  | 'received'
  | 'completed'
  | 'cancelled'

export interface PurchaseLine {
  id: ID
  productId: ID
  qty: number
  grossWeight: number // per piece
  stoneWeight: number // per piece
  netWeight: number // per piece
  purityId: ID
  stoneDetails: string
  rate: number // purchase metal rate / g
  makingCharge: number // per piece, absolute
  wastagePercent: number
  gstPercent: number
  taxable: number
  gst: number
  amount: number
  receivedQty: number
}
export interface PurchaseOrder extends Audited {
  id: ID
  poNumber: string
  supplierId: ID
  invoiceNo: string
  date: string
  expectedDate?: string
  status: PurchaseStatus
  lines: PurchaseLine[]
  taxable: number
  gst: number
  total: number
  notes?: string
  cancelReason?: string
}

export type InwardStatus = 'draft' | 'pending_approval' | 'completed' | 'rejected'
export interface InwardItem {
  id: ID
  poLineId: ID
  productId: ID
  expectedGross: number
  expectedPurityId: ID
  receivedGross: number
  receivedStone: number
  receivedNet: number
  verifiedPurityId: ID
  stoneOk: boolean
  condition: 'ok' | 'damaged'
  accepted: boolean
  remarks: string
  stockItemId?: ID
}
export interface StockInward extends Audited {
  id: ID
  inwardNo: string
  purchaseOrderId: ID
  supplierId: ID
  date: string
  status: InwardStatus
  items: InwardItem[]
  notes?: string
  approvedBy?: string
  approvedAt?: string
  rejectReason?: string
}

export type LedgerRef =
  | 'inward'
  | 'sale'
  | 'sale_cancel'
  | 'sale_return'
  | 'repair'
  | 'polishing'
  | 'audit'
  | 'reserve'
  | 'restock'
  | 'manual'

export interface StockLedgerEntry {
  id: ID
  txnNo: string
  date: string
  stockItemId: ID
  productId: ID
  refType: LedgerRef
  refId: ID
  refNo: string
  statusFrom: ItemStatus | null
  statusTo: ItemStatus
  qtyIn: number
  qtyOut: number
  weightIn: number
  weightOut: number
  /** Available (sellable) stock of the product before / after this movement. */
  prevQty: number
  prevWeight: number
  resultQty: number
  resultWeight: number
  userId: string
  userName: string
  reason: string
}

export type PaymentMode = 'cash' | 'upi' | 'card' | 'bank'
export interface PaymentAllocation {
  docType: 'sale' | 'purchase' | 'repair'
  docId: ID
  docNo: string
  amount: number
}
export interface Payment extends Audited {
  id: ID
  paymentNo: string
  date: string
  direction: 'in' | 'out'
  partyType: 'customer' | 'supplier'
  partyId: ID
  mode: PaymentMode
  amount: number
  kind: 'receipt' | 'advance' | 'refund' | 'supplier_payment'
  reference?: string
  notes?: string
  allocations: PaymentAllocation[]
  status: 'posted' | 'void'
}

export interface SaleLine {
  stockItemId: ID
  barcode: string
  itemCode: string
  productId: ID
  name: string
  metalId: ID
  purityId: ID
  purityLabel: string
  grossWeight: number
  stoneWeight: number
  netWeight: number
  ratePerGram: number // snapshot of metal rate at invoice time
  pricingMode: PricingMode
  metalValue: number
  wastageValue: number
  makingValue: number
  stoneCharge: number
  discount: number
  taxable: number
  gstPercent: number
  gst: number
  amount: number
  hsn: string
  huid: string
  costPrice: number
  returned?: boolean
}
export interface Sale extends Audited {
  id: ID
  invoiceNo: string
  date: string
  customerId: ID | null
  customerName: string
  customerPhone: string
  branchId?: string
  branchName?: string
  status: 'completed' | 'cancelled'
  lines: SaleLine[]
  subtotal: number
  discount: number
  taxable: number
  cgst: number
  sgst: number
  gst: number
  roundOff: number
  total: number
  returnedValue: number
  notes?: string
  cancelReason?: string
  cancelledAt?: string
}
export interface SaleReturn extends Audited {
  id: ID
  returnNo: string
  saleId: ID
  invoiceNo: string
  date: string
  itemIds: ID[]
  value: number
  refund: number
  refundMode: PaymentMode
  reason: string
}

export type RepairStatus = 'received' | 'assigned' | 'in_progress' | 'completed' | 'delivered' | 'cancelled'
export interface StatusEvent {
  at: string
  status: string
  by: string
  note?: string
}
export interface Repair extends Audited {
  id: ID
  jobNo: string
  customerId: ID
  stockItemId?: ID // shop-owned item sent for repair (optional)
  description: string
  repairType: string
  receivedWeight: number
  damage: string
  instructions: string
  expectedDelivery: string
  artisanId?: ID
  labourEstimate: number
  labourFinal: number
  photos: string[]
  status: RepairStatus
  history: StatusEvent[]
  deliveredAt?: string
}

export type PolishStatus = 'pending' | 'assigned' | 'in_progress' | 'quality_check' | 'completed' | 'returned'
export interface PolishingJob extends Audited {
  id: ID
  jobNo: string
  stockItemId: ID
  polishType: string
  artisanId?: ID
  beforeWeight: number
  afterWeight: number
  weightDiff: number
  labourCharge: number
  expectedDate: string
  status: PolishStatus
  qcPassed?: boolean
  qcRemarks?: string
  remarks: string
  history: StatusEvent[]
}

export type AuditStatus = 'in_progress' | 'pending_approval' | 'approved' | 'rejected'
export interface AuditScan {
  barcode: string
  stockItemId?: ID
  physicalWeight?: number
  at: string
}
export interface AuditDiscrepancy {
  kind: 'missing' | 'extra' | 'weight' | 'unknown'
  stockItemId?: ID
  barcode: string
  itemCode?: string
  name?: string
  systemWeight?: number
  physicalWeight?: number
  note: string
}
export interface StockAudit extends Audited {
  id: ID
  auditNo: string
  title: string
  categoryId?: ID
  status: AuditStatus
  expectedItemIds: ID[]
  scans: AuditScan[]
  discrepancies: AuditDiscrepancy[]
  approvedBy?: string
  approvalNote?: string
}
export interface StockAdjustment extends Audited {
  id: ID
  auditId: ID
  auditNo: string
  stockItemId: ID
  kind: 'missing' | 'found' | 'weight'
  oldWeight: number
  newWeight: number
  reason: string
  approvedBy: string
}

export interface Expense extends Audited {
  id: ID
  expenseNo: string
  date: string
  category: string
  amount: number
  mode: PaymentMode
  paidTo: string
  notes?: string
}

export interface Settings {
  id: 'main'
  shopName: string
  tagline: string
  address: string
  phone: string
  gstin: string
  defaultGstPercent: number
  invoicePrefix: string
  labelSize: LabelSizeKey
  allowNegativeStock: boolean
  showPriceOnLabel: boolean
  weightTolerance: number
  branches: { id: string; name: string }[]
}
export type LabelSizeKey = 'small' | 'medium' | 'large'

export interface AuditLog {
  id: ID
  at: string
  userId: string
  userName: string
  action: string
  entity: string
  entityId: string
  details: string
}

export interface Counter {
  id: string
  value: number
}
