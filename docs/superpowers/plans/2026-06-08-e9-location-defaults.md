# E9 — Location-based assumption defaults (RPE-56)

**Date:** 2026-06-08  
**Epic:** RPE-56  
**Release branch:** v1.3.0  
**SPIKE gate:** RPE-63 → Done ✅

---

## Overview

When a user enters a location (ZIP code), the deal's hidden baseline assumptions are pre-filled from regional averages instead of static national baselines. User overrides always win. A source/region badge shows where the data came from.

**What changes in simple mode:**
- Property taxes: `pp × stateEffectiveTaxRate` instead of always `pp × 0.012`
- Insurance: `pp × stateInsuranceRate` instead of always `pp × 0.005`  
- Vacancy: regional average (state/national fallback)
- Rent (suggestion): HUD SAFMR ZIP-level estimate shown as a hint (not a baseline override; `grossRent` is user-entered)

**What stays unchanged:**
- Financing defaults (interestRate, loanTermYears, etc.) — not location-specific
- CapEx/maintenance/mgmt percentages — national averages are fine
- User-entered values in complex mode — never touched by this feature

---

## Architecture decisions (from SPIKE RPE-63)

**Data sources:**
| Assumption | Source | Granularity | Approach |
|---|---|---|---|
| Property tax rate | Census ACS state effective rates (pre-computed, baked in) | State | Static JSON in packages/region-defaults |
| Insurance rate | NAIC 2022 state premium ÷ $254k nat'l median home value | State | Static JSON in packages/region-defaults |
| Vacancy | National 6.8% for v1 (county ACS deferred) | National | Static fallback |
| Rent estimate | HUD SAFMR (via apps/api proxy) | ZIP/ZCTA | Live API call, 30-day localStorage cache |
| Appreciation | National 4.0% for v1 (FHFA HPI data deferred) | National | Static fallback |
| Rent growth | National 3.5% for v1 (Zillow ZORI deferred) | National | Static fallback |

**Key design:** `packages/region-defaults` exports `resolveRegionalRates(stateCode)` returning multipliers that `simpleBaselines.ts` uses instead of hard-coded constants. The `apps/api /region?zip=XXXXX` endpoint calls HUD SAFMR (proxy, free API token) to get ZIP-level rent + state code, then merges with static data.

**State code from ZIP:** HUD SAFMR API returns state in its response — no need for a bundled ZIP→state lookup table. The `/region` endpoint drives off the SAFMR response.

---

## Task Breakdown

### Task 1: RPE-64 — Location input + region state

**Branch:** `RPE-64`  
**Files touched:** `packages/ui/src/state/locationState.ts` (new), `packages/ui/src/components/LocationInput.tsx` (new), `packages/ui/src/Evaluator.tsx`, `packages/ui/tests/locationState.test.ts` (new)

#### locationState.ts
```typescript
// packages/ui/src/state/locationState.ts
export interface LocationState {
  zip: string;           // raw ZIP5 input ('' = not set)
  stateCode: string;     // 2-letter state code once resolved ('' = unresolved)
  label: string;         // human-readable label e.g. 'Austin, TX (78701)' ('' = unresolved)
}

export const DEFAULT_LOCATION: LocationState = { zip: '', stateCode: '', label: '' };
const STORAGE_KEY = 'rpe_location';

export function loadLocation(): LocationState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LOCATION;
    const parsed = JSON.parse(raw) as Partial<LocationState>;
    const zip = typeof parsed.zip === 'string' ? parsed.zip : '';
    const stateCode = typeof parsed.stateCode === 'string' ? parsed.stateCode : '';
    const label = typeof parsed.label === 'string' ? parsed.label : '';
    return { zip, stateCode, label };
  } catch {
    return DEFAULT_LOCATION;
  }
}

export function saveLocation(loc: LocationState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(loc)); } catch { /* ignore */ }
}

export function clearLocation(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export function isValidZip5(value: string): boolean {
  return /^\d{5}$/.test(value.trim());
}
```

#### LocationInput.tsx

