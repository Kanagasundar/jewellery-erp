# Database schema

Two representations of the same model:

1. **Demo** — IndexedDB via Dexie (`src/repositories/indexeddb/db.ts`). Entities are JSON documents; sub-records (sale lines, PO lines,
   inward items, payment allocations, audit scans) are embedded arrays.
2. **Production** — MySQL 8 (InnoDB, utf8mb4) normalised tables below. Embedded arrays become child tables.

## Conventions
* PK: `BIGINT UNSIGNED AUTO_INCREMENT` (the demo uses UUID strings; the API may expose either — the frontend treats ids as opaque strings).
* Money: `DECIMAL(14,2)`. Weights (grams): `DECIMAL(12,3)`. Rates: `DECIMAL(12,2)`. Percent: `DECIMAL(6,3)`. **Never FLOAT/DOUBLE.**
* Every table: `created_at`, `updated_at`, `created_by`, `updated_by` (FK `users.id`).
* Financial/stock history is **append-only**: `stock_ledger`, `audit_logs` have no UPDATE/DELETE grants for the application DB user.
  Cancellations are status changes + reversing rows, never deletes.
* App code does all arithmetic with decimal libraries (frontend `decimal.js`, backend `bcmath` / `brick/math`).

## Entity map
```
users ─┬─ roles ─ role_permissions ─ permissions
categories ─ products ─┬─ stock_items ─ barcodes
metals ─ purities ─────┘        │
suppliers ─ purchase_orders ─ purchase_order_items ─ stock_inwards ─ stock_inward_items ─► stock_items
stock_items ─► stock_ledger  (every status/weight change)
customers ─ sales ─ sale_items ─► stock_items          sales ─ sale_returns ─ sale_return_items
payments ─ payment_allocations ─► (sales | purchase_orders | repairs)
customers ─ repairs ─ repair_events        stock_items ─ polishing_jobs ─ polishing_events
stock_audits ─ stock_audit_scans / stock_audit_discrepancies ─ stock_adjustments
metal_rates, tax_configs, expenses, settings, audit_logs, counters
```

