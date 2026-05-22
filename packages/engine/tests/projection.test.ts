import { describe, it, expect } from 'vitest';
import { calcProjection, calcProForma, evaluate, calcScreener, normalizeInputs } from '../src/index';
import type { DealInputs } from '../src/index';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE: DealInputs = {
  purchasePrice: 300_000,
  percentDown: 20,
  interestRate: 7,
  loanTermYears: 30,
  closingCosts: 6_000,
  rollClosingCostsIntoLoan: false,
  rehab: 0,
  grossRent: 2_200,
  otherIncome: 0,
  vacancyPct: 5,
  expenses: {
    capExPct: 5,
    maintPct: 5,
    mgmtPct: 10,
    taxes: { amount: 4_800, period: 'annual' },
    insurance: { amount: 1_800, period: 'annual' },
    hoa: { amount: 0, period: 'monthly' },
  },
  capExInNOI: true,
};

// ─── calcProjection — no holdYears ────────────────────────────────────────────

describe('calcProjection — no holdYears', () => {
  it('returns empty array when holdYears is absent', () => {
    expect(calcProjection(normalizeInputs(BASE))).toEqual([]);
  });

  it('returns empty array when holdYears is 0', () => {
    expect(calcProjection(normalizeInputs({ ...BASE, holdYears: 0 }))).toEqual([]);
  });

  it('returns empty array when holdYears is negative', () => {
    expect(calcProjection(normalizeInputs({ ...BASE, holdYears: -5 }))).toEqual([]);
  });
});

// ─── calcProjection — zero growth rates ──────────────────────────────────────

describe('calcProjection — zero growth rates (Year 1 = screener base)', () => {
  const inputs = normalizeInputs({
    ...BASE,
    holdYears: 5,
    rentGrowthPct: 0,
    expenseGrowthPct: 0,
    appreciationPct: 0,
  });
  const projection = calcProjection(inputs);
  const screener = calcScreener(inputs);

  it('returns exactly holdYears rows', () => {
    expect(projection.length).toBe(5);
  });

  it('year numbers are 1-indexed and sequential', () => {
    expect(projection.map((y) => y.year)).toEqual([1, 2, 3, 4, 5]);
  });

  it('Year 1 grossRentAnnual matches screener grossRent × 12', () => {
    expect(projection[0]!.grossRentAnnual).toBeCloseTo(inputs.grossRent * 12, 6);
  });

  it('Year 1 egiAnnual matches screener egiAnnual', () => {
    expect(projection[0]!.egiAnnual).toBeCloseTo(screener.egiAnnual!, 6);
  });

  it('Year 1 opExAnnual matches screener opExAnnual', () => {
    expect(projection[0]!.opExAnnual).toBeCloseTo(screener.opExAnnual!, 6);
  });

  it('Year 1 noiAnnual matches screener noiAnnual', () => {
    expect(projection[0]!.noiAnnual).toBeCloseTo(screener.noiAnnual!, 6);
  });

  it('Year 1 cashFlowAnnual matches screener cashFlowAnnual', () => {
    expect(projection[0]!.cashFlowAnnual).toBeCloseTo(screener.cashFlowAnnual!, 6);
  });

  it('all years are identical when growth rates are 0', () => {
    // Cash flow, EGI, OpEx, NOI should be the same every year at 0% growth
    for (let i = 1; i < projection.length; i++) {
      expect(projection[i]!.grossRentAnnual).toBeCloseTo(projection[0]!.grossRentAnnual, 4);
      expect(projection[i]!.egiAnnual).toBeCloseTo(projection[0]!.egiAnnual, 4);
      expect(projection[i]!.opExAnnual).toBeCloseTo(projection[0]!.opExAnnual, 4);
      expect(projection[i]!.cashFlowAnnual).toBeCloseTo(projection[0]!.cashFlowAnnual, 4);
    }
  });

  it('property value equals purchasePrice when appreciationPct is 0', () => {
    for (const y of projection) {
      expect(y.propertyValue).toBeCloseTo(inputs.purchasePrice, 4);
    }
  });

  it('cumulativeCashFlow is the running sum of cashFlowAnnual', () => {
    let running = 0;
    for (const y of projection) {
      running += y.cashFlowAnnual;
      expect(y.cumulativeCashFlow).toBeCloseTo(running, 6);
    }
  });

  it('equity = propertyValue − loanBalance', () => {
    for (const y of projection) {
      expect(y.equity).toBeCloseTo(y.propertyValue - y.loanBalance, 6);
    }
  });

  it('loan balance decreases each year (positive-rate loan)', () => {
    for (let i = 1; i < projection.length; i++) {
      expect(projection[i]!.loanBalance).toBeLessThan(projection[i - 1]!.loanBalance);
    }
  });
});

