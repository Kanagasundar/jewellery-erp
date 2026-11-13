import Dexie, { type EntityTable } from 'dexie'
import type {
  AuditLog, Barcode, Category, Counter, Customer, Expense, Metal, MetalRate, Payment, PolishingJob, Product, PurchaseOrder,
  Purity, Repair, Sale, SaleReturn, Settings, StockAdjustment, StockAudit, StockInward, StockItem, StockLedgerEntry,
  Supplier, TaxConfig, User,
} from '@/types/entities'

/**
 * Browser database for DEMO mode. Unique indexes (&) mirror the UNIQUE constraints of the
 * production MySQL schema (barcodes, invoice numbers, SKUs, …). This is single-browser,
 * single-user storage – it is NOT a production multi-user database.
 */
export class ErpDB extends Dexie {
  users!: EntityTable<User, 'id'>
  categories!: EntityTable<Category, 'id'>
  metals!: EntityTable<Metal, 'id'>
  purities!: EntityTable<Purity, 'id'>
  metalRates!: EntityTable<MetalRate, 'id'>
  taxConfigs!: EntityTable<TaxConfig, 'id'>
  products!: EntityTable<Product, 'id'>
  customers!: EntityTable<Customer, 'id'>
  suppliers!: EntityTable<Supplier, 'id'>
  stockItems!: EntityTable<StockItem, 'id'>
  barcodes!: EntityTable<Barcode, 'id'>
  purchaseOrders!: EntityTable<PurchaseOrder, 'id'>
  inwards!: EntityTable<StockInward, 'id'>
  ledger!: EntityTable<StockLedgerEntry, 'id'>
  sales!: EntityTable<Sale, 'id'>
  saleReturns!: EntityTable<SaleReturn, 'id'>
  payments!: EntityTable<Payment, 'id'>
  repairs!: EntityTable<Repair, 'id'>
  polishing!: EntityTable<PolishingJob, 'id'>
  audits!: EntityTable<StockAudit, 'id'>
  adjustments!: EntityTable<StockAdjustment, 'id'>
  expenses!: EntityTable<Expense, 'id'>
  settings!: EntityTable<Settings, 'id'>
  auditLogs!: EntityTable<AuditLog, 'id'>
  counters!: EntityTable<Counter, 'id'>
  meta!: EntityTable<{ id: string; value: string }, 'id'>

  constructor(name = 'aurum-erp-demo') {
    super(name)
    this.version(1).stores({
      users: 'id, email, role',
      categories: 'id, &code',
      metals: 'id, &code',
      purities: 'id, metalId',
      metalRates: 'id, [metalId+purityId], effectiveAt',
      taxConfigs: 'id',
      products: 'id, &code, categoryId, metalId, status',
      customers: 'id, &code, phone',
      suppliers: 'id, &code',
      stockItems: 'id, &itemCode, &barcode, productId, status, purchaseOrderId',
      barcodes: 'id, &code, stockItemId, active',
      purchaseOrders: 'id, &poNumber, supplierId, status, date',
      inwards: 'id, &inwardNo, purchaseOrderId, status',
      ledger: 'id, &txnNo, stockItemId, productId, date, refType',
      sales: 'id, &invoiceNo, customerId, date, status',
      saleReturns: 'id, saleId',
      payments: 'id, &paymentNo, partyId, date',
      repairs: 'id, &jobNo, customerId, status',
      polishing: 'id, &jobNo, stockItemId, status',
      audits: 'id, &auditNo, status',
      adjustments: 'id, auditId',
      expenses: 'id, date',
      settings: 'id',
      auditLogs: 'id, at, entity',
      counters: 'id',
      meta: 'id',
    })
  }
}

export const db = new ErpDB()
