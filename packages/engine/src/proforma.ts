/**
 * Pro-forma mode entry point (RPE-29, RPE-33).
 *
 * Bundles the screener snapshot, multi-year projection, and hold-period summary
 * metrics (IRR, NPV, equity multiple). Exit/sale modeling added in RPE-34.
 *
 * Inputs MUST be pre-normalised via normalizeInputs() before calling calcProForma().
 */

import { calcScreener } from './screener';
import { calcProjection } from './projection';
import { calcIRR, calcNPV } from './irr';
import type { DealInputs, ProFormaResults } from './types';

/**
 * Compute pro-forma results: screener snapshot + multi-year hold projection +
 * hold-period summary (IRR, NPV, equity multiple).
 *
 * The screener results reflect Year-0 (acquisition-day) financials.
 * The projection array covers Years 1..holdYears. Returns an empty projection when
 * holdYears is absent/0 or purchasePrice ≤ 0 (the latter prevents internally
 * inconsistent results where screener fields are null but projection rows are numeric).
 */
export function calcProForma(inputs: DealInputs): ProFormaResults {
  const screener = calcScreener(inputs);

  // Guard: purchasePrice = 0 causes calcScreener() to return an all-null snapshot.
  // Projecting in that case would yield numeric rows that contradict the null screener,
  // producing an internally inconsistent result. Return an empty projection instead.
  if (inputs.purchasePrice <= 0) {
    return { screener, projection: [], irr: null, npv: null, equityMultiple: null };
  }

  const projection = calcProjection(inputs);

  // ── Hold-period summary (RPE-33) ──────────────────────────────────────────
  const totalCashInvested = screener.totalCashInvested;
  const lastYear = projection[projection.length - 1] ?? null;

  let irr: number | null = null;
  let npv: number | null = null;
  let equityMultiple: number | null = null;

  if (projection.length > 0 && lastYear !== null && totalCashInvested !== null && totalCashInvested > 0) {
    // Terminal equity: propertyValue − loanBalance at end of hold period.
    const terminalEquity = lastYear.equity;

    // IRR cash-flow series:
    //   Year 0: initial outflow (negative)
    //   Years 1..N-1: annual cash flow
    //   Year N: annual cash flow + terminal equity (liquidation)
    const cashFlows: number[] = [-totalCashInvested];
    for (let i = 0; i < projection.length - 1; i++) {
      cashFlows.push(projection[i]!.cashFlowAnnual);
    }
    cashFlows.push(lastYear.cashFlowAnnual + terminalEquity);

    irr = calcIRR(cashFlows);

    // NPV: only computed when investor provides a discount rate.
    const discountRatePct = inputs.discountRatePct;
    if (discountRatePct !== undefined && discountRatePct > 0) {
      npv = calcNPV(cashFlows, discountRatePct);
    }

    // Equity multiple: total return (cash flows + terminal equity) / initial investment.
    const totalReturn =
      projection.reduce((sum, y) => sum + y.cashFlowAnnual, 0) + terminalEquity;
    equityMultiple = totalReturn / totalCashInvested;
  }

  return {
    screener,
    projection,
    irr,
    npv,
    equityMultiple,
  };
}
