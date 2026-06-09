/**
 * RPE-58: simpleBaselines unit tests
 *
 * Covers:
 *  - getSimpleBaselines: purchase-price-relative computations, static fields,
 *    zero-price edge case, rounding, exhaustive expense coverage.
 *  - applySimpleBaselines: simple-tier fields come from inputs, complex-tier
 *    from baselines (user's complex-mode values are intentionally ignored),
 *    no mutation, closing-cost scaling.
 *  - BASELINE_DESCRIPTIONS: every baseline leaf key has a non-empty description.
 */

import { describe, it, expect } from 'vitest';
import {
  getSimpleBaselines,
  applySimpleBaselines,
  BASELINE_DESCRIPTIONS,
  type LocationRateOverrides,
} from '../src/state/simpleBaselines';
import { DEFAULT_INPUTS } from '../src/state/defaultInputs';
import type { DealInputs } from '@rpe/engine';

// ─── getSimpleBaselines ───────────────────────────────────────────────────────

describe('getSimpleBaselines', () => {
  it('closing costs = 2 % of purchase price (rounded)', () => {
    expect(getSimpleBaselines(300_000).closingCosts).toBe(6_000);
    expect(getSimpleBaselines(250_000).closingCosts).toBe(5_000);
  });

  it('property taxes = 1.2 % of purchase price (annual, rounded)', () => {
    const b = getSimpleBaselines(300_000);
    expect(b.expenses.taxes.amount).toBe(3_600);
    expect(b.expenses.taxes.period).toBe('annual');
  });

  it('insurance = 0.5 % of purchase price (annual, rounded)', () => {
    const b = getSimpleBaselines(300_000);
    expect(b.expenses.insurance.amount).toBe(1_500);
    expect(b.expenses.insurance.period).toBe('annual');
  });

  it('rounds purchase-price-relative values to whole dollars', () => {
    const b = getSimpleBaselines(199_999);
    expect(Number.isInteger(b.closingCosts)).toBe(true);
    expect(Number.isInteger(b.expenses.taxes.amount)).toBe(true);
    expect(Number.isInteger(b.expenses.insurance.amount)).toBe(true);
  });

  it('static fields are stable regardless of purchase price', () => {
    for (const pp of [100_000, 300_000, 1_000_000]) {
      const b = getSimpleBaselines(pp);
      expect(b.interestRate).toBe(7.0);
      expect(b.loanTermYears).toBe(30);
      expect(b.vacancyPct).toBe(5);
      expect(b.rollClosingCostsIntoLoan).toBe(false);
      expect(b.rehab).toBe(0);
      expect(b.otherIncome).toBe(0);
      expect(b.capExInNOI).toBe(true);
      expect(b.expenses.capExPct).toBe(5);
      expect(b.expenses.maintPct).toBe(5);
      expect(b.expenses.mgmtPct).toBe(10);
      expect(b.expenses.miscPct).toBe(1);
      expect(b.expenses.hoa).toEqual({ amount: 0, period: 'monthly' });
      expect(b.expenses.other).toEqual({ amount: 0, period: 'monthly' });
    }
  });

  it('zero purchase price produces zero for relative fields (no NaN)', () => {
    const b = getSimpleBaselines(0);
    expect(b.closingCosts).toBe(0);
    expect(b.expenses.taxes.amount).toBe(0);
    expect(b.expenses.insurance.amount).toBe(0);
    expect(Number.isNaN(b.interestRate)).toBe(false);
    expect(Number.isNaN(b.expenses.capExPct)).toBe(false);
  });

  it('expenses object includes all DealExpenses sub-fields (incl. other)', () => {
    const { expenses } = getSimpleBaselines(300_000);
    expect(expenses).toHaveProperty('capExPct');
    expect(expenses).toHaveProperty('maintPct');
    expect(expenses).toHaveProperty('mgmtPct');
    expect(expenses).toHaveProperty('miscPct');
    expect(expenses).toHaveProperty('taxes');
    expect(expenses).toHaveProperty('insurance');
    expect(expenses).toHaveProperty('hoa');
    expect(expenses).toHaveProperty('other');
    expect(expenses.other.amount).toBe(0);
  });
});