// ─── calcProjection — rent growth ─────────────────────────────────────────────

describe('calcProjection — rent growth', () => {
  const inputs = normalizeInputs({
    ...BASE,
    holdYears: 3,
    rentGrowthPct: 3,
    expenseGrowthPct: 0,
    appreciationPct: 0,
  });
  const projection = calcProjection(inputs);
  const year1 = projection[0]!;
  const year2 = projection[1]!;
  const year3 = projection[2]!;

  it('Year 2 grossRentAnnual = Year 1 × 1.03', () => {
    expect(year2.grossRentAnnual).toBeCloseTo(year1.grossRentAnnual * 1.03, 4);
  });

  it('Year 3 grossRentAnnual = Year 1 × 1.03²', () => {
    expect(year3.grossRentAnnual).toBeCloseTo(year1.grossRentAnnual * 1.03 * 1.03, 4);
  });

  it('EGI grows at the same rate as rent (vacancy % is constant)', () => {
    expect(year2.egiAnnual).toBeCloseTo(year1.egiAnnual * 1.03, 4);
    expect(year3.egiAnnual).toBeCloseTo(year1.egiAnnual * 1.03 * 1.03, 4);
  });

  it('% of rent OpEx components scale with rent (opExAnnual grows with rent)', () => {
    // When only pct-of-rent expenses exist (BASE has capExPct+maintPct+mgmtPct),
    // and fixed expenses have 0% growth rate, the fixed part stays flat while
    // pct part grows with rent — so total opEx should be strictly larger in Year 2.
    expect(year2.opExAnnual).toBeGreaterThan(year1.opExAnnual);
  });
});

// ─── calcProjection — expense growth ──────────────────────────────────────────

describe('calcProjection — expense growth on fixed components', () => {
  const inputs = normalizeInputs({
    ...BASE,
    holdYears: 3,
    rentGrowthPct: 0,
    expenseGrowthPct: 4,
    appreciationPct: 0,
  });
  const projection = calcProjection(inputs);
  const year1 = projection[0]!;
  const year2 = projection[1]!;

  it('Year 1 opExAnnual matches screener (base)', () => {
    const screener = calcScreener(inputs);
    expect(year1.opExAnnual).toBeCloseTo(screener.opExAnnual!, 4);
  });

  it('Year 2 opExAnnual > Year 1 (fixed expenses grew)', () => {
    expect(year2.opExAnnual).toBeGreaterThan(year1.opExAnnual);
  });

  it('NOI decreases as expenses grow with flat rent', () => {
    expect(year2.noiAnnual).toBeLessThan(year1.noiAnnual);
  });
});

// ─── calcProjection — appreciation ───────────────────────────────────────────

