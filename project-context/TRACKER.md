# Project tracker

_Update this file at the end of every working session (status, what changed, next steps, blockers)._

**Last updated:** 2026-11-13 · **Branch:** `main` · **Latest local commit:** `e13bf6d` (+ the context commit that adds this folder)
**Health:** `tsc` clean · 39/39 tests · build OK · browser-verified (dashboard, POS, workflow 1, branch UI, transfers)

## ⚠ Blockers / open decisions
| # | Item | State |
|---|---|---|
| B1 | **Nothing is pushed to GitHub.** Remote `origin = https://github.com/Kanagasundar/jewellery-erp.git` is set; push fails with HTTP 403 because the only `gh` login (`kanaga-sundar`) has no write access. | Needs the owner to (a) add `kanaga-sundar` as a collaborator with Write, or (b) `gh auth login` as `Kanagasundar`, or (c) run `git push -u origin main` themselves. Then Settings → Pages → Source = GitHub Actions. |
| B2 | Production backend (CodeIgniter 4 + MySQL) not built — only contract + schema docs + REST provider. | Not started; spec: `API_DOCUMENTATION.md`, `DATABASE_SCHEMA.md`, `PRODUCTION_MIGRATION_GUIDE.md`. |
| B3 | GitHub Pages deploy never executed (workflow written; sub-path build verified locally). | Blocked by B1. |

## Done (chronological)
1. Phase 1–2: scaffold (Vite/TS/Tailwind), design system, layout, Dexie DB, demo mode, seed.
2. Phase 3–4: all 17 modules (Dashboard, Products, Purchases, Inward, Barcodes, Inventory, Sales/POS+invoice+returns+cancel, Payments, Repairs, Polishing, Stock audit, Customers, Suppliers, Expenses, Reports + Excel/PDF/print, Users & permissions, Settings).
3. Phase 5: business-rule test suite; fixes for bugs found in browser (StrictMode double-seed, confirm-dialog empty-string bug, POS/invoice overflow, purity dropdown, return round-off).
4. Phase 6–7: GitHub Pages workflow + docs set; REST provider + API contract + MySQL DDL + migration guide.
5. Rebrand to **Samayan Jewellers**; shop name read from Settings everywhere (sidebar/login/title); Settings → Branches (add/rename/remove).
6. **Per-branch stock:** branch on items/ledger/inward/sales/audits; sales bill only from selling branch; Stock Transfers module (dispatch → in transit → receive/cancel); per-branch reconcile; branch scope in dashboard/inventory/alerts/reports; migration for old demo data; docs + 6 tests.
7. This `project-context/` folder + root `CLAUDE.md`.

## Backlog (suggested order)
- [ ] **Unblock push (B1)**, run the Pages workflow, verify the live URL.
- [ ] Extend branch scoping: purchases, payments/cash book, expenses, reports (profit by branch), per-branch invoice numbering (optional).
- [ ] Committed Playwright E2E suite for the 7 workflows (+ axe accessibility run) — currently browser checks were ad hoc.
- [ ] Build the CodeIgniter 4 API from the contract; port `test/workflows.test.ts` as acceptance tests; add `GET /reports/*`, server pagination.
- [ ] Real auth in production mode (cookie/JWT, permissions from server; `can()` to use server list); wire `setUnauthorizedHandler` to logout.
- [ ] Repairs/polishing: show branch; allow assigning repair intake to a branch; cross-branch artisan visibility rules.
- [ ] IGST / interstate sales, e-invoice, TCS/TDS; old-gold exchange; schemes (chit); hallmark/HUID verification.
- [ ] Thermal label printer profiles (TSPL/ZPL), customer display, cash-drawer.
- [ ] Image storage off base64 (production); data export/import tool for pilots.
- [ ] Rename legacy `aurum.*` storage keys / DB name with a proper migration (only if desired).
- [ ] Mobile layout pass on dense screens (POS, inward grid); print checks on real printers.

## Known issues / limitations
* Demo data is per-browser IndexedDB; role switcher is NOT authentication.
* Dashboard/report money figures are computed client-side; purchases/payments/expenses are shop-wide (not per branch).
* Camera scanning needs HTTPS/localhost + hardware (untested); print layouts only checked on screen.
* `GITHUB_PAGES_DEPLOYMENT.md` custom-domain section assumes root hosting (`VITE_BASE_PATH=/`).
* `inventory?tab=summary` only reads the tab param on first mount.

## Decision log (why things are the way they are)
| Decision | Reason |
|---|---|
| Commands, not CRUD-only repositories | Workflows are multi-table transactions; keeps business rules out of the UI and makes the production switch a 1:1 port |
| One stock choke-point + append-only ledger | Auditability, reconciliation, rules 5/9/10/15 |
| Per-piece StockItem | Rule 1; barcode = one physical item |
| decimal.js everywhere | No float drift (tested) |
| Allocation-based payments | Split payments, advances, supplier payments, one ledger |
| Seed through real commands | Consistent demo data; seed doubles as a test |
| HashRouter + relative/`VITE_BASE_PATH` base | GitHub Pages sub-paths without server rewrites |
| Branch = location of the piece (not a tenant) | Simple per-branch stock with transfers; money not yet per branch |
| `logimax-design` skill playbook says no React/Tailwind **inside the eTail repo**; this is a separate project with React/Tailwind mandated by the brief | Brief wins here; the playbook's usability principles were applied |

## Verification record
* 2026-11-13: tsc 0 errors; vitest 39 passed; `vite build` OK (also with `VITE_BASE_PATH=/jewellery-erp/`, served at that path: assets 200, hard refresh on deep hash route OK, no console errors; sweep of 30 routes clean).
* Browser (Chrome + Playwright CLI): login, dashboard, POS end-to-end, purchase→inward→approve flow, Settings branches, transfers receive, branch-wise inventory (Main 70 + Branch 2 7 = 77 available).

## Session log
| Date | Summary |
|---|---|
| 2026-11-13 | Built the whole app (phases 1–7), rebrand, branches, per-branch stock & transfers, docs, tests; push blocked by 403; created this context folder. |
