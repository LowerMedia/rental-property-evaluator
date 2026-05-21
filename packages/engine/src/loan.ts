/**
 * Loan-tier calculations: loanAmount, mortgagePayment, amortization schedule.
 *
 * All spec formulas from 02-calculations-spec.md §"Core loan math".
 *
 * Inputs MUST be pre-normalised via normalizeInputs() before calling these.
 */

import { amortize, pmt } from './finance';
import type { DealInputs } from './types';

// ─── Loan amount ─────────────────────────────────────────────────────────────

/**
 * loanAmount = (purchasePrice + (rollClosingCosts ? closingCosts : 0))
 *              × (1 − percentDown / 100)
 *
 * Returns 0 (not null) when percentDown === 100 so downstream callers can
 * uniformly check `loanAmount === 0` for the no-loan case.
 */
export function calcLoanAmount(inputs: DealInputs): number {
  const base =
    inputs.purchasePrice +
    (inputs.rollClosingCostsIntoLoan ? inputs.closingCosts : 0);
  return base * (1 - inputs.percentDown / 100);
}

// ─── Aggregated loan results ─────────────────────────────────────────────────

export interface LoanResult {
  loanAmount: number;
  /** Monthly P&I. Null when there is no loan (loanAmount === 0 or termYears === 0). */
  mortgagePayment: number | null;
  /** Total interest paid over the full term (from schedule). */
  totalInterest: number | null;
  /** Annual debt service (mortgagePayment × 12). Null when no loan. */
  annualDebtService: number | null;
}

/**
 * Computes all loan-tier values in one pass.
 * Amortizes once so totalInterest is exact (not a formula approximation).
 */
export function calcLoan(inputs: DealInputs): LoanResult {
  const loanAmount = calcLoanAmount(inputs);

  if (loanAmount === 0) {
    return {
      loanAmount: 0,
      mortgagePayment: null,
      totalInterest: null,
      annualDebtService: null,
    };
  }

  const schedule = amortize(loanAmount, inputs.interestRate, inputs.loanTermYears);
  const mortgagePayment = pmt(loanAmount, inputs.interestRate, inputs.loanTermYears);

  return {
    loanAmount,
    mortgagePayment,
    totalInterest: schedule?.totalInterest ?? null,
    annualDebtService: mortgagePayment !== null ? mortgagePayment * 12 : null,
  };
}
