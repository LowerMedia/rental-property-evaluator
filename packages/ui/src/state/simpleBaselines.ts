/**
 * E8 — Baseline-assumptions module (RPE-58)
 *
 * Provides conservative national-average default values for the complex-tier
 * DealInputs fields hidden in simple mode (financing, variable/fixed expenses).
 * Optional metadata and pro-forma fields (units, sqft, holdYears, etc.) are NOT
 * baselined — they remain undefined and are only relevant in complex mode.
 *
 * Design contract:
 *   - All baseline values are documented in BASELINE_DESCRIPTIONS.
 *   - Purchase-price-dependent baselines (closing costs, taxes, insurance) are
 *     recomputed each time the purchase price changes.
 *   - E9 (location defaults, RPE-56) will override these static values per region
 *     by replacing getSimpleBaselines() at the call sites in Evaluator.tsx.
 *   - applySimpleBaselines() is the evaluation path for simple mode ONLY.
 *     Calling it in complex mode is incorrect — complex mode passes inputs directly.
 */

import type { DealInputs, ExpenseInput } from '@rpe/engine';

// ─── Baseline value type ─────────────────────────────────────────────────────

/**
 * All complex-tier DealInputs fields populated by the baselines module.
 * Explicit non-optional types so TypeScript guarantees completeness at compile time.
 */
export interface SimpleBaselineValues {
  interestRate: number;
  loanTermYears: number;
  closingCosts: number;
  rollClosingCostsIntoLoan: boolean;
  rehab: number;
  otherIncome: number;
  /** Baseline vacancy — also the initial default for the visible vacancyPct field. */
  vacancyPct: number;
  capExInNOI: boolean;
  expenses: {
    capExPct: number;
    maintPct: number;
    mgmtPct: number;
    miscPct: number;
    taxes: ExpenseInput;
    insurance: ExpenseInput;
    hoa: ExpenseInput;
    /** Other fixed expense: $0 — assumed none; explicitly present so callers need no special-case. */
    other: ExpenseInput;
  };
}

// ─── Core baseline function ──────────────────────────────────────────────────

/**
 * Return baseline assumption values for the given purchase price.
 *
 * Purchase-price-relative items (closing costs, taxes, insurance) are
 * re-derived on every call; all other values are static constants.
 */
export function getSimpleBaselines(purchasePrice: number): SimpleBaselineValues {
  const pp = purchasePrice > 0 ? purchasePrice : 0;
  return {
    // ── Financing ──────────────────────────────────────────────────────────
    interestRate: 7.0,
    loanTermYears: 30,
    /** 2 % of purchase price — typical buyer closing cost range 1.5–3 %. */
    closingCosts: Math.round(pp * 0.02),
    rollClosingCostsIntoLoan: false,
    rehab: 0,

    // ── Income ────────────────────────────────────────────────────────────
    otherIncome: 0,
    /** 5 % vacancy — conservative national average for stabilised SFR / small multifamily. */
    vacancyPct: 5,

    // ── Expense settings ──────────────────────────────────────────────────
    capExInNOI: true,

    // ── Expense rates (all as % of gross rent) ────────────────────────────
    expenses: {
      /** 5 % CapEx reserve — long-run average for major repairs and replacements. */
      capExPct: 5,
      /** 5 % maintenance — routine upkeep and minor repairs. */
      maintPct: 5,
      /** 10 % property management — standard professional-management fee. */
      mgmtPct: 10,
      /** 1 % miscellaneous — accounting, legal, advertising, etc. */
      miscPct: 1,

      // ── Fixed expenses (purchase-price-relative heuristics) ─────────────
      /** Property taxes: ~1.2 % of purchase price annually (national effective rate). */
      taxes: { amount: Math.round(pp * 0.012), period: 'annual' },
      /** Insurance: ~0.5 % of purchase price annually (homeowners / landlord policy). */
      insurance: { amount: Math.round(pp * 0.005), period: 'annual' },
      /** HOA: $0 — assumed single-family or self-managed; user adjusts if needed. */
      hoa: { amount: 0, period: 'monthly' },
      /** Other fixed expense: $0 — no supplemental fixed costs assumed. */
      other: { amount: 0, period: 'monthly' },
    },
  };
}

// ─── Human-readable descriptions ─────────────────────────────────────────────

/**
 * Union of every *leaf* key in SimpleBaselineValues:
 * - top-level keys (excluding the 'expenses' container itself)
 * - DealExpenses sub-field keys (the leaves inside expenses)
 * Derived from SimpleBaselineValues so it stays in sync automatically.
 */
type BaselineDescriptionKey =
  | Exclude<keyof SimpleBaselineValues, 'expenses'>
  | keyof SimpleBaselineValues['expenses'];

/**
 * One-sentence description of each baseline assumption.
 * Used in "based on assumptions" tooltips (RPE-61) and documentation.
 * Keys match DealInputs / DealExpenses field names.
 *
 * `satisfies` enforces that every BaselineDescriptionKey has a description
 * and that no extra/unknown keys are present — missing or misspelled entries
 * are compile errors.
 */
export const BASELINE_DESCRIPTIONS = {
  interestRate: '30-yr fixed mortgage rate estimate (7 %).',
  loanTermYears: 'Standard 30-year loan term.',
  closingCosts: 'Buyer closing costs estimated at 2 % of purchase price.',
  rollClosingCostsIntoLoan: 'Closing costs paid out-of-pocket (not financed).',
  rehab: 'No rehab budget assumed — move-in-ready property.',
  otherIncome: 'No ancillary income (parking, laundry, etc.) assumed.',
  vacancyPct: '5 % vacancy — conservative national average for stabilised rentals.',
  capExInNOI: 'CapEx reserve included in NOI (conservative lender view).',
  capExPct: '5 % of gross rent reserved for capital expenditures.',
  maintPct: '5 % of gross rent for routine maintenance.',
  mgmtPct: '10 % of gross rent for professional property management.',
  miscPct: '1 % of gross rent for miscellaneous operating expenses.',
  taxes: 'Property taxes estimated at 1.2 % of purchase price annually.',
  insurance: 'Landlord insurance estimated at 0.5 % of purchase price annually.',
  hoa: 'No HOA fees assumed.',
  other: 'No other fixed expenses assumed.',
} as const satisfies Record<BaselineDescriptionKey, string>;

// ─── Apply helper ─────────────────────────────────────────────────────────────

/**
 * Build the effective DealInputs for simple-mode evaluation.
 *
 * Baselines supply every complex-tier field. The four simple-tier fields
 * (purchasePrice, grossRent, percentDown, vacancyPct) come from the user's
 * current inputs. All other user-state values (entered in complex mode) are
 * intentionally ignored — the point of simple mode is a clean baseline
 * calculation. The state itself is never mutated; user values survive a
 * mode switch and are restored when returning to complex mode.
 *
 * @param inputs  Current scenario inputs (from the reducer).
 * @returns       A new DealInputs object safe to pass directly to evaluate().
 */
export function applySimpleBaselines(inputs: DealInputs): DealInputs {
  const b = getSimpleBaselines(inputs.purchasePrice);
  return {
    // ── Baseline fields (complex-tier) ────────────────────────────────────
    ...b,
    // ── User fields (simple-tier) — override the baselines ────────────────
    purchasePrice: inputs.purchasePrice,
    percentDown: inputs.percentDown,
    grossRent: inputs.grossRent,
    vacancyPct: inputs.vacancyPct,
  };
}