A ZIP5 input control. Shown above the Acquisition section (after AutofillBar). When the user enters a valid 5-digit ZIP and presses Enter or clicks "Look up", it fires an `onZipChange(zip: string)` callback. When location is resolved, shows a chip like "TX · 78701 ×" with a clear button.

Props:
```typescript
interface LocationInputProps {
  zip: string;
  stateCode: string;
  label: string;
  onZipChange: (zip: string) => void;  // called when user submits a valid ZIP
  onClear: () => void;
}
```

Render states:
1. **Empty:** text input with placeholder "ZIP code for local defaults". No badge.
2. **Has zip, resolving:** input shows the ZIP, a loading spinner.
3. **Resolved:** chip "TX · 78701" with × clear button; input hidden.
4. **Error:** input remains, inline error text "ZIP not found" or "Enter a 5-digit ZIP".

#### Evaluator.tsx changes

```typescript
// New state
const [location, setLocation] = useState<LocationState>(() => loadLocation());

// When ZIP submitted → save to state + localStorage (resolution happens in useLocationDefaults)
const handleZipChange = useCallback((zip: string) => {
  setLocation({ zip, stateCode: '', label: '' });
  saveLocation({ zip, stateCode: '', label: '' });
}, []);

const handleLocationClear = useCallback(() => {
  const cleared = DEFAULT_LOCATION;
  setLocation(cleared);
  clearLocation();
}, []);
```

Add `<LocationInput>` between `<AutofillBar>` and the Acquisition section in the form (via DealInputsForm props or directly in Evaluator).

Actually — LocationInput fits as a new prop on DealInputsForm, alongside `apiKey`:
```typescript
interface DealInputsFormProps {
  // ... existing ...
  location?: LocationState;
  onZipChange?: (zip: string) => void;
  onLocationClear?: () => void;
}
```

#### Tests

`packages/ui/tests/locationState.test.ts` — covers `loadLocation`, `saveLocation`, `clearLocation`, `isValidZip5`.

---

### Task 2: RPE-65 — Location-defaults data layer

**Branch:** `RPE-65` (cut from v1.3.0 after RPE-64 cherry-pick)  
**New package:** `packages/region-defaults/`  
**New API route:** `apps/api/src/routes/region.ts`

#### packages/region-defaults

**package.json:**
```json
{
  "name": "@rpe/region-defaults",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint src tests"
  }
}
```

**src/types.ts:**
```typescript
export type RegionLevel = 'zip' | 'state' | 'national';

export interface RegionalRates {
  /** Effective property tax rate (0–1). E.g. 0.013 = 1.3% of home value annually. */
  propertyTaxRate: number;
  /** Annual homeowner insurance as fraction of purchase price. E.g. 0.006 = 0.6%. */
  insuranceRate: number;
  /** Rental vacancy rate (0–1). */
  vacancyRate: number;
  /** Annualised home price appreciation (0–1). */
  appreciationRate: number;
  /** Annual rent growth rate (0–1). */
  rentGrowthRate: number;

  /** Finest level these rates were resolved at. */
  resolvedLevel: RegionLevel;
  /** Human-readable source label. E.g. 'TX state averages (Census ACS / NAIC 2022)' */
  sourceLabel: string;
}
```

**src/data/states.ts:** — hard-coded lookup table:
```typescript
// property-tax-rate: Census ACS 2022 5-yr state effective rates (median taxes / median home value)
// insurance-rate: NAIC 2022 state avg premium ÷ $254,000 (national median home value)
// Values rounded to 4 decimal places.
export const STATE_RATES: Record<string, { taxRate: number; insuranceRate: number }> = {
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
};

export const NATIONAL_RATES = {
  taxRate: 0.0112,          // national effective average
  insuranceRate: 0.0066,    // NAIC national avg $1,672 / $254k
  vacancyRate: 0.068,       // CPS/HVS Q4 2024 national rental vacancy
  appreciationRate: 0.040,  // FHFA trailing 10-yr national avg
  rentGrowthRate: 0.035,    // Zillow ZORI trailing 5-yr national avg
};
```