## MySQL DDL (core tables)
```sql
CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,                       -- password_hash()/argon2id, never plaintext
  role_id BIGINT UNSIGNED NOT NULL, is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, created_by BIGINT UNSIGNED NULL, updated_by BIGINT UNSIGNED NULL,
  FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE roles (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code VARCHAR(40) NOT NULL UNIQUE, label VARCHAR(80) NOT NULL);
CREATE TABLE permissions (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code VARCHAR(60) NOT NULL UNIQUE);
CREATE TABLE role_permissions (role_id BIGINT UNSIGNED NOT NULL, permission_id BIGINT UNSIGNED NOT NULL, PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id), FOREIGN KEY (permission_id) REFERENCES permissions(id));

CREATE TABLE categories (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code VARCHAR(20) NOT NULL UNIQUE, name VARCHAR(80) NOT NULL, subcategories JSON NOT NULL);
CREATE TABLE metals (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code VARCHAR(10) NOT NULL UNIQUE, name VARCHAR(40) NOT NULL);
CREATE TABLE purities (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, metal_id BIGINT UNSIGNED NOT NULL, label VARCHAR(20) NOT NULL, fineness SMALLINT NOT NULL,
  UNIQUE (metal_id, label), FOREIGN KEY (metal_id) REFERENCES metals(id));
CREATE TABLE metal_rates (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, metal_id BIGINT UNSIGNED NOT NULL, purity_id BIGINT UNSIGNED NOT NULL,
  rate_per_gram DECIMAL(12,2) NOT NULL, effective_at DATETIME NOT NULL, created_by BIGINT UNSIGNED NULL,
  INDEX ix_rate_lookup (metal_id, purity_id, effective_at), FOREIGN KEY (purity_id) REFERENCES purities(id));
CREATE TABLE tax_configs (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80) NOT NULL, percent DECIMAL(6,3) NOT NULL, hsn VARCHAR(12) NULL);

CREATE TABLE products (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, sku VARCHAR(40) NOT NULL UNIQUE, name VARCHAR(160) NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL, subcategory VARCHAR(80) NULL, product_type VARCHAR(60) NOT NULL,
  metal_id BIGINT UNSIGNED NOT NULL, purity_id BIGINT UNSIGNED NOT NULL,
  gross_weight DECIMAL(12,3) NOT NULL, stone_weight DECIMAL(12,3) NOT NULL DEFAULT 0, net_weight DECIMAL(12,3) NOT NULL,
  stone_details VARCHAR(255) NULL, stone_charge DECIMAL(14,2) NOT NULL DEFAULT 0,
  pricing_mode ENUM('weight_based','fixed_price') NOT NULL DEFAULT 'weight_based', fixed_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  making_type ENUM('percent','per_gram','fixed') NOT NULL, making_value DECIMAL(12,3) NOT NULL,
  wastage_type ENUM('percent','weight') NOT NULL, wastage_value DECIMAL(12,3) NOT NULL,
  hsn VARCHAR(12) NOT NULL, gst_percent DECIMAL(6,3) NOT NULL, huid VARCHAR(20) NULL,
  supplier_id BIGINT UNSIGNED NULL, image_path VARCHAR(255) NULL, status ENUM('active','inactive') NOT NULL DEFAULT 'active', reorder_level INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, created_by BIGINT UNSIGNED NULL, updated_by BIGINT UNSIGNED NULL,
  CHECK (stone_weight < gross_weight OR gross_weight = 0),
  INDEX ix_prod_cat (category_id), INDEX ix_prod_metal (metal_id, purity_id),
  FOREIGN KEY (category_id) REFERENCES categories(id), FOREIGN KEY (metal_id) REFERENCES metals(id), FOREIGN KEY (purity_id) REFERENCES purities(id)
) ENGINE=InnoDB;

CREATE TABLE customers (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code VARCHAR(20) NOT NULL UNIQUE, name VARCHAR(140) NOT NULL, phone VARCHAR(20) NOT NULL,
  email VARCHAR(190) NULL, address TEXT NULL, gstin VARCHAR(15) NULL, opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0, notes TEXT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active', created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, created_by BIGINT UNSIGNED NULL, updated_by BIGINT UNSIGNED NULL,
  INDEX ix_cust_phone (phone));
CREATE TABLE suppliers LIKE customers;  -- same shape + contact_person VARCHAR(120) NULL

/* one physical piece */
CREATE TABLE stock_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, item_code VARCHAR(50) NOT NULL UNIQUE, barcode VARCHAR(40) NOT NULL UNIQUE,
  product_id BIGINT UNSIGNED NOT NULL, metal_id BIGINT UNSIGNED NOT NULL, purity_id BIGINT UNSIGNED NOT NULL,
  gross_weight DECIMAL(12,3) NOT NULL, stone_weight DECIMAL(12,3) NOT NULL, net_weight DECIMAL(12,3) NOT NULL, cost_price DECIMAL(14,2) NOT NULL,
  status ENUM('available','reserved','sold','repair','polishing','damaged','returned','missing') NOT NULL,
  purchase_order_id BIGINT UNSIGNED NULL, inward_id BIGINT UNSIGNED NULL, huid VARCHAR(20) NULL, reserved_for BIGINT UNSIGNED NULL, note VARCHAR(255) NULL,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, created_by BIGINT UNSIGNED NULL, updated_by BIGINT UNSIGNED NULL,
  INDEX ix_item_status (status), INDEX ix_item_product_status (product_id, status), FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE barcodes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code VARCHAR(40) NOT NULL UNIQUE, stock_item_id BIGINT UNSIGNED NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1, active_item_key BIGINT UNSIGNED GENERATED ALWAYS AS (IF(active=1, stock_item_id, NULL)) STORED,
  print_count INT NOT NULL DEFAULT 0, last_printed_at DATETIME NULL, voided_reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, created_by BIGINT UNSIGNED NULL, updated_by BIGINT UNSIGNED NULL,
  UNIQUE KEY uq_one_active_barcode_per_item (active_item_key), FOREIGN KEY (stock_item_id) REFERENCES stock_items(id)
);  -- code UNIQUE across all rows (voided codes are never reused); one ACTIVE barcode per item

CREATE TABLE purchase_orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, po_number VARCHAR(20) NOT NULL UNIQUE, supplier_id BIGINT UNSIGNED NOT NULL, invoice_no VARCHAR(60) NULL,
  po_date DATETIME NOT NULL, expected_date DATETIME NULL,
  status ENUM('draft','pending','partially_received','received','completed','cancelled') NOT NULL,
  taxable DECIMAL(14,2) NOT NULL, gst DECIMAL(14,2) NOT NULL, total DECIMAL(14,2) NOT NULL, notes TEXT NULL, cancel_reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, created_by BIGINT UNSIGNED NULL, updated_by BIGINT UNSIGNED NULL,
  INDEX ix_po_supplier (supplier_id, status), FOREIGN KEY (supplier_id) REFERENCES suppliers(id));
CREATE TABLE purchase_order_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, purchase_order_id BIGINT UNSIGNED NOT NULL, product_id BIGINT UNSIGNED NOT NULL, purity_id BIGINT UNSIGNED NOT NULL,
  qty INT NOT NULL, received_qty INT NOT NULL DEFAULT 0, gross_weight DECIMAL(12,3) NOT NULL, stone_weight DECIMAL(12,3) NOT NULL, net_weight DECIMAL(12,3) NOT NULL,
  stone_details VARCHAR(255) NULL, rate DECIMAL(12,2) NOT NULL, making_charge DECIMAL(14,2) NOT NULL, wastage_percent DECIMAL(6,3) NOT NULL, gst_percent DECIMAL(6,3) NOT NULL,
  taxable DECIMAL(14,2) NOT NULL, gst DECIMAL(14,2) NOT NULL, amount DECIMAL(14,2) NOT NULL,
  CHECK (received_qty <= qty), FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id), FOREIGN KEY (product_id) REFERENCES products(id));

CREATE TABLE stock_inwards (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, inward_no VARCHAR(20) NOT NULL UNIQUE, purchase_order_id BIGINT UNSIGNED NOT NULL,
  supplier_id BIGINT UNSIGNED NOT NULL, inward_date DATETIME NOT NULL, status ENUM('draft','pending_approval','completed','rejected') NOT NULL, notes TEXT NULL,
  approved_by BIGINT UNSIGNED NULL, approved_at DATETIME NULL, reject_reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, created_by BIGINT UNSIGNED NULL, updated_by BIGINT UNSIGNED NULL);
CREATE TABLE stock_inward_items (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, inward_id BIGINT UNSIGNED NOT NULL, po_item_id BIGINT UNSIGNED NOT NULL, product_id BIGINT UNSIGNED NOT NULL,
  expected_gross DECIMAL(12,3) NOT NULL, expected_purity_id BIGINT UNSIGNED NOT NULL, received_gross DECIMAL(12,3) NOT NULL, received_stone DECIMAL(12,3) NOT NULL, received_net DECIMAL(12,3) NOT NULL,
  verified_purity_id BIGINT UNSIGNED NOT NULL, stone_ok TINYINT(1) NOT NULL, condition_status ENUM('ok','damaged') NOT NULL, accepted TINYINT(1) NOT NULL, remarks VARCHAR(255) NULL,
  stock_item_id BIGINT UNSIGNED NULL, FOREIGN KEY (inward_id) REFERENCES stock_inwards(id));

/* APPEND-ONLY */
CREATE TABLE stock_ledger (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, txn_no VARCHAR(20) NOT NULL UNIQUE, txn_at DATETIME NOT NULL, stock_item_id BIGINT UNSIGNED NOT NULL, product_id BIGINT UNSIGNED NOT NULL,
  ref_type VARCHAR(20) NOT NULL, ref_id BIGINT UNSIGNED NOT NULL, ref_no VARCHAR(30) NOT NULL,
  status_from VARCHAR(20) NULL, status_to VARCHAR(20) NOT NULL,
  qty_in INT NOT NULL DEFAULT 0, qty_out INT NOT NULL DEFAULT 0, weight_in DECIMAL(12,3) NOT NULL DEFAULT 0, weight_out DECIMAL(12,3) NOT NULL DEFAULT 0,
  prev_qty INT NOT NULL, prev_weight DECIMAL(12,3) NOT NULL, result_qty INT NOT NULL, result_weight DECIMAL(12,3) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL, reason VARCHAR(255) NOT NULL,
  INDEX ix_ledger_item (stock_item_id), INDEX ix_ledger_product_date (product_id, txn_at), INDEX ix_ledger_ref (ref_type, ref_id));

CREATE TABLE sales (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, invoice_no VARCHAR(20) NOT NULL UNIQUE, sale_date DATETIME NOT NULL, customer_id BIGINT UNSIGNED NULL,
  customer_name VARCHAR(140) NOT NULL, customer_phone VARCHAR(20) NULL, status ENUM('completed','cancelled') NOT NULL,
  subtotal DECIMAL(14,2) NOT NULL, discount DECIMAL(14,2) NOT NULL, taxable DECIMAL(14,2) NOT NULL, cgst DECIMAL(14,2) NOT NULL, sgst DECIMAL(14,2) NOT NULL,
  gst DECIMAL(14,2) NOT NULL, round_off DECIMAL(6,2) NOT NULL, total DECIMAL(14,2) NOT NULL, returned_value DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes TEXT NULL, cancel_reason VARCHAR(255) NULL, cancelled_at DATETIME NULL,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, created_by BIGINT UNSIGNED NULL, updated_by BIGINT UNSIGNED NULL,
  INDEX ix_sale_cust (customer_id, sale_date), INDEX ix_sale_date (sale_date));
/* snapshot rows: rate, weights, pricing at invoice time — never recomputed from current masters */
CREATE TABLE sale_items (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, sale_id BIGINT UNSIGNED NOT NULL, stock_item_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL, name VARCHAR(160) NOT NULL, barcode VARCHAR(40) NOT NULL, item_code VARCHAR(50) NOT NULL, purity_label VARCHAR(20) NOT NULL,
  gross_weight DECIMAL(12,3) NOT NULL, stone_weight DECIMAL(12,3) NOT NULL, net_weight DECIMAL(12,3) NOT NULL, rate_per_gram DECIMAL(12,2) NOT NULL,
  pricing_mode VARCHAR(20) NOT NULL, metal_value DECIMAL(14,2) NOT NULL, wastage_value DECIMAL(14,2) NOT NULL, making_value DECIMAL(14,2) NOT NULL, stone_charge DECIMAL(14,2) NOT NULL,
  discount DECIMAL(14,2) NOT NULL, taxable DECIMAL(14,2) NOT NULL, gst_percent DECIMAL(6,3) NOT NULL, gst DECIMAL(14,2) NOT NULL, amount DECIMAL(14,2) NOT NULL,
  hsn VARCHAR(12) NOT NULL, huid VARCHAR(20) NULL, cost_price DECIMAL(14,2) NOT NULL, returned TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_sale_item (sale_id, stock_item_id), FOREIGN KEY (sale_id) REFERENCES sales(id), FOREIGN KEY (stock_item_id) REFERENCES stock_items(id));
CREATE TABLE sale_returns (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, return_no VARCHAR(20) NOT NULL UNIQUE, sale_id BIGINT UNSIGNED NOT NULL, return_date DATETIME NOT NULL,
  value DECIMAL(14,2) NOT NULL, refund DECIMAL(14,2) NOT NULL, refund_mode ENUM('cash','upi','card','bank') NOT NULL, reason VARCHAR(255) NOT NULL, created_by BIGINT UNSIGNED NULL, created_at DATETIME NOT NULL);
CREATE TABLE sale_return_items (return_id BIGINT UNSIGNED NOT NULL, stock_item_id BIGINT UNSIGNED NOT NULL, PRIMARY KEY (return_id, stock_item_id));

CREATE TABLE payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, payment_no VARCHAR(20) NOT NULL UNIQUE, paid_at DATETIME NOT NULL, direction ENUM('in','out') NOT NULL,
  party_type ENUM('customer','supplier') NOT NULL, party_id BIGINT UNSIGNED NULL,           -- NULL = walk-in
  mode ENUM('cash','upi','card','bank') NOT NULL, amount DECIMAL(14,2) NOT NULL CHECK (amount > 0),
  kind ENUM('receipt','advance','refund','supplier_payment') NOT NULL, reference VARCHAR(80) NULL, notes VARCHAR(255) NULL, status ENUM('posted','void') NOT NULL DEFAULT 'posted',
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, created_by BIGINT UNSIGNED NULL, updated_by BIGINT UNSIGNED NULL, INDEX ix_pay_party (party_type, party_id, paid_at));
CREATE TABLE payment_allocations (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, payment_id BIGINT UNSIGNED NOT NULL,
  doc_type ENUM('sale','purchase','repair') NOT NULL, doc_id BIGINT UNSIGNED NOT NULL, amount DECIMAL(14,2) NOT NULL CHECK (amount > 0),
  INDEX ix_alloc_doc (doc_type, doc_id), FOREIGN KEY (payment_id) REFERENCES payments(id));
-- invariant (enforced in the service layer inside the transaction): SUM(allocations.amount) <= payments.amount

CREATE TABLE repairs (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, job_no VARCHAR(20) NOT NULL UNIQUE, customer_id BIGINT UNSIGNED NOT NULL, stock_item_id BIGINT UNSIGNED NULL,
  description VARCHAR(255) NOT NULL, repair_type VARCHAR(60) NOT NULL, received_weight DECIMAL(12,3) NOT NULL, damage TEXT NULL, instructions TEXT NULL,
  expected_delivery DATETIME NOT NULL, artisan_id BIGINT UNSIGNED NULL, labour_estimate DECIMAL(14,2) NOT NULL, labour_final DECIMAL(14,2) NOT NULL DEFAULT 0,
  status ENUM('received','assigned','in_progress','completed','delivered','cancelled') NOT NULL, delivered_at DATETIME NULL,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, created_by BIGINT UNSIGNED NULL, updated_by BIGINT UNSIGNED NULL, INDEX ix_rep_status (status));
CREATE TABLE repair_photos (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, repair_id BIGINT UNSIGNED NOT NULL, file_path VARCHAR(255) NOT NULL);
CREATE TABLE repair_events (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, repair_id BIGINT UNSIGNED NOT NULL, at DATETIME NOT NULL, status VARCHAR(20) NOT NULL, user_id BIGINT UNSIGNED NOT NULL, note VARCHAR(255) NULL);

CREATE TABLE polishing_jobs (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, job_no VARCHAR(20) NOT NULL UNIQUE, stock_item_id BIGINT UNSIGNED NOT NULL, polish_type VARCHAR(60) NOT NULL,
  artisan_id BIGINT UNSIGNED NULL, before_weight DECIMAL(12,3) NOT NULL, after_weight DECIMAL(12,3) NOT NULL DEFAULT 0, weight_diff DECIMAL(12,3) NOT NULL DEFAULT 0,
  labour_charge DECIMAL(14,2) NOT NULL, expected_date DATETIME NOT NULL, status ENUM('pending','assigned','in_progress','quality_check','completed','returned') NOT NULL,
  qc_passed TINYINT(1) NULL, qc_remarks VARCHAR(255) NULL, remarks VARCHAR(255) NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, created_by BIGINT UNSIGNED NULL, updated_by BIGINT UNSIGNED NULL);
CREATE TABLE polishing_events (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, job_id BIGINT UNSIGNED NOT NULL, at DATETIME NOT NULL, status VARCHAR(20) NOT NULL, user_id BIGINT UNSIGNED NOT NULL, note VARCHAR(255) NULL);

CREATE TABLE stock_audits (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, audit_no VARCHAR(20) NOT NULL UNIQUE, title VARCHAR(160) NOT NULL, category_id BIGINT UNSIGNED NULL,
  status ENUM('in_progress','pending_approval','approved','rejected') NOT NULL, approved_by BIGINT UNSIGNED NULL, approval_note VARCHAR(255) NULL,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, created_by BIGINT UNSIGNED NULL, updated_by BIGINT UNSIGNED NULL);
CREATE TABLE stock_audit_expected (audit_id BIGINT UNSIGNED NOT NULL, stock_item_id BIGINT UNSIGNED NOT NULL, PRIMARY KEY (audit_id, stock_item_id));
CREATE TABLE stock_audit_scans (audit_id BIGINT UNSIGNED NOT NULL, barcode VARCHAR(40) NOT NULL, stock_item_id BIGINT UNSIGNED NULL, physical_weight DECIMAL(12,3) NULL, scanned_at DATETIME NOT NULL, PRIMARY KEY (audit_id, barcode));
CREATE TABLE stock_audit_discrepancies (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, audit_id BIGINT UNSIGNED NOT NULL, kind ENUM('missing','extra','weight','unknown') NOT NULL,
  stock_item_id BIGINT UNSIGNED NULL, barcode VARCHAR(40) NOT NULL, system_weight DECIMAL(12,3) NULL, physical_weight DECIMAL(12,3) NULL, note VARCHAR(255) NOT NULL);
CREATE TABLE stock_adjustments (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, audit_id BIGINT UNSIGNED NOT NULL, stock_item_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('missing','found','weight') NOT NULL, old_weight DECIMAL(12,3) NOT NULL, new_weight DECIMAL(12,3) NOT NULL, reason VARCHAR(255) NOT NULL, approved_by BIGINT UNSIGNED NOT NULL, created_at DATETIME NOT NULL);

CREATE TABLE expenses (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, expense_no VARCHAR(20) NOT NULL UNIQUE, expense_date DATETIME NOT NULL, category VARCHAR(60) NOT NULL,
  amount DECIMAL(14,2) NOT NULL CHECK (amount > 0), mode ENUM('cash','upi','card','bank') NOT NULL, paid_to VARCHAR(140) NOT NULL, notes VARCHAR(255) NULL,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, created_by BIGINT UNSIGNED NULL, updated_by BIGINT UNSIGNED NULL);
CREATE TABLE settings (id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1, data JSON NOT NULL);        -- shop profile, defaults, branches
CREATE TABLE counters (name VARCHAR(30) PRIMARY KEY, value BIGINT UNSIGNED NOT NULL);         -- use SELECT … FOR UPDATE for gap-free document numbers
CREATE TABLE audit_logs (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, at DATETIME NOT NULL, user_id BIGINT UNSIGNED NULL, action VARCHAR(30) NOT NULL,
  entity VARCHAR(40) NOT NULL, entity_id VARCHAR(40) NOT NULL, details VARCHAR(500) NOT NULL, ip VARCHAR(45) NULL, INDEX ix_audit_entity (entity, entity_id));
```
### Branches & per-branch stock
```sql
CREATE TABLE branches (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code VARCHAR(20) NOT NULL UNIQUE, name VARCHAR(120) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL);

ALTER TABLE stock_items     ADD COLUMN branch_id BIGINT UNSIGNED NOT NULL, ADD INDEX ix_item_branch_status (branch_id, status),
                            ADD FOREIGN KEY (branch_id) REFERENCES branches(id);   -- branch that holds (or dispatched, while in transit) the piece
ALTER TABLE stock_ledger    ADD COLUMN branch_id BIGINT UNSIGNED NOT NULL, ADD INDEX ix_ledger_branch_product (branch_id, product_id);
ALTER TABLE stock_inwards   ADD COLUMN branch_id BIGINT UNSIGNED NOT NULL;         -- receiving branch
ALTER TABLE sales           ADD COLUMN branch_id BIGINT UNSIGNED NOT NULL, ADD COLUMN branch_name VARCHAR(120) NOT NULL;  -- name snapshot
ALTER TABLE stock_audits    ADD COLUMN branch_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE stock_items MODIFY status ENUM('available','reserved','sold','repair','polishing','in_transit','damaged','returned','missing') NOT NULL;

CREATE TABLE stock_transfers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, transfer_no VARCHAR(20) NOT NULL UNIQUE,
  from_branch_id BIGINT UNSIGNED NOT NULL, to_branch_id BIGINT UNSIGNED NOT NULL, CHECK (from_branch_id <> to_branch_id),
  status ENUM('in_transit','received','cancelled') NOT NULL, note VARCHAR(255) NULL,
  dispatched_at DATETIME NOT NULL, received_at DATETIME NULL, received_by BIGINT UNSIGNED NULL, cancel_reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, created_by BIGINT UNSIGNED NULL, updated_by BIGINT UNSIGNED NULL,
  FOREIGN KEY (from_branch_id) REFERENCES branches(id), FOREIGN KEY (to_branch_id) REFERENCES branches(id));
CREATE TABLE stock_transfer_items (transfer_id BIGINT UNSIGNED NOT NULL, stock_item_id BIGINT UNSIGNED NOT NULL, PRIMARY KEY (transfer_id, stock_item_id),
  FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id), FOREIGN KEY (stock_item_id) REFERENCES stock_items(id));
```
Rules: a sale may only include items whose `branch_id` equals the selling branch; items `in_transit` are not sellable anywhere;
dispatch writes a ledger **out** row on the source branch (`available → in_transit`), receipt writes a ledger **in** row on the destination
branch and sets `stock_items.branch_id`; a branch that holds stock (including in transit) cannot be deleted/deactivated.
Reconciliation also runs per branch: `COUNT(available items at branch × product) = Σ(qty_in − qty_out)` of ledger rows with that `branch_id`.
Payments, expenses and purchase orders are **not** branch-scoped yet (add `branch_id` the same way if cash books must be per branch).

