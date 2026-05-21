/**
 * Direction model tests — RPE-15.
 *
 * Validates that SCREENER_METRIC_CONFIG has correct directions/thresholds
 * and that pass/fail logic works for the key metrics the spec calls out.
 */
import { describe, it, expect } from 'vitest';
import { SCREENER_METRIC_CONFIG } from '../src/directions';
import type { ScreenerResults } from '../src/types';

// ─── Config completeness ──────────────────────────────────────────────────────

describe('SCREENER_METRIC_CONFIG', () => {
  it('has an entry for every ScreenerResults field', () => {
    // Build an exhaustive list by checking the type keys at runtime.
    const sampleResult: ScreenerResults = {
      loanAmount: null,
      mortgagePayment: null,
      totalInterest: null,
      egi: null,
      egiAnnual: null,
      opExMonthly: null,
      opExAnnual: null,
      piti: null,
      noiMonthly: null,
      noiAnnual: null,
      capRate: null,
      cashFlowMonthly: null,
      cashFlowAnnual: null,
      cocRoi: null,
      dscr: null,
      grm: null,
      onePercentRule: null,
      breakEvenOccupancy: null,
      expenseRatio: null,
      ltv: null,
      debtYield: null,
      grossYield: null,
      pricePerUnit: null,
      pricePerSqft: null,
      totalCashInvested: null,
      fiftyPctRuleDeviation: null,
    };

    const resultKeys = Object.keys(sampleResult) as (keyof ScreenerResults)[];
    resultKeys.forEach((key) => {
      expect(
        SCREENER_METRIC_CONFIG[key],
        `Missing config for ScreenerResults.${key}`,
      ).toBeDefined();
    });
  });
});

// ─── Direction correctness ────────────────────────────────────────────────────

describe('metric directions', () => {
  it('GRM is direction=lower (lower GRM = better value)', () => {
    expect(SCREENER_METRIC_CONFIG.grm.direction).toBe('lower');
  });

  it('cap rate is direction=higher', () => {
    expect(SCREENER_METRIC_CONFIG.capRate.direction).toBe('higher');
  });

  it('DSCR is direction=higher with threshold 1.25', () => {
    expect(SCREENER_METRIC_CONFIG.dscr.direction).toBe('higher');
    expect(SCREENER_METRIC_CONFIG.dscr.threshold).toBe(1.25);
  });

  it('1% rule is direction=higher with threshold 1', () => {
    expect(SCREENER_METRIC_CONFIG.onePercentRule.direction).toBe('higher');
    expect(SCREENER_METRIC_CONFIG.onePercentRule.threshold).toBe(1);
  });

  it('break-even occupancy is direction=lower (lower occupancy needed = safer)', () => {
    expect(SCREENER_METRIC_CONFIG.breakEvenOccupancy.direction).toBe('lower');
  });

  it('LTV is direction=lower (lower leverage = safer)', () => {
    expect(SCREENER_METRIC_CONFIG.ltv.direction).toBe('lower');
  });

  it('loanAmount is informational (direction=none)', () => {
    expect(SCREENER_METRIC_CONFIG.loanAmount.direction).toBe('none');
  });

  it('totalCashInvested is informational (direction=none)', () => {
    expect(SCREENER_METRIC_CONFIG.totalCashInvested.direction).toBe('none');
  });
});

// ─── Pass/fail logic ──────────────────────────────────────────────────────────

/** Helper: apply config direction + threshold to a value to get pass/fail. */
function isPassing(key: keyof ScreenerResults, value: number | null): boolean | null {
  if (value === null) return null;
  const cfg = SCREENER_METRIC_CONFIG[key];
  if (cfg.direction === 'none' || cfg.threshold === undefined) return null;
  return cfg.direction === 'higher' ? value > cfg.threshold : value < cfg.threshold;
}

describe('pass/fail evaluation', () => {
  it('DSCR 1.3 passes (> 1.25)', () => expect(isPassing('dscr', 1.3)).toBe(true));
  it('DSCR 1.1 fails (< 1.25)', () => expect(isPassing('dscr', 1.1)).toBe(false));
  it('DSCR null → null (no value)', () => expect(isPassing('dscr', null)).toBeNull());

  it('GRM 9 passes (< 12)', () => expect(isPassing('grm', 9)).toBe(true));
  it('GRM 15 fails (> 12)', () => expect(isPassing('grm', 15)).toBe(false));

  it('capRate 6 passes (> 5)', () => expect(isPassing('capRate', 6)).toBe(true));
  it('capRate 4 fails (< 5)', () => expect(isPassing('capRate', 4)).toBe(false));

  it('1% rule 1.1 passes', () => expect(isPassing('onePercentRule', 1.1)).toBe(true));
  it('1% rule 0.8 fails', () => expect(isPassing('onePercentRule', 0.8)).toBe(false));

  it('loanAmount has no pass/fail (direction=none)', () =>
    expect(isPassing('loanAmount', 100_000)).toBeNull());
});
