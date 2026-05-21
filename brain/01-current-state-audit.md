# Current State Audit (v0.1.0)

Severity: **P0** breaks the build/correctness, **P1** wrong results/UX, **P2** quality/debt.

## Build / correctness (P0)

- **Main doesn't compile.** `RentalPropertyEvaluator.js:43` → `RPECalc.[key](this.state)` is invalid syntax (`.` before `[`). Should be `RPECalc[key](state)`.
- **Interest formulas are fabricated.** `RPECalc.js:32-34` `TotalInterestPaidMonthly = PurchasePrice * (InterestRate * 0.00001)` and `:36-38` `TotalInterestPaidYearly = 12 * (PurchasePrice * (InterestRate * 0.0001))`. Two different magic constants that don't even agree with each other (monthly×12 ≠ yearly), and neither is a real interest calculation. Interest must be derived from the amortization schedule on the loan balance.
- **`TotalInterestPaid` unit mismatch.** `:40-42` multiplies a *monthly* interest figure by `LoanTerm` (years, e.g. 30) instead of months. Off by 12× even if the monthly figure were correct.
- **`PITI` and `IRR` are stubs.** `:11-17` both return the *same* expression (`YearlyMortgagePayment + Taxes + TotalInterestPaidYearly`). Neither is a valid PITI or IRR. IRR can't be a one-liner — it needs a multi-period cash-flow vector incl. sale proceeds.

## Wrong results / UX (P1)

- **GRM uses monthly rent + inverted pass/fail.** `:24-26` `GrossRentMultiplier = PurchasePrice / TotalMonthlyIncome` (monthly). GRM is conventionally Price / **annual** gross rent. Also lower GRM is *better*, but `ResultsField` marks passing as `value > threshold` (threshold 1), so the green/red light is backwards for GRM.
- **Threshold direction is hardcoded "higher is better".** `RentalPropertyEvaluator.js:141,143` `isPassing = calculated[id] > threshold`. Correct for CoCROI/Cap/DSCR/1%-rule, wrong for GRM (and any future "lower is better" metric like expense ratio, break-even, price-to-rent).
- **`EBDITA` misspelled** (should be EBITDA) and built on the broken interest figure, so the value is wrong even if the concept were right.
- **Income is rent-only.** `TotalMonthlyIncome = MonthlyRent` (`:76-78`) despite the TODO; no other income (parking, laundry, storage, pet rent). Vacancy is treated as an expense line rather than reducing income to **effective gross income** — a convention smell that distorts NOI/cap.
- **Mortgage formula divides by zero at 0% interest.** `:108-110` standard amortization formula has `pow(1+r,...) - 1` in the denominator → `NaN/Infinity` when `InterestRate = 0`. Needs the linear `principal / months` fallback.
- **No input guards.** `PurchasePrice = 0` → div-by-zero in 1%-rule/Cap/GRM (Infinity/NaN render). `PercentDown > 100`, negatives, and empty fields are all accepted. Issue **#54**: decimals are blocked by `checkKeyPress` regex edge cases.
- **Ambiguous expense units.** Insurance/Taxes/HOA/Other are treated as **annual** (divided by 12 in `TotalMonthlyExpenses`) but the labels don't say so. Default `OtherExpense: 1200` reads as monthly to a user. Guaranteed data-entry errors.
- **`TotalExpensesYearly`/`TotalExpensesMonthly`** are flagged "NOT CORRECT" in-code (`:92,96`) and mix annual + monthly-derived figures inconsistently.

## Architecture / debt (P2)

- **Uncontrolled inputs + manual DOM writes.** Inputs use `defaultValue` and the component writes results back via `document.getElementById(id).value = ...` (`RentalPropertyEvaluator.js:60-62,93-98`). This fights React and is the **root cause of "reset only works once" (#50)** — after the first reset the DOM and React state diverge.
- **State mutation.** `handleFieldChange`/`calcAllDynamically` do `const newState = {...prevState}` (shallow) then mutate `newState.changeable[x]` — mutates `prevState` too.
- **`await this.setState(...)`** misunderstands React; `setState` returns `undefined`, the awaits are no-ops.
- **Dependency ordering hack.** `calcAllDynamically(count = 2)` runs the whole calc map **twice** to paper over the fact that calcs read `state.calculated.X` before it's computed, and it reads `this.state` (stale) inside the updater instead of the working copy. A topological/ordered evaluation removes the loop entirely.
- **localStorage stores `calculated`** (derived, recomputable) → can desync/corrupt.
- **Custom `formatCurrency`** (`ResultsField.js`) reimplements comma grouping with brittle modulo logic; breaks on negatives and recomputes "yearly" as `monthly*12` inside the formatter. Replace with `Intl.NumberFormat`.
- **Tests are brittle and wrong.** `App.test.js` reaches into DOM via `Object.keys(...)[1]` and the third test types `200000` but still asserts the `100000` result.
- **EOL toolchain.** CRA 4 (`react-scripts` deprecated), `node-sass` (dead, native-build pain), React 17, `react-router-dom` v5, `html2canvas` + `html2canvas-cors` both pinned.

## Open GitHub issues (12) — disposition

| # | Title | 1.0.0 disposition |
|---|-------|-------------------|
| #56 / #48 | Feature: API / Add API to run calculations | Falls out of engine extraction — engine is callable/headless; optional thin HTTP wrapper |
| #54 | Fix: allow decimal values | Fixed by controlled numeric inputs + validation |
| #53 | Feature: share | URL-share via compact encoded state |
| #50 | Fix: broken state reset | Fixed by controlled inputs (root cause removed) |
| #49 | Feature: export to pdf | Part of export workflow (PDF + CSV) |
| #47 | Add advertising spaces | SPA shell only; slot component, gated |
| #46 | Add SEO | SPA shell: meta/OG, SSR or prerender |
| #18 | Amortization numbers + graph | Pro-forma mode: schedule + chart |
| #17 | Unit tests | Engine is pure fns → high-coverage unit tests |
| #3 | Info/data graphing | Pro-forma charts |
| #2 | CI/CD via GitHub Actions | Lint+typecheck+test+build pipeline |
