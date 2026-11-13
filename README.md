# Samayan Jewellers — Jewellery ERP

A modern jewellery-shop ERP built as a **static React app** that works immediately as a **demo on GitHub Pages**
(data in the browser's IndexedDB) and is architected to become a **real multi-user ERP** by swapping the data
provider for a CodeIgniter 4 + MySQL REST API.

> **Demo ≠ production.** Demo mode stores everything in one browser, and the role switcher is *not* authentication.
> See [PRODUCTION_MIGRATION_GUIDE.md](PRODUCTION_MIGRATION_GUIDE.md).

## Modules
Dashboard · Products · Purchases · Stock Inward · Barcode Management · Inventory (+ stock ledger) · Sales / POS & Invoices ·
Repairs · Polishing · Stock Checking (audits) · Customers · Suppliers · Payments & Receipts · Expenses · Reports (Excel/PDF/print) ·
Users & Permissions · Settings (rates, masters, tax) — all interconnected through one stock ledger and one payment/allocation model.

## Quick start
```bash
npm install
npm run dev          # http://localhost:5173  (demo mode, seeded data)
npm test             # business-rule tests (Vitest + fake-indexeddb)
npm run build        # static build in dist/
```
Requirements: Node 20+ (developed on Node 22).

> **Windows note:** run Vitest from PowerShell/cmd with a normal `D:\…` path. Starting it from Git-Bash with a lowercase `/d/…`
> path breaks Vitest's module graph (drive-letter case mismatch).

## Configuration (`.env`, see `.env.example`)
| Variable | Meaning |
|---|---|
| `VITE_APP_MODE` | `demo` (IndexedDB, default) or `production` (REST API) |
| `VITE_API_BASE_URL` | API root for production, e.g. `https://api.example.com/api/v1`. **Never put secrets here.** |
| `VITE_BASE_PATH` | `/` or empty → relative base. For GitHub Pages project sites: `/REPOSITORY-NAME/` |

## Architecture in one picture
```
UI (features/*)  ──►  hooks/useData (TanStack Query)  ──►  services/erp  (the ONLY switch)
                                                            ├─ repositories/indexeddb  (demo: Dexie, transactions, seed)
                                                            └─ repositories/api        (production: fetch client → CI4 REST)
domain/  pure business logic: decimal pricing, ledgers, permissions, workflow rules (no UI, no storage)
```
* `src/domain` — decimal.js pricing (`priceItem`, `invoiceTotals`), customer/supplier ledgers, permission matrix, state-machine rules.
* `src/repositories/interfaces` — `DataProvider`: generic repositories + **command groups** (purchases, inward, sales, repairs …).
  Every multi-step business operation is a single command = one DB transaction (demo) / one server transaction (production).
* `src/repositories/indexeddb` — Dexie schema with unique indexes, `moveItem()` (the only way a stock item changes status → writes an
  immutable ledger row), commands, seeder (runs *through the real commands*, so demo data is ledger-consistent).
* `src/repositories/api` — API client (timeouts, retry on idempotent GETs, error envelope, 401 hook) and REST provider.

## Documentation
| File | Purpose |
|---|---|
| [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) | Phases, structure, decisions, status |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | IndexedDB stores + MySQL DDL + CI4 migration plan |
| [API_DOCUMENTATION.md](API_DOCUMENTATION.md) | REST contract the frontend expects |
| [BUSINESS_WORKFLOWS.md](BUSINESS_WORKFLOWS.md) | Rules and the 7 demo workflows |
| [UI_DESIGN_SYSTEM.md](UI_DESIGN_SYSTEM.md) | Tokens, components, patterns |
| [GITHUB_PAGES_DEPLOYMENT.md](GITHUB_PAGES_DEPLOYMENT.md) | Publish to GitHub Pages |
| [PRODUCTION_MIGRATION_GUIDE.md](PRODUCTION_MIGRATION_GUIDE.md) | Demo → real backend |
| [TESTING_GUIDE.md](TESTING_GUIDE.md) | What is tested and how |

## Demo roles
Super Admin, Shop Admin, Sales Person, Stock Manager, Purchase Manager, Workshop/Artisan (two artisans), Accountant, Viewer.
Switch from the user menu (top-right). Menus and screens are permission-aware, and the demo command layer also refuses actions the
role may not perform (e.g. Sales cannot adjust stock, only Shop Admin/Super Admin approve audits).

## Known limitations (by design for a demo)
* IndexedDB is single-user, per-browser. No sync, no real security, no backup beyond "Reset demo data".
* Camera barcode scanning needs HTTPS/localhost and camera permission; USB scanners (keyboard wedge) and manual entry always work.
* GST is split CGST/SGST (intra-state). IGST, TCS/TDS, e-invoicing and e-way bills are not implemented.
* The production API is a documented contract; the CodeIgniter backend itself is **not** included.
