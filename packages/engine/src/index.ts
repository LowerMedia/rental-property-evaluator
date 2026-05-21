/**
 * @rpe/engine public API
 *
 * evaluate() is the single entry point for all calculations.
 * Implementation arrives in RPE-13 (loan/amortization) through RPE-16 (new screener metrics).
 */

export type {
  Period,
  ExpenseInput,
  DealExpenses,
  DealInputs,
  ScreenerResults,
  ProFormaResults,
  EvalMode,
  EvalOptions,
  Results,
} from './types';

export { safeNum, clamp, clampPercent, clampNonNeg, normalizeInputs } from './validate';
export { pmt, amortize } from './finance';
export type { AmortizationRow, AmortizationSchedule } from './finance';
export { calcLoanAmount, calcLoan } from './loan';
export type { LoanResult } from './loan';

import type { DealInputs, EvalOptions, Results } from './types';

/**
 * Evaluate a deal and return metrics.
 *
 * @param inputs  Raw deal inputs (will be normalised internally before calculation).
 * @param opts    { mode: 'screener' (default) | 'proforma' }
 * @returns       ScreenerResults (screener mode) or ProFormaResults (proforma mode).
 *                Every numeric field is `number | null` — null renders as "—" in UI.
 *
 * @throws        Until RPE-13 through RPE-16 are implemented.
 */
export function evaluate(_inputs: DealInputs, _opts?: EvalOptions): Results {
  throw new Error(
    'evaluate() not yet implemented — see RPE-13 (loan), RPE-14 (screener), ' +
      'RPE-15 (GRM + direction), RPE-16 (new metrics).',
  );
}
