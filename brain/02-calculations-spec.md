# Calculations Spec (1.0.0)

All formulas use a single canonical unit convention: **store every input in a known unit; derive monthly/annual explicitly.** No magic constants.

## Input model (normalize on entry)

- Currency inputs stored in dollars. Each recurring expense carries an explicit period flag (`monthly`|`annual`) shown in the UI — kills the Insurance/Taxes/HOA ambiguity.
- Rates stored as percent (e.g. `4.5`), converted to decimal (`/100`) at point of use.
- Loan term stored in years; months = `years * 12`.

## Core loan math (foundation — everything depends on this)

```
r            = annualInterestRate / 100 / 12          // monthly rate
n            = loanTermYears * 12                       // payments
loanAmount   = (purchasePrice + (rollClosingCosts ? closingCosts : 0)) * (1 - percentDown/100)

// Monthly P&I — with 0% guard
mortgagePayment = r === 0
  ? loanAmount / n
  : loanAmount * (r * (1+r)**n) / ((1+r)**n - 1)
```

**Amortization schedule** (drives correct interest, principal, and balance over time):
```
for each month m in 1..n:
  interest_m   = balance * r
  principal_m  = mortgagePayment - interest_m
  balance      = balance - principal_m
totalInterest  = Σ interest_m            // replaces the fabricated TotalInterestPaid*
```

## Corrected existing metrics

| Metric | Correct formula | Pass direction |
|--------|-----------------|----------------|
| Effective Gross Income (EGI) | `(grossRent + otherIncome) * (1 - vacancy%)` | — |
| Operating Expenses (OpEx) | sum of all expenses **excluding** debt service & CapEx reserve* | — |
| NOI (annual) | `EGI_annual - OpEx_annual` | higher |
| Cap rate | `NOI_annual / purchasePrice * 100` | higher (threshold cfg) |
| Cash flow (monthly) | `NOI_monthly - mortgagePayment_monthly` | higher |
| Cash-on-cash ROI | `cashFlow_annual / totalCashInvested * 100` | higher |
| DSCR | `NOI_annual / annualDebtService` | higher (≥1.25) |
| **GRM** | `purchasePrice / grossRent_**annual**` | **lower** (fix inverted threshold) |
| 1% rule | `grossRent_monthly / purchasePrice * 100` | higher (≥1) |
| Total cash invested | `downPayment + closingCosts(if not rolled) + rehab` | — |
| Total loan amount | see loan math above | — |

\* *CapEx treatment is a documented toggle: include as reserve (conservative, default) or exclude from NOI (lender convention). Surface the choice instead of hardcoding.*

## New calculations

### Screener tier (cheap, instant)
- **PITI** (real): `mortgageP&I + (taxes + insurance)/12 + HOA/12` — what the bank underwrites.
- **Break-even occupancy %**: `(OpEx_monthly + debtService_monthly) / grossPotentialRent_monthly * 100`. The single most useful risk number — "how empty can it get before I bleed."
- **Expense ratio**: `OpEx_annual / EGI_annual * 100` (lower better; sanity-check vs 35–45% norm).
- **Price per unit / per sqft**: `purchasePrice / units`, `purchasePrice / sqft`.
- **Rent-to-value (monthly)**: the 1% rule generalized + **Gross yield**: `grossRent_annual / purchasePrice * 100`.
- **LTV**: `loanAmount / purchasePrice * 100`.
- **Debt yield** (lender metric): `NOI_annual / loanAmount * 100`.
- **50% rule sanity check**: flag if modeled OpEx deviates hard from `0.5 * EGI`.

### Pro-forma tier (multi-year, opt-in)
- **Amortization schedule + chart** (issue #18/#3): balance, cumulative interest vs principal.
- **Multi-year projection**: rent growth %, expense growth %, appreciation % → year-by-year cash flow, equity, and return.
- **Depreciation & tax**: `(purchasePrice - landValue) / 27.5` (US residential), taxable income after depreciation & interest, after-tax cash flow at a configurable marginal rate.
- **Equity build / loan paydown** per year (from schedule).
- **Exit / sale modeling**: projected sale price (appreciation), selling costs %, remaining balance → net sale proceeds; **total profit** = cumulative cash flow + net proceeds − initial investment.
- **IRR** (real): solve for rate where NPV of `[−initialInvestment, CF₁..CFₙ₋₁, CFₙ + netSaleProceeds] = 0` (Newton/bisection).
- **NPV** at a configurable discount rate.
- **Equity multiple**: `(totalCashFlow + netSaleProceeds) / initialInvestment`.
- **Average annual return / annualized ROI** over hold period.

## Validation / edge cases (enforced in engine, surfaced in UI)
- `purchasePrice <= 0` → metrics depending on it return `null` (render "—"), not Infinity/NaN.
- `percentDown` clamped 0–100; `100%` ⇒ no loan ⇒ DSCR/mortgage are `null`/N/A.
- `0%` interest ⇒ linear amortization (no div-by-zero).
- Vacancy/expense % clamped 0–100; decimals allowed (#54).
- Empty input ⇒ treated as 0 with a visible hint, never `NaN`.
- All money formatting via `Intl.NumberFormat`; negatives render correctly (parentheses or `-$`).
