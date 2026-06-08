/**
 * RPE-62: Simple-mode integration tests
 *
 * Covers the full E8 data path without React rendering:
 *  - Baseline fill: applySimpleBaselines() populates all complex-tier fields.
 *  - Engine evaluation: all 8 SIMPLE_RESULT_KEYS are non-null after evaluate().
 *  - Engine parity: simple-mode results equal complex-mode results when the
 *    complex inputs are manually set to the same baseline values.
 *  - Value preservation: user-entered simple-tier values survive applySimpleBaselines().
 *  - Scored-key intersection: SIMPLE_RESULT_KEYS ∩ SCORED_KEYS = 7 (totalCashInvested
 *    has direction='none' and is intentionally excluded from scoring).
 *  - Complex-only metrics absent from simple-tier: engine produces them but they are
 *    not in SIMPLE_RESULT_KEYS.
 */

import { describe, it, expect } from 'vitest';
import { evaluate, SCREENER_METRIC_CONFIG } from '@rpe/engine';
import type { ScreenerResults } from '@rpe/engine';
import { SIMPLE_RESULT_KEYS } from '../src/state/uiMode';
import { applySimpleBaselines, getSimpleBaselines } from '../src/state/simpleBaselines';
import { DEFAULT_INPUTS } from '../src/state/defaultInputs';

// ─── Shared fixture ───────────────────────────────────────────────────────────

const USER_SIMPLE_INPUTS = {
  purchasePrice: 350_000,
  grossRent: 2_500,
  percentDown: 20,
  vacancyPct: 5,
};

const SIMPLE_INPUTS = applySimpleBaselines({
  ...DEFAULT_INPUTS,
  ...USER_SIMPLE_INPUTS,
});

const SIMPLE_RESULTS = evaluate(SIMPLE_INPUTS) as ScreenerResults;

// ─── Baseline fill ────────────────────────────────────────────────────────────

describe('baseline fill', () => {
  it('applySimpleBaselines sets interestRate to the national-average baseline', () => {
    expect(SIMPLE_INPUTS.interestRate).toBe(getSimpleBaselines(350_000).interestRate);
  });

  it('applySimpleBaselines sets loanTermYears to the national-average baseline', () => {
    expect(SIMPLE_INPUTS.loanTermYears).toBe(30);
  });

  it('applySimpleBaselines sets all expense pct fields from baselines', () => {
    const b = getSimpleBaselines(350_000);
    expect(SIMPLE_INPUTS.expenses.capExPct).toBe(b.expenses.capExPct);
    expect(SIMPLE_INPUTS.expenses.maintPct).toBe(b.expenses.maintPct);
    expect(SIMPLE_INPUTS.expenses.mgmtPct).toBe(b.expenses.mgmtPct);
    expect(SIMPLE_INPUTS.expenses.miscPct).toBe(b.expenses.miscPct);
  });

  it('applySimpleBaselines sets fixed expense amounts relative to purchase price', () => {
    const b = getSimpleBaselines(350_000);
    expect(SIMPLE_INPUTS.expenses.taxes.amount).toBe(b.expenses.taxes.amount);
    expect(SIMPLE_INPUTS.expenses.insurance.amount).toBe(b.expenses.insurance.amount);
  });
});

// ─── Value preservation ───────────────────────────────────────────────────────

describe('value preservation', () => {
  it('user purchasePrice is preserved through applySimpleBaselines', () => {
    expect(SIMPLE_INPUTS.purchasePrice).toBe(USER_SIMPLE_INPUTS.purchasePrice);
  });

  it('user grossRent is preserved through applySimpleBaselines', () => {
    expect(SIMPLE_INPUTS.grossRent).toBe(USER_SIMPLE_INPUTS.grossRent);
  });

  it('user percentDown is preserved through applySimpleBaselines', () => {
    expect(SIMPLE_INPUTS.percentDown).toBe(USER_SIMPLE_INPUTS.percentDown);
  });

  it('user vacancyPct is preserved through applySimpleBaselines', () => {
    expect(SIMPLE_INPUTS.vacancyPct).toBe(USER_SIMPLE_INPUTS.vacancyPct);
  });

  it('user complex-tier values in original state are not mutated', () => {
    const original = {
      ...DEFAULT_INPUTS,
      ...USER_SIMPLE_INPUTS,
      interestRate: 3.5,   // user's custom complex value
      loanTermYears: 15,
    };
    const before = { interestRate: original.interestRate, loanTermYears: original.loanTermYears };
    applySimpleBaselines(original);
    expect(original.interestRate).toBe(before.interestRate);
    expect(original.loanTermYears).toBe(before.loanTermYears);
  });
});

// ─── Engine evaluation ────────────────────────────────────────────────────────