// ─── getSimpleBaselines — with LocationRateOverrides ────────────────────────

describe('getSimpleBaselines — with LocationRateOverrides', () => {
  const TX_OVERRIDES: LocationRateOverrides = {
    propertyTaxRate: 0.018,
    insuranceRate: 0.0123,
    sourceLabel: 'TX state averages',
  };

  it('uses override propertyTaxRate for taxes amount', () => {
    const b = getSimpleBaselines(300_000, TX_OVERRIDES);
    expect(b.expenses.taxes.amount).toBe(Math.round(300_000 * 0.018)); // 5400
    expect(b.expenses.taxes.period).toBe('annual');
  });

  it('uses override insuranceRate for insurance amount', () => {
    const b = getSimpleBaselines(300_000, TX_OVERRIDES);
    expect(b.expenses.insurance.amount).toBe(Math.round(300_000 * 0.0123)); // 3690
    expect(b.expenses.insurance.period).toBe('annual');
  });

  it('vacancyPct stays at the 5 % baseline regardless of overrides (user-controlled field)', () => {
    const b = getSimpleBaselines(300_000, TX_OVERRIDES);
    expect(b.vacancyPct).toBe(5);
  });

  it('overrides do not affect static fields', () => {
    const b = getSimpleBaselines(300_000, TX_OVERRIDES);
    expect(b.interestRate).toBe(7.0);
    expect(b.loanTermYears).toBe(30);
    expect(b.expenses.capExPct).toBe(5);
    expect(b.expenses.mgmtPct).toBe(10);
  });

  it('falls back to national rates when overrides is undefined', () => {
    const b = getSimpleBaselines(300_000, undefined);
    expect(b.expenses.taxes.amount).toBe(Math.round(300_000 * 0.012)); // 3600 (national 1.2 %)
    expect(b.expenses.insurance.amount).toBe(Math.round(300_000 * 0.005)); // 1500 (national 0.5 %)
    expect(b.vacancyPct).toBe(5);
  });

  it('honours a zero override rate (falsy-zero guard — ?? not ||)', () => {
    const b = getSimpleBaselines(300_000, {
      propertyTaxRate: 0,
      insuranceRate: 0,
      sourceLabel: 'Hypothetical zero-rate region',
    });
    // 0 is a valid rate and must NOT fall back to national defaults
    expect(b.expenses.taxes.amount).toBe(0);
    expect(b.expenses.insurance.amount).toBe(0);
  });
});

// ─── applySimpleBaselines ─────────────────────────────────────────────────────