describe('calcProjection — appreciation', () => {
  const inputs = normalizeInputs({
    ...BASE,
    holdYears: 5,
    rentGrowthPct: 0,
    expenseGrowthPct: 0,
    appreciationPct: 3,
  });
  const projection = calcProjection(inputs);

  it('Year 1 propertyValue = purchasePrice × 1.03', () => {
    expect(projection[0]!.propertyValue).toBeCloseTo(inputs.purchasePrice * 1.03, 2);
  });

  it('Year 3 propertyValue = purchasePrice × 1.03³', () => {
    expect(projection[2]!.propertyValue).toBeCloseTo(
      inputs.purchasePrice * Math.pow(1.03, 3),
      2,
    );
  });

  it('property value strictly increases each year', () => {
    for (let i = 1; i < projection.length; i++) {
      expect(projection[i]!.propertyValue).toBeGreaterThan(projection[i - 1]!.propertyValue);
    }
  });

  it('equity increases due to appreciation + principal pay-down', () => {
    for (let i = 1; i < projection.length; i++) {
      expect(projection[i]!.equity).toBeGreaterThan(projection[i - 1]!.equity);
    }
  });
});

// ─── calcProjection — cash purchase ──────────────────────────────────────────

describe('calcProjection — cash purchase (no loan)', () => {
  const cashInputs = normalizeInputs({
    ...BASE,
    percentDown: 100,
    holdYears: 3,
    rentGrowthPct: 0,
    expenseGrowthPct: 0,
    appreciationPct: 0,
  });
  const projection = calcProjection(cashInputs);

  it('annualDebtService is 0 for a cash purchase', () => {
    for (const y of projection) {
      expect(y.annualDebtService).toBe(0);
    }
  });

  it('loanBalance is 0 for a cash purchase', () => {
    for (const y of projection) {
      expect(y.loanBalance).toBe(0);
    }
  });

  it('cashFlowAnnual equals noiAnnual for a cash purchase', () => {
    for (const y of projection) {
      expect(y.cashFlowAnnual).toBeCloseTo(y.noiAnnual, 6);
    }
  });

  it('equity equals propertyValue for a cash purchase', () => {
    for (const y of projection) {
      expect(y.equity).toBeCloseTo(y.propertyValue, 6);
    }
  });
});

// ─── calcProjection — hold period == loan term ───────────────────────────────

describe('calcProjection — hold period equals loan term', () => {
  const inputs = normalizeInputs({
    ...BASE,
    loanTermYears: 5,
    holdYears: 5,
    rentGrowthPct: 0,
    expenseGrowthPct: 0,
    appreciationPct: 0,
  });
  const projection = calcProjection(inputs);

  it('loan balance at end of year 5 is ~0 (fully amortized)', () => {
    expect(projection[4]!.loanBalance).toBeCloseTo(0, 0);
  });
});

// ─── calcProForma ─────────────────────────────────────────────────────────────

describe('calcProForma', () => {
  const inputs = normalizeInputs({ ...BASE, holdYears: 3 });

  it('returns screener results matching calcScreener', () => {
    const proforma = calcProForma(inputs);
    const screener = calcScreener(inputs);
    expect(proforma.screener).toEqual(screener);
  });

  it('returns a projection array of length holdYears', () => {
    const proforma = calcProForma(inputs);
    expect(proforma.projection.length).toBe(3);
  });

  it('returns empty projection when holdYears is absent', () => {
    const proforma = calcProForma(normalizeInputs(BASE));
    expect(proforma.projection).toEqual([]);
  });
});

// ─── evaluate() in proforma mode ─────────────────────────────────────────────

describe('evaluate — proforma mode', () => {
  const inputs = { ...BASE, holdYears: 5 };

  it('does not throw in proforma mode', () => {
    expect(() => evaluate(inputs, { mode: 'proforma' })).not.toThrow();
  });

  it('returns a ProFormaResults shape with screener and projection', () => {
    const result = evaluate(inputs, { mode: 'proforma' }) as { screener: unknown; projection: unknown[] };
    expect(result).toHaveProperty('screener');
    expect(result).toHaveProperty('projection');
    expect(Array.isArray(result.projection)).toBe(true);
  });

  it('screener mode is unaffected', () => {
    const result = evaluate(inputs);
    expect(result).not.toHaveProperty('projection');
    expect(result).toHaveProperty('capRate');
  });
});

// ─── calcProjection — holdYears > loanTermYears ──────────────────────────────

