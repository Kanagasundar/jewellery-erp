# CLAUDE.md — Samayan Jewellers ERP

**Start here:** read `project-context/CONTEXT.md` (architecture, conventions, gotchas, commands) and `project-context/TRACKER.md` (current status, blockers, backlog, decision log). Update the tracker at the end of each session.

Quick rules:
- UI talks only to `erp` (`src/services/index.ts`); business operations are commands (`erp.commands.*`), each one transaction. Stock status/weight/branch changes go only through `moveItem()` (writes the ledger).
- Money/weights: decimal.js helpers only (money 2 dp, weight 3 dp). Permissions: `src/domain/permissions.ts`.
- Done = `npx tsc --noEmit` clean, `npx vitest run` green (run from PowerShell with a `D:\` path on Windows), `npm run build` ok, UI checked in a real browser, docs + tracker updated.
- Org rule: Logimax work only; never ask for or store client passwords/secrets. No secrets in `VITE_*`.
- Don't push/commit unless asked; GitHub push currently blocked (see tracker B1).