## Business invariants the database/service layer must enforce
| # | Invariant | Mechanism |
|---|---|---|
| 1 | one physical piece = one `stock_items` row | per-piece rows, `item_code` & `barcode` UNIQUE |
| 2 | no duplicate active barcode | `barcodes.code` UNIQUE + one-active-per-item generated-column unique key |
| 3 | item cannot be sold twice / while in repair or polishing | sale service does `SELECT … FOR UPDATE` on items, requires `status='available'`; `sale_items(sale_id, stock_item_id)` unique |
| 4 | no stock change without ledger row | all status/weight changes via one service method writing `stock_ledger` in the same transaction |
| 5 | ledger is immutable | no UPDATE/DELETE grants; corrections are new rows |
| 6 | ledger reconciles | `GET /stock/reconcile`: last `status_to` per item = `stock_items.status`; Σ(qty_in−qty_out) per product = count(`available`) |
| 7 | completed invoices not edited | no update endpoint; cancel/return create reversing rows; line snapshots hold rate & pricing |
| 8 | partial payments / advances | `payment_allocations`; unallocated remainder = advance |
| 9 | stock only on approved inward | only `POST /inwards/{id}/approve` creates items/barcodes/ledger |
| 10 | no negative stock | piece-level model: availability is a status, not a counter |

