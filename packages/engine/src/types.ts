/**
 * @rpe/engine — canonical types
 *
 * Convention:
 *  - All percentages stored as percent (e.g. 4.5 = 4.5 %, not 0.045).
 *  - All currency stored in USD dollars.
 *  - Expense amounts carry an explicit `period` flag — no silent unit ambiguity.
 *  - Every numeric result is `number | null`; null means "undefined / N/A" (render "—").
 *    The engine NEVER returns NaN or Infinity.
 */

// ─── Input types ────────────────────────────────────────────────────────────

export type Period = 'monthly' | 'annual';

export interface ExpenseInput {
  amount: number;
  period: Period;
}

export interface DealExpenses {
  /** CapEx reserve as % of monthly gross rent. Default: conservative (included in OpEx). */
  capExPct?: number;
  /** Maintenance as % of monthly gross rent. */
  maintPct?: number;
  /** Property management as % of monthly gross rent. */
  mgmtPct?: number;
  /** Miscellaneous as % of monthly gross rent. */
  miscPct?: number;
  /** Property taxes — amount + explicit period. */
  taxes: ExpenseInput;
  /** Insurance — amount + explicit period. */
  insurance: ExpenseInput;
  /** HOA — amount + explicit period. */
  hoa?: ExpenseInput;
  /** Other fixed expense — amount + explicit period. */
  other?: ExpenseInput;
}

export interface DealInputs {
  // ── Purchase ───────────────────────────────────────────────────────────────
  purchasePrice: number;
  /** 0–100. 100 = cash purchase (no loan). */
  percentDown: number;
  /** Annual interest rate in percent (e.g. 6.5 = 6.5 %). 0 is valid. */
  interestRate: number;
  loanTermYears: number;
  closingCosts: number;
  rollClosingCostsIntoLoan: boolean;
  rehab?: number;

  // ── Income ─────────────────────────────────────────────────────────────────
  /** Monthly gross rent (gross potential rent before vacancy). */
  grossRent: number;
  /** Other monthly income (parking, laundry, storage, pet rent, etc.). */
  otherIncome?: number;

  // ── Vacancy ────────────────────────────────────────────────────────────────
  /** 0–100. Applied to (grossRent + otherIncome) to derive EGI. */
  vacancyPct: number;

  // ── Expenses ───────────────────────────────────────────────────────────────
  expenses: DealExpenses;

  // ── Property metadata (optional) ──────────────────────────────────────────
  units?: number;
  sqft?: number;
  /** Land value used for depreciation calculation (non-depreciable). */
  landValue?: number;

  // ── Pro-forma inputs (opt-in) ──────────────────────────────────────────────
  holdYears?: number;
  /** Annual rent growth rate in percent. */
  rentGrowthPct?: number;
  /** Annual expense growth rate in percent. */
  expenseGrowthPct?: number;
  /** Annual appreciation rate in percent. */
  appreciationPct?: number;
  /** Selling costs as % of projected sale price. */
  sellingCostsPct?: number;
  /** Marginal income tax rate in percent (for after-tax cash flow). */
  marginalTaxPct?: number;
  /**
   * When true (default), CapEx reserve is included in OpEx → NOI is conservative.
   * When false, CapEx excluded from OpEx (lender convention).
   */
  capExInNOI?: boolean;
}

// ─── Result types ────────────────────────────────────────────────────────────

/**
 * Screener-tier results. Every value is `number | null`.
 * null = metric is undefined for this input set (e.g. DSCR at 100% down).
 * The UI renders null as "—".
 */
export interface ScreenerResults {
  // ── Loan ───────────────────────────────────────────────────────────────────
  loanAmount: number | null;
  /** Monthly principal + interest payment. */
  mortgagePayment: number | null;
  /** Total interest paid over the full loan term (from amortization schedule). */
  totalInterest: number | null;

  // ── Income ─────────────────────────────────────────────────────────────────
  /** Effective Gross Income, monthly: (grossRent + otherIncome) × (1 − vacancy%). */
  egi: number | null;
  /** EGI annualised (egi × 12). */
  egiAnnual: number | null;

  // ── Expenses ───────────────────────────────────────────────────────────────
  /**
   * Operating Expenses, monthly (excludes debt service; CapEx included per capExInNOI flag).
   */
  opExMonthly: number | null;
  /** OpEx annualised (opExMonthly × 12). */
  opExAnnual: number | null;
  /**
   * PITI: monthly mortgage P&I + (taxes + insurance) / 12 + HOA / 12.
   * What the bank underwrites.
   */
  piti: number | null;

  // ── NOI ────────────────────────────────────────────────────────────────────
  /** Net Operating Income, monthly (egi − opExMonthly). */
  noiMonthly: number | null;
  /** NOI annualised (noiMonthly × 12). */
  noiAnnual: number | null;

