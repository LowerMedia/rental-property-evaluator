/**
 * IRR / NPV financial utilities (RPE-33).
 *
 * All rates are plain decimals internally (0.10 = 10%). Exported functions
 * that accept/return user-facing rates use percent notation (10 = 10%).
 */

const MAX_ITER = 200;
const TOLERANCE = 1e-10;

/**
 * Net Present Value of a series of cash flows discounted at `rate` (decimal).
 *
 * cashFlows[0] is the Year-0 outflow (typically negative).
 * cashFlows[t] is the cash flow at the end of Year t.
 */
function npvDecimal(cashFlows: number[], rate: number): number {
  return cashFlows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);
}

/**
 * Derivative of NPV with respect to rate (for Newton-Raphson).
 */
function dnpvDecimal(cashFlows: number[], rate: number): number {
  return cashFlows.reduce(
    (acc, cf, t) => acc - (t * cf) / Math.pow(1 + rate, t + 1),
    0,
  );
}

/**
 * Compute the IRR of a cash-flow series using Newton-Raphson with bisection fallback.
 *
 * @param cashFlows  Array where index t corresponds to Year t.
 *                   cashFlows[0] should be negative (initial investment).
 * @returns          IRR as a percent (e.g. 12.5) or null if convergence fails.
 */
export function calcIRR(cashFlows: number[]): number | null {
  if (cashFlows.length < 2) return null;

  // Sanity: require at least one positive and one negative flow.
  const hasPositive = cashFlows.some((cf) => cf > 0);
  const hasNegative = cashFlows.some((cf) => cf < 0);
  if (!hasPositive || !hasNegative) return null;

  // ── Newton-Raphson starting from 0.1 (10%) ───────────────────────────────
  let rate = 0.1;
  for (let i = 0; i < MAX_ITER; i++) {
    const f = npvDecimal(cashFlows, rate);
    const df = dnpvDecimal(cashFlows, rate);

    if (Math.abs(df) < 1e-15) break; // derivative too flat → fall through to bisection
    const next = rate - f / df;
    if (Math.abs(next - rate) < TOLERANCE) {
      return next * 100; // convert decimal to percent
    }
    rate = next;
    // Clamp rate to [-0.999, 10] to avoid divergence
    if (rate <= -0.999) rate = -0.999;
    if (rate > 10) rate = 10;
  }

  // ── Bisection fallback on [-0.999, 10] ───────────────────────────────────
  let lo = -0.999;
  let hi = 10.0;
  if (Math.sign(npvDecimal(cashFlows, lo)) === Math.sign(npvDecimal(cashFlows, hi))) {
    return null; // no root in range
  }
  for (let i = 0; i < MAX_ITER; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npvDecimal(cashFlows, mid);
    if (Math.abs(fMid) < TOLERANCE || (hi - lo) / 2 < TOLERANCE) {
      return mid * 100;
    }
    if (Math.sign(fMid) === Math.sign(npvDecimal(cashFlows, lo))) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return null; // failed to converge
}

/**
 * Net Present Value at a user-facing discount rate (percent).
 *
 * @param cashFlows      Array where index t corresponds to Year t.
 * @param discountRatePct  Discount rate in percent (e.g. 10 = 10%).
 * @returns              NPV in dollars.
 */
export function calcNPV(cashFlows: number[], discountRatePct: number): number {
  return npvDecimal(cashFlows, discountRatePct / 100);
}