describe('calcProjection — holdYears exceeds loanTermYears', () => {
  const inputs = normalizeInputs({
    ...BASE,
    loanTermYears: 3,
    holdYears: 5,
    rentGrowthPct: 0,
    expenseGrowthPct: 0,
    appreciationPct: 0,
  });
  const projection = calcProjection(inputs);

  it('returns holdYears rows', () => {
    expect(projection.length).toBe(5);
  });

  it('annualDebtService is non-zero during the loan term', () => {
    expect(projection[0]!.annualDebtService).toBeGreaterThan(0);
    expect(projection[2]!.annualDebtService).toBeGreaterThan(0);
  });

  it('annualDebtService is 0 for years beyond the loan term', () => {
    expect(projection[3]!.annualDebtService).toBe(0); // Year 4
    expect(projection[4]!.annualDebtService).toBe(0); // Year 5
  });

  it('loanBalance is 0 for years beyond the loan term', () => {
    expect(projection[3]!.loanBalance).toBe(0);
    expect(projection[4]!.loanBalance).toBe(0);
  });

  it('cashFlowAnnual equals noiAnnual for years beyond the loan term', () => {
    expect(projection[3]!.cashFlowAnnual).toBeCloseTo(projection[3]!.noiAnnual, 6);
    expect(projection[4]!.cashFlowAnnual).toBeCloseTo(projection[4]!.noiAnnual, 6);
  });

  it('cashFlowAnnual in post-payoff years exceeds loan-term years (no debt service)', () => {
    expect(projection[3]!.cashFlowAnnual).toBeGreaterThan(projection[0]!.cashFlowAnnual);
  });
});

// ─── calcProjection — growth rate guard (negative rates) ─────────────────────

describe('calcProjection — growth rate clamping', () => {
  it('extreme negative rentGrowthPct never produces negative grossRentAnnual', () => {
    const inputs = normalizeInputs({ ...BASE, holdYears: 5, rentGrowthPct: -200 });
    const projection = calcProjection(inputs);
    for (const y of projection) {
      expect(y.grossRentAnnual).toBeGreaterThanOrEqual(0);
      expect(y.egiAnnual).toBeGreaterThanOrEqual(0);
    }
  });

  it('extreme negative expenseGrowthPct never produces negative opExAnnual for fixed-expense component', () => {
    const inputs = normalizeInputs({ ...BASE, holdYears: 3, expenseGrowthPct: -200 });
    const projection = calcProjection(inputs);
    for (const y of projection) {
      expect(y.opExAnnual).toBeGreaterThanOrEqual(0);
    }
  });

  it('extreme negative appreciationPct never produces negative propertyValue', () => {
    const inputs = normalizeInputs({ ...BASE, holdYears: 5, appreciationPct: -200 });
    const projection = calcProjection(inputs);
    for (const y of projection) {
      expect(y.propertyValue).toBeGreaterThanOrEqual(0);
    }
  });

  it('even-exponent base-clamping: rentGrowthPct=-200 on even years does not oscillate back to positive', () => {
    // Old result-clamp would allow (-1+(-2)/100)^2 = 1.0 (oscillation at year 2).
    // Base-clamp ensures factor is always 0 when pct ≤ -100, regardless of exponent parity.
    const inputs = normalizeInputs({ ...BASE, holdYears: 4, rentGrowthPct: -200 });
    const projection = calcProjection(inputs);
    // Year 1: factor = (1 + (-2))^0 = 1 (no growth yet applied), rent = base rent
    // Year 2 onward: factor = max(0, -1)^n = 0 → rent collapses to 0
    expect(projection[1]!.grossRentAnnual).toBe(0); // year 2
    expect(projection[2]!.grossRentAnnual).toBe(0); // year 3
    expect(projection[3]!.grossRentAnnual).toBe(0); // year 4
  });
});

// ─── calcProjection — integer coercion (fractional holdYears / loanTermYears) ──