  // ── Core metrics ───────────────────────────────────────────────────────────
  /** Cap rate: noiAnnual / purchasePrice × 100. Higher is better. */
  capRate: number | null;
  /** Monthly cash flow: noiMonthly − mortgagePayment. Higher is better. */
  cashFlowMonthly: number | null;
  /** Annual cash flow: cashFlowMonthly × 12. */
  cashFlowAnnual: number | null;
  /** Cash-on-cash ROI: cashFlowAnnual / totalCashInvested × 100. Higher is better. */
  cocRoi: number | null;
  /** DSCR: noiAnnual / annualDebtService. Higher is better (threshold ≥ 1.25). */
  dscr: number | null;
  /** GRM: purchasePrice / grossRent_annual. LOWER is better. */
  grm: number | null;
  /** 1% rule: grossRent_monthly / purchasePrice × 100. Higher is better (threshold ≥ 1). */
  onePercentRule: number | null;

  // ── Extended screener metrics (RPE-16) ─────────────────────────────────────
  /**
   * Break-even occupancy %: (opExMonthly + mortgagePayment) / grossPotentialRent × 100.
   * "How empty before cash goes negative." Lower is better.
   */
  breakEvenOccupancy: number | null;
  /** Expense ratio: opExAnnual / egiAnnual × 100. Lower is better (norm 35–45%). */
  expenseRatio: number | null;
  /** LTV: loanAmount / purchasePrice × 100. */
  ltv: number | null;
  /** Debt yield (lender metric): noiAnnual / loanAmount × 100. Higher is better. */
  debtYield: number | null;
  /** Gross yield: grossRent_annual / purchasePrice × 100. Higher is better. */
  grossYield: number | null;
  /** Price per unit: purchasePrice / units. Null if units not provided. */
  pricePerUnit: number | null;
  /** Price per sqft: purchasePrice / sqft. Null if sqft not provided. */
  pricePerSqft: number | null;
  /** Down payment + closingCosts (if not rolled) + rehab. */
  totalCashInvested: number | null;
  /**
   * 50% rule sanity check: (modeled opExAnnual − 0.5 × egiAnnual) / egiAnnual × 100.
   * Positive = more expensive than the 50% rule; negative = cheaper.
   */
  fiftyPctRuleDeviation: number | null;
}

// ─── Pro-forma types (RPE-29) ─────────────────────────────────────────────────

/**
 * Single year in the multi-year hold projection (RPE-29).
 *
 * All values are end-of-year figures. Conventions:
 *   - Rent/expense growth: Year 1 = base rates (growth factor = (1+g)^0 = 1).
 *     Compounding begins in Year 2 and beyond.
 *   - Property value: end-of-Year-1 = purchasePrice × (1+a)^1 (first year of appreciation applied).
 *   - Loan balance: remaining balance at the end of that calendar year.
 *   - Debt service: 0 for years beyond the loan term (loan fully paid off) and for cash purchases.
 *   - % of rent expenses (capEx, maint, mgmt, misc) scale automatically with rent growth.
 *   - Fixed dollar expenses (taxes, insurance, HOA, other) grow at expenseGrowthPct.
 */
export interface ProjectionYear {
  /** 1-indexed; Year 1 = base year (end-of-year-1 values), Year N = last year of hold. */
  year: number;
  /** Gross potential rent for the year (base in Year 1; grows at rentGrowthPct from Year 2). */
  grossRentAnnual: number;
  /** EGI = (grossRent + otherIncome) × (1 − vacancy%) for the year. */
  egiAnnual: number;
  /** Operating expenses for the year (% components track rent; fixed components grow at expenseGrowthPct). */
  opExAnnual: number;
  /** NOI = egiAnnual − opExAnnual. */
  noiAnnual: number;
  /** Annual debt service (P&I × 12). Zero for years beyond the loan term or for cash purchases. */
  annualDebtService: number;
  /** Cash flow = noiAnnual − annualDebtService. */
  cashFlowAnnual: number;
  /** Running total of cash flows from Year 1 through this year. */
  cumulativeCashFlow: number;
  /** Remaining loan balance at end-of-year. 0 for cash purchases or after loan payoff. */
  loanBalance: number;
  /** Estimated property value at end-of-year = purchasePrice × (1 + appreciationPct/100)^year. */
  propertyValue: number;
  /** Equity = propertyValue − loanBalance. */
  equity: number;
}

/**
 * Pro-forma results — screener snapshot + multi-year projection.
 * IRR / NPV / equity multiple added in RPE-33; exit modeling in RPE-34.
 */
export interface ProFormaResults {
  screener: ScreenerResults;
  /** Year-by-year projections. Length = holdYears (empty array if holdYears is absent/0). */
  projection: ProjectionYear[];
}

export type EvalMode = 'screener' | 'proforma';

export interface EvalOptions {
  mode?: EvalMode;
}

/** Union return type of evaluate(). */
export type Results = ScreenerResults | ProFormaResults;