describe('engine evaluation in simple mode', () => {
  it('all 8 SIMPLE_RESULT_KEYS are non-null', () => {
    for (const key of SIMPLE_RESULT_KEYS) {
      expect(SIMPLE_RESULTS[key], `${key} must not be null`).not.toBeNull();
    }
  });

  it('all 8 SIMPLE_RESULT_KEYS are finite numbers', () => {
    for (const key of SIMPLE_RESULT_KEYS) {
      const value = SIMPLE_RESULTS[key];
      expect(typeof value).toBe('number');
      expect(Number.isFinite(value as number), `${key} should be finite`).toBe(true);
    }
  });

  it('cashFlowMonthly is consistent with cashFlowAnnual (×12)', () => {
    const monthly = SIMPLE_RESULTS.cashFlowMonthly as number;
    const annual = SIMPLE_RESULTS.cashFlowAnnual as number;
    expect(annual).toBeCloseTo(monthly * 12, 0);
  });
});

// ─── Engine parity ────────────────────────────────────────────────────────────

describe('engine parity', () => {
  it('simple-mode results equal complex-mode results when complex inputs match baselines', () => {
    const baselines = getSimpleBaselines(USER_SIMPLE_INPUTS.purchasePrice);

    // Build the equivalent complex-mode inputs by manually applying every baseline value.
    // NOTE: vacancyPct is a simple-tier/user-controlled field — applySimpleBaselines()
    // preserves the user's value, so we use USER_SIMPLE_INPUTS.vacancyPct here (already
    // present via the ...USER_SIMPLE_INPUTS spread) rather than baselines.vacancyPct.
    // Setting it to the baseline value would only coincidentally work when both are equal.
    const complexInputs = {
      ...DEFAULT_INPUTS,
      ...USER_SIMPLE_INPUTS,
      interestRate: baselines.interestRate,
      loanTermYears: baselines.loanTermYears,
      closingCosts: baselines.closingCosts,
      rollClosingCostsIntoLoan: baselines.rollClosingCostsIntoLoan,
      rehab: baselines.rehab,
      otherIncome: baselines.otherIncome,
      // vacancyPct: user's value (from ...USER_SIMPLE_INPUTS above, not baselines)
      capExInNOI: baselines.capExInNOI,
      expenses: {
        ...DEFAULT_INPUTS.expenses,
        capExPct: baselines.expenses.capExPct,
        maintPct: baselines.expenses.maintPct,
        mgmtPct: baselines.expenses.mgmtPct,
        miscPct: baselines.expenses.miscPct,
        taxes: baselines.expenses.taxes,
        insurance: baselines.expenses.insurance,
        hoa: baselines.expenses.hoa,
        other: baselines.expenses.other,
      },
    };

    const complexResults = evaluate(complexInputs) as ScreenerResults;

    for (const key of SIMPLE_RESULT_KEYS) {
      expect(SIMPLE_RESULTS[key], `${key} mismatch between simple and equivalent complex`).toBe(
        complexResults[key],
      );
    }
  });
});

// ─── Scored-key intersection ──────────────────────────────────────────────────

describe('SIMPLE_RESULT_KEYS × SCORED_KEYS intersection', () => {
  type MetricKey = keyof ScreenerResults;

  const SCORED_KEYS: MetricKey[] = (
    Object.entries(SCREENER_METRIC_CONFIG) as [MetricKey, (typeof SCREENER_METRIC_CONFIG)[MetricKey]][]
  )
    .filter(([, cfg]) => cfg.direction !== 'none')
    .map(([key]) => key);

  const SIMPLE_SCORED_KEYS = SCORED_KEYS.filter((k) => SIMPLE_RESULT_KEYS.includes(k));

  it('SIMPLE_RESULT_KEYS has fewer scored keys than the full SCORED_KEYS set', () => {
    expect(SIMPLE_SCORED_KEYS.length).toBeLessThan(SCORED_KEYS.length);
  });

  it('totalCashInvested is in SIMPLE_RESULT_KEYS but has direction="none" (not scored)', () => {
    expect(SIMPLE_RESULT_KEYS).toContain('totalCashInvested');
    expect(SCREENER_METRIC_CONFIG['totalCashInvested'].direction).toBe('none');
    expect(SIMPLE_SCORED_KEYS).not.toContain('totalCashInvested');
  });

  it('the 7 remaining simple-tier keys all have a pass/fail direction', () => {
    for (const key of SIMPLE_SCORED_KEYS) {
      const { direction } = SCREENER_METRIC_CONFIG[key];
      expect(['higher', 'lower'], `${key} should have direction higher or lower`).toContain(
        direction,
      );
    }
  });

  it('complex-only result keys are absent from SIMPLE_RESULT_KEYS', () => {
    const complexOnly: MetricKey[] = [
      'loanAmount', 'mortgagePayment', 'totalInterest',
      'egi', 'egiAnnual', 'opExMonthly', 'opExAnnual', 'piti',
      'noiMonthly', 'noiAnnual', 'grm', 'grossYield',
      'expenseRatio', 'ltv', 'debtYield',
      'pricePerUnit', 'pricePerSqft', 'fiftyPctRuleDeviation',
    ];
    for (const key of complexOnly) {
      expect(SIMPLE_RESULT_KEYS, `${key} must not appear in SIMPLE_RESULT_KEYS`).not.toContain(key);
    }
  });
});