describe('calcProjection — integer coercion', () => {
  it('fractional holdYears is floored to whole years', () => {
    const int5 = calcProjection(normalizeInputs({ ...BASE, holdYears: 5 }));
    const frac5 = calcProjection(normalizeInputs({ ...BASE, holdYears: 5.9 }));
    expect(frac5.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(frac5[i]!.cashFlowAnnual).toBeCloseTo(int5[i]!.cashFlowAnnual, 6);
    }
  });

  it('fractional loanTermYears is floored (no ambiguous month-index offset)', () => {
    const int10 = calcProjection(normalizeInputs({ ...BASE, holdYears: 5, loanTermYears: 10 }));
    const frac10 = calcProjection(normalizeInputs({ ...BASE, holdYears: 5, loanTermYears: 10.5 }));
    // Both should produce identical year rows (10.5 floored to 10)
    expect(frac10.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(frac10[i]!.annualDebtService).toBeCloseTo(int10[i]!.annualDebtService, 2);
      expect(frac10[i]!.loanBalance).toBeCloseTo(int10[i]!.loanBalance, 2);
    }
  });
});

// ─── other income growth ──────────────────────────────────────────────────────

describe('calcProjection — other income grows with rent', () => {
  const inputs = normalizeInputs({
    ...BASE,
    otherIncome: 200,
    holdYears: 3,
    rentGrowthPct: 5,
    expenseGrowthPct: 0,
    appreciationPct: 0,
  });
  const projection = calcProjection(inputs);

  it('EGI in Year 2 is 1.05× Year 1 EGI', () => {
    expect(projection[1]!.egiAnnual).toBeCloseTo(projection[0]!.egiAnnual * 1.05, 4);
  });
});

// ─── RPE-32: depreciation + after-tax cash flow ───────────────────────────────

describe('calcProjection — depreciation (RPE-32)', () => {
  const inputs = normalizeInputs({
    ...BASE,
    purchasePrice: 300_000,
    landValue: 60_000,
    holdYears: 5,
    rentGrowthPct: 0,
    expenseGrowthPct: 0,
    appreciationPct: 0,
  });
  const projection = calcProjection(inputs);

  it('depreciationAnnual = (purchasePrice − landValue) / 27.5', () => {
    // (300_000 - 60_000) / 27.5 = 240_000 / 27.5 ≈ 8_727.27
    expect(projection[0]!.depreciationAnnual).toBeCloseTo(240_000 / 27.5, 4);
  });

  it('depreciationAnnual is constant for years within the 27.5-year recovery period', () => {
    // holdYears:5 — all within recovery period, so all years should equal Year-1
    const base = projection[0]!.depreciationAnnual;
    for (const y of projection) {
      expect(y.depreciationAnnual).toBeCloseTo(base, 6);
    }
  });

  it('depreciationAnnual is 0 for years beyond the 27.5-year recovery period', () => {
    // 30-year hold: years 1-27 have full depreciation; year 28 has partial; years 29-30 → 0
    const longHold = calcProjection(
      normalizeInputs({
        ...BASE,
        purchasePrice: 300_000,
        landValue: 60_000,      // depreciable basis = 240_000
        interestRate: 0,        // cash-equivalent to avoid amortization table length issues
        percentDown: 100,
        holdYears: 30,
        rentGrowthPct: 0,
        expenseGrowthPct: 0,
        appreciationPct: 0,
      }),
    );
    // Cumulative depreciation must not exceed depreciable basis
    const totalDepr = longHold.reduce((sum, y) => sum + y.depreciationAnnual, 0);
    expect(totalDepr).toBeCloseTo(240_000, 2);
    // Years 29 and 30 should have 0 depreciation
    expect(longHold[28]!.depreciationAnnual).toBe(0);
    expect(longHold[29]!.depreciationAnnual).toBe(0);
  });

  it('depreciationAnnual = 0 when landValue >= purchasePrice', () => {
    const p = calcProjection(
      normalizeInputs({ ...BASE, purchasePrice: 300_000, landValue: 300_000, holdYears: 3 }),
    );
    expect(p[0]!.depreciationAnnual).toBe(0);
  });

  it('depreciationAnnual = purchasePrice / 27.5 when landValue is omitted', () => {
    const p = calcProjection(normalizeInputs({ ...BASE, holdYears: 3 }));
    // landValue defaults to 0 → full price is depreciable
    expect(p[0]!.depreciationAnnual).toBeCloseTo(300_000 / 27.5, 4);
  });
});

