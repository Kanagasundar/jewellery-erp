import type {
  AuditLog, Barcode, Category, Customer, Expense, ID, InwardItem, ItemStatus, Metal, MetalRate, PaymentMode, Payment,
  Product, PolishingJob, PurchaseOrder, Purity, Repair, RoleKey, Sale, SaleReturn, Settings, StockAdjustment, StockAudit,
  StockInward, StockItem, StockLedgerEntry, Supplier, TaxConfig, User, PurchaseLine, PricingMode,
} from '@/types/entities'

/* ---------- generic repositories ---------- */
export interface ReadRepository<T extends { id: ID }> {
  list(): Promise<T[]>
  get(id: ID): Promise<T | undefined>
}
export type NewEntity<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'> & { id?: ID }
export interface Repository<T extends { id: ID }> extends ReadRepository<T> {
  create(data: NewEntity<T>): Promise<T>
  update(id: ID, patch: Partial<T>): Promise<T>
  remove(id: ID): Promise<void>
}

/* ---------- command inputs ---------- */
export interface PurchaseLineInput {
  id?: ID
  productId: ID
  qty: number
  grossWeight: number
  stoneWeight: number
  purityId: ID
  stoneDetails: string
  rate: number
  makingCharge: number
  wastagePercent: number
  gstPercent: number
}
export interface PurchaseInput {
  id?: ID
  supplierId: ID
  invoiceNo: string
  date: string
  expectedDate?: string
  notes?: string
  lines: PurchaseLineInput[]
  /** true = move to Pending (sent to supplier); false = keep as Draft */
  submit: boolean
}
export interface InwardInput {
  id?: ID
  purchaseOrderId: ID
  date: string
  notes?: string
  items: InwardItem[]
}
export interface SaleItemInput {
  stockItemId: ID
  discount?: number
}
export interface SalePaymentInput {
  mode: PaymentMode
  amount: number
  reference?: string
}
export interface SaleInput {
  /** selling branch (id from Settings → Branches); name is snapshotted on the invoice */
  branchId?: string
  customerId: ID | null
  walkInName?: string
  walkInPhone?: string
  items: SaleItemInput[]
  payments: SalePaymentInput[]
  advanceAdjust?: number
  notes?: string
  date?: string
}
export interface SaleReturnInput {
  saleId: ID
  itemIds: ID[]
  reason: string
  refundMode: PaymentMode
}
export interface RecordPaymentInput {
  direction: 'in' | 'out'
  partyType: 'customer' | 'supplier'
  partyId: ID
  mode: PaymentMode
  amount: number
  kind: 'receipt' | 'advance' | 'refund' | 'supplier_payment'
  allocations?: { docType: 'sale' | 'purchase' | 'repair'; docId: ID; amount: number }[]
  /** allocate oldest-first against open documents */
  autoAllocate?: boolean
  reference?: string
  notes?: string
  date?: string
}
export interface RepairInput {
  customerId: ID
  stockItemId?: ID
  description: string
  repairType: string
  receivedWeight: number
  damage: string
  instructions: string
  expectedDelivery: string
  artisanId?: ID
  labourEstimate: number
  photos: string[]
  advance?: { amount: number; mode: PaymentMode }
}
export interface PolishingInput {
  stockItemId: ID
  polishType: string
  artisanId?: ID
  labourCharge: number
  expectedDate: string
  remarks: string
}
export interface AuditCreateInput {
  title: string
  categoryId?: ID
}
export interface ExpenseInput {
  date: string
  category: string
  amount: number
  mode: PaymentMode
  paidTo: string
  notes?: string
}

export interface BarcodeLookup {
  item: StockItem
  product?: Product
  barcode?: Barcode
}

export interface LedgerCheck {
  ok: boolean
  checkedItems: number
  problems: { stockItemId: ID; itemCode: string; problem: string }[]
  productBalances: { productId: ID; available: number; ledger: number; weightAvailable: number; weightLedger: number; ok: boolean }[]
}

