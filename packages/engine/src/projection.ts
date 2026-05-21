/**
 * Multi-year hold projection (RPE-29).
 *
 * Produces one ProjectionYear per year of the hold period, modelling:
 *   - Rent & other-income growth at rentGrowthPct (% of rent expenses follow automatically)
 *   - Fixed expense growth at expenseGrowthPct
 *   - Property value appreciation at appreciationPct
 *   - Fixed-rate debt service throughout the hold
 *   - Remaining loan balance from the amortization schedule
 *
 * Inputs MUST be pre-normalised via normalizeInputs() before calling calcProjection().
 */

import { amortize } from './finance';
import { calcLoan } from './loan';
import type { DealInputs, ProjectionYear } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toMonthlyAmount(e: { amount: number; period: 'monthly' | 'annual' }): number {
  return e.period === 'annual' ? e.amount / 12 : e.amount;
}

// ─── Main projection entry point ──────────────────────────────────────────────

/**
 * Compute a year-by-year hold projection for a deal.
 *
 * Returns an empty array when `holdYears` is absent, zero, or negative.
 *
 * Year 1 = first full year of ownership at base rates (growth factor = 1.0).
 * Year N = base rates × growth factor^(N−1).
 */
export function calcProjection(inputs: DealInputs): ProjectionYear[] {
  const holdYears = inputs.holdYears ?? 0;
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

  // ── Debt service (fixed throughout hold) ─────────────────────────────────
  const loan = calcLoan(inputs);
  const annualDebtService =
    loan.mortgagePayment !== null ? loan.mortgagePayment * 12 : 0;

  // ── Amortization schedule for end-of-year balance lookup ─────────────────
  const schedule = amortize(loan.loanAmount, inputs.interestRate, inputs.loanTermYears);

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
    // Compound growth factors. Year 1 = ^0 = 1.0 (base year, no growth applied).
    const rentFactor = Math.pow(1 + rentGrowthPct / 100, y - 1);
    const expFactor = Math.pow(1 + expenseGrowthPct / 100, y - 1);
    const appFactor = Math.pow(1 + appreciationPct / 100, y);

    // ── Income ──────────────────────────────────────────────────────────────
    const grossRentMonthly = grossRent * rentFactor;
    const grossRentAnnual = grossRentMonthly * 12;
    const otherIncomeMonthly = otherIncome * rentFactor;
    const egiAnnual =
      (grossRentMonthly + otherIncomeMonthly) * (1 - vacancyPct / 100) * 12;

    // ── Operating expenses ───────────────────────────────────────────────────
    const pctOpExMonthly = totalPctRate * grossRentMonthly;
    const fixedOpExMonthly = baseFixedMonthly * expFactor;
    const opExAnnual = (pctOpExMonthly + fixedOpExMonthly) * 12;

    // ── NOI & cash flow ──────────────────────────────────────────────────────
    const noiAnnual = egiAnnual - opExAnnual;
    const cashFlowAnnual = noiAnnual - annualDebtService;
    cumulativeCashFlow += cashFlowAnnual;

    // ── Loan balance at end of year y ────────────────────────────────────────
    // Amortization rows are 1-indexed by month; end of year y = month y*12.
    const lastMonthIdx = y * 12 - 1; // 0-based index into rows array
    const loanBalance = schedule?.rows[lastMonthIdx]?.balance ?? 0;

    // ── Property value & equity ──────────────────────────────────────────────
    const propertyValue = purchasePrice * appFactor;
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
