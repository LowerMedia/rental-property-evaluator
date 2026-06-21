/**
 * Screener golden-number tests — RPE-14 through RPE-16.
 *
 * Reference deal used throughout:
 *   purchasePrice : $200,000
 *   percentDown   : 25%  → down = $50,000, loan = $150,000
 *   interestRate  : 6%  (annual)
 *   loanTermYears : 30
 *   closingCosts  : $4,000 (not rolled)
 *   grossRent     : $1,800/mo
 *   otherIncome   : $100/mo
 *   vacancyPct    : 5%
 *   expenses:
 *     capExPct    : 5%  of grossRent → $90/mo
 *     maintPct    : 5%  of grossRent → $90/mo
 *     mgmtPct     : 10% of grossRent → $180/mo
 *     taxes       : $3,600/yr        → $300/mo
 *     insurance   : $1,200/yr        → $100/mo
 *     hoa         : $0
 *   capExInNOI    : true (default — conservative)
 *
 * Derived:
 *   loanAmount    = 200,000 × 0.75 = 150,000
 *   mortgagePayment ≈ $899.33/mo
 *   EGI = (1800 + 100) × 0.95 = 1805/mo
 *   opEx = 90 + 90 + 180 + 300 + 100 = 760/mo
 *   NOI  = 1805 − 760 = 1045/mo  → 12,540/yr
 *   capRate = 12,540 / 200,000 × 100 = 6.27%
 *   cashFlow = 1045 − 899.33 ≈ 145.67/mo
 *   totalCashInvested = 50,000 + 4,000 + 0 = 54,000
 *   cocRoi = (145.67 × 12) / 54,000 × 100 ≈ 3.23%
 *   DSCR = 12,540 / (899.33 × 12) ≈ 1.163
 *   PITI = 899.33 + 300 + 100 = 1,299.33/mo
 */
import { describe, it, expect } from 'vitest';
import { calcScreener } from '../src/screener';
import type { DealInputs } from '../src/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function r(n: number, places = 2): number {
  return Number(n.toFixed(places));
}

function refDeal(overrides: Partial<DealInputs> = {}): DealInputs {
  return {
    purchasePrice: 200_000,
    percentDown: 25,
    interestRate: 6,
    loanTermYears: 30,
    closingCosts: 4_000,
    rollClosingCostsIntoLoan: false,
    grossRent: 1_800,
    otherIncome: 100,
    vacancyPct: 5,
    expenses: {
      capExPct: 5,
      maintPct: 5,
      mgmtPct: 10,
      taxes: { amount: 3_600, period: 'annual' },
      insurance: { amount: 1_200, period: 'annual' },
    },
    ...overrides,
  };
}

// ─── Cap rate basis (RPE-105) ─────────────────────────────────────────────────

describe('Cap rate all-in basis (RPE-105)', () => {
  it('defaults to purchase-price basis (unchanged by rehab/closing)', () => {
    expect(r(calcScreener(refDeal({ rehab: 20_000 })).capRate!)).toBe(6.27);
  });

  it('all-in basis includes rehab + out-of-pocket closing', () => {
    // basis = 200,000 + 20,000 rehab + 4,000 closing (not rolled) = 224,000
    expect(r(calcScreener(refDeal({ rehab: 20_000, capRateAllIn: true })).capRate!)).toBe(5.6);
  });

  it('all-in basis excludes closing when it is rolled into the loan', () => {
    // basis = 200,000 + 20,000 rehab + 0 closing = 220,000
    const res = calcScreener(refDeal({ rehab: 20_000, capRateAllIn: true, rollClosingCostsIntoLoan: true }));
    expect(r(res.capRate!)).toBe(5.7);
  });

  it('all-in with no rehab and rolled closing equals the price basis', () => {
    expect(r(calcScreener(refDeal({ capRateAllIn: true, rollClosingCostsIntoLoan: true })).capRate!)).toBe(6.27);
  });
});

// ─── EGI ─────────────────────────────────────────────────────────────────────