/* ---------- command groups (business workflows) ---------- */
export interface ErpCommands {
  purchases: {
    save(input: PurchaseInput): Promise<PurchaseOrder>
    submit(id: ID): Promise<PurchaseOrder>
    cancel(id: ID, reason: string): Promise<PurchaseOrder>
  }
  inward: {
    save(input: InwardInput): Promise<StockInward>
    submit(id: ID): Promise<StockInward>
    /** Approve + complete: the ONLY operation that creates stock items, barcodes and ledger rows. */
    approve(id: ID): Promise<StockInward>
    reject(id: ID, reason: string): Promise<StockInward>
    discardDraft(id: ID): Promise<void>
  }
  barcodes: {
    markPrinted(itemIds: ID[]): Promise<void>
    regenerate(itemId: ID, reason: string): Promise<Barcode>
    lookup(code: string): Promise<BarcodeLookup | undefined>
  }
  inventory: {
    reserve(itemId: ID, customerId: ID, note: string): Promise<StockItem>
    release(itemId: ID): Promise<StockItem>
    markDamaged(itemId: ID, reason: string): Promise<StockItem>
    restock(itemId: ID, reason: string): Promise<StockItem>
    reconcile(): Promise<LedgerCheck>
  }
  sales: {
    create(input: SaleInput): Promise<Sale>
    cancel(id: ID, reason: string): Promise<Sale>
    returnItems(input: SaleReturnInput): Promise<SaleReturn>
  }
  payments: {
    record(input: RecordPaymentInput): Promise<Payment>
  }
  repairs: {
    create(input: RepairInput): Promise<Repair>
    assign(id: ID, artisanId: ID): Promise<Repair>
    start(id: ID): Promise<Repair>
    complete(id: ID, labourFinal: number, note: string): Promise<Repair>
    deliver(id: ID): Promise<Repair>
    cancel(id: ID, reason: string): Promise<Repair>
  }
  polishing: {
    create(input: PolishingInput): Promise<PolishingJob>
    assign(id: ID, artisanId: ID): Promise<PolishingJob>
    start(id: ID): Promise<PolishingJob>
    submitForQc(id: ID, afterWeight: number, remarks: string): Promise<PolishingJob>
    qc(id: ID, passed: boolean, remarks: string): Promise<PolishingJob>
    returnToStock(id: ID): Promise<PolishingJob>
  }
  audits: {
    create(input: AuditCreateInput): Promise<StockAudit>
    scan(id: ID, barcode: string, physicalWeight?: number): Promise<{ audit: StockAudit; result: 'matched' | 'extra' | 'unknown' | 'duplicate' }>
    removeScan(id: ID, barcode: string): Promise<StockAudit>
    submit(id: ID): Promise<StockAudit>
    approve(id: ID, note: string): Promise<StockAudit>
    reject(id: ID, note: string): Promise<StockAudit>
  }
  system: {
    getSettings(): Promise<Settings>
    saveSettings(s: Settings): Promise<Settings>
    resetDemo(): Promise<void>
  }
}

/* ---------- authentication ---------- */
export interface SessionUser {
  id: ID
  name: string
  email: string
  role: RoleKey
}
/**
 * DEMO: role picker, no password, nothing secure.
 * PRODUCTION: POST /auth/login → server session / JWT; backend enforces authorization.
 */
export interface AuthService {
  readonly mode: 'demo' | 'production'
  listDemoUsers(): Promise<User[]>
  current(): Promise<SessionUser | null>
  loginDemo(userId: ID): Promise<SessionUser>
  login(email: string, password: string): Promise<SessionUser>
  logout(): Promise<void>
}

/* ---------- the data provider ---------- */
export interface DataProvider {
  readonly mode: 'demo' | 'production'
  repos: {
    users: Repository<User>
    categories: Repository<Category>
    metals: Repository<Metal>
    purities: Repository<Purity>
    metalRates: Repository<MetalRate>
    taxConfigs: Repository<TaxConfig>
    products: Repository<Product>
    customers: Repository<Customer>
    suppliers: Repository<Supplier>
    expenses: Repository<Expense>
    stockItems: ReadRepository<StockItem>
    barcodes: ReadRepository<Barcode>
    purchaseOrders: ReadRepository<PurchaseOrder>
    inwards: ReadRepository<StockInward>
    ledger: ReadRepository<StockLedgerEntry>
    sales: ReadRepository<Sale>
    saleReturns: ReadRepository<SaleReturn>
    payments: ReadRepository<Payment>
    repairs: ReadRepository<Repair>
    polishing: ReadRepository<PolishingJob>
    audits: ReadRepository<StockAudit>
    adjustments: ReadRepository<StockAdjustment>
    auditLogs: ReadRepository<AuditLog>
  }
  commands: ErpCommands
  auth: AuthService
  /** called by the app whenever the signed-in user changes (demo only; production uses the token) */
  setActor(user: SessionUser | null): void
}

export type { ItemStatus, PurchaseLine, PricingMode }
