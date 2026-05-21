import { describe, it, expect } from 'vitest';
import { amortize } from '@rpe/engine';
import { buildAmortizationYears, findCrossoverYear } from '../src/utils/amortization';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** 30-year, $240,000 @ 7% loan */
function schedule30() {
  const s = amortize(240_000, 7, 30);
  if (!s) throw new Error('amortize returned null');
  return s;
}

/** 5-year, $50,000 @ 6% loan — short term for edge cases */
function schedule5() {
  const s = amortize(50_000, 6, 5);
  if (!s) throw new Error('amortize returned null');
  return s;
}

// ─── buildAmortizationYears ───────────────────────────────────────────────────

describe('buildAmortizationYears', () => {
  it('returns 30 entries for a 30-year schedule', () => {
    expect(buildAmortizationYears(schedule30()).length).toBe(30);
  });

  it('returns 5 entries for a 5-year schedule', () => {
    expect(buildAmortizationYears(schedule5()).length).toBe(5);
  });

  it('year numbers are 1-indexed and sequential', () => {
    const years = buildAmortizationYears(schedule5());
    expect(years.map((y) => y.year)).toEqual([1, 2, 3, 4, 5]);
  });

  it('annualPayment ≈ monthly payment × 12', () => {
    const s = schedule30();
    const monthlyPayment = s.rows[0]!.payment;
    const years = buildAmortizationYears(s);
    expect(years[0]!.annualPayment).toBeCloseTo(monthlyPayment * 12, 2);
  });

  it('annualPayment = principalPaid + interestPaid for each year', () => {
    const years = buildAmortizationYears(schedule30());
    for (const y of years) {
      expect(y.annualPayment).toBeCloseTo(y.principalPaid + y.interestPaid, 6);
    }
  });

  it('endingBalance at final year is ≈ 0 (fully amortized)', () => {
    const years = buildAmortizationYears(schedule30());
    expect(years[29]!.endingBalance).toBeCloseTo(0, 0);
  });

  it('endingBalance decreases each year', () => {
    const years = buildAmortizationYears(schedule30());
    for (let i = 1; i < years.length; i++) {
      expect(years[i]!.endingBalance).toBeLessThan(years[i - 1]!.endingBalance);
    }
  });

  it('principalPaid increases each year (more goes to principal as balance falls)', () => {
    const years = buildAmortizationYears(schedule30());
    for (let i = 1; i < years.length; i++) {
      expect(years[i]!.principalPaid).toBeGreaterThan(years[i - 1]!.principalPaid);
    }
  });

  it('interestPaid decreases each year', () => {
    const years = buildAmortizationYears(schedule30());
    for (let i = 1; i < years.length; i++) {
      expect(years[i]!.interestPaid).toBeLessThan(years[i - 1]!.interestPaid);
    }
  });

  it('cumulativePrincipal is the running sum of principalPaid', () => {
    const years = buildAmortizationYears(schedule30());
    let running = 0;
    for (const y of years) {
      running += y.principalPaid;
      expect(y.cumulativePrincipal).toBeCloseTo(running, 6);
    }
  });

  it('cumulativeInterest is the running sum of interestPaid', () => {
    const years = buildAmortizationYears(schedule30());
    let running = 0;
    for (const y of years) {
      running += y.interestPaid;
      expect(y.cumulativeInterest).toBeCloseTo(running, 6);
    }
  });

  it('total cumulative interest matches schedule.totalInterest', () => {
    const s = schedule30();
    const years = buildAmortizationYears(s);
    const totalInterest = years[years.length - 1]!.cumulativeInterest;
    expect(totalInterest).toBeCloseTo(s.totalInterest, 2);
  });

  it('total cumulative principal ≈ original loan amount', () => {
    const s = schedule30();
    const years = buildAmortizationYears(s);
    const totalPrincipal = years[years.length - 1]!.cumulativePrincipal;
    expect(totalPrincipal).toBeCloseTo(240_000, 0);
  });

  it('returns empty array for schedule with 0 rows', () => {
    expect(buildAmortizationYears({ rows: [], totalInterest: 0 })).toEqual([]);
  });
});

// ─── findCrossoverYear ────────────────────────────────────────────────────────

describe('findCrossoverYear', () => {
  it('returns -1 for empty years array', () => {
    expect(findCrossoverYear([])).toBe(-1);
  });

  it('returns a valid index for a standard 30-year loan at 7%', () => {
    const years = buildAmortizationYears(schedule30());
    const idx = findCrossoverYear(years);
    // At 7%, crossover happens somewhere in the second half of the term
    expect(idx).toBeGreaterThan(0);
    expect(idx).toBeLessThan(years.length);
  });

  it('at the crossover year, principalPaid >= interestPaid', () => {
    const years = buildAmortizationYears(schedule30());
    const idx = findCrossoverYear(years);
    if (idx >= 0) {
      expect(years[idx]!.principalPaid).toBeGreaterThanOrEqual(years[idx]!.interestPaid);
    }
  });

  it('before crossover year, principalPaid < interestPaid', () => {
    const years = buildAmortizationYears(schedule30());
    const idx = findCrossoverYear(years);
    if (idx > 0) {
      expect(years[idx - 1]!.principalPaid).toBeLessThan(years[idx - 1]!.interestPaid);
    }
  });

  it('returns index 0 for a 0% interest loan (principal always ≥ interest)', () => {
    const s = amortize(10_000, 0, 5);
    expect(s).not.toBeNull();
    if (!s) return; // narrow type for TS
    const years = buildAmortizationYears(s);
    expect(findCrossoverYear(years)).toBe(0);
  });
});