## Demo (IndexedDB) stores
`users, categories(&code), metals(&code), purities, metalRates([metalId+purityId],effectiveAt), taxConfigs, products(&code), customers(&code), suppliers(&code),
stockItems(&itemCode,&barcode,productId,status), barcodes(&code,stockItemId,active), purchaseOrders(&poNumber), inwards(&inwardNo), ledger(&txnNo,stockItemId,productId),
sales(&invoiceNo), saleReturns, payments(&paymentNo,partyId), repairs(&jobNo), polishing(&jobNo), audits(&auditNo), adjustments, expenses, settings, auditLogs, counters, meta`.
(`&` = unique index.) All commands run inside `db.transaction('rw', db.tables, …)` and roll back on any error.

## CodeIgniter 4 migration plan
1. `php spark make:migration` per table group in dependency order: *RBAC → masters → parties → products → stock → purchasing → inward → sales → payments → workshop → audit → system*.
2. Models extend `CodeIgniter\Model` with `$useTimestamps = true`, `$useSoftDeletes = false` (financial tables are never soft-deleted).
3. Seeders: `RolePermissionSeeder` (generate from `src/domain/permissions.ts` — the matrix is the single source of truth), `MasterSeeder`, optional `DemoSeeder`.
4. One `Services\StockService::move()` mirrors `moveItem()`; controllers stay thin and call services inside `$db->transStart()`.
5. Production database user: `SELECT, INSERT, UPDATE, DELETE` on normal tables; **no UPDATE/DELETE on `stock_ledger`, `audit_logs`**; backups via nightly `mysqldump --single-transaction` + binary logs for point-in-time recovery.