describe('EGI', () => {
  it('(grossRent + otherIncome) × (1 − vacancy%)', () => {
    const res = calcScreener(refDeal());
    expect(r(res.egi!)).toBe(1805.0); // (1800+100) × 0.95
    expect(r(res.egiAnnual!)).toBe(21_660.0);
  });

  it('0% vacancy: EGI = grossRent + otherIncome', () => {
    const res = calcScreener(refDeal({ vacancyPct: 0 }));
    expect(r(res.egi!)).toBe(1_900.0);
  });

  it('100% vacancy: EGI = 0', () => {
    const res = calcScreener(refDeal({ vacancyPct: 100 }));
    expect(res.egi).toBe(0);
  });
});

// ─── Operating expenses ───────────────────────────────────────────────────────

describe('OpEx', () => {
  it('sums % and fixed expenses correctly', () => {
    // capEx=90, maint=90, mgmt=180, taxes=300, insurance=100 → 760/mo
    const res = calcScreener(refDeal());
    expect(r(res.opExMonthly!)).toBe(760.0);
    expect(r(res.opExAnnual!)).toBe(9_120.0);
  });

  it('capExInNOI=false excludes capEx from OpEx', () => {
    const res = calcScreener(refDeal({ capExInNOI: false }));
    expect(r(res.opExMonthly!)).toBe(670.0); // 760 − 90 capEx
  });

  it('annual expense inputs are divided by 12', () => {
    const res = calcScreener(
      refDeal({
        expenses: {
          taxes: { amount: 1_200, period: 'annual' }, // 100/mo
          insurance: { amount: 600, period: 'annual' }, // 50/mo
        },
      }),
    );
    // opEx = taxes(100) + insurance(50) = 150/mo (no % expenses)
    expect(r(res.opExMonthly!)).toBe(150.0);
  });

  it('monthly expense inputs are used directly (no /12 applied)', () => {
    // Override expenses entirely: only taxes + insurance, monthly period.
    // 300/mo + 100/mo = 400/mo. If the engine wrongly treated them as annual,
    // it would return 300/12 + 100/12 ≈ 33.33. Getting 400 proves monthly → used as-is.
    const res = calcScreener(
      refDeal({
        expenses: {
          taxes: { amount: 300, period: 'monthly' },
          insurance: { amount: 100, period: 'monthly' },
        },
      }),
    );
    expect(r(res.opExMonthly!)).toBe(400.0);
  });
});

// ─── PITI ─────────────────────────────────────────────────────────────────────

describe('PITI', () => {
  it('mortgagePayment + taxes/12 + insurance/12', () => {
    const res = calcScreener(refDeal());
    // mortgage ≈ 899.33, taxes=300, insurance=100 → ≈ 1299.33
    expect(r(res.piti!)).toBe(r(res.mortgagePayment! + 300 + 100));
  });

  it('cash buyer: PITI = taxes + insurance (no mortgage)', () => {
    const res = calcScreener(refDeal({ percentDown: 100 }));
    expect(r(res.piti!)).toBe(400.0); // 300 + 100
  });
});

// ─── NOI ─────────────────────────────────────────────────────────────────────

describe('NOI', () => {
  it('EGI − opExMonthly (monthly)', () => {
    const res = calcScreener(refDeal());
    expect(r(res.noiMonthly!)).toBe(r(res.egi! - res.opExMonthly!));
    expect(r(res.noiMonthly!)).toBe(1045.0);
  });

  it('noiAnnual = noiMonthly × 12', () => {
    const res = calcScreener(refDeal());
    expect(r(res.noiAnnual!)).toBe(r(res.noiMonthly! * 12));
    expect(r(res.noiAnnual!)).toBe(12_540.0);
  });
});

// ─── Cap rate ─────────────────────────────────────────────────────────────────

describe('Cap rate', () => {
  it('NOI_annual / purchasePrice × 100', () => {
    const res = calcScreener(refDeal());
    expect(r(res.capRate!)).toBe(r((12_540 / 200_000) * 100));
    expect(r(res.capRate!)).toBe(6.27);
  });

  it('$0 price returns all-null', () => {
    const res = calcScreener(refDeal({ purchasePrice: 0 }));
    expect(res.capRate).toBeNull();
  });
});

// ─── Cash flow ────────────────────────────────────────────────────────────────

