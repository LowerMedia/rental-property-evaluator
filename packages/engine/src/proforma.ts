/**
 * Pro-forma mode entry point (RPE-29).
 *
 * Bundles the screener snapshot with the multi-year projection.
 * IRR / NPV added in RPE-33; exit/sale modeling in RPE-34.
 *
 * Inputs MUST be pre-normalised via normalizeInputs() before calling calcProForma().
 */

import { calcScreener } from './screener';
import { calcProjection } from './projection';
import type { DealInputs, ProFormaResults } from './types';

/**
 * Compute pro-forma results: screener snapshot + multi-year hold projection.
 *
 * The screener results reflect Year-0 (acquisition-day) financials.
 * The projection array covers Years 1..holdYears (empty if holdYears is absent/0).
 */
export function calcProForma(inputs: DealInputs): ProFormaResults {
  const screener = calcScreener(inputs);

  // Guard: purchasePrice = 0 causes calcScreener() to return an all-null snapshot.
  // Projecting in that case would yield numeric rows that contradict the null screener,
  // producing an internally inconsistent result. Return an empty projection instead.
  if (inputs.purchasePrice <= 0) {
    return { screener, projection: [] };
  }

  return {
    screener,
    projection: calcProjection(inputs),
  };
}
