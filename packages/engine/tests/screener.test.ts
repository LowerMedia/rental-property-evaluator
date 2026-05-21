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
