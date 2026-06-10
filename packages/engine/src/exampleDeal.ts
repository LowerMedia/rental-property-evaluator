/**
 * EXAMPLE deal — golden verification fixture (RPE-68)
 *
 * A known deal with hand-verified expected outputs, loadable in the UI
 * ("Load Example") and locked by an engine test so any change that
 * shifts results fails CI.
 *
 * Hand-calc derivation (matches brain/02-calculations-spec.md):
 *   loan          = 300,000 × 80%                        = 240,000
 *   P&I (7%/30y)  = 240,000 × r(1+r)^360/((1+r)^360−1),
 *                   r = 0.07/12                          = 1,596.7259884300377
 *   EGI           = 2,200 × (1 − 5%)                     = 2,090 /mo
 *   OpEx          = 400 tax + 150 ins + 110 capEx
 *                   + 110 maint + 220 mgmt               = 990 /mo
 *   NOI           = 2,090 − 990                          = 1,100 /mo → 13,200 /yr
 *   Cap rate      = 13,200 / 300,000                     = 4.4%
 *   Cash flow     = 1,100 − 1,596.73                     = −496.73 /mo
 *   Cash invested = 60,000 down + 6,000 closing          = 66,000
 *   CoC ROI       = −5,960.71 / 66,000                   = −9.031%
 *   DSCR          = 13,200 / 19,160.71                   = 0.6889
 *   GRM           = 300,000 / 26,400                     = 11.364
 *   1% rule       = 2,200 / 300,000                      = 0.7333%
 *   Break-even    = (11,880 + 19,160.71) / 26,400        = 117.58%
 *   Expense ratio = 11,880 / 25,080                      = 47.368%
 *   LTV           = 80% · Debt yield = 5.5% · Gross yield = 8.8%
 */

import type { DealInputs, Results } from './types';

export const EXAMPLE_DEAL_INPUTS: DealInputs = {
  purchasePrice: 300_000,
  percentDown: 20,
  interestRate: 7,
  loanTermYears: 30,
  closingCosts: 6_000,
  rollClosingCostsIntoLoan: false,
  grossRent: 2_200,
  vacancyPct: 5,
  expenses: {
    taxes: { amount: 4_800, period: 'annual' },
    insurance: { amount: 1_800, period: 'annual' },
    capExPct: 5,
    maintPct: 5,
    mgmtPct: 10,
  },
};

/** Locked golden outputs for EXAMPLE_DEAL_INPUTS (screener mode). */
export const EXAMPLE_DEAL_EXPECTED: Partial<Results> = {
  loanAmount: 240_000,
  mortgagePayment: 1596.7259884300377,
  egi: 2_090,
  egiAnnual: 25_080,
  opExMonthly: 990,
  opExAnnual: 11_880,
  piti: 2146.7259884300374,
  noiMonthly: 1_100,
  noiAnnual: 13_200,
  capRate: 4.3999999999999995, // 4.4 — exact IEEE-754 value locked for toBe()
  cashFlowMonthly: -496.72598843003766,
  cashFlowAnnual: -5960.711861160452,
  cocRoi: -9.031381607818867,
  dscr: 0.6889096864275143,
  grm: 11.363636363636363,
  onePercentRule: 0.7333333333333333,
  breakEvenOccupancy: 117.57845401954717,
  expenseRatio: 47.368421052631575,
  ltv: 80,
  debtYield: 5.5,
  grossYield: 8.799999999999999, // 8.8 — exact IEEE-754 value locked for toBe()
  totalCashInvested: 66_000,
};
