# Changelog

All notable changes to the Rental Property Evaluator are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions.  
Versioning: [SemVer](https://semver.org/) — `MAJOR.MINOR.PATCH`.

---

## [1.2.0] — 2026-06-07

### Added
- **WordPress Gutenberg block** (`apps/wp-block`) — self-contained IIFE bundle that
  mounts the full `<Evaluator />` SPA into any WordPress page via the `rpe/evaluator`
  block. WPCS/Plugin Check-clean PHP wrapper with `render_callback` and i18n scaffolding
  (RPE-36, RPE-37).
- **SEO / Open Graph** (`apps/web`) — `<title>`, `<meta description>`, OG tags, Twitter
  card, WebApplication schema.org structured data, `<noscript>` prerender, and canonical
  URL driven by `VITE_APP_ORIGIN` (RPE-38).
- **Gated ad slots** — `AdConfig` prop on `<Evaluator />` exposes optional header/footer
  ad slots; renders nothing unless the host passes a config (RPE-39).
- **Thin HTTP evaluation API** (`apps/api`) — Node.js HTTP server exposing
  `POST /v1/evaluate` with full input validation (`Object.hasOwn`, typed shape checks,
  finite-number guards, `DealExpenses` two-category model) and `GET /v1/health` (RPE-40).

### Changed
- **A11y hardening** — all interactive SVG charts (`AmortizationChart`, `CashFlowChart`,
  `EquityBuildChart`) now carry `role="img"`, `aria-labelledby`, `<title>`, and a
  redundant `aria-label` fallback. `useId()` generates per-instance collision-safe IDs
  for multi-block WordPress pages (RPE-41).
- **Keyboard focus ring** — unified amber `outline` applied via `!important` unlayered
  CSS rule; eliminates browser-default blue ring and double-indicator regressions from
  Tailwind utility overrides (RPE-41).
- **Perf budget** — React + ReactDOM split into a separate `vendor-react` chunk (~143 kB
  raw / 46 kB gzip). Per-chunk size warning limit set to 250 kB. Google Fonts preconnect
  hints added to `index.html` (RPE-41).

### Fixed
- API `readBody` hang on client abort; `beforeAll` error wiring in tests (RPE-40).
- Expense validation incorrectly rejected valid `capExPct` / `maintPct` / `mgmtPct` /
  `miscPct` numeric fields (RPE-40).
- Error messages now fully-qualify each invalid key (`inputs.expenses.taxes`) instead of
  emitting a misleading dotted-path string (RPE-40).
- `@types/node` pinned to `^20.0.0` repo-wide via `pnpm.overrides` to match the Node 20
  runtime target (RPE-40).

---

## [1.1.0] — 2026-05-31

### Added
- **Pro-forma mode** — full screener ↔ pro-forma toggle in the UI (RPE-35). Activating
  pro-forma reveals a multi-year hold-projection panel driven by configurable rent growth,
  expense growth, and appreciation rates.
- **Multi-year projection engine** — `packages/engine` exports `projectHold()` computing
  annual NOI, debt service, net cash flow, property value, loan balance, and equity for
  hold periods up to 30 years (RPE-29).
- **Depreciation + after-tax cash flow** — straight-line 27.5-year depreciation, marginal
  tax rate input, and after-tax net cash flow per projection year (RPE-32).
- **IRR / NPV / equity multiple** — `packages/engine` computes internal rate of return,
  net present value against a configurable hurdle rate, and equity multiple across the
  full hold period (RPE-33).
- **Exit / sale modeling** — sale proceeds, closing cost deduction, and total profit
  (equity + cumulative net CF) at end of hold (RPE-34).
- **Amortization panel** — collapsible panel with per-year principal/interest breakdown,
  paginated table, and SVG stacked bar chart with principal-crossover marker (RPE-30).
- **Cash flow chart** — grouped SVG bars (NOI / Debt Svc / Net CF) per hold year (RPE-31).
- **Equity build chart** — property value vs. loan balance line chart with shaded equity
  fill and end-of-hold equity label (RPE-31).

---

## [1.0.0] — 2026-05-25

### Added
- **Monorepo scaffold** — pnpm workspaces (`packages/*`, `apps/*`). Vite, React 18,
  TypeScript strict mode, ESLint 9 flat config, Prettier, Vitest. GitHub Actions CI
  (lint + typecheck + test + build) (RPE-8, RPE-9, RPE-11).
- **Calc engine** (`packages/engine`) — typed `DealInputs` / `DealResults` / `DealExpenses`
  schema; input normalization, EGI, OpEx, NOI, cap rate, DSCR, CoC, PITI, GRM, and
  12+ supplementary screener metrics (LTV, debt yield, break-even, expense ratio, 50% rule,
  $/unit, $/sqft). Pass/fail direction model. 63 golden-number regression tests (RPE-12–
  RPE-16).
- **Loan + amortization** (`packages/engine`) — monthly payment, full amortization schedule,
  0 % interest guard. 24 property tests (RPE-13).
- **Evaluator SPA** (`packages/ui`, `apps/web`) — controlled-input form, real-time results
  panel with pass/fail colour coding and score card, dark-mode "Midnight Ledger" theme
  (Cormorant Garamond / Barlow / JetBrains Mono), responsive layout (RPE-19–RPE-23).
- **Scenario comparison** — up to 4 named scenarios side-by-side with diff highlighting
  (RPE-25).
- **Saved deals** — versioned localStorage CRUD with named deal management (RPE-24).
- **URL share** — base64-encoded deal state in query param for shareable links (RPE-26).
- **CSV export** — all screener metrics exported as comma-separated values (RPE-27).
- **Print / PDF** — `@media print` stylesheet swaps to a light theme and single-column
  layout; no JS required (RPE-28).
- **Legacy migration shim** — reads and discards pre-monorepo localStorage shape (RPE-10).