describe('applySimpleBaselines', () => {
  /** User inputs with non-default simple-tier values and custom complex-tier values. */
  const userInputs: DealInputs = {
    ...DEFAULT_INPUTS,
    purchasePrice: 400_000,
    grossRent: 2_800,
    percentDown: 25,
    vacancyPct: 8,
    // Complex-tier values the user customised in complex mode:
    interestRate: 3.5,
    loanTermYears: 15,
    closingCosts: 99_999,
  };

  it('simple-tier fields come from user inputs', () => {
    const r = applySimpleBaselines(userInputs);
    expect(r.purchasePrice).toBe(400_000);
    expect(r.grossRent).toBe(2_800);
    expect(r.percentDown).toBe(25);
    expect(r.vacancyPct).toBe(8);
  });

  it('complex-tier fields are replaced by baselines (user values intentionally ignored)', () => {
    const r = applySimpleBaselines(userInputs);
    expect(r.interestRate).toBe(7.0);   // baseline wins over user's 3.5
    expect(r.loanTermYears).toBe(30);   // baseline wins over user's 15
    // closing costs are purchase-price-relative, not the user's 99_999
    expect(r.closingCosts).toBe(Math.round(400_000 * 0.02));
  });

  it('expenses are fully replaced by purchase-price-relative baselines', () => {
    const r = applySimpleBaselines(userInputs);
    const b = getSimpleBaselines(400_000);
    expect(r.expenses.taxes.amount).toBe(b.expenses.taxes.amount);
    expect(r.expenses.insurance.amount).toBe(b.expenses.insurance.amount);
    expect(r.expenses.capExPct).toBe(5);
    expect(r.expenses.mgmtPct).toBe(10);
  });

  it('does not mutate the original inputs object', () => {
    const before = { ...userInputs, expenses: { ...userInputs.expenses } };
    applySimpleBaselines(userInputs);
    expect(userInputs.interestRate).toBe(before.interestRate);
    expect(userInputs.loanTermYears).toBe(before.loanTermYears);
    expect(userInputs.expenses.taxes.amount).toBe(before.expenses.taxes.amount);
  });

  it('closing costs in result scale with purchase price', () => {
    const r200 = applySimpleBaselines({ ...DEFAULT_INPUTS, purchasePrice: 200_000 });
    const r400 = applySimpleBaselines({ ...DEFAULT_INPUTS, purchasePrice: 400_000 });
    expect(r400.closingCosts).toBe(r200.closingCosts * 2);
  });

  it('result satisfies DealInputs required fields', () => {
    const r = applySimpleBaselines(userInputs);
    // All required DealInputs fields must be present and non-null/non-undefined.
    expect(typeof r.purchasePrice).toBe('number');
    expect(typeof r.percentDown).toBe('number');
    expect(typeof r.interestRate).toBe('number');
    expect(typeof r.loanTermYears).toBe('number');
    expect(typeof r.closingCosts).toBe('number');
    expect(typeof r.rollClosingCostsIntoLoan).toBe('boolean');
    expect(typeof r.grossRent).toBe('number');
    expect(typeof r.vacancyPct).toBe('number');
    expect(r.expenses).toBeDefined();
    expect(r.expenses.taxes).toBeDefined();
    expect(r.expenses.insurance).toBeDefined();
  });
});

// ─── applySimpleBaselines — with LocationRateOverrides ───────────────────────

describe('applySimpleBaselines — with LocationRateOverrides', () => {
  const TX_OVERRIDES: LocationRateOverrides = {
    propertyTaxRate: 0.018,
    insuranceRate: 0.0123,
    sourceLabel: 'TX state averages',
  };

  const inputs = { ...DEFAULT_INPUTS, purchasePrice: 300_000, vacancyPct: 6 };

  it('override tax rate flows through to result expenses', () => {
    const r = applySimpleBaselines(inputs, TX_OVERRIDES);
    expect(r.expenses.taxes.amount).toBe(Math.round(300_000 * 0.018)); // 5400
  });

  it('override insurance rate flows through to result expenses', () => {
    const r = applySimpleBaselines(inputs, TX_OVERRIDES);
    expect(r.expenses.insurance.amount).toBe(Math.round(300_000 * 0.0123)); // 3690
  });

  it("user's visible vacancyPct is used regardless of overrides", () => {
    // vacancyPct is a simple-tier field the user owns — overrides carry no
    // vacancy data (see LocationRateOverrides docs)
    const r = applySimpleBaselines(inputs, TX_OVERRIDES);
    expect(r.vacancyPct).toBe(6);
  });

  it('without overrides uses national-average tax and insurance', () => {
    const r = applySimpleBaselines(inputs);
    expect(r.expenses.taxes.amount).toBe(Math.round(300_000 * 0.012)); // 3600
    expect(r.expenses.insurance.amount).toBe(Math.round(300_000 * 0.005)); // 1500
  });
});

// ─── BASELINE_DESCRIPTIONS ────────────────────────────────────────────────────

describe('BASELINE_DESCRIPTIONS', () => {
  const expectedKeys = [
    'interestRate', 'loanTermYears', 'closingCosts', 'rollClosingCostsIntoLoan',
    'rehab', 'otherIncome', 'vacancyPct', 'capExInNOI',
    'capExPct', 'maintPct', 'mgmtPct', 'miscPct',
    'taxes', 'insurance', 'hoa', 'other',
  ] as const;

  for (const key of expectedKeys) {
    it(`has a non-empty description for '${key}'`, () => {
      expect(BASELINE_DESCRIPTIONS[key]).toBeTruthy();
      expect(typeof BASELINE_DESCRIPTIONS[key]).toBe('string');
      expect(BASELINE_DESCRIPTIONS[key].length).toBeGreaterThan(5);
    });
  }
});
