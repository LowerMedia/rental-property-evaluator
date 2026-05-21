/**
 * Golden-number end-to-end tests for evaluate() — RPE-17.
 *
 * Every expected value in this file is hand-verified against the formulas in
 * 02-calculations-spec.md.  Do not change expected values without re-deriving
 * them from the spec.
 *
 * ── Reference Deal (Fixture A) ────────────────────────────────────────────────
 * purchasePrice  : $200,000
 * percentDown    : 20%    → down=$40,000   loan=$160,000
 * interestRate   : 6%  annual
 * loanTermYears  : 30
 * closingCosts   : $4,000  (not rolled)
 * grossRent      : $2,000/mo
 * otherIncome    : $0
 * vacancyPct     : 5%
 * expenses:
 *   capExPct     : 5%  of grossRent → $100/mo
 *   maintPct     : 5%  of grossRent → $100/mo
 *   mgmtPct      : 10% of grossRent → $200/mo
 *   taxes        : $2,400/yr        → $200/mo
 *   insurance    : $1,200/yr        → $100/mo
 * capExInNOI     : true  (default)
 *
 * Derived (spec §"Core loan math" + §"Corrected existing metrics"):
 *   loanAmount      = 200,000 × 0.80             = $160,000
 *   r               = 0.06/12                    = 0.005
 *   n               = 360
 *   mortgagePayment = 160,000×(0.005×1.005^360)/(1.005^360−1) ≈ $959.28/mo
 *   EGI             = 2,000 × 0.95               = $1,900/mo  → $22,800/yr
 *   opEx            = 100+100+200+200+100         = $700/mo    → $8,400/yr
 *   NOI             = 1,900 − 700                = $1,200/mo  → $14,400/yr
 *   cap rate        = 14,400 / 200,000 × 100     = 7.2%
 *   cashFlow        = 1,200 − 959.28             ≈ $240.72/mo
 *   TCI             = 40,000 + 4,000             = $44,000
 *   cocRoi          = (240.72×12)/44,000×100     ≈ 6.56%
 *   DSCR            = 14,400/(959.28×12)         ≈ 1.2509
 *   GRM             = 200,000/(2,000×12)         ≈ 8.33
 *   1% rule         = 2,000/200,000×100          = 1.0%
 *   PITI            = 959.28+200+100             ≈ 1,259.28
 *   LTV             = 160,000/200,000×100        = 80%
 *   grossYield      = 24,000/200,000×100         = 12.0%
 *   debtYield       = 14,400/160,000×100         = 9.0%
 *   expenseRatio    = 8,400/22,800×100           ≈ 36.84%
 *   breakEven       = (700+959.28)/2,000×100     ≈ 82.96%
 *   fiftyPctDev     = (8,400−11,400)/22,800×100 ≈ −13.16%
 */

import { describe, it, expect } from 'vitest';
import { evaluate } from '../src/index';
import type { DealInputs, ScreenerResults } from '../src/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function r(n: number, places = 2): number {
  return Number(n.toFixed(places));
}

function fixtureA(overrides: Partial<DealInputs> = {}): DealInputs {
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
      capExPct: 5,
      maintPct: 5,
      mgmtPct: 10,
      taxes: { amount: 2_400, period: 'annual' },
      insurance: { amount: 1_200, period: 'annual' },
    },
    ...overrides,
  };
}

// ─── Fixture A: standard deal — all screener metrics ─────────────────────────

