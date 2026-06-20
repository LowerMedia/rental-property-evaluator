/**
 * Score calc + verdict bands — RPE-108.
 *
 * Asserts the go/no-go bands at the exact thresholds (49/50/74/75) and the
 * per-metric signal + aggregation, so the verdict chip, sticky score bar, and
 * report header never diverge.
 */
import { describe, it, expect } from 'vitest';
import {
  scoreVerdict,
  evalSignal,
  computeScreenerScore,
  SCORED_KEYS,
  SCORE_VERDICT_LABEL,
  SCORE_BAND_MIN,
} from '../src/score';
import type { ScreenerResults } from '../src/types';

describe('scoreVerdict band boundaries', () => {
  it('fails below 50%', () => {
    expect(scoreVerdict(0)).toBe('fail');
    expect(scoreVerdict(49)).toBe('fail');
    expect(scoreVerdict(49.999)).toBe('fail');
  });

  it('is marginal in [50, 75)', () => {
    expect(scoreVerdict(50)).toBe('marginal');
    expect(scoreVerdict(60)).toBe('marginal');
    expect(scoreVerdict(74)).toBe('marginal');
    expect(scoreVerdict(74.999)).toBe('marginal');
  });

  it('passes at or above 75%', () => {
    expect(scoreVerdict(75)).toBe('pass');
    expect(scoreVerdict(100)).toBe('pass');
  });

  it('treats non-finite or negative input as fail', () => {
    expect(scoreVerdict(NaN)).toBe('fail');
    expect(scoreVerdict(-10)).toBe('fail');
  });

  it('exposes labels and thresholds as the single source of truth', () => {
    expect(SCORE_VERDICT_LABEL).toEqual({ pass: 'Pass', marginal: 'Marginal', fail: 'Fail' });
    expect(SCORE_BAND_MIN).toEqual({ pass: 75, marginal: 50 });
  });
});

describe('evalSignal', () => {
  it('passes a "higher" metric at or above threshold (capRate ≥ 5)', () => {
    expect(evalSignal('capRate', 5)).toBe('pass');
    expect(evalSignal('capRate', 4.99)).toBe('fail');
  });

  it('passes a "lower" metric at or below threshold (grm ≤ 12)', () => {
    expect(evalSignal('grm', 12)).toBe('pass');
    expect(evalSignal('grm', 12.01)).toBe('fail');
  });

  it('returns neutral for informational metrics (direction none)', () => {
    expect(evalSignal('loanAmount', 250_000)).toBe('neutral');
  });

  it('returns null for a null value', () => {
    expect(evalSignal('capRate', null)).toBe('null');
  });
});

describe('computeScreenerScore', () => {
  it('aggregates passing/total/pct and bands the verdict', () => {
    // capRate 6 ≥ 5 pass; dscr 1.0 < 1.25 fail; cocRoi 10 ≥ 8 pass → 2/3 ≈ 66.7% → marginal
    const results = { capRate: 6, dscr: 1.0, cocRoi: 10 } as unknown as ScreenerResults;
    const score = computeScreenerScore(results, ['capRate', 'dscr', 'cocRoi']);
    expect(score.passing).toBe(2);
    expect(score.total).toBe(3);
    expect(score.pct).toBeCloseTo(66.6667, 2);
    expect(score.verdict).toBe('marginal');
  });

  it('excludes null-valued metrics from the denominator', () => {
    const results = { capRate: 6, dscr: null, cocRoi: 10 } as unknown as ScreenerResults;
    const score = computeScreenerScore(results, ['capRate', 'dscr', 'cocRoi']);
    expect(score.passing).toBe(2);
    expect(score.total).toBe(2);
    expect(score.pct).toBe(100);
    expect(score.verdict).toBe('pass');
  });

  it('defaults to all scored keys and returns 0/0 fail when nothing is scoreable', () => {
    expect(SCORED_KEYS.length).toBeGreaterThan(0);
    const empty = Object.fromEntries(SCORED_KEYS.map((k) => [k, null])) as unknown as ScreenerResults;
    const score = computeScreenerScore(empty);
    expect(score.total).toBe(0);
    expect(score.pct).toBe(0);
    expect(score.verdict).toBe('fail');
  });
});