**src/index.ts:**
```typescript
export function resolveRegionalRates(stateCode: string): RegionalRates {
  const upper = stateCode.toUpperCase();
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
    ...NATIONAL_RATES,
    propertyTaxRate: NATIONAL_RATES.taxRate,
    insuranceRate: NATIONAL_RATES.insuranceRate,
    resolvedLevel: 'national',
    sourceLabel: 'National averages',
  };
}

export type { RegionalRates, RegionLevel } from './types.js';
```

**tsconfig.json:** Use same pattern as `packages/rentcast/tsconfig.json`.

**Tests:** `packages/region-defaults/tests/regionDefaults.test.ts`
- `resolveRegionalRates('TX')` returns TX rates
- `resolveRegionalRates('tx')` (lowercase) returns TX rates  
- `resolveRegionalRates('XX')` falls back to national
- `resolveRegionalRates('')` falls back to national
- Spot-check a few states against known-good values

#### apps/api /region route

**apps/api/src/routes/region.ts:**

```typescript
// GET /region?zip=XXXXX
//
// Calls HUD SAFMR API for rent estimate + state code, merges with
// packages/region-defaults static data, returns RegionalAssumptionSet.
//
// Requires env var: HUD_TOKEN (free token from https://www.huduser.gov/portal/dataset/fmr-api.html)
// If HUD_TOKEN is absent, rent data is omitted (static-only response).
```

Response shape:
```typescript
interface RegionResponse {
  zip: string;
  stateCode: string;        // e.g. 'TX'
  label: string;            // e.g. 'Austin, TX (78701)'
  
  propertyTaxRate: number;
  insuranceRate: number;
  vacancyRate: number;
  appreciationRate: number;
  rentGrowthRate: number;

  // Rent data from HUD SAFMR (null when HUD_TOKEN absent or ZIP not found)
  rent: {
    studio: number | null;
    oneBed: number | null;
    twoBed: number | null;
    threeBed: number | null;
    fourBed: number | null;
  } | null;

  resolvedLevel: 'zip' | 'state' | 'national';
  sourceLabel: string;
}
```

HUD SAFMR endpoint: `GET https://www.huduser.gov/hudapi/public/fmr/statedata/{zip}` or the ZIP-level FMR API.

**apps/api/.env.example:** Add `HUD_TOKEN=` entry.

**apps/api/src/index.ts:** Wire `/region` route.

**tests:** `apps/api/tests/region.test.ts` — mocks HUD API, tests 200/400/500 paths and fallback when HUD_TOKEN absent.

---

### Task 3: RPE-66 — Wire location defaults into baseline-assumptions module

**Branch:** `RPE-66` (cut from v1.3.0 after RPE-65 cherry-pick)

#### simpleBaselines.ts changes

Extend `getSimpleBaselines()` to accept optional location overrides:

```typescript
export interface LocationRateOverrides {
  propertyTaxRate?: number;
  insuranceRate?: number;
  vacancyRate?: number;
  sourceLabel?: string;
}

export function getSimpleBaselines(
  purchasePrice: number,
  locationOverrides?: LocationRateOverrides,
): SimpleBaselineValues {
  const pp = purchasePrice > 0 ? purchasePrice : 0;
  const taxRate = locationOverrides?.propertyTaxRate ?? 0.012;
  const insRate = locationOverrides?.insuranceRate ?? 0.005;
  const vacancy = locationOverrides?.vacancyRate != null
    ? locationOverrides.vacancyRate * 100  // convert 0–1 to percent
    : 5;
  return {
    // ... same as before, but use taxRate/insRate/vacancy instead of hard-coded values
    expenses: {
      taxes: { amount: Math.round(pp * taxRate), period: 'annual' },
      insurance: { amount: Math.round(pp * insRate), period: 'annual' },
      // ... rest unchanged
    },
  };
}
```

Update `applySimpleBaselines()` to accept the overrides and pass through.

Update `BASELINE_DESCRIPTIONS` to be a function (or make sourceLabel-aware) so badges can show regional source.

#### useLocationDefaults hook

`packages/ui/src/hooks/useLocationDefaults.ts`:

