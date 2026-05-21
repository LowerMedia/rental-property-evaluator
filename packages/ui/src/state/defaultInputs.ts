import type { DealInputs } from '@rpe/engine';

/**
 * Default DealInputs shown when the evaluator first loads.
 * Values are deliberately illustrative (a plausible starter deal) not zero-filled,
 * so the results panel shows useful numbers immediately.
 */
export const DEFAULT_INPUTS: DealInputs = {
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
