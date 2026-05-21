/**
 * @rpe/engine public API
 *
 * evaluate() is the single entry point for all calculations.
 * Implementation: RPE-13 (loan/amortization) → RPE-16 (screener metrics) → RPE-29 (pro-forma projection).
 */

export type {
  Period,
  ExpenseInput,
  DealExpenses,
  DealInputs,
  ScreenerResults,
  ProjectionYear,
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
export { calcProjection } from './projection';
export { calcProForma } from './proforma';
export { SCREENER_METRIC_CONFIG } from './directions';
export type { MetricDirection, MetricConfig } from './directions';

import type { DealInputs, EvalOptions, Results } from './types';
import { normalizeInputs } from './validate';
import { calcScreener } from './screener';
import { calcProForma } from './proforma';

/**
 * Evaluate a deal and return metrics.
 *
 * Normalises inputs before calculation so callers never need to pre-clean values.
 *
 * @param inputs  Raw deal inputs (NaN/out-of-range values are clamped internally).
 * @param opts    { mode: 'screener' (default) | 'proforma' }
 * @returns       ScreenerResults in screener mode; ProFormaResults in proforma mode.
 *                Every numeric field is `number | null` (null → "—").
 */
export function evaluate(inputs: DealInputs, opts?: EvalOptions): Results {
  const mode = opts?.mode ?? 'screener';
  const normalized = normalizeInputs(inputs);

  if (mode === 'screener') {
    return calcScreener(normalized);
  }

  return calcProForma(normalized);
}
