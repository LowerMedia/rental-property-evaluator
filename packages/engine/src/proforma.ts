/**
 * Pro-forma mode entry point (RPE-29, RPE-33, RPE-34).
 *
 * Bundles the screener snapshot, multi-year projection, exit/sale modeling
 * (RPE-34), and hold-period summary metrics (IRR, NPV, equity multiple).
 *
 * Inputs MUST be pre-normalised via normalizeInputs() before calling calcProForma().
 */

import { calcScreener } from './screener';
import { calcProjection } from './projection';
import { calcIRR, calcNPV } from './irr';
import type { DealInputs, ProFormaResults } from './types';

/**
 * Compute pro-forma results: screener snapshot + multi-year hold projection +
 * exit/sale modeling + hold-period summary (IRR, NPV, equity multiple).
 *
 * The screener results reflect Year-0 (acquisition-day) financials.
 * The projection array covers Years 1..holdYears. Returns an empty projection when
 * holdYears is absent/0 or purchasePrice ≤ 0 (the latter prevents internally
 * inconsistent results where screener fields are null but projection rows are numeric).
 *
 * Exit modeling (RPE-34):
 *   salePrice       = lastYear.propertyValue
 *   sellingCosts    = salePrice × sellingCostsPct / 100
 *   netSaleProceeds = salePrice − sellingCosts − lastYear.loanBalance
 *   totalProfit     = Σ cashFlowAnnual + netSaleProceeds − totalCashInvested
 *
 * IRR / NPV / equityMultiple use netSaleProceeds as the terminal cash-flow value
 * so that selling costs are correctly reflected in all return metrics.
 */
export function calcProForma(inputs: DealInputs): ProFormaResults {
  const screener = calcScreener(inputs);

  // Guard: purchasePrice = 0 causes calcScreener() to return an all-null snapshot.
  // Projecting in that case would yield numeric rows that contradict the null screener,
  // producing an internally inconsistent result. Return an empty projection instead.
  if (inputs.purchasePrice <= 0) {
    return {
      screener,
      projection: [],
      salePrice: null,
      sellingCosts: null,
      netSaleProceeds: null,
      totalProfit: null,
      irr: null,
      npv: null,
      equityMultiple: null,
    };
  }

  const projection = calcProjection(inputs);

  const totalCashInvested = screener.totalCashInvested;
  const lastYear = projection[projection.length - 1] ?? null;

  // ── Exit / sale modeling (RPE-34) ─────────────────────────────────────────
  let salePrice: number | null = null;
  let sellingCosts: number | null = null;
  let netSaleProceeds: number | null = null;
  let totalProfit: number | null = null;

  if (lastYear !== null) {
    salePrice = lastYear.propertyValue;
    const sellingCostsPct = inputs.sellingCostsPct ?? 0;
    sellingCosts = salePrice * (sellingCostsPct / 100);
    netSaleProceeds = salePrice - sellingCosts - lastYear.loanBalance;

    if (totalCashInvested !== null && totalCashInvested > 0) {
      const cumulativeCF = projection.reduce((sum, y) => sum + y.cashFlowAnnual, 0);
      totalProfit = cumulativeCF + netSaleProceeds - totalCashInvested;
    }
  }

  // ── Hold-period summary (RPE-33) — uses netSaleProceeds as terminal value ──
  let irr: number | null = null;
  let npv: number | null = null;
  let equityMultiple: number | null = null;

  if (
    projection.length > 0 &&
    lastYear !== null &&
    netSaleProceeds !== null &&
    totalCashInvested !== null &&
    totalCashInvested > 0
  ) {
    // IRR cash-flow series:
    //   Year 0: initial outflow (negative)
    //   Years 1..N-1: annual cash flow
    //   Year N: annual cash flow + netSaleProceeds (liquidation after selling costs)
    const cashFlows: number[] = [-totalCashInvested];
    for (let i = 0; i < projection.length - 1; i++) {
      cashFlows.push(projection[i]!.cashFlowAnnual);
    }
    cashFlows.push(lastYear.cashFlowAnnual + netSaleProceeds);

    irr = calcIRR(cashFlows);

    // NPV: only computed when investor provides a discount rate.
    const discountRatePct = inputs.discountRatePct;
    if (discountRatePct !== undefined && discountRatePct > 0) {
      npv = calcNPV(cashFlows, discountRatePct);
    }

    // Equity multiple: total return (cash flows + netSaleProceeds) / initial investment.
    const totalReturn =
      projection.reduce((sum, y) => sum + y.cashFlowAnnual, 0) + netSaleProceeds;
    equityMultiple = totalReturn / totalCashInvested;
  }

  return {
    screener,
    projection,
    salePrice,
    sellingCosts,
    netSaleProceeds,
    totalProfit,
    irr,
    npv,
    equityMultiple,
  };
}
