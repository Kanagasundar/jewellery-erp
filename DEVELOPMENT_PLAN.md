# Development plan & status

## Key decisions
| Decision | Why |
|---|---|
| React 19 + TypeScript + Vite 8 + Tailwind 4, HashRouter | Static build, no server rewrites on GitHub Pages |
| `DataProvider` abstraction with **command groups**, not just CRUD repositories | Jewellery workflows are multi-table transactions; a CRUD-only abstraction would push business logic into the UI and make the production switch impossible |
| Dexie/IndexedDB with unique indexes + `db.transaction('rw', db.tables, …)` | Real persistence, atomic commands, constraint behaviour close to MySQL |
| One stock choke-point `moveItem()` + append-only ledger | Auditable, reconcilable stock; rules 5, 9, 10, 15 |
| Per-piece `StockItem` ≠ `Product` model | Rule 1; barcode identifies one physical item |
| `decimal.js` everywhere money/weight is computed; stored rounded (2 / 3 dp) | No float drift (tested) |
| Allocation-based payments | Partial/split payments, advances, supplier payments, one customer ledger |
| Seeder runs through real commands with a back-dated clock | Demo data is guaranteed consistent and the seed doubles as a test |
| Permission matrix as data (`domain/permissions.ts`) | Same matrix seeds the production RBAC tables |
| Lazy-loaded routes; xlsx/jsPDF loaded only on export | Fast first load |

## Phases
| Phase | Scope | Status |
|---|---|---|
| 1 Discovery & planning | Repo inspected (empty workspace), design skill read, structure/design/DB/API planned | ✅ |
| 2 Foundation | Vite/TS/Tailwind, routing, base path, design system, layout, IndexedDB, demo mode, seed | ✅ |
| 3 Core ERP | Dashboard, products, customers, suppliers, purchases, inward, barcodes, inventory | ✅ |
| 4 Business operations | Sales/POS, payments, repairs, polishing, stock checking, expenses, reports | ✅ |
| 5 Integration | Cross-module consistency (reconcile after every workflow), payment & ledger consistency, 33 automated tests, browser E2E of workflows 1 & 2, route sweep | ✅ |
| 6 Deployment | Pages workflow, base path, build verified at sub-path, docs | ✅ workflow written & sub-path build verified locally; **first real deploy happens when you push to GitHub** |
| 7 Production prep | API contract, MySQL DDL, CI4 plan, migration/auth guides | ✅ documentation + REST provider; backend itself **not built** |

## Project structure
```
src/
  app/            App shell, auth context, login
  components/     ui/ (design system) · layout/ · common/ (barcode, scanner)
  features/       one folder per module (pages, forms, module-specific components)
  domain/         calculations/ (decimal, pricing, ledger) · workflows/rules · permissions
  repositories/   interfaces/ · indexeddb/ (db, ctx/moveItem, commands/*, repos, seed, provider) · api/ (client, provider)
  services/       the data-provider switch + bootstrap
  hooks/          TanStack Query wrappers (useList, useAction, useMasters, useAlerts)
  routes/ config/ utils/ types/ styles/ test/
```

## Known gaps / next steps
1. Backend implementation (CodeIgniter 4) from the documented contract.
2. Committed Playwright E2E suite for the 7 workflows; axe accessibility run.
3. Server-side pagination & report endpoints; branch dimension (`branch_id`) — the demo branch selector is cosmetic.
4. IGST / interstate, e-invoice, TCS/TDS; old-gold exchange / scheme (chit) modules; hallmark (HUID) verification.
5. Hardware: thermal label printer profiles (TSPL/ZPL), customer display, cash drawer.
6. Image storage off base64; data export/import tool for pilots.
