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

  // ── Cap rate ──────────────────────────────────────────────────────────────
  // NOI_annual / purchasePrice × 100
  const capRate = (noiAnnual / purchasePrice) * 100;

  // ── Cash flow ─────────────────────────────────────────────────────────────
  // Monthly: NOI_monthly − mortgagePayment (if no loan, CF = NOI)
  const cashFlowMonthly =
    loan.mortgagePayment !== null ? noiMonthly - loan.mortgagePayment : noiMonthly;
  const cashFlowAnnual = cashFlowMonthly * 12;

  // ── Total cash invested ───────────────────────────────────────────────────
  // downPayment + closingCosts (if not rolled into loan) + rehab
  const downPayment = purchasePrice * (inputs.percentDown / 100);
  const closingCostsOut = inputs.rollClosingCostsIntoLoan ? 0 : inputs.closingCosts;
  const rehab = inputs.rehab ?? 0;
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

  // ── GRM — implemented in RPE-15 (uses annual rent; old code used monthly) ─
  // Stub: null until RPE-15 commit.
  const grm: number | null = null;

  // ── New screener metrics — implemented in RPE-16 ─────────────────────────
  const breakEvenOccupancy: number | null = null;
  const expenseRatio: number | null = null;
  const ltv: number | null = null;
  const debtYield: number | null = null;
  const grossYield: number | null = null;
  const pricePerUnit: number | null = null;
  const pricePerSqft: number | null = null;
  const fiftyPctRuleDeviation: number | null = null;

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
