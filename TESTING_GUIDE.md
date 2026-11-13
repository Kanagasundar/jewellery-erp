# Testing guide

## Automated (Vitest + fake-indexeddb) — `npm test`
Tests run the **real command layer against a real (in-memory) IndexedDB implementation**, so they exercise transactions, unique indexes,
permissions and the seed. 33 tests, ~5 s.

> Windows: run from PowerShell/cmd using a `D:\…` path. Launching Vitest from Git-Bash with a lowercase `/d/…` path breaks it
> (drive-letter-case module duplication → "Cannot read properties of undefined (reading 'config')").

| Area | Test (src/test) |
|---|---|
| Decimal-safe pricing, fixed-price items, no float drift, round-off | `workflows.test.ts › pricing` |
| Seed consistency: ledger reconciles, unique barcodes, one active barcode/item | `› seeded demo data` |
| Purchase → partial inward → remainder; drafts/submission leave stock untouched; approval creates stock + ledger; over-receipt rejected; permissions | `› Workflow 1 + 6` |
| Barcode lookup (barcode / item code / unknown), regenerate + uniqueness + history | `› barcode scanning` |
| Sale, split payment, outstanding, double-sale refusal, credit sale & customer ledger, over-allocation, advance adjustment, cancel (permission + restore + refund), return/restock | `› Workflow 2 + 7` |
| Repair lifecycle incl. artisan ownership, payment before delivery, shop-item repair not sellable | `› Workflow 3` |
| Polishing lifecycle: QC fail/pass, weight loss, return with new weight, not sellable while polishing | `› Workflow 4` |
| Audit: missing/extra/weight/unknown/duplicate; no change before approval; maker-checker; adjustments + ledger | `› Workflow 5` |
| Product & supplier CRUD, duplicate SKU, delete protection, audit log, persistence (close/re-open DB), demo reset | `› master data + persistence` |
| Permission matrix, amount-in-words, every report builds with finite numbers, report totals = source data | `misc.test.ts` |

After most workflows the tests call `inventory.reconcile()` and require `ok: true`.

## Build & type checks
```bash
npx tsc --noEmit      # strict TypeScript
npm run build         # tsc + vite build → dist/
```

## Browser verification (performed during development, Playwright CLI, localhost only)
* Login → dashboard renders from live data.
* **POS end-to-end**: scan barcode → +CASH → Complete sale → invoice; barcode lookup then shows *Not sellable — already SOLD*.
* **Workflow 1 through the real forms**: new PO → Receive stock (2 of 3) → submit → approve → barcodes issued → PO *Partially received*.
* Sweep of all 21 list/form routes and 9 detail pages: no console errors, no `NaN`/`undefined`/`Infinity`/`[object` text.
* **GitHub Pages sub-path**: built with `VITE_BASE_PATH=/jewellery-erp/`, served at `/jewellery-erp/`: all assets 200, hard refresh on `#/inventory` works,
  Sales Person menu shows only permitted modules.

Bugs these checks found and fixed: concurrent seeding under React StrictMode; confirm dialogs without a reason silently doing nothing;
POS right panel overflow; invoice table clipping; blank purity dropdown after choosing a product; all-lines-returned round-off refund mismatch.

## Manual test script (10 minutes)
1. **Reset**: Settings → *Demo data* → Reset. Reload; data persists.
2. **Stock manager**: Purchases (as Purchase Manager) → new PO → Place order → Stock Inward → Receive 2 pcs, mark one *Damaged* → Submit → Approve. Check Inventory (new *Available* + *Damaged*) and the Stock ledger tab (reconciled banner green).
3. **Barcode**: Barcode Management → select the new items → Print labels (preview shows CODE128) → Scan tab → paste a barcode → history shows inward.
4. **Sales person**: New sale → scan → customer → +CASH half, +UPI rest (or leave balance) → Complete → print invoice. Try scanning the same barcode again: refused.
5. **Returns/cancel**: as Sales, *Return items*; as Shop Admin, *Cancel invoice* on a different invoice (Sales cannot).
6. **Repair**: Sales → Repairs → New (advance ₹200) → Shop admin assigns Ramesh → switch to Ramesh: Start → Complete → switch back: Collect → Deliver.
7. **Polishing**: Stock Manager → New → scan item → assign → Suresh: start, submit after-weight → Stock Manager: Pass → Return to inventory.
8. **Audit**: Stock Manager → new session (category *Chains*) → scan most items, one with a different weight → Submit → try Approve as Stock Manager (refused) → Shop Admin: Approve → ledger rows appear.
9. **Reports**: Reports → Daily sales → Excel and PDF export; Customer outstanding shows the seeded credit customer.
10. **Roles**: Viewer sees no create buttons; Accountant sees Payments/Expenses/Reports incl. *Profit*; Artisan sees only Repairs/Polishing.

## Not covered (be honest)
* No automated UI/E2E suite is committed (the browser checks above were run ad hoc). A Playwright suite for the seven workflows is the recommended next step.
* Camera scanning needs real hardware; USB scanner behaviour is a keyboard-wedge (Enter-terminated) which the scan field handles.
* Print layouts (A4 invoice, label sheets) were checked on screen, not on physical printers.
* No load/concurrency testing — IndexedDB is single-user.