```typescript
// Calls apps/api /region?zip=XXXXX
// Caches result in localStorage with 30-day TTL
// Returns { rates: LocationRateOverrides | null, loading, error, resolvedLocation }
```

State machine: idle → loading → resolved | error.

Abort on unmount (same AbortController pattern as useAutofill).

30-day cache key: `rpe_region_${zip}`.

#### Evaluator.tsx changes

```typescript
// After location state setup:
const { rates: locationRates, loading: locationLoading, resolvedLocation } = useLocationDefaults({
  zip: location.zip,
  apiUrl,
});

// Update location state when region resolves
useEffect(() => {
  if (resolvedLocation) {
    const updated = { ...location, stateCode: resolvedLocation.stateCode, label: resolvedLocation.label };
    setLocation(updated);
    saveLocation(updated);
  }
}, [resolvedLocation]);

// Pass locationRates to applySimpleBaselines call sites:
// uiMode === 'simple' ? applySimpleBaselines(s.inputs, locationRates ?? undefined) : s.inputs
```

#### Source badge in "based on assumptions" tooltip

`packages/ui/src/components/AssumptionsBadge.tsx` (exists from E8 RPE-61): Update the tooltip to show the `sourceLabel` from location rates, e.g.:

- Without location: "National averages"
- With TX location: "TX state averages (Census ACS / NAIC 2022)"

Pass `sourceLabel` down from Evaluator → DealInputsForm → AssumptionsBadge (or wherever the tooltip is rendered).

#### DealInputsForm.tsx changes

- Pass `locationLoading` to `LocationInput` (shows spinner while resolving)
- Pass resolved location state so `LocationInput` shows the resolved chip

---

### Task 4: RPE-67 — Tests + fixtures

**Branch:** `RPE-67` (cut from v1.3.0 after RPE-66 cherry-pick)

Integration-level tests (beyond unit tests added in RPE-64–66):

1. `packages/ui/tests/useLocationDefaults.test.ts`
   - Loading state emitted while fetch in flight
   - Resolved state after successful fetch; cache hit on second call
   - AbortController cancels in-flight request on re-trigger
   - Error state on network error
   - Unmount clears abort

2. `packages/ui/tests/simpleBaselines.test.ts` (update existing)
   - `getSimpleBaselines(300000, { propertyTaxRate: 0.018, insuranceRate: 0.012 })` uses TX rates
   - `getSimpleBaselines(300000, undefined)` uses national fallback rates
   - `applySimpleBaselines(inputs, txRates)` uses TX tax/insurance in result

3. `packages/region-defaults/tests/regionDefaults.test.ts` (done in RPE-65, but fixtures here)
   - Golden fixture: `resolveRegionalRates('NJ')` → propertyTaxRate: 0.0213 (highest in US)
   - Golden fixture: `resolveRegionalRates('HI')` → propertyTaxRate: 0.0026 (lowest)
   - Fallback: `resolveRegionalRates('ZZ')` → resolvedLevel: 'national'

4. `apps/api/tests/region.test.ts` (done in RPE-65)
   - Already covered; RPE-67 adds an integration test: full stack from ZIP → state lookup → rate merging

---

## Git workflow

Same as E7:
- Task branches: `RPE-64`, `RPE-65`, `RPE-66`, `RPE-67`
- All cut from `v1.3.0`, named exactly after ticket handle
- All commits prefixed `RPE-64:`, `RPE-65:`, etc.
- Cherry-pick order: 64 → 65 → 66 → 67
- Max 2 open PRs at a time; Copilot review loop required before cherry-pick
- PR target: `v1.3.0`

## Gate (before each cherry-pick)

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## API keys needed (for local testing)

- HUD SAFMR token: https://www.huduser.gov/portal/dataset/fmr-api.html (free, instant)
- No Census API key needed for v1 (static data only; Census API deferred)

## Deferred to v1.4.0+

- ZIP-level property tax (Census ACS ZCTA pipeline)
- County-level vacancy (ACS B25004)
- FHFA HPI state/metro appreciation (annual CSV pipeline)
- Zillow ZORI rent growth (CSV pipeline)
- City/metro text geocoding (beyond ZIP5)
