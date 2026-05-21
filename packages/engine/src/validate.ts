/**
 * Input normalisation helpers.
 *
 * The engine contract: callers pass raw DealInputs (values may be NaN, Infinity, or
 * out-of-range from a form). normalizeInputs() must be called before any calculation
 * so every downstream function can assume safe, finite numbers.
 *
 * No business logic lives here — only clamping and NaN/Infinity guards.
 */

import type { DealExpenses, DealInputs, ExpenseInput } from './types';

// ─── Primitives ──────────────────────────────────────────────────────────────

/**
 * Converts any value to a finite number. Returns `fallback` (default 0) for
 * NaN, ±Infinity, null, undefined, or non-numeric strings.
 */
export function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

/** Clamps `v` to the closed interval [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Clamps to [0, 100] for percentage fields. */
export function clampPercent(v: number): number {
  return clamp(v, 0, 100);
}

/** Clamps to [0, +∞) for dollar and year fields. */
export function clampNonNeg(v: number): number {
  return Math.max(0, v);
}

// ─── Sub-object normalisers ──────────────────────────────────────────────────

function normalizeExpenseInput(e: ExpenseInput): ExpenseInput {
  return { amount: clampNonNeg(safeNum(e.amount)), period: e.period };
}

function normalizeExpenses(e: DealExpenses): DealExpenses {
  return {
    capExPct: e.capExPct !== undefined ? clampPercent(safeNum(e.capExPct)) : undefined,
    maintPct: e.maintPct !== undefined ? clampPercent(safeNum(e.maintPct)) : undefined,
    mgmtPct: e.mgmtPct !== undefined ? clampPercent(safeNum(e.mgmtPct)) : undefined,
    miscPct: e.miscPct !== undefined ? clampPercent(safeNum(e.miscPct)) : undefined,
    taxes: normalizeExpenseInput(e.taxes),
    insurance: normalizeExpenseInput(e.insurance),
    hoa: e.hoa !== undefined ? normalizeExpenseInput(e.hoa) : undefined,
    other: e.other !== undefined ? normalizeExpenseInput(e.other) : undefined,
  };
}

// ─── Main normaliser ─────────────────────────────────────────────────────────

/**
 * Returns a copy of `raw` with every field guaranteed finite and in-range.
 * Optional fields are preserved as `undefined` when absent; they are NOT filled
 * with defaults — that is the caller's / UI's responsibility.
 */
export function normalizeInputs(raw: DealInputs): DealInputs {
  return {
    purchasePrice: clampNonNeg(safeNum(raw.purchasePrice)),
    percentDown: clampPercent(safeNum(raw.percentDown)),
    interestRate: clampPercent(safeNum(raw.interestRate)),
    loanTermYears: clampNonNeg(safeNum(raw.loanTermYears)),
    closingCosts: clampNonNeg(safeNum(raw.closingCosts)),
    rollClosingCostsIntoLoan: Boolean(raw.rollClosingCostsIntoLoan),

    rehab: raw.rehab !== undefined ? clampNonNeg(safeNum(raw.rehab)) : undefined,

    grossRent: clampNonNeg(safeNum(raw.grossRent)),
    otherIncome:
      raw.otherIncome !== undefined ? clampNonNeg(safeNum(raw.otherIncome)) : undefined,

    vacancyPct: clampPercent(safeNum(raw.vacancyPct)),

    expenses: normalizeExpenses(raw.expenses),

    units: raw.units !== undefined ? clampNonNeg(safeNum(raw.units)) : undefined,
    sqft: raw.sqft !== undefined ? clampNonNeg(safeNum(raw.sqft)) : undefined,
    landValue:
      raw.landValue !== undefined ? clampNonNeg(safeNum(raw.landValue)) : undefined,

    // Pro-forma — growth/appreciation rates may be negative (modelling decline), so no
    // clampNonNeg. Only clamp to finite; sellingCostsPct and marginalTaxPct stay 0–100.
    holdYears:
      raw.holdYears !== undefined ? clampNonNeg(safeNum(raw.holdYears)) : undefined,
    rentGrowthPct:
      raw.rentGrowthPct !== undefined ? safeNum(raw.rentGrowthPct) : undefined,
    expenseGrowthPct:
      raw.expenseGrowthPct !== undefined ? safeNum(raw.expenseGrowthPct) : undefined,
    appreciationPct:
      raw.appreciationPct !== undefined ? safeNum(raw.appreciationPct) : undefined,
    sellingCostsPct:
      raw.sellingCostsPct !== undefined
        ? clampPercent(safeNum(raw.sellingCostsPct))
        : undefined,
    marginalTaxPct:
      raw.marginalTaxPct !== undefined
        ? clampPercent(safeNum(raw.marginalTaxPct))
        : undefined,

    capExInNOI: raw.capExInNOI !== undefined ? Boolean(raw.capExInNOI) : undefined,
  };
}
