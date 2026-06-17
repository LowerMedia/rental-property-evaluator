/**
 * @rpe/region-defaults — Regional assumption defaults data layer (RPE-65)
 *
 * Provides per-region rates for the baseline-assumptions module so simple-mode
 * calculations use location-specific defaults instead of static national averages.
 *
 * v1 data coverage:
 *   - Property tax rate:  state-level (Census ACS 2022)
 *   - Insurance rate:     state-level (NAIC 2022)
 *   - Vacancy rate:       national only (county ACS deferred)
 *   - Appreciation rate:  national only (FHFA HPI state/metro data deferred)
 *   - Rent growth rate:   national only (Zillow ZORI data deferred)
 *
 * Resolution is performed by the apps/api /region endpoint (which also
 * calls HUD SAFMR for ZIP-level rent data). This package is the pure-TS,
 * no-I/O, static-data layer that the route handler imports.
 */

import { STATE_RATES, NATIONAL_RATES } from './stateRates.js';
import type { RegionalRates } from './types.js';

export type { RegionalRates, RegionLevel } from './types.js';
export { STATE_RATES, NATIONAL_RATES } from './stateRates.js';
export { stateForZip } from './zipToState.js';

/**
 * Resolve regional assumption rates for the given US state code.
 *
 * @param stateCode  2-letter US state code (case-insensitive, e.g. 'TX', 'tx').
 *                   Pass an empty string or unknown code to receive national fallback.
 * @returns          `RegionalRates` for the state if known, otherwise national defaults.
 */
export function resolveRegionalRates(stateCode: string): RegionalRates {
  const upper = stateCode.trim().toUpperCase();
  const state = STATE_RATES[upper];

  if (state) {
    return {
      propertyTaxRate: state.taxRate,
      insuranceRate: state.insuranceRate,
      vacancyRate: NATIONAL_RATES.vacancyRate,
      appreciationRate: NATIONAL_RATES.appreciationRate,
      rentGrowthRate: NATIONAL_RATES.rentGrowthRate,
      resolvedLevel: 'state',
      sourceLabel: `${upper} state averages (Census ACS / NAIC 2022)`,
    };
  }

  return {
    propertyTaxRate: NATIONAL_RATES.taxRate,
    insuranceRate: NATIONAL_RATES.insuranceRate,
    vacancyRate: NATIONAL_RATES.vacancyRate,
    appreciationRate: NATIONAL_RATES.appreciationRate,
    rentGrowthRate: NATIONAL_RATES.rentGrowthRate,
    resolvedLevel: 'national',
    sourceLabel: 'National averages',
  };
}
