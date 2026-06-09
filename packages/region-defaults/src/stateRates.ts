/**
 * State-level property tax and insurance rates for all 50 US states.
 *
 * Property tax rate:
 *   Source: Census ACS 5-year estimates (2022), state-level effective rate.
 *   Method: median property taxes paid (B25103) ÷ median home value (B25077).
 *   Reference: Tax Foundation 2023 state property tax comparison (same ACS methodology).
 *
 * Insurance rate:
 *   Source: NAIC Homeowners Insurance Report 2022 (state average annual premium).
 *   Derived rate: state avg premium ÷ $254,000 (US median home value, ACS 2022).
 *   This produces a purchase-price-relative rate consistent with the baseline
 *   module's existing pattern of `amount = purchasePrice * rate`.
 *
 * Data vintage: 2022. Updated annually via the data pipeline script.
 * Keys: 2-letter US state codes (uppercase).
 */
export const STATE_RATES: Readonly<
  Record<string, Readonly<{ taxRate: number; insuranceRate: number }>>
> = {
  AL: { taxRate: 0.0040, insuranceRate: 0.0068 },
  AK: { taxRate: 0.0098, insuranceRate: 0.0046 },
  AZ: { taxRate: 0.0062, insuranceRate: 0.0054 },
  AR: { taxRate: 0.0062, insuranceRate: 0.0083 },
  CA: { taxRate: 0.0073, insuranceRate: 0.0046 },
  CO: { taxRate: 0.0050, insuranceRate: 0.0095 },
  CT: { taxRate: 0.0179, insuranceRate: 0.0063 },
  DE: { taxRate: 0.0056, insuranceRate: 0.0040 },
  FL: { taxRate: 0.0086, insuranceRate: 0.0142 },
  GA: { taxRate: 0.0090, insuranceRate: 0.0067 },
  HI: { taxRate: 0.0026, insuranceRate: 0.0050 },
  ID: { taxRate: 0.0044, insuranceRate: 0.0042 },
  IL: { taxRate: 0.0222, insuranceRate: 0.0067 },
  IN: { taxRate: 0.0083, insuranceRate: 0.0054 },
  IA: { taxRate: 0.0144, insuranceRate: 0.0060 },
  KS: { taxRate: 0.0133, insuranceRate: 0.0100 },
  KY: { taxRate: 0.0082, insuranceRate: 0.0064 },
  LA: { taxRate: 0.0053, insuranceRate: 0.0113 },
  ME: { taxRate: 0.0105, insuranceRate: 0.0038 },
  MD: { taxRate: 0.0099, insuranceRate: 0.0049 },
  MA: { taxRate: 0.0114, insuranceRate: 0.0065 },
  MI: { taxRate: 0.0132, insuranceRate: 0.0054 },
  MN: { taxRate: 0.0102, insuranceRate: 0.0069 },
  MS: { taxRate: 0.0066, insuranceRate: 0.0074 },
  MO: { taxRate: 0.0088, insuranceRate: 0.0075 },
  MT: { taxRate: 0.0074, insuranceRate: 0.0067 },
  NE: { taxRate: 0.0161, insuranceRate: 0.0084 },
  NV: { taxRate: 0.0048, insuranceRate: 0.0039 },
  NH: { taxRate: 0.0182, insuranceRate: 0.0039 },
  NJ: { taxRate: 0.0213, insuranceRate: 0.0059 },
  NM: { taxRate: 0.0066, insuranceRate: 0.0060 },
  NY: { taxRate: 0.0140, insuranceRate: 0.0060 },
  NC: { taxRate: 0.0080, insuranceRate: 0.0050 },
  ND: { taxRate: 0.0094, insuranceRate: 0.0079 },
  OH: { taxRate: 0.0143, insuranceRate: 0.0047 },
  OK: { taxRate: 0.0085, insuranceRate: 0.0113 },
  OR: { taxRate: 0.0082, insuranceRate: 0.0043 },
  PA: { taxRate: 0.0149, insuranceRate: 0.0042 },
  RI: { taxRate: 0.0140, insuranceRate: 0.0065 },
  SC: { taxRate: 0.0050, insuranceRate: 0.0059 },
  SD: { taxRate: 0.0114, insuranceRate: 0.0071 },
  TN: { taxRate: 0.0061, insuranceRate: 0.0066 },
  TX: { taxRate: 0.0180, insuranceRate: 0.0123 },
  UT: { taxRate: 0.0056, insuranceRate: 0.0041 },
  VT: { taxRate: 0.0183, insuranceRate: 0.0040 },
  VA: { taxRate: 0.0087, insuranceRate: 0.0049 },
  WA: { taxRate: 0.0084, insuranceRate: 0.0045 },
  WV: { taxRate: 0.0053, insuranceRate: 0.0044 },
  WI: { taxRate: 0.0161, insuranceRate: 0.0043 },
  WY: { taxRate: 0.0055, insuranceRate: 0.0050 },
} as const;

/**
 * National-average fallback rates used when no state match is found
 * or as the base for assumptions not yet resolved at finer granularity.
 *
 * Sources:
 *   taxRate:          Census ACS national effective rate (~1.12 %)
 *   insuranceRate:    NAIC national avg $1,672 ÷ $254,000 (~0.66 %)
 *   vacancyRate:      Census CPS/HVS Q4 2024 national rental vacancy (6.8 %)
 *   appreciationRate: FHFA HPI trailing 10-yr national annualised (4.0 %)
 *   rentGrowthRate:   Zillow ZORI trailing 5-yr national annualised (3.5 %)
 */
export const NATIONAL_RATES = {
  taxRate: 0.0112,
  insuranceRate: 0.0066,
  vacancyRate: 0.068,
  appreciationRate: 0.040,
  rentGrowthRate: 0.035,
} as const;
