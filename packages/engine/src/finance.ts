/**
 * Low-level financial primitives: pmt(), irr(), npv().
 *
 * These are pure functions with no side effects.
 * All inputs are assumed already normalised (no NaN, no Infinity).
 *
 * irr() and npv() are stubs — implemented in RPE-E4 (pro-forma mode).
 */

// ─── PMT ─────────────────────────────────────────────────────────────────────

/**
 * Monthly mortgage payment (principal + interest).
 *
 * Formula (02-calculations-spec.md):
 *   r = annualRate / 100 / 12
 *   n = termYears × 12
 *   r === 0  →  loanAmount / n           (linear amortisation guard)
 *   r !== 0  →  loanAmount × r(1+r)^n / ((1+r)^n − 1)
 *
 * @param loanAmount  Principal in dollars (≥ 0).
 * @param annualRate  Annual interest rate in percent (e.g. 6.5). 0 is valid.
 * @param termYears   Loan term in years (> 0).
 * @returns           Monthly P&I payment, or null if termYears ≤ 0.
 */
export function pmt(
  loanAmount: number,
  annualRate: number,
  termYears: number,
): number | null {
  if (termYears <= 0) return null;
  if (loanAmount <= 0) return 0;

  const n = termYears * 12;
  const r = annualRate / 100 / 12;

  if (r === 0) {
    return loanAmount / n;
  }

  const compounded = Math.pow(1 + r, n);
  return (loanAmount * (r * compounded)) / (compounded - 1);
}

// ─── Amortization schedule ───────────────────────────────────────────────────

export interface AmortizationRow {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

export interface AmortizationSchedule {
  rows: AmortizationRow[];
  /** Sum of all interest_m over the full term. Replaces the old fabricated formula. */
  totalInterest: number;
}

/**
 * Full amortization schedule for a fixed-rate loan.
 *
 * Spec (02-calculations-spec.md):
 *   for each month m in 1..n:
 *     interest_m  = balance × r
 *     principal_m = payment − interest_m
 *     balance     = balance − principal_m
 *   totalInterest = Σ interest_m
 *
 * @returns null if the loan has no principal (loanAmount ≤ 0 or termYears ≤ 0).
 */
export function amortize(
  loanAmount: number,
  annualRate: number,
  termYears: number,
): AmortizationSchedule | null {
  const payment = pmt(loanAmount, annualRate, termYears);
  if (payment === null || loanAmount <= 0) return null;

  const n = termYears * 12;
  const r = annualRate / 100 / 12;

  const rows: AmortizationRow[] = [];
  let balance = loanAmount;
  let totalInterest = 0;

  for (let month = 1; month <= n; month++) {
    const interest = balance * r;
    const principal = payment - interest;
    balance = Math.max(0, balance - principal); // guard floating-point drift at final payment

    totalInterest += interest;

    rows.push({
      month,
      payment,
      principal,
      interest,
      balance,
    });
  }

  return { rows, totalInterest };
}

// ─── IRR / NPV (stubs — RPE-E4) ──────────────────────────────────────────────

/**
 * Internal rate of return via Newton-Raphson / bisection.
 * Stub — implemented in RPE-E4.
 */
export function irr(_cashFlows: number[]): number | null {
  // TODO: implement in RPE-E4
  return null;
}

/**
 * Net present value at a given discount rate.
 * Stub — implemented in RPE-E4.
 */
export function npv(_discountRate: number, _cashFlows: number[]): number | null {
  // TODO: implement in RPE-E4
  return null;
}
