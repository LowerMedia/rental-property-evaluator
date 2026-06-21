/**
 * Screener-tier calculations.
 *
 * All formulas from 02-calculations-spec.md.
 * Inputs MUST be pre-normalised via normalizeInputs() before calling calcScreener().
 *
 * Implementation schedule:
 *   RPE-14  — EGI, OpEx, NOI, cap rate, cash flow, CoC, DSCR, PITI, 1% rule
 *   RPE-15  — Fix GRM (annual rent) + direction model
 *   RPE-16  — New metrics: break-even, expense ratio, LTV, debt yield, gross yield,
 *             $/unit, $/sqft, 50% rule
 */

import { calcLoan } from './loan';
import type { DealExpenses, DealInputs, ExpenseInput, ScreenerResults } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert an ExpenseInput to a monthly dollar amount. */
function toMonthly(e: ExpenseInput): number {
  return e.period === 'annual' ? e.amount / 12 : e.amount;
}

/** Returns a ScreenerResults with every field null (purchasePrice ≤ 0 guard). */
function nullResults(): ScreenerResults {
  return {
    loanAmount: null,
    mortgagePayment: null,
    totalInterest: null,
    egi: null,
    egiAnnual: null,
    opExMonthly: null,
    opExAnnual: null,
    piti: null,
    noiMonthly: null,
    noiAnnual: null,
    capRate: null,
    cashFlowMonthly: null,
    cashFlowAnnual: null,
    cocRoi: null,
    dscr: null,
    grm: null,
    onePercentRule: null,
    breakEvenOccupancy: null,
    expenseRatio: null,
    ltv: null,
    debtYield: null,
    grossYield: null,
    pricePerUnit: null,
    pricePerSqft: null,
    totalCashInvested: null,
    fiftyPctRuleDeviation: null,
  };
}

// ─── Operating expenses ───────────────────────────────────────────────────────

/**
 * Monthly operating expenses (excluding debt service).
 *
 * CapEx treatment (capExInNOI toggle, default true = conservative):
 *   true  → CapEx reserve is included in OpEx (lowers NOI; good for investor analysis)
 *   false → CapEx excluded from OpEx (lender DSCR convention)
 *
 * Percentage components use grossRent (gross potential) as the base, not EGI.
 * This is conservative for CapEx/maintenance (you budget for upkeep even when vacant).
 */
function calcOpExMonthly(expenses: DealExpenses, grossRent: number, capExInNOI: boolean): number {
  const pctBase = grossRent; // gross potential rent

  const capEx = capExInNOI ? ((expenses.capExPct ?? 0) / 100) * pctBase : 0;
  const maint = ((expenses.maintPct ?? 0) / 100) * pctBase;
  const mgmt = ((expenses.mgmtPct ?? 0) / 100) * pctBase;
  const misc = ((expenses.miscPct ?? 0) / 100) * pctBase;

  const taxes = toMonthly(expenses.taxes);
  const insurance = toMonthly(expenses.insurance);
  const hoa = expenses.hoa ? toMonthly(expenses.hoa) : 0;
  const other = expenses.other ? toMonthly(expenses.other) : 0;

  return capEx + maint + mgmt + misc + taxes + insurance + hoa + other;
}

// ─── Main screener entry point ────────────────────────────────────────────────

/**
 * Compute all screener-tier metrics for a deal.
 *
 * Returns nullResults() when purchasePrice ≤ 0 (prevents Infinity/NaN from
 * propagating into every division-by-price metric).
 */
