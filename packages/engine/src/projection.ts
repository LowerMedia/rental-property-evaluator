/**
 * Multi-year hold projection (RPE-29).
 *
 * Produces one ProjectionYear per year of the hold period, modelling:
 *   - Rent & other-income growth at rentGrowthPct (% of rent expenses follow automatically)
 *   - Fixed expense growth at expenseGrowthPct
 *   - Property value appreciation at appreciationPct (applied end-of-year)
 *   - Debt service from the amortization schedule (zero after loan payoff)
 *   - Remaining loan balance from the amortization schedule (end-of-year)
 *
 * Inputs MUST be pre-normalised via normalizeInputs() before calling calcProjection().
 *
 * End-of-year convention:
 *   - All ProjectionYear values are end-of-year figures.
 *   - Rent/expense growth: Year 1 = base rates (factor = (1+g)^0 = 1).
 *     Growth compounds in Year 2 and beyond.
 *   - Property value: end-of-Year-1 = purchasePrice × (1+a)^1 (first year of appreciation).
 *   - Loan balance: remaining balance at the end of that calendar year.
 *   - Debt service: zero for years beyond the loan term (loan is fully paid off).
 */

import { amortize, pmt } from './finance';
import { calcLoanAmount } from './loan';
import type { DealInputs, ProjectionYear } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toMonthlyAmount(e: { amount: number; period: 'monthly' | 'annual' }): number {
  return e.period === 'annual' ? e.amount / 12 : e.amount;
}

/**
 * Compound a growth rate for `n` periods, monotonically clamped to ≥ 0.
 *
 * The base multiplier `(1 + pct/100)` is clamped to 0 before exponentiation so
 * that extreme negative rates (pct ≤ −100) always produce 0, not the oscillating
 * positive values that `Math.pow(negative, even)` would otherwise return.
 */
function growthFactor(pct: number, n: number): number {
  return Math.pow(Math.max(0, 1 + pct / 100), n);
}

// ─── Main projection entry point ──────────────────────────────────────────────

/**
 * Compute a year-by-year hold projection for a deal.
 *
 * Returns an empty array when `holdYears` is absent, zero, or negative.
 */
export function calcProjection(inputs: DealInputs): ProjectionYear[] {
  // Floor to whole years — fractional hold/term values are meaningless for annual rows,
  // and fractional loanTermYears would cause ambiguous month-index lookups.
  const holdYears = Math.floor(inputs.holdYears ?? 0);
  const loanTermYears = Math.floor(inputs.loanTermYears);
  if (holdYears <= 0) return [];

  const {
    purchasePrice,
    grossRent,
    vacancyPct,
    expenses,
    rentGrowthPct = 0,
    expenseGrowthPct = 0,
    appreciationPct = 0,
  } = inputs;

  const otherIncome = inputs.otherIncome ?? 0;
  const capExInNOI = inputs.capExInNOI ?? true;

  // ── Loan primitives (single amortize call) ────────────────────────────────
  // Use floored loanTermYears so the amortization schedule and debt-service guard
  // are consistent with the per-year loop index comparisons.
  const loanAmount = calcLoanAmount(inputs);

  // Guard: a non-zero loan with loanTermYears = 0 would produce a null amortization
  // schedule, making all loanBalance values silently 0 (equity overstated).
  // Return an empty projection rather than produce misleading rows.
  if (loanAmount > 0 && loanTermYears <= 0) return [];

  const monthlyPayment = loanAmount > 0
    ? pmt(loanAmount, inputs.interestRate, loanTermYears)
    : null;
  const baseAnnualDebtService = monthlyPayment !== null ? monthlyPayment * 12 : 0;
  const schedule = amortize(loanAmount, inputs.interestRate, loanTermYears);

  // ── Fixed expense base (monthly dollars) ─────────────────────────────────
  // These components grow at expenseGrowthPct (tax assessments, insurance, HOA, other).
  const baseFixedMonthly =
    toMonthlyAmount(expenses.taxes) +
    toMonthlyAmount(expenses.insurance) +
    (expenses.hoa ? toMonthlyAmount(expenses.hoa) : 0) +
    (expenses.other ? toMonthlyAmount(expenses.other) : 0);

  // ── Percentage expense rates (applied to grossRent each year) ─────────────
  // These components naturally scale when grossRent grows — no separate growth factor needed.
  const capExRate = capExInNOI ? (expenses.capExPct ?? 0) / 100 : 0;
  const maintRate = (expenses.maintPct ?? 0) / 100;
  const mgmtRate = (expenses.mgmtPct ?? 0) / 100;
  const miscRate = (expenses.miscPct ?? 0) / 100;
  const totalPctRate = capExRate + maintRate + mgmtRate + miscRate;

  // ── Build projection ──────────────────────────────────────────────────────
  const years: ProjectionYear[] = [];
  let cumulativeCashFlow = 0;

  for (let y = 1; y <= holdYears; y++) {
    // Rent/expense growth: Year 1 uses ^0 = 1.0 (base rates, no growth yet).
    // Property value: end-of-year, so Year 1 uses ^1 (one year of appreciation).
    const rentF = growthFactor(rentGrowthPct, y - 1);
    const expF = growthFactor(expenseGrowthPct, y - 1);
    const appF = growthFactor(appreciationPct, y);

    // ── Income ──────────────────────────────────────────────────────────────
    const grossRentMonthly = grossRent * rentF;
    const grossRentAnnual = grossRentMonthly * 12;
    const otherIncomeMonthly = otherIncome * rentF;
    const egiAnnual =
      (grossRentMonthly + otherIncomeMonthly) * (1 - vacancyPct / 100) * 12;

    // ── Operating expenses ───────────────────────────────────────────────────
    const pctOpExMonthly = totalPctRate * grossRentMonthly;
    const fixedOpExMonthly = baseFixedMonthly * expF;
    const opExAnnual = (pctOpExMonthly + fixedOpExMonthly) * 12;

    // ── Debt service: zero once the loan term has passed ────────────────────
    const annualDebtService = y <= loanTermYears ? baseAnnualDebtService : 0;

    // ── NOI & cash flow ──────────────────────────────────────────────────────
    const noiAnnual = egiAnnual - opExAnnual;
    const cashFlowAnnual = noiAnnual - annualDebtService;
    cumulativeCashFlow += cashFlowAnnual;

    // ── Loan balance at end of year y ────────────────────────────────────────
    // End-of-year balance from the amortization schedule; 0 if loan is paid off.
    const lastMonthIdx = y * 12 - 1; // 0-based index into rows array
    const loanBalance = schedule?.rows[lastMonthIdx]?.balance ?? 0;

    // ── Property value & equity ──────────────────────────────────────────────
    const propertyValue = purchasePrice * appF;
    const equity = propertyValue - loanBalance;

    years.push({
      year: y,
      grossRentAnnual,
      egiAnnual,
      opExAnnual,
      noiAnnual,
      annualDebtService,
      cashFlowAnnual,
      cumulativeCashFlow,
      loanBalance,
      propertyValue,
      equity,
    });
  }

  return years;
}
