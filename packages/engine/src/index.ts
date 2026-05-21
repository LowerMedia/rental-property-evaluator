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
export { calcScreener } from './screener';
export { SCREENER_METRIC_CONFIG } from './directions';
export type { MetricDirection, MetricConfig } from './directions';

import type { DealInputs, EvalOptions, Results } from './types';
import { normalizeInputs } from './validate';
import { calcScreener } from './screener';

/**
 * Evaluate a deal and return metrics.
 *
 * Normalises inputs before calculation so callers never need to pre-clean values.
 *
 * @param inputs  Raw deal inputs (NaN/out-of-range values are clamped internally).
 * @param opts    { mode: 'screener' (default) | 'proforma' }
 * @returns       ScreenerResults. Every numeric field is `number | null` (null → "—").
 *                proforma mode is a stub until RPE-E4.
 */
export function evaluate(inputs: DealInputs, opts?: EvalOptions): Results {
  const mode = opts?.mode ?? 'screener';
  const normalized = normalizeInputs(inputs);

  if (mode === 'screener') {
    return calcScreener(normalized);
  }

  // proforma mode — RPE-E4
  throw new Error('proforma mode not yet implemented — see RPE-E4.');
}
