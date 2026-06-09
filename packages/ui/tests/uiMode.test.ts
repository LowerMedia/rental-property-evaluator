/**
 * RPE-62: uiMode tier-config unit tests
 *
 * Covers:
 *  - INPUT_TIER: the 4 simple-tier input fields are correct; all values are valid tiers.
 *  - RESULT_TIER: simple-tier result keys are exactly the 8 expected; all values valid.
 *  - SIMPLE_RESULT_KEYS: derived correctly from RESULT_TIER; contains the expected set.
 */

import { describe, it, expect } from 'vitest';
import {
  INPUT_TIER,
  RESULT_TIER,
  SIMPLE_RESULT_KEYS,
  type ComplexityTier,
} from '../src/state/uiMode';

const VALID_TIERS: ComplexityTier[] = ['simple', 'complex'];

// ─── INPUT_TIER ───────────────────────────────────────────────────────────────

describe('INPUT_TIER', () => {
  it('every value is a valid ComplexityTier', () => {
    for (const [key, tier] of Object.entries(INPUT_TIER)) {
      expect(VALID_TIERS, `INPUT_TIER[${key}] is invalid`).toContain(tier);
    }
  });

  it('exactly 4 simple-tier input fields', () => {
    const simpleKeys = Object.entries(INPUT_TIER)
      .filter(([, t]) => t === 'simple')
      .map(([k]) => k);
    expect(simpleKeys).toHaveLength(4);
  });

  it('simple-tier input fields are purchasePrice, percentDown, grossRent, vacancyPct', () => {
    const simpleKeys = Object.entries(INPUT_TIER)
      .filter(([, t]) => t === 'simple')
      .map(([k]) => k);
    const expected = ['purchasePrice', 'percentDown', 'grossRent', 'vacancyPct'];
    expect(simpleKeys.sort()).toEqual(expected.sort());
  });

  it('known complex-tier fields are not exposed in simple mode', () => {
    const complexFields = [
      'interestRate', 'loanTermYears', 'closingCosts', 'rollClosingCostsIntoLoan',
      'rehab', 'otherIncome', 'capExInNOI',
      'capExPct', 'maintPct', 'mgmtPct', 'miscPct',
      'taxes', 'insurance', 'hoa', 'other',
      'units', 'sqft',
      'holdYears', 'rentGrowthPct', 'expenseGrowthPct', 'appreciationPct',
      'sellingCostsPct', 'landValue', 'marginalTaxPct', 'discountRatePct',
    ] as const;
    for (const field of complexFields) {
      expect(INPUT_TIER[field], `${field} should be complex`).toBe('complex');
    }
  });

  it('covers all expected DealExpenses sub-fields (incl. other)', () => {
    const expenseFields = ['capExPct', 'maintPct', 'mgmtPct', 'miscPct', 'taxes', 'insurance', 'hoa', 'other'];
    for (const field of expenseFields) {
      expect(INPUT_TIER).toHaveProperty(field);
    }
  });
});

// ─── RESULT_TIER ──────────────────────────────────────────────────────────────

describe('RESULT_TIER', () => {
  it('every value is a valid ComplexityTier', () => {
    for (const [key, tier] of Object.entries(RESULT_TIER)) {
      expect(VALID_TIERS, `RESULT_TIER[${key}] is invalid`).toContain(tier);
    }
  });

  it('exactly 8 simple-tier result keys', () => {
    const simpleKeys = Object.entries(RESULT_TIER)
      .filter(([, t]) => t === 'simple')
      .map(([k]) => k);
    expect(simpleKeys).toHaveLength(8);
  });

  it('simple-tier result keys are the expected 8 metrics', () => {
    const simpleKeys = Object.entries(RESULT_TIER)
      .filter(([, t]) => t === 'simple')
      .map(([k]) => k)
      .sort();
    const expected = [
      'breakEvenOccupancy', 'capRate', 'cashFlowAnnual', 'cashFlowMonthly',
      'cocRoi', 'dscr', 'onePercentRule', 'totalCashInvested',
    ].sort();
    expect(simpleKeys).toEqual(expected);
  });

  it('known complex-only metrics are not in the simple tier', () => {
    const complexOnly = [
      'loanAmount', 'mortgagePayment', 'totalInterest',
      'egi', 'egiAnnual', 'opExMonthly', 'opExAnnual', 'piti',
      'noiMonthly', 'noiAnnual', 'grm', 'grossYield', 'expenseRatio',
      'ltv', 'debtYield', 'pricePerUnit', 'pricePerSqft', 'fiftyPctRuleDeviation',
    ] as const;
    for (const key of complexOnly) {
      expect(RESULT_TIER[key], `${key} should be complex`).toBe('complex');
    }
  });
});

// ─── SIMPLE_RESULT_KEYS ───────────────────────────────────────────────────────

describe('SIMPLE_RESULT_KEYS', () => {
  it('has exactly 8 entries', () => {
    expect(SIMPLE_RESULT_KEYS).toHaveLength(8);
  });

  it('matches the simple-tier keys derived from RESULT_TIER', () => {
    const fromTier = (
      Object.entries(RESULT_TIER) as [keyof typeof RESULT_TIER, ComplexityTier][]
    )
      .filter(([, t]) => t === 'simple')
      .map(([k]) => k)
      .sort();
    expect([...SIMPLE_RESULT_KEYS].sort()).toEqual(fromTier);
  });

  it('contains each of the 8 expected key names', () => {
    const expected = [
      'cashFlowMonthly', 'cashFlowAnnual', 'cocRoi', 'capRate',
      'dscr', 'onePercentRule', 'totalCashInvested', 'breakEvenOccupancy',
    ] as const;
    for (const key of expected) {
      expect(SIMPLE_RESULT_KEYS, `SIMPLE_RESULT_KEYS should contain ${key}`).toContain(key);
    }
  });

  it('does not contain any complex-only metric key', () => {
    const complexOnly = ['loanAmount', 'grm', 'noiMonthly', 'ltv', 'pricePerUnit'];
    for (const key of complexOnly) {
      expect(SIMPLE_RESULT_KEYS).not.toContain(key);
    }
  });
});