describe('Fixture A — standard deal (6% / 30yr / 20% down)', () => {
  const inputs = fixtureA();
  const res = evaluate(inputs) as ScreenerResults;

  it('loanAmount = $160,000', () => expect(res.loanAmount).toBe(160_000));

  it('mortgagePayment ≈ $959.28/mo', () => expect(r(res.mortgagePayment!)).toBe(959.28));

  it('totalInterest > $0 (from amortization schedule)', () => {
    expect(res.totalInterest).not.toBeNull();
    expect(res.totalInterest!).toBeGreaterThan(100_000);
  });

  it('EGI = $1,900/mo', () => expect(r(res.egi!)).toBe(1_900.0));
  it('egiAnnual = $22,800/yr', () => expect(r(res.egiAnnual!)).toBe(22_800.0));

  it('opExMonthly = $700/mo', () => expect(r(res.opExMonthly!)).toBe(700.0));
  it('opExAnnual = $8,400/yr', () => expect(r(res.opExAnnual!)).toBe(8_400.0));

  it('PITI ≈ $1,259.28/mo', () => expect(r(res.piti!)).toBe(r(959.28 + 200 + 100)));

  it('NOI = $1,200/mo', () => expect(r(res.noiMonthly!)).toBe(1_200.0));
  it('NOI annual = $14,400/yr', () => expect(r(res.noiAnnual!)).toBe(14_400.0));

  it('cap rate = 7.20%', () => expect(r(res.capRate!)).toBe(7.2));

  it('cashFlowMonthly ≈ $240.72/mo', () => {
    expect(r(res.cashFlowMonthly!)).toBe(r(1_200 - 959.28));
  });

  it('cashFlowAnnual = cashFlowMonthly × 12', () => {
    expect(r(res.cashFlowAnnual!)).toBe(r(res.cashFlowMonthly! * 12));
  });

  it('totalCashInvested = $44,000', () => expect(res.totalCashInvested).toBe(44_000));

  it('cocRoi ≈ 6.57%', () => {
    expect(r(res.cocRoi!)).toBe(r((res.cashFlowAnnual! / 44_000) * 100));
  });

  it('DSCR ≈ 1.25', () => {
    expect(r(res.dscr!, 4)).toBe(r(14_400 / (959.28 * 12), 4));
  });

  it('GRM ≈ 8.33  (price / annual rent — NOT monthly)', () => {
    expect(r(res.grm!, 2)).toBe(r(200_000 / 24_000, 2));
    expect(r(res.grm!)).toBe(8.33);
  });

  it('1% rule = 1.00%', () => expect(r(res.onePercentRule!)).toBe(1.0));

  it('LTV = 80%', () => expect(r(res.ltv!)).toBe(80.0));
  it('debtYield = 9.00%', () => expect(r(res.debtYield!)).toBe(9.0));
  it('grossYield = 12.00%', () => expect(r(res.grossYield!)).toBe(12.0));
  it('expenseRatio ≈ 36.84%', () => {
    expect(r(res.expenseRatio!, 2)).toBe(r((8_400 / 22_800) * 100, 2));
  });
  it('breakEvenOccupancy ≈ 82.96%', () => {
    expect(r(res.breakEvenOccupancy!, 2)).toBe(r(((700 + 959.28) / 2_000) * 100, 2));
  });
  it('fiftyPctRuleDeviation: modeled opEx is below 50% of EGI (good)', () => {
    expect(res.fiftyPctRuleDeviation!).toBeLessThan(0);
    expect(r(res.fiftyPctRuleDeviation!, 2)).toBe(r(((8_400 - 11_400) / 22_800) * 100, 2));
  });
});

// ─── Fixture B: 0% interest — linear amortization, no NaN ────────────────────

describe('Fixture B — 0% interest (linear amortization)', () => {
  const res = evaluate(fixtureA({ interestRate: 0 })) as ScreenerResults;

  it('mortgagePayment = loanAmount / (termYears × 12)', () => {
    // 160,000 / 360 ≈ 444.44
    expect(r(res.mortgagePayment!)).toBe(r(160_000 / 360));
  });

  it('totalInterest = 0', () => expect(res.totalInterest).toBe(0));

  it('no NaN or Infinity in any result field', () => {
    Object.values(res).forEach((v) => {
      if (v !== null) {
        expect(isNaN(v as number)).toBe(false);
        expect(isFinite(v as number)).toBe(true);
      }
    });
  });

  it('DSCR still computable at 0% interest', () => {
    expect(res.dscr).not.toBeNull();
    expect(res.dscr!).toBeGreaterThan(0);
  });
});

// ─── Fixture C: 100% down — no loan, null debt metrics ───────────────────────

describe('Fixture C — 100% down (cash purchase)', () => {
  const res = evaluate(fixtureA({ percentDown: 100 })) as ScreenerResults;

  it('loanAmount = 0', () => expect(res.loanAmount).toBe(0));
  it('mortgagePayment = null', () => expect(res.mortgagePayment).toBeNull());
  it('totalInterest = null', () => expect(res.totalInterest).toBeNull());
  it('DSCR = null (no debt service)', () => expect(res.dscr).toBeNull());
  it('debtYield = null (no loan)', () => expect(res.debtYield).toBeNull());
  it('LTV = 0%', () => expect(res.ltv).toBe(0));
  it('cashFlowMonthly = NOI (no mortgage deduction)', () => {
    expect(r(res.cashFlowMonthly!)).toBe(r(res.noiMonthly!));
  });
  it('PITI = T&I only (no P&I)', () => {
    // taxes 200 + insurance 100 = 300
    expect(r(res.piti!)).toBe(300.0);
  });
  it('NOI and cap rate are still valid', () => {
    expect(res.capRate).not.toBeNull();
    expect(res.capRate!).toBeGreaterThan(0);
  });
});

