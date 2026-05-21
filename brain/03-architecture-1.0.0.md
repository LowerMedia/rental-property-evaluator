# Architecture — 1.0.0

## Principle: pure engine, dumb shells

The calculation engine is a **framework-agnostic TypeScript package** with zero React/DOM dependencies. Everything else (SPA, WP block, optional API) is a thin presentation shell that imports the engine. This makes the engine independently unit-testable (issue #17), reusable across both deployment targets, and trivially callable from a future API (#56/#48).

## Monorepo layout (pnpm/npm workspaces)

```
rental-property-evaluator/
├─ packages/
│  ├─ engine/                 # @rpe/engine — pure TS, no UI
│  │  ├─ src/
│  │  │  ├─ types.ts          # DealInputs, ScreenerResults, ProFormaResults
│  │  │  ├─ loan.ts           # payment, amortization schedule
│  │  │  ├─ screener.ts       # cap, NOI, DSCR, CoC, GRM, PITI, break-even...
│  │  │  ├─ proforma.ts       # multi-year, depreciation, IRR/NPV, exit
│  │  │  ├─ finance.ts        # irr(), npv(), pmt() primitives
│  │  │  ├─ validate.ts       # input clamping/normalization
│  │  │  └─ index.ts          # evaluate(inputs, {mode}) → results
│  │  └─ tests/               # vitest, golden-number fixtures
│  └─ ui/                     # @rpe/ui — shared React 18 components (inputs, results, charts)
├─ apps/
│  ├─ web/                    # Vite SPA (standalone public tool; SEO, ad slots)
│  └─ wp-block/               # WordPress block/plugin build (@wordpress/scripts)
├─ .github/workflows/ci.yml   # lint + typecheck + test + build (#2)
└─ package.json               # workspaces
```

## Engine API (the contract)

```ts
type Period = 'monthly' | 'annual';
interface ExpenseInput { amount: number; period: Period; }

interface DealInputs {
  purchasePrice: number;
  percentDown: number;          // 0–100
  interestRate: number;         // annual %, 0 allowed
  loanTermYears: number;
  closingCosts: number;
  rollClosingCostsIntoLoan: boolean;
  rehab?: number;
  grossRent: number;            // monthly
  otherIncome?: number;         // monthly
  vacancyPct: number;           // 0–100
  expenses: {                   // % of rent OR fixed $ w/ period
    capExPct?: number; maintPct?: number; mgmtPct?: number; miscPct?: number;
    taxes: ExpenseInput; insurance: ExpenseInput; hoa?: ExpenseInput; other?: ExpenseInput;
  };
  units?: number; sqft?: number; landValue?: number;
  // pro-forma only:
  holdYears?: number; rentGrowthPct?: number; expenseGrowthPct?: number;
  appreciationPct?: number; sellingCostsPct?: number; marginalTaxPct?: number;
  capExInNOI?: boolean;         // toggle (default true = conservative)
}

function evaluate(inputs: DealInputs, opts?: { mode: 'screener' | 'proforma' }): Results;
// Every numeric result may be `null` when undefined (e.g. DSCR at 100% down) → UI renders "—".
```

UI never does math. It calls `evaluate()` on debounced input change and renders. Each result field declares its own pass/fail **direction** (`higher`|`lower`) and threshold — fixes the GRM inversion and generalizes to future "lower is better" metrics.

## State / persistence

- **Controlled inputs only.** Single source of truth in React state (Zustand or `useReducer`). No `document.getElementById().value` writes anywhere — this structurally removes the "reset only works once" bug (#50).
- **Scenarios:** array of named deals persisted to localStorage under a versioned key (`rpe.v1.scenarios`). Migration shim for any legacy `changeableRPE` data.
- **Compare:** select 2–4 scenarios → results table side-by-side, deltas highlighted.
- **URL share (#53):** serialize inputs → compact base64/`lz-string` param; loading hydrates a transient (unsaved) scenario. Strict parse + validation; bad params fall back to defaults silently.
- **Export (#49):** CSV (inputs+results) and PDF (print-stylesheet → `window.print()` or a headless render; avoid `html2canvas` pixel screenshots — they're the current low-quality approach).

## Shells

- **`apps/web` (SPA):** SEO (react-helmet/meta + prerender or migrate to Next later if SSR needed — out of 1.0.0 scope), gated ad slots (#47/#46), full scenario UI.
- **`apps/wp-block`:** registers a Gutenberg block that mounts the same `@rpe/ui` root; built with `@wordpress/scripts`; enqueues the engine bundle. WPCS-clean PHP wrapper, Plugin Check-ready, i18n-wrapped strings.

## Tooling
- Vite + React 18 + TS strict. ESLint + Prettier. Vitest + Testing Library. `Intl.NumberFormat` for money. Charts via Recharts (or lightweight `chart.js`) for amortization/projection.
- Dart Sass (`sass`) replaces dead `node-sass`; or Tailwind for the SPA — decide at kickoff.
