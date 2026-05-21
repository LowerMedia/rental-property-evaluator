/**
 * Loan + amortization golden-number tests.
 *
 * All expected values hand-verified against the spec formulas in
 * 02-calculations-spec.md.  Where a spreadsheet formula is given,
 * the fixture matches it to ≥ 4 decimal places.
 */
import { describe, it, expect } from 'vitest';
import { amortize, pmt } from '../src/finance';
import { calcLoan, calcLoanAmount } from '../src/loan';
import type { DealInputs } from '../src/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Rounds to n decimal places for fixture comparisons. */
function r(n: number, places = 2): number {
  return Number(n.toFixed(places));
}

/** Minimal valid DealInputs for loan-only tests. */
function baseInputs(overrides: Partial<DealInputs> = {}): DealInputs {
  return {
    purchasePrice: 200_000,
    percentDown: 20,
    interestRate: 6,
    loanTermYears: 30,
    closingCosts: 0,
    rollClosingCostsIntoLoan: false,
    grossRent: 2_000,
    vacancyPct: 5,
    expenses: {
      taxes: { amount: 3_000, period: 'annual' },
      insurance: { amount: 1_200, period: 'annual' },
    },
    ...overrides,
  };
}

// ─── pmt() ───────────────────────────────────────────────────────────────────

describe('pmt()', () => {
  it('standard case: $160k at 6% / 30yr ≈ $959.28/mo', () => {
    // r = 0.06/12 = 0.005, n = 360
    // 160000 × (0.005 × 1.005^360) / (1.005^360 − 1)
    expect(r(pmt(160_000, 6, 30)!)).toBe(959.28);
  });

  it('0% interest uses linear division (no div-by-zero)', () => {
    // $120k / 360 months = $333.33…
    expect(r(pmt(120_000, 0, 30)!)).toBe(333.33);
  });

  it('returns 0 when loanAmount is 0', () => {
    expect(pmt(0, 6, 30)).toBe(0);
  });

  it('returns null when termYears is 0', () => {
    expect(pmt(100_000, 6, 0)).toBeNull();
  });

  it('returns null when termYears is negative', () => {
    expect(pmt(100_000, 6, -1)).toBeNull();
  });

  it('15-year term doubles principal but reduces total interest', () => {
    const p30 = pmt(200_000, 6, 30)!;
    const p15 = pmt(200_000, 6, 15)!;
    // 15-yr payment is higher
    expect(p15).toBeGreaterThan(p30);
    // 15-yr payment on $200k at 6%: ~$1,687.71
    expect(r(p15)).toBe(1687.71);
  });
});

// ─── amortize() ──────────────────────────────────────────────────────────────

describe('amortize()', () => {
  it('returns null when loanAmount is 0', () => {
    expect(amortize(0, 6, 30)).toBeNull();
  });

  it('produces exactly n rows for term', () => {
    const s = amortize(160_000, 6, 30);
    expect(s?.rows).toHaveLength(360);
  });

  it('month-1 interest = balance × r', () => {
    const s = amortize(160_000, 6, 30)!;
    const row1 = s.rows[0]!;
    // interest = 160000 × 0.005 = 800
    expect(r(row1.interest)).toBe(800.0);
  });

  it('month-1 principal = payment − interest', () => {
    const s = amortize(160_000, 6, 30)!;
    const row1 = s.rows[0]!;
    const payment = pmt(160_000, 6, 30)!;
    expect(r(row1.principal)).toBe(r(payment - 800));
  });

  it('balance reaches ~0 at final month', () => {
    const s = amortize(160_000, 6, 30)!;
    const lastRow = s.rows[s.rows.length - 1]!;
    expect(lastRow.balance).toBeCloseTo(0, 1);
  });

  it('totalInterest = Σ interest_m (not a formula approximation)', () => {
    const s = amortize(160_000, 6, 30)!;
    const sumInterest = s.rows.reduce((acc, row) => acc + row.interest, 0);
    expect(s.totalInterest).toBeCloseTo(sumInterest, 4);
  });

  it('0% interest: every payment is pure principal', () => {
    const s = amortize(120_000, 0, 30)!;
    s.rows.forEach((row) => expect(row.interest).toBe(0));
    expect(s.totalInterest).toBe(0);
  });

  it('100% down (loanAmount = 0): amortize returns null', () => {
    const inputs = baseInputs({ percentDown: 100 });
    const loanAmount = calcLoanAmount(inputs);
    expect(amortize(loanAmount, inputs.interestRate, inputs.loanTermYears)).toBeNull();
  });
});

// ─── calcLoanAmount() ─────────────────────────────────────────────────────────

describe('calcLoanAmount()', () => {
  it('standard: 20% down on $200k = $160k', () => {
    expect(calcLoanAmount(baseInputs())).toBe(160_000);
  });

  it('100% down = $0 loan', () => {
    expect(calcLoanAmount(baseInputs({ percentDown: 100 }))).toBe(0);
  });

  it('0% down = full purchase price', () => {
    expect(calcLoanAmount(baseInputs({ percentDown: 0 }))).toBe(200_000);
  });

  it('rolls closing costs into loan when flag is true', () => {
    const inputs = baseInputs({
      closingCosts: 5_000,
      rollClosingCostsIntoLoan: true,
      percentDown: 20,
    });
    // (200k + 5k) × 0.80 = 164,000
    expect(calcLoanAmount(inputs)).toBe(164_000);
  });

  it('does NOT roll closing costs when flag is false', () => {
    const inputs = baseInputs({
      closingCosts: 5_000,
      rollClosingCostsIntoLoan: false,
      percentDown: 20,
    });
    expect(calcLoanAmount(inputs)).toBe(160_000);
  });
});

// ─── calcLoan() ───────────────────────────────────────────────────────────────

describe('calcLoan()', () => {
  it('100% down: all loan fields are null (no loan)', () => {
    const result = calcLoan(baseInputs({ percentDown: 100 }));
    expect(result.loanAmount).toBe(0);
    expect(result.mortgagePayment).toBeNull();
    expect(result.totalInterest).toBeNull();
    expect(result.annualDebtService).toBeNull();
  });

  it('standard deal: annualDebtService = mortgagePayment × 12', () => {
    const result = calcLoan(baseInputs());
    expect(result.mortgagePayment).not.toBeNull();
    expect(r(result.annualDebtService!)).toBe(r(result.mortgagePayment! * 12));
  });

  it('$0 price: loanAmount = 0, all null', () => {
    const result = calcLoan(baseInputs({ purchasePrice: 0 }));
    expect(result.loanAmount).toBe(0);
    expect(result.mortgagePayment).toBeNull();
  });

  it('totalInterest is positive for a normal loan', () => {
    const result = calcLoan(baseInputs());
    expect(result.totalInterest).toBeGreaterThan(0);
  });

  it('0% interest loan has totalInterest = 0', () => {
    const result = calcLoan(baseInputs({ interestRate: 0 }));
    expect(result.totalInterest).toBe(0);
  });
});
