/**
 * Pass/fail direction and threshold configuration for every ScreenerResults field.
 *
 * The UI uses this map to colour each metric green/red without embedding policy in
 * component code.  Thresholds are conventional real-estate defaults; the UI may
 * expose them as configurable.
 *
 * direction 'higher' → value > threshold is passing (green)
 * direction 'lower'  → value < threshold is passing (green)
 * direction 'none'   → informational only, no pass/fail colouring
 */

import type { ScreenerResults } from './types';

export type MetricDirection = 'higher' | 'lower' | 'none';

export interface MetricConfig {
  /** Pass/fail direction. 'none' = informational only. */
  direction: MetricDirection;
  /** Passing threshold. Undefined when direction is 'none'. */
  threshold?: number;
  /** Display label for the metric. */
  label: string;
  /** One-sentence description shown in tooltip. */
  description: string;
  /** Unit suffix for display (%, $, ×, etc.). */
  unit?: string;
  /** How many decimal places to display. */
  decimals?: number;
}

/**
 * Configuration for every ScreenerResults key.
 * Typed as Partial because some fields are informational (loanAmount, totalCashInvested, etc.).
 */
export const SCREENER_METRIC_CONFIG: Readonly<
  Record<keyof ScreenerResults, MetricConfig>
> = {
  loanAmount: {
    direction: 'none',
    label: 'Loan Amount',
    description: 'Total mortgage principal.',
    unit: '$',
    decimals: 0,
  },
  mortgagePayment: {
    direction: 'none',
    label: 'Mortgage Payment',
    description: 'Monthly principal + interest (P&I).',
    unit: '$/mo',
    decimals: 2,
  },
  totalInterest: {
    direction: 'none',
    label: 'Total Interest',
    description: 'Total interest paid over the full loan term (from amortization schedule).',
    unit: '$',
    decimals: 0,
  },
  egi: {
    direction: 'none',
    label: 'EGI',
    description: 'Effective Gross Income — gross rent after vacancy.',
    unit: '$/mo',
    decimals: 2,
  },
  egiAnnual: {
    direction: 'none',
    label: 'EGI (Annual)',
    description: 'Effective Gross Income annualised.',
    unit: '$/yr',
    decimals: 0,
  },
  opExMonthly: {
    direction: 'none',
    label: 'Operating Expenses',
    description: 'Total operating expenses excluding debt service.',
    unit: '$/mo',
    decimals: 2,
  },
  opExAnnual: {
    direction: 'none',
    label: 'Operating Expenses (Annual)',
    description: 'Total operating expenses annualised.',
    unit: '$/yr',
    decimals: 0,
  },
  piti: {
    direction: 'none',
    label: 'PITI',
    description: 'Monthly mortgage P&I + taxes + insurance + HOA — what the lender underwrites.',
    unit: '$/mo',
    decimals: 2,
  },
  noiMonthly: {
    direction: 'higher',
    threshold: 0,
    label: 'NOI',
    description: 'Net Operating Income — EGI minus all operating expenses.',
    unit: '$/mo',
    decimals: 2,
  },
  noiAnnual: {
    direction: 'higher',
    threshold: 0,
    label: 'NOI (Annual)',
    description: 'Net Operating Income annualised.',
    unit: '$/yr',
    decimals: 0,
  },
  capRate: {
    direction: 'higher',
    threshold: 5,
    label: 'Cap Rate',
    description: 'NOI ÷ purchase price. Market-dependent; 5% is a common minimum.',
    unit: '%',
    decimals: 2,
  },
  cashFlowMonthly: {
    direction: 'higher',
    threshold: 0,
    label: 'Cash Flow',
    description: 'Monthly income after all expenses including mortgage.',
    unit: '$/mo',
    decimals: 2,
  },
  cashFlowAnnual: {
    direction: 'higher',
    threshold: 0,
    label: 'Cash Flow (Annual)',
    description: 'Annual income after all expenses including mortgage.',
    unit: '$/yr',
    decimals: 0,
  },
  cocRoi: {
    direction: 'higher',
    threshold: 8,
    label: 'Cash-on-Cash ROI',
    description: 'Annual cash flow ÷ total cash invested. 8% is a common minimum target.',
    unit: '%',
    decimals: 2,
  },
  dscr: {
    direction: 'higher',
    threshold: 1.25,
    label: 'DSCR',
    description: 'Debt Service Coverage Ratio — NOI ÷ annual debt service. Lenders require ≥1.25.',
    unit: '×',
    decimals: 2,
  },
  grm: {
    // GRM: LOWER is better — price/rent ratio, like a P/E ratio for real estate
    direction: 'lower',
    threshold: 12,
    label: 'GRM',
    description:
      'Gross Rent Multiplier — price ÷ annual gross rent. Lower is better; 12 is a rough market target.',
    unit: '×',
    decimals: 1,
  },
  onePercentRule: {
    direction: 'higher',
    threshold: 1,
    label: '1% Rule',
    description: 'Monthly rent ÷ purchase price × 100. Passing at ≥1% suggests positive cash flow potential.',
    unit: '%',
    decimals: 2,
  },
  breakEvenOccupancy: {
    direction: 'lower',
    threshold: 80,
    label: 'Break-Even Occupancy',
    description:
      'Occupancy rate at which cash flow = 0. Lower is better; above 80% is risky.',
    unit: '%',
    decimals: 1,
  },
  expenseRatio: {
    direction: 'lower',
    threshold: 45,
    label: 'Expense Ratio',
    description: 'Operating expenses ÷ EGI. Norm is 35–45%; above 50% is a warning.',
    unit: '%',
    decimals: 1,
  },
  ltv: {
    direction: 'lower',
    threshold: 80,
    label: 'LTV',
    description: 'Loan-to-Value — loan ÷ purchase price. Most lenders require ≤80%.',
    unit: '%',
    decimals: 1,
  },
  debtYield: {
    direction: 'higher',
    threshold: 8,
    label: 'Debt Yield',
    description: 'NOI ÷ loan amount — a lender underwriting metric independent of amortization.',
    unit: '%',
    decimals: 2,
  },
  grossYield: {
    direction: 'higher',
    threshold: 7,
    label: 'Gross Yield',
    description: 'Annual gross rent ÷ purchase price. Pre-expense return on price.',
    unit: '%',
    decimals: 2,
  },
  pricePerUnit: {
    direction: 'none',
    label: 'Price / Unit',
    description: 'Purchase price divided by number of units.',
    unit: '$',
    decimals: 0,
  },
  pricePerSqft: {
    direction: 'none',
    label: 'Price / Sqft',
    description: 'Purchase price divided by total square footage.',
    unit: '$/sqft',
    decimals: 2,
  },
  totalCashInvested: {
    direction: 'none',
    label: 'Total Cash Invested',
    description: 'Down payment + out-of-pocket closing costs + rehab.',
    unit: '$',
    decimals: 0,
  },
  fiftyPctRuleDeviation: {
    direction: 'none',
    label: '50% Rule Check',
    description:
      'How far modeled expenses deviate from the 50% rule heuristic (positive = more expensive than 50% rule).',
    unit: '%',
    decimals: 1,
  },
} as const;
