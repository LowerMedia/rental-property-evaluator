/**
 * Input normalisation + decimal handling tests — RPE-18.
 *
 * Validates that normalizeInputs() guards every numeric field and that decimal
 * percentages (4.75%, 7.5%, etc.) survive clamping without rounding or NaN.
 */
import { describe, it, expect } from 'vitest';
import { clamp, clampNonNeg, clampPercent, normalizeInputs, safeNum } from '../src/validate';
import type { DealInputs } from '../src/types';

// ─── safeNum ─────────────────────────────────────────────────────────────────

describe('safeNum()', () => {
  it('returns the number unchanged for finite values', () => {
    expect(safeNum(4.75)).toBe(4.75);
    expect(safeNum(0)).toBe(0);
    expect(safeNum(-5)).toBe(-5);
  });

  it('returns 0 (default) for NaN', () => expect(safeNum(NaN)).toBe(0));
  it('returns 0 for Infinity', () => expect(safeNum(Infinity)).toBe(0));
  it('returns 0 for -Infinity', () => expect(safeNum(-Infinity)).toBe(0));
  it('returns 0 for undefined', () => expect(safeNum(undefined)).toBe(0));
  it('returns 0 for null', () => expect(safeNum(null)).toBe(0));
  it('returns 0 for empty string', () => expect(safeNum('')).toBe(0));
  it('parses numeric strings', () => expect(safeNum('4.75')).toBe(4.75));
  it('uses custom fallback', () => expect(safeNum(NaN, 99)).toBe(99));
});

// ─── clamp helpers ────────────────────────────────────────────────────────────

describe('clamp()', () => {
  it('passes through in-range values', () => expect(clamp(5, 0, 10)).toBe(5));
  it('clamps below min', () => expect(clamp(-1, 0, 100)).toBe(0));
  it('clamps above max', () => expect(clamp(101, 0, 100)).toBe(100));
  it('preserves decimals', () => expect(clamp(4.75, 0, 100)).toBe(4.75));
});

describe('clampPercent()', () => {
  it('allows decimal percentages like 4.75', () => expect(clampPercent(4.75)).toBe(4.75));
  it('clamps 0', () => expect(clampPercent(-1)).toBe(0));
  it('clamps 100', () => expect(clampPercent(101)).toBe(100));
  it('allows 0 (0% interest is valid)', () => expect(clampPercent(0)).toBe(0));
});

describe('clampNonNeg()', () => {
  it('passes positive values', () => expect(clampNonNeg(1.5)).toBe(1.5));
  it('passes zero', () => expect(clampNonNeg(0)).toBe(0));
  it('clamps negative to 0', () => expect(clampNonNeg(-100)).toBe(0));
});

// ─── normalizeInputs ─────────────────────────────────────────────────────────

function base(): DealInputs {
  return {
    purchasePrice: 200_000,
    percentDown: 20,
    interestRate: 6,
    loanTermYears: 30,
    closingCosts: 4_000,
    rollClosingCostsIntoLoan: false,
    grossRent: 2_000,
    vacancyPct: 5,
    expenses: {
      taxes: { amount: 2_400, period: 'annual' },
      insurance: { amount: 1_200, period: 'annual' },
    },
  };
}

describe('normalizeInputs()', () => {
  it('passes through already-valid inputs unchanged', () => {
    const normalized = normalizeInputs(base());
    expect(normalized.purchasePrice).toBe(200_000);
    expect(normalized.percentDown).toBe(20);
    expect(normalized.interestRate).toBe(6);
  });

  // ── Decimal preservation ───────────────────────────────────────────────────

  it('preserves decimal interestRate (4.75%)', () => {
    const out = normalizeInputs({ ...base(), interestRate: 4.75 });
    expect(out.interestRate).toBe(4.75);
  });

  it('preserves decimal vacancyPct (7.5%)', () => {
    const out = normalizeInputs({ ...base(), vacancyPct: 7.5 });
    expect(out.vacancyPct).toBe(7.5);
  });

  it('preserves decimal expense percents', () => {
    const out = normalizeInputs({
      ...base(),
      expenses: {
        ...base().expenses,
        capExPct: 4.5,
        maintPct: 3.25,
        mgmtPct: 8.75,
      },
    });
    expect(out.expenses.capExPct).toBe(4.5);
    expect(out.expenses.maintPct).toBe(3.25);
    expect(out.expenses.mgmtPct).toBe(8.75);
  });

  // ── NaN / Infinity guards ──────────────────────────────────────────────────

  it('replaces NaN purchasePrice with 0', () => {
    const out = normalizeInputs({ ...base(), purchasePrice: NaN });
    expect(out.purchasePrice).toBe(0);
  });

  it('replaces Infinity interestRate with 0', () => {
    const out = normalizeInputs({ ...base(), interestRate: Infinity });
    expect(out.interestRate).toBe(0);
  });

  it('clamps percentDown > 100 to 100', () => {
    const out = normalizeInputs({ ...base(), percentDown: 110 });
    expect(out.percentDown).toBe(100);
  });

  it('clamps vacancyPct < 0 to 0', () => {
    const out = normalizeInputs({ ...base(), vacancyPct: -5 });
    expect(out.vacancyPct).toBe(0);
  });

  it('clamps purchasePrice < 0 to 0', () => {
    const out = normalizeInputs({ ...base(), purchasePrice: -1 });
    expect(out.purchasePrice).toBe(0);
  });

  // ── Optional field preservation ───────────────────────────────────────────

  it('preserves undefined optional fields as undefined', () => {
    const out = normalizeInputs(base());
    expect(out.rehab).toBeUndefined();
    expect(out.units).toBeUndefined();
    expect(out.holdYears).toBeUndefined();
  });

  it('normalizes provided optional fields', () => {
    const out = normalizeInputs({ ...base(), rehab: NaN, units: 4 });
    expect(out.rehab).toBe(0); // NaN → 0
    expect(out.units).toBe(4);
  });

  // ── Growth rates may be negative (modelling decline) ──────────────────────

  it('allows negative rentGrowthPct (modelling rent decline)', () => {
    const out = normalizeInputs({ ...base(), rentGrowthPct: -2.5 });
    expect(out.rentGrowthPct).toBe(-2.5);
  });

  it('allows negative appreciationPct', () => {
    const out = normalizeInputs({ ...base(), appreciationPct: -3 });
    expect(out.appreciationPct).toBe(-3);
  });
});
