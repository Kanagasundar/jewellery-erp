# Business rules & workflows

Implemented in `src/domain/*` (pure rules) and `src/repositories/indexeddb/commands/*` (transactional commands), and covered by
`src/test/workflows.test.ts`. Where a rule says *enforced*, a test proves a violation is rejected.

## The 17 jewellery rules → where enforced
| # | Rule | Enforcement |
|---|---|---|
| 1 | Each physical item has its own identity | `stockItems` row per piece, own `itemCode` + `barcode` created at inward approval |
| 2 | An item cannot be sold twice | `sellBlockReason()` + sale command re-checks status inside the transaction ✔ test |
| 3 | Repair items cannot be sold | status `repair` → blocked ✔ test |
| 4 | Polishing items cannot be sold | status `polishing` → blocked ✔ test |
| 5 | Every stock movement is recorded | `moveItem()` is the only writer of item status/weight and always writes a ledger row |
| 6 | Completed invoices are not silently edited | no edit command exists; only `cancel` and `return` (new rows, reasons, audit log) |
| 7 | Financial/stock adjustments need authorisation | permission checks per command (`audit.approve`, `sales.cancel`, `inward.approve`, `inventory.manage`) ✔ test |
| 8 | Cancelled transactions keep history | status `cancelled` + reason + timestamp; lines retained; refunds as new payments |
| 9 | Important transactions are auditable | `auditLogs` (who/what/when) + `stockLedger` |
| 10 | Stock reconciles to the ledger | `inventory.reconcile()` (shown on Inventory → Stock ledger) ✔ test after every workflow |
| 11 | Decimal precision for weights | `decimal.js`; weights 3 dp, money 2 dp, half-up ✔ test |
| 12 | GST configurable | per-product `gstPercent`, HSN, tax master, default in settings |
| 13 | Metal rates preserved on completed invoices | `SaleLine.ratePerGram` snapshot; rates are dated history (never edited) |
| 14 | Partial payments | `Payment` + `allocations`; outstanding derived; advances = unallocated receipts ✔ test |
| 15 | Stock movements link to source docs | ledger `refType/refId/refNo` |
| 16 | No duplicate active barcode | unique `barcode` index + `regenerate` voids the old one ✔ test |
| 17 | No negative stock | piece-level model: an item is either available or not; nothing to go negative |

## Pricing (configurable per product)
`weight_based`: `metal = net × rate/g`; `wastage = (net × %) or grams × rate`; `making = % of (metal+wastage) | ₹/g × net | fixed ₹`;
`taxable = metal + wastage + making + stone charge − discount`; `GST = taxable × gst%`; CGST/SGST split; invoice total rounded to ₹1 with the
round-off stored. `fixed_price` (coins etc.): taxable = fixed price − discount. Code: `domain/calculations/pricing.ts`.
The POS shows a preview with the same function; the command **re-prices** authoritatively.

## Money model
* Invoice outstanding = `total − returnedValue − Σ(allocated receipts) + Σ(allocated refunds)`.
* Customer ledger balance (>0 owes, <0 advance) = opening + invoices + repair charges + refunds − returns − receipts.
* Advance = receipts not allocated to any document. "Advance adjustment" allocates it to an invoice FIFO.

## The seven workflows (all functional; ✔ = covered by automated tests, UI = also driven in a real browser)
1. **Purchase → inventory** — Supplier → *Purchases → New* (Draft/Place order) → *Receive stock* → piece-by-piece verification (weights, purity, stone, damage, accept) → *Submit for approval* → **Approve & complete** ⇒ stock items + barcodes + ledger → *Barcode Management* to print labels → Inventory shows them *Available*. ✔ UI ✔
2. **Sales** — *New sale*: scan barcode (or search) → customer/walk-in → live bill → collect payment (cash/UPI/card/bank, split, advance) → **Complete sale** ⇒ invoice, items *Sold*, ledger out. ✔ UI ✔
3. **Repair** — *Repairs → New* (customer, photos, weight, advance) → assign artisan → artisan *Start work* → *Complete work* (final charge) → collect balance → *Deliver* (blocked until paid). Shop-owned items can be sent for repair (status `repair`, not sellable). ✔
4. **Polishing** — *Polishing → New* (scan item) ⇒ item leaves sellable stock → assign → start → enter after-weight (loss recorded) → *QC* pass/fail → *Return to inventory* ⇒ item available with new weight. ✔
5. **Stock audit** — *Stock checking → New session* (whole shop or category) → scan barcodes (optionally weigh) → *Finish & submit* ⇒ variance report (missing / extra / weight / unknown) → approver *Approve & adjust* ⇒ adjustments + ledger rows (nothing changes before approval). Maker-checker: counters cannot approve. ✔
6. **Partial purchase** — receive some pieces → PO becomes *Partially received* → receive the rest → *Received* (→ *Completed* when fully paid). Over-receipt is rejected. ✔ UI ✔
7. **Split payment** — POS: add +CASH and +UPI rows (or cash now, balance later from *Payments*) → invoice shows each receipt; customer ledger and outstanding stay consistent. ✔

## Roles (see Users → Role permission matrix)
Super Admin (all) · Shop Admin (all except user management; approves audits, cancels invoices) · Sales (billing, customers, repair intake, returns, reserve) ·
Stock Manager (inward incl. approval, barcodes, inventory, audits, polishing, repairs) · Purchase Manager (purchases, suppliers, inward drafts) ·
Workshop/Artisan (update **own** repair & polishing jobs only) · Accountant (payments, expenses, financial reports) · Viewer (read-only).
