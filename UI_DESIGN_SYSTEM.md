# UI design system

**Direction:** premium, restrained enterprise UI for a jewellery counter — warm neutrals, champagne-gold accent, serif display headings, dense
right-aligned tables. Functionality first; no decorative gradients/glass, no oversized cards, motion limited to 180 ms fades.

> Design-skill note: the installed `logimax-design` skill routes ERP work to its *web-app/ERP* playbook, whose rules are written for the existing
> Bootstrap-based eTail repo and say not to introduce Tailwind/React there. This is a **new standalone project** with React + Tailwind explicitly
> specified, so that stack choice follows the project brief; the playbook's *principles* were applied: dense data tables with numbers right-aligned,
> weights 3 dp / money 2 dp (Indian grouping), no `NaN/undefined` in the DOM (verified), loading/error/empty states everywhere, every async action has an
> error path, permissions enforced beyond hiding UI, verification in a real browser at localhost.

## Tokens (`src/styles/index.css`, Tailwind v4 `@theme`)
| Token | Value | Use |
|---|---|---|
| `canvas` | `#f6f4ef` | app background (warm stone) |
| `surface` | `#ffffff` | cards, tables |
| `line` / `line-strong` | `#e8e3d9` / `#d6cfc0` | borders / inputs |
| `ink` / `ink-2` / `muted` / `faint` | `#1c1917` / `#44403c` / `#78716c` / `#a8a29e` | text scale |
| `side` / `side-2` | `#15130f` / `#1f1c17` | sidebar |
| `gold-50…700` | `#faf6ec … #6f5426` (accent `gold-400 #c9a45c`, action `gold-500 #b08a3e`) | active nav, key CTA, charts, focus ring |
| status | `ok #2f7d4f` · `warn #a66a0a` · `bad #b3372f` · `info #2b6aa3` · `violet #6b4fa0` (+ `-bg` tints) | badges, alerts |
Fonts: **Cormorant Garamond** (display: page titles, invoice/brand), **Inter** (UI, tabular numerals for money/weights). Base size 14 px.
Radius 10 px cards / 6 px controls. Focus: 2 px gold outline. `prefers-reduced-motion` respected.

## Layout
* Fixed dark sidebar (≥1024 px) with grouped, permission-filtered navigation; drawer on tablet/mobile.
* Sticky header: global search (barcode/item/product/customer/invoice), Quick actions, notifications (derived alerts), branch selector, user menu with **demo role switcher**, DEMO/PRODUCTION badge.
* Content max-width 1480 px. Page header = serif title + one-line subtitle + actions.
* Workflow-specific layouts: **POS** (scan bar + bill table left, sticky customer/totals/payment column right), **Stock audit** (progress bar + always-focused scan field + live result banner), **Inward** (piece-by-piece verification grid with discrepancy flags), **Invoice** (A4 print document).

## Components (`src/components/ui`)
`Button` (primary/gold/secondary/ghost/danger, loading) · `Input/Select/Textarea/Field` (label, hint, error, required) · `Bare` (dense in-table controls) ·
`DataTable` (search, sort, pagination 10–100/All, footer totals, loading/error/empty, keyboard row activation) · `Modal` + promise-based `useConfirm()` (optional required reason) ·
`Toast` (success/error/info, aria-live) · `Badge/StatusBadge/Notice/Spinner/EmptyState/ErrorState` · `Card/PageHeader/Stat/Tabs/KV`.
Domain components: `BarcodeImage` (CODE128 SVG), `ScanInput` (USB wedge + camera + manual), `Label` (3 label sizes), `PaymentDialog` (allocation), `ItemDetail`.

## Patterns
* **Numbers:** `.num` = right-aligned tabular; weights `fmtW` (3 dp), money `fmtNum/fmtMoney` (en-IN grouping, 2 dp).
* **Status colours:** green available/completed · amber pending/reserved/returned · blue assigned/in-progress/repair · violet polishing · red damaged/missing/cancelled.
* **Destructive/irreversible actions** always go through `useConfirm` and (for cancellations/rejections) require a reason that is stored.
* **Errors never silent:** commands surface `BusinessError`/`ApiError` text in a toast; forms show field errors (Zod).
* **Charts:** single gold hue for magnitude, neutral/ink for secondary series, direct labels + tooltips, `role="img"` with text alternative.
* **Print:** `.no-print` hides chrome; `.print-area` is the document (invoice, labels, reports).
* **Responsive:** tables scroll horizontally inside their card; forms collapse to 1–2 columns; dialogs become bottom sheets on phones.

## Accessibility
Labelled controls, `aria-sort` on sortable headers, `role=dialog aria-modal` with Escape and focus return, visible focus, colour never the only status cue
(badges carry text), live regions for toasts. Known gaps: no automated axe run committed; dense POS table is best on ≥1024 px.