describe('calcProjection — interestPaid (RPE-32)', () => {
  const inputs = normalizeInputs({
    ...BASE,
    holdYears: 5,
    rentGrowthPct: 0,
    expenseGrowthPct: 0,
    appreciationPct: 0,
  });
  const projection = calcProjection(inputs);

  it('interestPaid > 0 for Year 1 (financed deal)', () => {
    expect(projection[0]!.interestPaid).toBeGreaterThan(0);
  });

  it('interestPaid decreases each year (amortization effect)', () => {
    for (let i = 1; i < projection.length; i++) {
      expect(projection[i]!.interestPaid).toBeLessThan(projection[i - 1]!.interestPaid);
    }
  });

  it('interestPaid is less than annualDebtService (some portion is principal)', () => {
    for (const y of projection) {
      expect(y.interestPaid).toBeLessThan(y.annualDebtService);
    }
  });

  it('interestPaid = 0 for a cash purchase', () => {
    const p = calcProjection(
      normalizeInputs({ ...BASE, percentDown: 100, holdYears: 3 }),
    );
    for (const y of p) {
      expect(y.interestPaid).toBe(0);
    }
  });
});

describe('calcProjection — taxableIncome & taxSavings (RPE-32)', () => {
  it('taxableIncome = noiAnnual − interestPaid − depreciationAnnual', () => {
    const inputs = normalizeInputs({
      ...BASE,
      landValue: 60_000,
      holdYears: 5,
      rentGrowthPct: 0,
      expenseGrowthPct: 0,
      appreciationPct: 0,
    });
    const projection = calcProjection(inputs);
    for (const y of projection) {
      expect(y.taxableIncome).toBeCloseTo(
        y.noiAnnual - y.interestPaid - y.depreciationAnnual,
        4,
      );
    }
  });

  it('taxSavings = null when marginalTaxPct is not provided', () => {
    // BASE has no marginalTaxPct → taxes not modelled → null (render "—" in UI)
    const p = calcProjection(normalizeInputs({ ...BASE, holdYears: 3 }));
    for (const y of p) {
      expect(y.taxSavings).toBeNull();
    }
  });

  it('taxSavings > 0 when there is a paper loss and marginalTaxPct is set', () => {
    const inputs = normalizeInputs({
      ...BASE,
      purchasePrice: 300_000,
      landValue: 0,             // full purchase price depreciable → large paper loss
      marginalTaxPct: 32,
      holdYears: 3,
      rentGrowthPct: 0,
      expenseGrowthPct: 0,
      appreciationPct: 0,
    });
    const p = calcProjection(inputs);
    // With 300k / 27.5 ≈ $10,909 depreciation + interest, paper loss is very likely
    const hasLoss = p.some((y) => y.taxableIncome < 0);
    if (hasLoss) {
      expect(p.find((y) => y.taxableIncome < 0)!.taxSavings).toBeGreaterThan(0);
    }
  });

  it('taxSavings = max(0, −taxableIncome) × marginalTaxPct/100', () => {
    const inputs = normalizeInputs({
      ...BASE,
      landValue: 0,
      marginalTaxPct: 25,
      holdYears: 3,
      rentGrowthPct: 0,
      expenseGrowthPct: 0,
      appreciationPct: 0,
    });
    const p = calcProjection(inputs);
    for (const y of p) {
      const expected = y.taxableIncome < 0 ? (-y.taxableIncome) * 0.25 : 0;
      expect(y.taxSavings).toBeCloseTo(expected, 6);
    }
  });

  it('taxSavings = 0 when taxableIncome >= 0', () => {
    // High-rent, low-value property → positive taxable income
    const inputs = normalizeInputs({
      ...BASE,
      purchasePrice: 100_000,  // small building value → small depreciation
      landValue: 90_000,       // only $10k depreciable → ~$364/yr depreciation
      grossRent: 5_000,        // high rent → NOI swamps deductions
      marginalTaxPct: 32,
      holdYears: 3,
      rentGrowthPct: 0,
      expenseGrowthPct: 0,
      appreciationPct: 0,
    });
    const p = calcProjection(inputs);
    for (const y of p) {
      if (y.taxableIncome >= 0) {
        expect(y.taxSavings).toBe(0);
      }
    }
  });
});