describe('Cash flow', () => {
  it('monthly = NOI − mortgagePayment', () => {
    const res = calcScreener(refDeal());
    expect(r(res.cashFlowMonthly!)).toBe(r(res.noiMonthly! - res.mortgagePayment!));
  });

  it('cash buyer: monthly CF = NOI (no mortgage deduction)', () => {
    const res = calcScreener(refDeal({ percentDown: 100 }));
    expect(r(res.cashFlowMonthly!)).toBe(r(res.noiMonthly!));
  });

  it('cashFlowAnnual = cashFlowMonthly × 12', () => {
    const res = calcScreener(refDeal());
    expect(r(res.cashFlowAnnual!)).toBe(r(res.cashFlowMonthly! * 12));
  });
});

// ─── Total cash invested ──────────────────────────────────────────────────────

describe('totalCashInvested', () => {
  it('downPayment + closingCosts (not rolled) + rehab', () => {
    // 25% × 200k = 50k + 4k closing + 0 rehab = 54k
    const res = calcScreener(refDeal());
    expect(res.totalCashInvested).toBe(54_000);
  });

  it('excludes closingCosts when rolled into loan', () => {
    const res = calcScreener(refDeal({ rollClosingCostsIntoLoan: true }));
    expect(res.totalCashInvested).toBe(50_000);
  });

  it('adds rehab to cash invested', () => {
    const res = calcScreener(refDeal({ rehab: 10_000 }));
    expect(res.totalCashInvested).toBe(64_000);
  });
});

// ─── CoC ROI ──────────────────────────────────────────────────────────────────

describe('CoC ROI', () => {
  it('cashFlowAnnual / totalCashInvested × 100', () => {
    const res = calcScreener(refDeal());
    expect(r(res.cocRoi!, 4)).toBe(
      r((res.cashFlowAnnual! / res.totalCashInvested!) * 100, 4),
    );
  });

  it('null when totalCashInvested = 0', () => {
    // 0% down + closing costs rolled into loan + no rehab → downPayment=0, closingOut=0, rehab=0
    const res = calcScreener(
      refDeal({ percentDown: 0, closingCosts: 0, rollClosingCostsIntoLoan: true, rehab: 0 }),
    );
    expect(res.totalCashInvested).toBe(0);
    expect(res.cocRoi).toBeNull();
  });
});

// ─── DSCR ─────────────────────────────────────────────────────────────────────

describe('DSCR', () => {
  it('NOI_annual / annualDebtService', () => {
    const res = calcScreener(refDeal());
    const expectedDscr = res.noiAnnual! / (res.mortgagePayment! * 12);
    expect(r(res.dscr!, 4)).toBe(r(expectedDscr, 4));
  });

  it('null for cash purchase (no debt service)', () => {
    const res = calcScreener(refDeal({ percentDown: 100 }));
    expect(res.dscr).toBeNull();
  });
});

// ─── 1% rule ──────────────────────────────────────────────────────────────────

describe('1% rule', () => {
  it('grossRent_monthly / purchasePrice × 100', () => {
    const res = calcScreener(refDeal());
    // 1800 / 200000 × 100 = 0.9%
    expect(r(res.onePercentRule!)).toBe(0.9);
  });

  it('exactly 1% when rent = 1% of price', () => {
    const res = calcScreener(refDeal({ grossRent: 2_000, purchasePrice: 200_000 }));
    expect(r(res.onePercentRule!)).toBe(1.0);
  });
});

// ─── New screener metrics (RPE-16) ───────────────────────────────────────────