// ─── Fixture D: $0 purchase price — all null ────────────────────────────────

describe('Fixture D — $0 purchase price', () => {
  const res = evaluate(fixtureA({ purchasePrice: 0 })) as ScreenerResults;

  const expectedNullFields = [
    'loanAmount', 'mortgagePayment', 'totalInterest',
    'egi', 'egiAnnual', 'opExMonthly', 'opExAnnual', 'piti',
    'noiMonthly', 'noiAnnual', 'capRate',
    'cashFlowMonthly', 'cashFlowAnnual', 'cocRoi', 'dscr',
    'grm', 'onePercentRule',
  ] as (keyof ScreenerResults)[];

  expectedNullFields.forEach((field) => {
    it(`${field} is null`, () => expect(res[field]).toBeNull());
  });
});

// ─── Fixture E: decimal inputs — no rounding errors ─────────────────────────

describe('Fixture E — decimal inputs (RPE-18)', () => {
  // Exercises the decimal-handling requirement (#54):
  // all decimal inputs should flow through without floating-point corruption.
  const inputs = fixtureA({
    interestRate: 6.75,
    vacancyPct: 7.5,
    expenses: {
      capExPct: 4.5,
      maintPct: 3.75,
      mgmtPct: 8.5,
      taxes: { amount: 3_150, period: 'annual' },
      insurance: { amount: 975, period: 'annual' },
    },
  });
  const res = evaluate(inputs) as ScreenerResults;

  it('no NaN or Infinity in any field', () => {
    Object.values(res).forEach((v) => {
      if (v !== null) {
        expect(isNaN(v as number)).toBe(false);
        expect(isFinite(v as number)).toBe(true);
      }
    });
  });

  it('EGI uses decimal vacancy correctly: 2000 × (1 − 0.075)', () => {
    expect(r(res.egi!)).toBe(r(2_000 * (1 - 0.075)));
  });

  it('capEx pct uses decimal: 4.5% × 2000 = $90/mo', () => {
    // capEx = 4.5/100 × 2000 = 90
    // maint = 3.75/100 × 2000 = 75
    // mgmt = 8.5/100 × 2000 = 170
    // taxes = 3150/12 = 262.5
    // insurance = 975/12 = 81.25
    // total = 90+75+170+262.5+81.25 = 678.75
    expect(r(res.opExMonthly!, 2)).toBe(678.75);
  });

  it('mortgagePayment at 6.75% is between 6% and 7% values', () => {
    const at6 = (evaluate(fixtureA({ interestRate: 6 })) as ScreenerResults).mortgagePayment!;
    const at7 = (evaluate(fixtureA({ interestRate: 7 })) as ScreenerResults).mortgagePayment!;
    expect(res.mortgagePayment!).toBeGreaterThan(at6);
    expect(res.mortgagePayment!).toBeLessThan(at7);
  });
});

// ─── Fixture F: closing costs rolled into loan ───────────────────────────────

describe('Fixture F — closing costs rolled into loan', () => {
  const res = evaluate(
    fixtureA({ closingCosts: 6_000, rollClosingCostsIntoLoan: true }),
  ) as ScreenerResults;

  it('loanAmount = (purchasePrice + closingCosts) × (1 − percentDown)', () => {
    // (200k + 6k) × 0.80 = 164,800
    expect(res.loanAmount).toBe(164_800);
  });

  it('totalCashInvested excludes rolled closing costs', () => {
    // down = 40,000; closing NOT counted (rolled)
    expect(res.totalCashInvested).toBe(40_000);
  });

  it('mortgagePayment is higher than without rolled costs', () => {
    const base = evaluate(fixtureA()) as ScreenerResults;
    expect(res.mortgagePayment!).toBeGreaterThan(base.mortgagePayment!);
  });
});

// ─── Fixture G: rehab adds to cash invested ──────────────────────────────────

describe('Fixture G — rehab cost', () => {
  const res = evaluate(fixtureA({ rehab: 15_000 })) as ScreenerResults;

  it('totalCashInvested includes rehab', () => {
    // 40k down + 4k closing + 15k rehab = 59k
    expect(res.totalCashInvested).toBe(59_000);
  });

  it('rehab does NOT affect mortgage or NOI (acquisition + opex only)', () => {
    const base = evaluate(fixtureA()) as ScreenerResults;
    expect(res.mortgagePayment).toBeCloseTo(base.mortgagePayment!, 4);
    expect(res.noiMonthly).toBeCloseTo(base.noiMonthly!, 4);
  });
});