describe('calcProjection — cashFlowAfterTax (RPE-32)', () => {
  it('cashFlowAfterTax = cashFlowAnnual + taxSavings for every year', () => {
    const inputs = normalizeInputs({
      ...BASE,
      landValue: 0,
      marginalTaxPct: 28,
      holdYears: 5,
      rentGrowthPct: 0,
      expenseGrowthPct: 0,
      appreciationPct: 0,
    });
    const p = calcProjection(inputs);
    for (const y of p) {
      // marginalTaxPct is provided → taxSavings and cashFlowAfterTax are non-null
      expect(y.cashFlowAfterTax).toBeCloseTo(y.cashFlowAnnual + y.taxSavings!, 6);
    }
  });

  it('cashFlowAfterTax = cashFlowAnnual when marginalTaxPct = 0', () => {
    const inputs = normalizeInputs({
      ...BASE,
      marginalTaxPct: 0,
      holdYears: 3,
      rentGrowthPct: 0,
      expenseGrowthPct: 0,
      appreciationPct: 0,
    });
    const p = calcProjection(inputs);
    for (const y of p) {
      expect(y.cashFlowAfterTax).toBeCloseTo(y.cashFlowAnnual, 6);
    }
  });

  it('cashFlowAfterTax >= cashFlowAnnual when there is a paper loss', () => {
    // Tax savings always >= 0, so after-tax >= pre-tax
    const inputs = normalizeInputs({
      ...BASE,
      landValue: 0,
      marginalTaxPct: 32,
      holdYears: 5,
      rentGrowthPct: 0,
      expenseGrowthPct: 0,
      appreciationPct: 0,
    });
    const p = calcProjection(inputs);
    for (const y of p) {
      expect(y.cashFlowAfterTax).toBeGreaterThanOrEqual(y.cashFlowAnnual - 0.001);
    }
  });
});

// ─── guard: loanTermYears = 0 with non-zero loan (RPE-29 review fix) ─────────

describe('calcProjection — loanTermYears = 0 guard', () => {
  it('returns empty array when there is a loan but loanTermYears = 0', () => {
    // percentDown < 100 → loanAmount > 0; loanTermYears = 0 → invalid combination
    const inputs = normalizeInputs({ ...BASE, holdYears: 5, loanTermYears: 0 });
    expect(calcProjection(inputs)).toEqual([]);
  });

  it('returns rows as normal for a cash purchase (percentDown = 100, loanTermYears = 0)', () => {
    // With no loan, loanTermYears = 0 is harmless
    const inputs = normalizeInputs({ ...BASE, percentDown: 100, holdYears: 3, loanTermYears: 0 });
    expect(calcProjection(inputs).length).toBe(3);
  });
});

// ─── guard: purchasePrice = 0 in calcProForma (RPE-29 review fix) ────────────

describe('calcProForma — purchasePrice = 0 guard', () => {
  it('returns empty projection when purchasePrice = 0', () => {
    const inputs = normalizeInputs({ ...BASE, purchasePrice: 0, holdYears: 5 });
    const result = calcProForma(inputs);
    expect(result.projection).toEqual([]);
  });

  it('screener snapshot is still returned (all-null) when purchasePrice = 0', () => {
    const inputs = normalizeInputs({ ...BASE, purchasePrice: 0, holdYears: 5 });
    const result = calcProForma(inputs);
    // screener.capRate should be null (can't divide by 0 purchase price)
    expect(result.screener.capRate).toBeNull();
  });
});