describe('new screener metrics', () => {
  it('breakEvenOccupancy: (opEx + mortgage) / grossPotentialRent × 100', () => {
    const res = calcScreener(refDeal());
    // (760 + 899.33) / (1800 + 100) × 100 = 1659.33 / 1900 × 100 ≈ 87.33%
    const expected = ((res.opExMonthly! + res.mortgagePayment!) / 1_900) * 100;
    expect(r(res.breakEvenOccupancy!, 2)).toBe(r(expected, 2));
  });

  it('breakEvenOccupancy: cash buyer has no mortgage in the formula', () => {
    const res = calcScreener(refDeal({ percentDown: 100 }));
    const expected = (res.opExMonthly! / 1_900) * 100;
    expect(r(res.breakEvenOccupancy!, 2)).toBe(r(expected, 2));
  });

  it('expenseRatio: opExAnnual / egiAnnual × 100', () => {
    const res = calcScreener(refDeal());
    expect(r(res.expenseRatio!, 4)).toBe(r((res.opExAnnual! / res.egiAnnual!) * 100, 4));
  });

  it('LTV: loanAmount / purchasePrice × 100', () => {
    const res = calcScreener(refDeal());
    // loan = 150k, price = 200k → 75%
    expect(r(res.ltv!)).toBe(75.0);
  });

  it('LTV is 0 for cash purchase (100% down)', () => {
    const res = calcScreener(refDeal({ percentDown: 100 }));
    expect(res.ltv).toBe(0);
  });

  it('debtYield: NOI_annual / loanAmount × 100', () => {
    const res = calcScreener(refDeal());
    expect(r(res.debtYield!, 4)).toBe(r((res.noiAnnual! / res.loanAmount!) * 100, 4));
  });

  it('debtYield is null for cash purchase (no loan)', () => {
    const res = calcScreener(refDeal({ percentDown: 100 }));
    expect(res.debtYield).toBeNull();
  });

  it('grossYield: grossRent × 12 / purchasePrice × 100', () => {
    // 1800 × 12 / 200000 × 100 = 10.8%
    const res = calcScreener(refDeal());
    expect(r(res.grossYield!)).toBe(10.8);
  });

  it('pricePerUnit: purchasePrice / units', () => {
    const res = calcScreener(refDeal({ units: 4 }));
    expect(res.pricePerUnit).toBe(50_000);
  });

  it('pricePerUnit is null when units not provided', () => {
    expect(calcScreener(refDeal()).pricePerUnit).toBeNull();
  });

  it('pricePerSqft: purchasePrice / sqft', () => {
    const res = calcScreener(refDeal({ sqft: 2_000 }));
    expect(res.pricePerSqft).toBe(100);
  });

  it('pricePerSqft is null when sqft not provided', () => {
    expect(calcScreener(refDeal()).pricePerSqft).toBeNull();
  });

  it('fiftyPctRuleDeviation: (opEx − 0.5×EGI) / EGI × 100', () => {
    const res = calcScreener(refDeal());
    const expected = ((res.opExAnnual! - 0.5 * res.egiAnnual!) / res.egiAnnual!) * 100;
    expect(r(res.fiftyPctRuleDeviation!, 4)).toBe(r(expected, 4));
  });
});

// ─── GRM (RPE-15 fix) ─────────────────────────────────────────────────────────

describe('GRM', () => {
  it('uses ANNUAL rent: purchasePrice / (grossRent × 12)', () => {
    // 200,000 / (1,800 × 12) = 200,000 / 21,600 ≈ 9.26
    const res = calcScreener(refDeal());
    expect(r(res.grm!, 2)).toBe(r(200_000 / (1_800 * 12), 2));
    expect(r(res.grm!)).toBe(9.26);
  });

  it('old monthly-rent GRM would have been 9.26 × 12 = 111 — this confirms the fix', () => {
    const res = calcScreener(refDeal());
    // The wrong formula (price / monthly) would give ~111
    expect(res.grm!).toBeLessThan(20); // correct annual-based GRM is < 20
  });

  it('null when grossRent is 0', () => {
    const res = calcScreener(refDeal({ grossRent: 0 }));
    expect(res.grm).toBeNull();
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('$0 purchasePrice → all-null results', () => {
    const res = calcScreener(refDeal({ purchasePrice: 0 }));
    expect(res.capRate).toBeNull();
    expect(res.dscr).toBeNull();
    expect(res.cocRoi).toBeNull();
    expect(res.grm).toBeNull();
  });

  it('0% interest: no NaN in results', () => {
    const res = calcScreener(refDeal({ interestRate: 0 }));
    Object.values(res).forEach((v) => {
      if (v !== null) expect(isNaN(v as number)).toBe(false);
    });
  });
});