export function calcScreener(inputs: DealInputs): ScreenerResults {
  const { purchasePrice, grossRent, vacancyPct, expenses } = inputs;
  const otherIncome = inputs.otherIncome ?? 0;
  const capExInNOI = inputs.capExInNOI ?? true;

  if (purchasePrice <= 0) return nullResults();

  // ── Loan ──────────────────────────────────────────────────────────────────
  const loan = calcLoan(inputs);

  // ── EGI ───────────────────────────────────────────────────────────────────
  // Monthly: (grossRent + otherIncome) × (1 − vacancy%)
  const egi = (grossRent + otherIncome) * (1 - vacancyPct / 100);
  const egiAnnual = egi * 12;

  // ── Operating expenses ────────────────────────────────────────────────────
  const opExMonthly = calcOpExMonthly(expenses, grossRent, capExInNOI);
  const opExAnnual = opExMonthly * 12;

  // ── PITI ──────────────────────────────────────────────────────────────────
  // Mortgage P&I + (taxes + insurance)/12 + HOA/12 — what the bank underwrites
  const taxesMonthly = toMonthly(expenses.taxes);
  const insuranceMonthly = toMonthly(expenses.insurance);
  const hoaMonthly = expenses.hoa ? toMonthly(expenses.hoa) : 0;
  const pitiFixed = taxesMonthly + insuranceMonthly + hoaMonthly;
  const piti = loan.mortgagePayment !== null ? loan.mortgagePayment + pitiFixed : pitiFixed;

  // ── NOI ───────────────────────────────────────────────────────────────────
  const noiMonthly = egi - opExMonthly;
  const noiAnnual = noiMonthly * 12;

  // ── Cost basis (shared by cap rate + total cash invested) ─────────────────
  const closingCostsOut = inputs.rollClosingCostsIntoLoan ? 0 : inputs.closingCosts;
  const rehab = inputs.rehab ?? 0;

  // ── Cap rate ──────────────────────────────────────────────────────────────
  // NOI_annual / basis × 100. Basis is purchasePrice by default, or the all-in
  // cost (purchasePrice + rehab + out-of-pocket closing) when capRateAllIn (RPE-105).
  const capRateBasis = inputs.capRateAllIn ? purchasePrice + rehab + closingCostsOut : purchasePrice;
  const capRate = (noiAnnual / capRateBasis) * 100;

  // ── Cash flow ─────────────────────────────────────────────────────────────
  // Monthly: NOI_monthly − mortgagePayment (if no loan, CF = NOI)
  const cashFlowMonthly =
    loan.mortgagePayment !== null ? noiMonthly - loan.mortgagePayment : noiMonthly;
  const cashFlowAnnual = cashFlowMonthly * 12;

  // ── Total cash invested ───────────────────────────────────────────────────
  // downPayment + closingCosts (if not rolled into loan) + rehab
  const downPayment = purchasePrice * (inputs.percentDown / 100);
  const totalCashInvested = downPayment + closingCostsOut + rehab;

  // ── CoC ROI ───────────────────────────────────────────────────────────────
  // cashFlow_annual / totalCashInvested × 100
  const cocRoi = totalCashInvested > 0 ? (cashFlowAnnual / totalCashInvested) * 100 : null;

  // ── DSCR ──────────────────────────────────────────────────────────────────
  // NOI_annual / annualDebtService — null for cash purchases (no debt service)
  const dscr =
    loan.annualDebtService !== null && loan.annualDebtService > 0
      ? noiAnnual / loan.annualDebtService
      : null;

  // ── 1% rule ───────────────────────────────────────────────────────────────
  // grossRent_monthly / purchasePrice × 100
  const onePercentRule = (grossRent / purchasePrice) * 100;

  // ── GRM: purchasePrice / grossRent_ANNUAL ─────────────────────────────────
  // Fix (RPE-15): old code used monthly rent (Price / monthlyRent), off by 12×.
  // Convention: GRM = Price / Annual Gross Rent. LOWER is better.
  const grossRentAnnual = grossRent * 12;
  const grm: number | null = grossRentAnnual > 0 ? purchasePrice / grossRentAnnual : null;

  // ── New screener metrics (RPE-16) ────────────────────────────────────────

  // Break-even occupancy: (opExMonthly + mortgagePayment) / grossPotentialRent × 100
  // "How empty can it get before I bleed." Cash buyer: mortgage term is 0.
  const grossPotentialRent = grossRent + otherIncome;
  const debtService = loan.mortgagePayment ?? 0;
  const breakEvenOccupancy =
    grossPotentialRent > 0
      ? ((opExMonthly + debtService) / grossPotentialRent) * 100
      : null;

  // Expense ratio: opExAnnual / egiAnnual × 100 (lower = better, norm 35–45%)
  const expenseRatio = egiAnnual > 0 ? (opExAnnual / egiAnnual) * 100 : null;

  // LTV: loanAmount / purchasePrice × 100
  const ltv = (loan.loanAmount / purchasePrice) * 100;

  // Debt yield (lender metric): NOI_annual / loanAmount × 100
  const debtYield =
    loan.loanAmount > 0 ? (noiAnnual / loan.loanAmount) * 100 : null;

  // Gross yield: grossRent_annual / purchasePrice × 100
  const grossYield = (grossRentAnnual / purchasePrice) * 100;

  // Price per unit / sqft
  const pricePerUnit =
    inputs.units !== undefined && inputs.units > 0
      ? purchasePrice / inputs.units
      : null;
  const pricePerSqft =
    inputs.sqft !== undefined && inputs.sqft > 0
      ? purchasePrice / inputs.sqft
      : null;

  // 50% rule deviation: (modeled opExAnnual − 0.5 × egiAnnual) / egiAnnual × 100
  // Positive = more expensive than the 50% rule; negative = cheaper.
  const fiftyPctRuleDeviation =
    egiAnnual > 0 ? ((opExAnnual - 0.5 * egiAnnual) / egiAnnual) * 100 : null;

  return {
    loanAmount: loan.loanAmount,
    mortgagePayment: loan.mortgagePayment,
    totalInterest: loan.totalInterest,
    egi,
    egiAnnual,
    opExMonthly,
    opExAnnual,
    piti,
    noiMonthly,
    noiAnnual,
    capRate,
    cashFlowMonthly,
    cashFlowAnnual,
    cocRoi,
    dscr,
    grm,
    onePercentRule,
    breakEvenOccupancy,
    expenseRatio,
    ltv,
    debtYield,
    grossYield,
    pricePerUnit,
    pricePerSqft,
    totalCashInvested,
    fiftyPctRuleDeviation,
  };
}
