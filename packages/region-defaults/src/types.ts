/**
 * Types for the regional assumption defaults data layer (RPE-65).
 *
 * RegionalRates expresses all location-variable assumptions as rates/fractions
 * so callers can apply them to any purchase price without knowing the median
 * home value of the region.
 *
 * Resolution levels follow a fallback hierarchy:
 *   zip → county → metro → state → national
 * For v1, state and national are the only populated levels.
 * Finer-grained data (ZIP/county ACS, FHFA metro HPI) can be added later
 * by the annual data pipeline without changing this interface.
 */

/** Geographic resolution level at which an assumption was resolved. */
export type RegionLevel = 'zip' | 'county' | 'metro' | 'state' | 'national';

/**
 * Location-variable assumption rates for a given region.
 *
 * All rates are expressed as fractions (0–1) unless noted otherwise.
 * Dollar amounts are NOT stored here — callers apply rates to the purchase price.
 */
export interface RegionalRates {
  /**
   * Effective property tax rate (median annual taxes paid / median home value).
   * E.g. Texas = 0.0180 (1.80 %).
   * Source: Census ACS 5-yr state averages.
   */
  propertyTaxRate: number;

  /**
   * Annual homeowner insurance premium as a fraction of purchase price.
   * Derived as: NAIC state avg annual premium ÷ $254,000 (US median home value 2022).
   * E.g. Florida = 0.0142 (1.42 %).
   */
  insuranceRate: number;

  /**
   * Rental vacancy rate (0–1).
   * E.g. 0.068 = 6.8 % — national CPS/HVS Q4 2024.
   * Sub-national data deferred to a future data pipeline run.
   */
  vacancyRate: number;

  /**
   * Annualised home price appreciation rate (0–1).
   * E.g. 0.04 = 4 % — FHFA trailing 10-yr national average.
   * Metro/state HPI data deferred to a future pipeline.
   */
  appreciationRate: number;

  /**
   * Annual rent growth rate (0–1).
   * E.g. 0.035 = 3.5 % — Zillow ZORI trailing 5-yr national average.
   * Metro/ZIP ZORI data deferred to a future pipeline.
   */
  rentGrowthRate: number;

  /**
   * Finest geographic level these rates were actually resolved at.
   * May differ from the requested level when a fallback was applied.
   */
  resolvedLevel: RegionLevel;

  /**
   * Human-readable source label for UI attribution badges.
   * E.g. 'TX state averages (Census ACS / NAIC 2022)'
   */
  sourceLabel: string;
}
