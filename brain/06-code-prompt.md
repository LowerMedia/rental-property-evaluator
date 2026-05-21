# Handoff Code Prompt (Phase 0 + Phase 1)

Self-contained prompt for Codex/Copilot/a junior dev. Hand over with `02-calculations-spec.md` and `03-architecture-1.0.0.md` attached.

---

You are rebuilding the LowerMedia **Rental Property Evaluator** (currently a broken React 17 / CRA 4 beta) into a maintainable 1.0.0. Do **Phase 0 (scaffold)** and **Phase 1 (calc engine)** only. Do not build UI yet.

**Context:** The old app's `main` doesn't compile and its calc engine has fabricated formulas (arbitrary `0.00001` interest factors, unit mismatches). We are extracting a pure, framework-agnostic TypeScript calculation engine and proving it with tests *before* any UI is built on it.

**Stack:** pnpm workspaces, TypeScript (strict), Vitest. No React in the engine package.

**Tasks:**

1. Scaffold a monorepo:
   ```
   packages/engine/{src,tests}
   apps/web        # placeholder Vite+React18+TS app, leave empty for now
   .github/workflows/ci.yml
   ```
   Root `package.json` with workspaces. ESLint + Prettier + TS strict. CI runs `lint`, `typecheck`, `test`, `build` on PR.

2. Implement `packages/engine` exactly to the contract in `03-architecture-1.0.0.md` (`DealInputs`, `evaluate(inputs, {mode})`) and the formulas in `02-calculations-spec.md`:
   - `loan.ts`: `monthlyPayment()` with a **0% interest linear fallback** (no div-by-zero); `amortizationSchedule()` returning per-month `{interest, principal, balance}` and `totalInterest`.
   - `screener.ts`: EGI, OpEx, NOI, cap, monthly cash flow, cash-on-cash, DSCR, **GRM (annual rent)**, 1% rule, PITI, break-even occupancy, expense ratio, LTV, debt yield, $/unit, $/sqft.
   - `finance.ts`: pure `pmt()`, `npv(rate, cashflows)`, `irr(cashflows)` (Newton with bisection fallback).
   - `validate.ts`: clamp `percentDown` 0–100, vacancy/expense % 0–100; coerce empty→0; allow decimals.
   - Every result is `number | null`; return `null` (not NaN/Infinity) when undefined — e.g. `purchasePrice<=0`, `percentDown===100` (no loan ⇒ DSCR/mortgage null).
   - Each screener metric exposes `{ value, direction: 'higher'|'lower', threshold }` so the UI can render pass/fail generically (the old code hardcoded "higher is better", breaking GRM).

3. **Tests (`vitest`) — this is the deliverable that matters.** Golden-number fixtures, hand-verified:
   - Baseline deal (price 100000, 20% down, 4.5%/30yr, rent 1000) → assert monthly P&I, NOI, cap, DSCR, cash-on-cash, GRM, break-even.
   - Edge cases: 0% interest (linear), 100% down (no mortgage), price 0 (nulls), decimal rate 4.625%, vacancy 100%.
   - `irr()` validated against a known spreadsheet IRR to 4 dp.

**Conventions:** WordPress/Laravel repos at LowerMedia use conventional commits and atomic commits — follow that here too (`feat:`, `fix:`, `test:`, `chore:`). Do not add AI/co-author attribution to commits. Lint-clean, TS-strict, no `any`.

**Definition of done:** `pnpm -w test` green with the fixtures above; `pnpm -w build` builds the engine; CI passes on a PR. No UI, no DOM, no React in `packages/engine`.

---

> Phase 2+ (UI, scenarios, pro-forma, WP block) get their own prompts once the engine is locked.
