/**
 * Aggregate score calc + banding (RPE-108).
 *
 * Single source of truth for the screener score (passing ÷ scored metrics) and
 * its go/no-go verdict band — consumed by the UI Score header + sticky bar
 * (RPE-112), the CSV exports, and the PDF report header. evalSignal mirrors the
 * per-metric pass/fail policy in SCREENER_METRIC_CONFIG; computeScreenerScore
 * aggregates it; scoreVerdict bands the percentage.
 */

import { SCREENER_METRIC_CONFIG } from './directions';
import type { ScreenerResults } from './types';

export type ScoreVerdict = 'pass' | 'marginal' | 'fail';

/** Per-metric signal. 'null' = no value; 'neutral' = informational (no threshold). */
export type ScoreSignal = 'pass' | 'fail' | 'null' | 'neutral';

/**
 * Inclusive lower bounds (percent) for each band:
 * ≥75 → pass, ≥50 → marginal, below 50 → fail.
 */
export const SCORE_BAND_MIN: { readonly pass: number; readonly marginal: number } = {
  pass: 75,
  marginal: 50,
};

/** Display label for each verdict. */
export const SCORE_VERDICT_LABEL: Readonly<Record<ScoreVerdict, string>> = {
  pass: 'Pass',
  marginal: 'Marginal',
  fail: 'Fail',
};

/**
 * Map a score percentage (0–100, passing ÷ scored × 100) to a verdict.
 * Non-finite or negative input is treated as 0 (fail).
 */
export function scoreVerdict(pct: number): ScoreVerdict {
  const p = Number.isFinite(pct) ? pct : 0;
  if (p >= SCORE_BAND_MIN.pass) return 'pass';
  if (p >= SCORE_BAND_MIN.marginal) return 'marginal';
  return 'fail';
}

/**
 * Pass/fail/neutral for a single metric vs. its configured threshold.
 * Mirrors the colouring policy in SCREENER_METRIC_CONFIG.
 */
export function evalSignal(key: keyof ScreenerResults, value: number | null): ScoreSignal {
  if (value === null) return 'null';
  const cfg = SCREENER_METRIC_CONFIG[key];
  if (cfg.direction === 'none' || cfg.threshold === undefined) return 'neutral';
  return cfg.direction === 'higher'
    ? value >= cfg.threshold ? 'pass' : 'fail'
    : value <= cfg.threshold ? 'pass' : 'fail';
}

/** Every metric key with a pass/fail threshold (direction !== 'none'). */
export const SCORED_KEYS: (keyof ScreenerResults)[] = (
  Object.entries(SCREENER_METRIC_CONFIG) as [
    keyof ScreenerResults,
    (typeof SCREENER_METRIC_CONFIG)[keyof ScreenerResults],
  ][]
)
  .filter(([, cfg]) => cfg.direction !== 'none')
  .map(([key]) => key);

export interface ScreenerScore {
  passing: number;
  total: number;
  /** passing / total × 100, 0 when nothing is scoreable. */
  pct: number;
  verdict: ScoreVerdict;
}

/**
 * Aggregate the screener score over the given scored keys (defaults to all).
 * `total` counts metrics with a non-null signal; `passing` counts 'pass'.
 */
export function computeScreenerScore(
  results: ScreenerResults,
  scoredKeys: readonly (keyof ScreenerResults)[] = SCORED_KEYS,
): ScreenerScore {
  const signals = scoredKeys.map((k) => evalSignal(k, results[k]));
  const total = signals.filter((s) => s !== 'null').length;
  const passing = signals.filter((s) => s === 'pass').length;
  const pct = total > 0 ? (passing / total) * 100 : 0;
  return { passing, total, pct, verdict: scoreVerdict(pct) };
}
