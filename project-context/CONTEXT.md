# Project context — Samayan Jewellers ERP

> Read this first, then `TRACKER.md` (state + next steps). Keep both updated when you change the project. Last verified: see TRACKER.

## What this is
A jewellery-shop ERP: **static React app** (runs as a demo on GitHub Pages, data in the browser's IndexedDB) architected to switch to a **real CodeIgniter 4 + MySQL REST API** by changing one data provider. Owner/org: Logimax (account is for Logimax work only). Brand shown in UI = `Settings.shopName` (default **Samayan Jewellers**; the code/storage keys still say `aurum` for historical reasons — do not rename them, it would orphan existing browser data).

Goal: a commercially presentable demo for real jewellery shop owners that can become production without a rewrite.

## Stack & versions (all verified working)
React 19 · TypeScript **7** (no `baseUrl`; uses `paths` with `./src/*`) · Vite **8** (rolldown: **no object-form `manualChunks`**) · Tailwind **4** (`@theme` tokens in `src/styles/index.css`) · react-router **HashRouter** · TanStack Query 5 · react-hook-form + zod 4 · Dexie 4 (IndexedDB) · decimal.js · recharts · jsbarcode (CODE128) · html5-qrcode (camera, lazy) · jspdf + jspdf-autotable + xlsx (lazy, exports) · Vitest 5 + fake-indexeddb · lucide-react.

## Commands
```bash
npm install
npm run dev            # http://localhost:5173
npm test               # vitest run (39 tests, ~5s)
npx tsc --noEmit       # strict type-check (must be clean)
npm run build          # tsc + vite build → dist/
# GitHub Pages sub-path check:
VITE_BASE_PATH=/jewellery-erp/ npm run build
```
Env (`.env.example`): `VITE_APP_MODE=demo|production`, `VITE_API_BASE_URL`, `VITE_BASE_PATH`. Never put secrets in `VITE_*`.

## Architecture (the one picture)
```
features/* (UI pages)  →  hooks/useData (useList/useAction/useMasters)  →  services/index.ts  `erp`  ← the ONLY provider switch
                                                                           ├─ repositories/indexeddb  (demo)
                                                                           └─ repositories/api        (production REST)
domain/  pure logic: decimal pricing, ledgers, permissions, workflow rules   (no UI, no storage)
```
* **`DataProvider`** (`repositories/interfaces/index.ts`) = generic repositories (`erp.repos.*`: CRUD for masters, read-only for transactions) + **command groups** (`erp.commands.purchases|inward|barcodes|inventory|sales|payments|transfers|repairs|polishing|audits|system`). Every multi-step business operation is ONE command = one DB transaction (demo: `db.transaction('rw', db.tables, …)`; production: one server transaction). UI never touches IndexedDB or `fetch`.
* **Reads are client-side:** lists come from `erp.repos.X.list()`; dashboards/reports/ledgers/outstanding are computed in the browser from lists (`domain/calculations/ledger.ts`, `features/reports/definitions.ts`). Fine for demo; production needs server-side pagination/report endpoints.
* **`useAction(fn, {success,onSuccess})`** wraps a command: toasts errors (never silent), invalidates *all* queries on success, returns `undefined` on failure. Use it for every mutation.
* **Stock choke-point:** `moveItem()` in `repositories/indexeddb/ctx.ts` is the ONLY code that changes a stock item's status/weight/branch, and it always appends an immutable `StockLedgerEntry`. New items use `ledgerForNewItem()`. Never `db.stockItems.put()` a status change directly.
* **Seeder runs through the real commands** with a back-dated clock (`utils/clock.ts`), so demo data is ledger-consistent. `seed.ts → resetAndSeed()`; `ensureSeeded()` also runs one-time migrations (branch backfill, shop-name rename). `bootstrap()` is a singleton promise (StrictMode double-run once corrupted seeding — keep it a singleton).
* **Permissions:** matrix in `domain/permissions.ts` (single source of truth; also seeds production RBAC). Enforced in the UI (nav/routes/buttons via `useAuth().can`) AND in the demo command layer (`requirePerm`). Production must enforce server-side.

## Domain model essentials (`src/types/entities.ts`)
* **Product** = catalogue model. **StockItem** = one physical piece (own `itemCode`, unique `barcode`, `status`, `branchId`, own weights, `costPrice`). Statuses: `available, reserved, sold, repair, polishing, in_transit, damaged, returned, missing`.
* **Money** stored as numbers rounded to 2 dp, **weights 3 dp**; ALL arithmetic via `domain/calculations/decimal.ts` (`D`, `money`, `weight`, `sum`). Never use raw float math on money/weight.
* **Pricing** (`domain/calculations/pricing.ts`): `priceItem()` per product formula (`weight_based` | `fixed_price`; making % / ₹ per g / fixed; wastage % / grams; stone charge; discount; GST), `invoiceTotals()` (CGST/SGST split, total rounded to ₹1 with stored round-off). POS previews with it; `sales.create` re-prices authoritatively and **snapshots the metal rate** on each line.
* **Payments:** `Payment` + `allocations[]` to sale/purchase/repair. Outstanding = total − Σallocations (`ledger.ts`). Unallocated receipts = customer **advance**. Customer ledger balance >0 owes, <0 advance. Walk-in must pay in full.
* **Purchases:** Draft→Pending→Partially received→Received→Completed (paid)/Cancelled. **Stock appears only when an inward is approved** (`inward.approve`): creates StockItems + barcodes + ledger. Barcode format `AUR########` (prefix kept for existing data).
* **Branches:** `Settings.branches[]`. Every StockItem/ledger row/inward/audit/sale has a branch. Sales only bill items held at the selling branch. **Transfers**: dispatch (`available→in_transit`, ledger out at source) → receive (`→available`, branch changes, ledger in at destination) / cancel while in transit. Header selector = view scope (`useBranch().scopeId`, undefined = All); `operating` = concrete branch for transactions. A branch holding stock can't be removed. **Not branch-scoped yet:** purchases, payments, expenses, customers/suppliers.
* **Ledger reconciliation:** `inventory.reconcile()` checks item status/branch vs last ledger row, per-product and per-(branch,product) available qty/weight. Must be `ok:true` — tests assert it after every workflow.

## Repo map
```
src/
  app/            App.tsx (route gate), auth.tsx, LoginScreen.tsx
  components/     ui/ (Button, Form, DataTable, Modal+useConfirm, Toast, Feedback, Layout) · layout/ (AppShell, Sidebar, Header, nav.ts) · common/ (BarcodeImage, ScanInput)
  features/       dashboard · products · customers(parties.tsx = customers+suppliers) · suppliers · purchases · inward · barcodes · inventory · transfers · sales(PosPage, SalesPages=list+invoice) · repairs · polishing · stock-audit · payments(PaymentDialog) · expenses · reports(definitions.ts+ReportsPage) · users · settings
  domain/         calculations/{decimal,pricing,ledger}.ts · workflows/rules.ts · permissions.ts
  repositories/   interfaces/index.ts · indexeddb/{db,ctx,repos,provider,seed}.ts + commands/{stock,sales,workshop,audits,transfers}.ts · api/{client,provider}.ts
  hooks/          useData.ts · useBranch.ts · useBrand.ts · useAlerts.ts
  routes/index.tsx  (lazy routes + required permission)   services/index.ts  (provider switch + bootstrap)
  test/           workflows.test.ts (command-layer business rules) · misc.test.ts (permissions, words, reports, branches)
*.md (root)       README, DEVELOPMENT_PLAN, DATABASE_SCHEMA (MySQL DDL), API_DOCUMENTATION, BUSINESS_WORKFLOWS, UI_DESIGN_SYSTEM, GITHUB_PAGES_DEPLOYMENT, PRODUCTION_MIGRATION_GUIDE, TESTING_GUIDE
.github/workflows/deploy.yml   test → build (VITE_BASE_PATH=/<repo>/) → Pages deploy
```

## Conventions (follow these)
* **Add a business operation** = (1) type in `entities.ts`, (2) input/command signature in `repositories/interfaces/index.ts`, (3) implement in `indexeddb/commands/*.ts` using `tx()`, `requirePerm`, `moveItem`, `audit()`, `nextNo()`, `stampNew/Update`, throw `BusinessError` for rule violations, (4) mirror in `repositories/api/provider.ts`, (5) hook UI with `useAction`, (6) add a test in `test/workflows.test.ts` + `reconcile()` assertion, (7) update `API_DOCUMENTATION.md` / `DATABASE_SCHEMA.md` / `BUSINESS_WORKFLOWS.md`.
* **Add a module/page:** page in `features/<x>/`, lazy route in `routes/index.tsx` with a permission, nav entry in `components/layout/nav.ts`, permission in `domain/permissions.ts` + role matrix.
* **Schema change (demo):** add a new `this.version(n).stores({...})` in `db.ts` (never edit version 1) and a backfill in `ensureSeeded()` for existing browsers.
* UI: numbers right-aligned (`.num`), weights `fmtW` (3 dp), money `fmtNum/fmtMoney` (en-IN); every async action has an error path; no `NaN/undefined` in DOM; dense tables via `DataTable`; confirmations via `useConfirm()` (**returns `null` on cancel, `'confirmed'` or the reason string otherwise** — check `!== null`/truthiness accordingly). Forms: RHF+zod for masters; local state for line-item screens.
* No fake buttons / no success toasts without a real state change. No secrets in frontend source.

## Gotchas learned the hard way
* **Vitest on Windows:** run from PowerShell/cmd with a `D:\…` path. From Git-Bash (`/d/…`) it fails with "Cannot read properties of undefined (reading 'config')" (drive-letter-case module duplication).
* **Bash heredocs** with long content were silently truncated/mis-parsed in this environment → write files with the Write tool, and multi-line patches as a `.py` file run via PowerShell/Bash. PowerShell 5.1 mangles `git commit -F -` here-strings → use `git commit -F <file>`.
* **Tailwind:** `clsx` doesn't dedupe conflicting utilities; to override `w-full` from `Bare.*` controls use `!w-auto`.
* `Select`/`Input` (labelled) vs `Bare.select/input` (unlabelled, dense, need `aria-label`).
* A `<select>` whose options depend on a value set in the same tick shows blank — render all options up-front (purchase-line purity bug).
* Same-URL navigation doesn't remount a page (stale form state) — navigate elsewhere first when testing.
* Don't blanket `taskkill` node; stop servers by port.
* GitHub: only `gh` login on this machine is `kanaga-sundar`, which lacks write access to `Kanagasundar/jewellery-erp` (403). See TRACKER.
* Org rule: Logimax work only; never ask for/store client passwords or secrets.

## How to verify a change (definition of done)
`npx tsc --noEmit` clean → `npx vitest run` green (PowerShell) → `npm run build` ok → for UI changes, look at it in a real browser (dev server `npm run dev`; login as Super Admin; check no console errors / `NaN`). Update docs + `project-context/TRACKER.md`.
