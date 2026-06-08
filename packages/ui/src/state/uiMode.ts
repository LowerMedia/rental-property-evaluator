/**
 * E8 — UI complexity mode (RPE-57)
 *
 * UiMode governs which DealInputs fields are shown in the form and which
 * ScreenerResults metrics are shown in the results panel.
 *
 * - 'simple'  — beginner-friendly: 4 visible inputs, 8 key metrics; hidden fields
 *               are filled from the baseline-assumptions module (RPE-58).
 * - 'complex' — full experience (default): all inputs and all metrics.
 *
 * The engine always receives a fully-populated DealInputs; UiMode is a UI concern only.
 * Disabling pro-forma mode in simple mode (it requires complex inputs) is wired in RPE-61.
 */

import type { DealExpenses, DealInputs, ScreenerResults } from '@rpe/engine';

// ─── Mode type ────────────────────────────────────────────────────────────────

/** Controls form and results complexity. Orthogonal to the screener/pro-forma eval mode. */
export type UiMode = 'simple' | 'complex';

/** Tier a field or metric belongs to. */
export type InputTier = 'simple' | 'complex';

// ─── Input tiering ────────────────────────────────────────────────────────────

/**
 * Tier for every field in the input form.
 *
 * The key union covers:
 *   - Every top-level DealInputs field except the `expenses` container itself.
 *   - Every DealExpenses sub-field (including the optional `other` fixed-expense row).
 *
 * TypeScript enforces exhaustiveness — a missing key is a compile error.
 *
 * 'simple'  → shown in both simple and complex mode.
 * 'complex' → shown only in complex mode; in simple mode the value comes from baselines.
 */
export type InputFieldKey = Exclude<keyof DealInputs, 'expenses'> | keyof DealExpenses;

export const INPUT_TIER: Readonly<Record<InputFieldKey, InputTier>> = {
  // ── Shown in simple mode ──────────────────────────────────────────────────
  purchasePrice: 'simple',
  grossRent: 'simple',
  percentDown: 'simple',
  vacancyPct: 'simple',

  // ── Hidden in simple mode (filled from baselines) ─────────────────────────
  interestRate: 'complex',
  loanTermYears: 'complex',
  closingCosts: 'complex',
  rollClosingCostsIntoLoan: 'complex',
  rehab: 'complex',
  otherIncome: 'complex',
  capExInNOI: 'complex',
  // DealExpenses sub-fields:
  capExPct: 'complex',
  maintPct: 'complex',
  mgmtPct: 'complex',
  miscPct: 'complex',
  taxes: 'complex',
  insurance: 'complex',
  hoa: 'complex',
  other: 'complex',
  // Optional property metadata:
  units: 'complex',
  sqft: 'complex',
  // Pro-forma inputs (gated by pro-forma mode; always complex):
  holdYears: 'complex',
  rentGrowthPct: 'complex',
  expenseGrowthPct: 'complex',
  appreciationPct: 'complex',
  sellingCostsPct: 'complex',
  landValue: 'complex',
  marginalTaxPct: 'complex',
  discountRatePct: 'complex',
} as const;

// ─── Result tiering ───────────────────────────────────────────────────────────

/**
 * Tier for every ScreenerResults metric.
 *
 * In simple mode only 'simple'-tier metrics are displayed. Restricting the deal
 * score to simple-tier metrics (so it reflects only the visible metrics) is wired
 * in RPE-60/RPE-61. The full set is available in complex mode (current behaviour).
 *
 * Simple set answers "is this deal worth pursuing?" without overwhelming a beginner:
 * cash flow, returns, loan safety, deal-quality rule-of-thumb, and capital required.
 */
export const RESULT_TIER: Readonly<Record<keyof ScreenerResults, InputTier>> = {
  // ── Shown in simple mode ──────────────────────────────────────────────────
  cashFlowMonthly: 'simple',
  cashFlowAnnual: 'simple',
  cocRoi: 'simple',
  capRate: 'simple',
  dscr: 'simple',
  onePercentRule: 'simple',
  totalCashInvested: 'simple',
  breakEvenOccupancy: 'simple',

  // ── Complex only ──────────────────────────────────────────────────────────
  loanAmount: 'complex',
  mortgagePayment: 'complex',
  totalInterest: 'complex',
  egi: 'complex',
  egiAnnual: 'complex',
  opExMonthly: 'complex',
  opExAnnual: 'complex',
  piti: 'complex',
  noiMonthly: 'complex',
  noiAnnual: 'complex',
  grm: 'complex',
  grossYield: 'complex',
  expenseRatio: 'complex',
  ltv: 'complex',
  debtYield: 'complex',
  pricePerUnit: 'complex',
  pricePerSqft: 'complex',
  fiftyPctRuleDeviation: 'complex',
} as const;

// ─── Derived helpers ──────────────────────────────────────────────────────────

/** Ordered list of result keys displayed in simple mode. */
export const SIMPLE_RESULT_KEYS: ReadonlyArray<keyof ScreenerResults> = (
  Object.entries(RESULT_TIER) as [keyof ScreenerResults, InputTier][]
)
  .filter(([, tier]) => tier === 'simple')
  .map(([key]) => key);
