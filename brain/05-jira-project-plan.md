# Jira Project Plan — proposed

**Site:** lowermedia.atlassian.net
**Proposed project:** `Rental Property Evaluator` — key **`RPE`** (type: Team-managed, Software/Kanban)
**Fix Versions:** `v0.9-engine`, `v0.95-spa`, `v1.0.0`

Epics map to roadmap phases. Stories carry the GitHub issue # where one exists. Estimates are T-shirt (S/M/L) pending kickoff sizing.

## EPIC RPE-E0 — Project scaffold & CI  (Phase 0)
- RPE: Stand up monorepo (workspaces) + Vite/React18/TS strict — M
- RPE: ESLint/Prettier/Vitest config — S
- RPE: GitHub Actions CI (lint+typecheck+test+build) — *[GH #2]* — M
- RPE: Legacy localStorage shape doc + migration shim — S

## EPIC RPE-E1 — Calc engine (correctness)  (Phase 1)
- RPE: `@rpe/engine` types + input normalization/validation — M
- RPE: Loan payment + amortization schedule (0% guard) — M
- RPE: Screener metrics — corrected cap/NOI/DSCR/CoC/PITI — L
- RPE: Fix GRM (annual rent) + pass/fail **direction** model — S
- RPE: New screener metrics (break-even, expense ratio, debt yield, LTV, $/unit) — M
- RPE: Golden-number unit tests — *[GH #17]* — L
- RPE: Decimal input handling — *[GH #54]* — S

## EPIC RPE-E2 — SPA screener UI  (Phase 2)
- RPE: `@rpe/ui` controlled inputs (no DOM writes) — L
- RPE: Results panel + per-metric thresholds/tooltips — M
- RPE: Fix reset (root-cause removed) — *[GH #50]* — S
- RPE: `Intl.NumberFormat` + edge-case "—" rendering — S
- RPE: Responsive layout / a11y baseline — M

## EPIC RPE-E3 — Scenarios, share, export  (Phase 3)
- RPE: Multiple named saved deals (versioned localStorage) — M
- RPE: Compare 2–4 scenarios side-by-side — M
- RPE: URL share (encoded state) — *[GH #53]* — M
- RPE: CSV export — S
- RPE: PDF export (print pipeline) — *[GH #49]* — M

## EPIC RPE-E4 — Pro-forma mode  (Phase 4)
- RPE: Multi-year projection (rent/expense/appreciation growth) — L
- RPE: Amortization numbers + graph — *[GH #18]* — M
- RPE: Info/data graphing — *[GH #3]* — M
- RPE: Depreciation + after-tax cash flow — M
- RPE: IRR / NPV / equity multiple — L
- RPE: Exit/sale modeling + total profit — M
- RPE: Screener⇄pro-forma toggle (progressive disclosure) — M

## EPIC RPE-E5 — WordPress block  (Phase 5)
- RPE: Gutenberg block mounting `@rpe/ui` — L
- RPE: WPCS/Plugin Check-clean PHP wrapper + i18n — M

## EPIC RPE-E6 — Launch  (Phase 6)
- RPE: SEO meta/OG + prerender — *[GH #46]* — M
- RPE: Gated ad slots — *[GH #47]* — S
- RPE: Optional thin calc API — *[GH #56, #48]* — M
- RPE: a11y + perf budget pass — M
- RPE: Tag v1.0.0 + release notes + deploy — S

## Status / blocker (2026-05-20)

- **Decision:** migrate all 12 GitHub issues into Jira and **close** them on GitHub, tagged `0.0.1-beta` (superseded by the 1.0.0 refactor). Jira `RPE` is source of truth.
- **Blocker:** the connected Atlassian MCP is only authorized for `mmdbsolutions.atlassian.net` (MMDB **client** tenant). `lowermedia.atlassian.net` is **not** granted. Per tenant-isolation rule, no RPE issues were created — must not write LowerMedia work into a client tenant.
- **Also:** the MCP cannot create a Jira *project*, only issues into an existing one. The empty `RPE` project must be created in the Jira UI first.
- **Unblock path:** (1) create empty `RPE` project in Jira; (2) authorize the Atlassian connector for `lowermedia.atlassian.net` and I'll create epics/stories directly, **or** import `rpe-jira-import.csv` via Jira's CSV importer; (3) run `close-github-issues.sh` to close the GitHub issues.

## Open question for kickoff
- Mirror these as Jira issues **and** keep GitHub issues, or migrate GitHub issues → Jira and close them with a pointer? (Recommend: Jira is source of truth; close GH issues referencing RPE-keys.)
