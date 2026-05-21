# Roadmap — 0.1.0 → 1.0.0

Sequenced so the **engine is correct and tested before any UI is built on it**. Each phase ends shippable.

## Phase 0 — Scaffold (foundation)
- Stand up monorepo (workspaces), Vite + React 18 + TS strict, ESLint/Prettier, Vitest.
- CI: lint + typecheck + test + build on PR (#2).
- Migrate legacy localStorage keys / document the old data shape.
- **Exit:** green CI on an empty app; `pnpm dev` runs the SPA shell.

## Phase 1 — Engine (correctness first)
- Implement `@rpe/engine`: loan + amortization, all corrected screener metrics, validation/clamping.
- **Golden-number tests** (#17): hand-verified fixtures (incl. 0% interest, 100% down, $0 price, decimals #54). This is where the math gets *proven*, not eyeballed.
- **Exit:** 100% of screener formulas covered; known-good deal reproduces expected outputs.

## Phase 2 — SPA screener (replace the old app)
- `@rpe/ui` controlled inputs + results; pass/fail directions wired per-metric.
- Reset works repeatably (#50); decimals (#54); edge cases render "—" not NaN.
- `Intl.NumberFormat`; responsive layout; tooltips with real formula text.
- **Exit:** feature-parity with old beta, but correct — this is the de facto 1.0.0-rc for the screener.

## Phase 3 — Scenarios + share + export
- Multiple named saved deals; compare 2–4 side-by-side.
- URL share (#53); CSV + PDF export (#49).
- **Exit:** full single-user deal workflow.

## Phase 4 — Pro-forma mode
- Multi-year projection, amortization chart (#18/#3), depreciation/tax, IRR/NPV, exit modeling, equity multiple.
- Screener⇄pro-forma toggle; advanced inputs progressively disclosed.
- **Exit:** serious analysis tool; charts render; IRR validated against spreadsheet.

## Phase 5 — WordPress block
- `apps/wp-block` Gutenberg block mounting `@rpe/ui`; WPCS/Plugin Check-clean PHP; i18n.
- **Exit:** block embeds in a WP page and runs the same engine.

## Phase 6 — Polish + launch (true 1.0.0)
- SEO (#46) + gated ad slots (#47) on SPA; a11y pass; perf budget.
- Optional thin calc API (#56/#48) — engine already headless.
- Tag **v1.0.0**, write release notes, deploy.

## Dependency order
`Phase 0 → 1` hard blocks everything. `2,3` sequential. `4,5` parallelizable after `2`. `6` last.
