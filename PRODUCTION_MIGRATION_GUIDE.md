# From demo to a real ERP

The UI only talks to `src/services/index.ts → erp` (a `DataProvider`). Demo = IndexedDB provider; production = REST provider.
**What changes is the data provider, environment configuration and a real backend — the screens and workflows stay.**

## 0. Be clear about what the demo is not
| Demo (IndexedDB) | Production needs |
|---|---|
| One browser, one user | Multi-user, shared server database |
| Role picker, no passwords | Server-side authentication + authorization on every endpoint |
| Rules enforced in the browser | Same rules enforced in the API (the browser can be tampered with) |
| Data lost if site data is cleared | Backups, point-in-time recovery |
| No real audit guarantees | Immutable server-side ledger/audit log |

## 1. Backend (CodeIgniter 4 + MySQL)
1. Create the schema from [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) as CI4 migrations; seed roles/permissions **from `src/domain/permissions.ts`**.
2. Implement the endpoints in [API_DOCUMENTATION.md](API_DOCUMENTATION.md). Port the logic 1:1 — the reference implementation is
   `src/repositories/indexeddb/commands/*.ts` (read them as the specification) and `src/domain/calculations/pricing.ts` (port to PHP with bcmath).
3. Mirror `moveItem()` as a single `StockService::move()`; wrap each command in `$db->transStart()`; lock rows with `SELECT … FOR UPDATE` when selling/receiving.
4. Port the test suite: every `it(...)` in `src/test/workflows.test.ts` is an executable acceptance test for the API (same inputs, same expected outcomes).
5. Filters/middleware: JWT/cookie auth → permission check per route → rate limit → audit logging.
6. Enable CORS for the exact GitHub Pages / production origin (not `*`); HTTPS only.

## 2. Frontend configuration
```env
VITE_APP_MODE=production
VITE_API_BASE_URL=https://api.yourshop.com/api/v1
VITE_BASE_PATH=/            # or /REPO/ on GitHub Pages
```
Set these as build-time values (GitHub: edit the `env:` block of `.github/workflows/deploy.yml`, or use repository *Variables* — **never** Secrets in a
static bundle; anything in `VITE_*` is public). No DB credentials or API keys belong in the frontend.

Behaviour changes automatically:
* `erp` becomes `apiProvider`; `bootstrap()` no longer seeds.
* Login screen shows an email/password form; the demo role picker and *Reset demo data* disappear, and the badge reads PRODUCTION.
* `401` responses call the handler registered with `setUnauthorizedHandler` (`repositories/api/client.ts`); register it in `auth.tsx` to log out and return to the login screen automatically.

## 3. Authentication transition
| | Demo | Production |
|---|---|---|
| Identity | `localStorage` user id | HttpOnly+Secure+SameSite cookie (preferred) or short-lived bearer token in memory |
| Roles | `ROLE_PERMISSIONS` in the bundle | Same matrix **loaded from the server** (`/auth/me` should also return `permissions[]`; update `can()` to use it) |
| Passwords | none | argon2id hashes, throttling, reset flow, optional 2FA for admins |

## 4. Data migration (IndexedDB → MySQL)
Demo data is sample data and should normally be **discarded**. If a real pilot was run on the demo and must be kept:
1. In the browser: export each Dexie store (`db.<table>.toArray()`) to a JSON file (add a small export button on the Settings page for this).
2. Write a CI4 `spark` command that reads the JSON, maps UUIDs → new integer ids (keep a mapping table), and inserts in dependency order
   (masters → parties → products → purchase orders → inwards → stock items → barcodes → sales → payments → …).
3. **Replay the ledger**, do not copy balances: after import run `GET /stock/reconcile`; it must return `ok:true`.
4. Freeze the demo (stop using it) during cut-over.

## 5. Hosting requirements
* PHP 8.1+, MySQL 8 / MariaDB 10.6+ (InnoDB), `bcmath`, `intl`, `mbstring`; nginx/Apache with HTTPS.
* Daily `mysqldump --single-transaction` + binary logs; test a restore monthly. Store backups off-server.
* Server clock in UTC; timezone display handled by the frontend.
* Logging/monitoring (PHP-FPM, MySQL slow query log), unattended security updates.
* Image uploads (product/repair photos): store files on disk/S3 and save paths — the demo's base64 data-URLs must not go to MySQL.

## 6. Hardening checklist before go-live
- [ ] Every endpoint authorises by permission, server-side
- [ ] Prices/totals recomputed server-side (never trust client numbers)
- [ ] Idempotency keys on `POST /sales` and `/payments` (double-click / retry safety)
- [ ] DB user cannot UPDATE/DELETE `stock_ledger` or `audit_logs`
- [ ] Rate limiting + lockout on login; password policy; admin 2FA
- [ ] CORS locked to the real origin; CSP headers on the static host
- [ ] Server-side pagination/filters; report endpoints for large data
- [ ] Backup + restore drill completed
- [ ] Vulnerability review; dependency audit (`npm audit`, `composer audit`)
- [ ] Branch (`branch_id`) dimension added if more than one shop will be used
- [ ] GST compliance reviewed with your CA (IGST, e-invoicing, TCS/TDS on bullion, HUID rules)

## 7. Suggested rollout
Pilot in one shop alongside the existing process for 2–4 weeks → daily stock reconcile + cash tally → cut over → retire the old process.
