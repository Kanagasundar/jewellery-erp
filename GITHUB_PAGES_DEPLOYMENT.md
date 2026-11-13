# Deploying to GitHub Pages

GitHub Pages hosts **static files only** (no PHP, CodeIgniter or MySQL). The demo is fully static: data lives in the visitor's browser
(IndexedDB), so it works without any server.

What the repo already contains:
* `vite.config.ts` — `base` comes from `VITE_BASE_PATH` (falls back to a relative `./`, which also works at any sub-path).
* `HashRouter` — URLs look like `https://USER.github.io/REPO/#/sales`; refresh/deep links never 404.
* `.github/workflows/deploy.yml` — test → build → upload `dist` → deploy with the official Pages actions.
* `public/.nojekyll` (copied into `dist`) and `.env.example`.

## 1. Create the GitHub repository
1. GitHub → **New repository** → name it, e.g. `jewellery-erp` (any name; the workflow reads it automatically). Keep it empty (no README).
2. Public repos get free Pages. Private repos need a paid plan for Pages.

## 2. Push from VS Code
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY-NAME.git
git push -u origin main
```
(or use VS Code *Source Control → Publish to GitHub*). `node_modules`, `dist` and `.env` are git-ignored; commit `package-lock.json`
(the workflow uses `npm ci`).

## 3. Configure Pages (one time)
Repository → **Settings → Pages → Build and deployment → Source: _GitHub Actions_**.

## 4. Run the workflow
* Every push to `main` deploys automatically.
* Manual run: **Actions → Deploy to GitHub Pages → Run workflow**.

## 5. Find the URL
`https://USERNAME.github.io/REPOSITORY-NAME/` — also shown on the finished workflow run (*deploy* job → `github-pages` environment) and in Settings → Pages.

## 6. Updating the app
Commit and push to `main`; the workflow rebuilds. Visitors' demo data persists across updates (same IndexedDB name). If you change the
IndexedDB schema, add a new Dexie `version(n)` with an upgrade path (see `repositories/indexeddb/db.ts`) or users will need *Settings → Reset demo data*.

## 7. Changing the repository name / base path
The workflow passes `VITE_BASE_PATH=/<repo-name>/` automatically, so renaming the repo needs **no code change** — just push again.
For a local sub-path test: `VITE_BASE_PATH=/jewellery-erp/ npm run build && VITE_BASE_PATH=/jewellery-erp/ npm run preview`.
For a user/organisation site (`USER.github.io`) or a custom domain at the root, use `VITE_BASE_PATH=/` (relative base).

## 8. Custom domain
1. Settings → Pages → **Custom domain** → enter e.g. `erp.yourshop.com` → Save. (For Actions-based deployments the domain is stored in the repository settings; no `CNAME` file is required.)
2. DNS: `CNAME erp → USERNAME.github.io` (apex domains use the four GitHub `A` records).
3. Tick **Enforce HTTPS** (needed for camera barcode scanning).
4. Set `VITE_BASE_PATH=/` for the build (edit the workflow `env` line) since the site now lives at the domain root.

## 9. Troubleshooting
| Symptom | Fix |
|---|---|
| Workflow fails at **Deploy** with "Pages not enabled / not found" | Settings → Pages → Source must be *GitHub Actions*. Re-run. |
| `npm ci` fails: lockfile out of sync | Run `npm install` locally, commit the updated `package-lock.json`. |
| Build step fails with TypeScript errors | Run `npm run build` locally; fix errors (the build runs `tsc`). |
| `npm test` step fails | Run `npm test` locally (PowerShell on Windows). Fix or investigate the failing rule — don't skip it. |
| Blank page, console shows 404 for `/assets/...` | Base path wrong. Ensure the build ran with `VITE_BASE_PATH=/<repo>/` (the workflow does) or use the default relative base. |
| 404 on refresh of a deep link | Use the `#/` URL form (HashRouter). Links without `#` are not supported on Pages. |
| Old version still shows | Hard refresh (Ctrl+Shift+R); Pages caches for ~10 minutes. |
| Fonts blocked | Google Fonts is loaded from the CDN; offline/blocked networks fall back to system fonts. |
| "Repository not found" when pushing | Check the remote URL and that you are signed in (`gh auth login` or VS Code GitHub sign-in). |

## 10. Verification performed
`npm run build` succeeds; the `dist` output was served under `/jewellery-erp/` and checked in a real browser: all assets return 200,
a hard refresh on `#/inventory` works, and no console errors occur.
