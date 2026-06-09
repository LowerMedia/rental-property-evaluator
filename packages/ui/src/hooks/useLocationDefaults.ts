/**
 * E9 — useLocationDefaults hook (RPE-66)
 *
 * Fetches regional assumption defaults for a given ZIP5 code from the
 * apps/api /region endpoint. Returns the resolved rates plus resolved
 * stateCode and label for display in LocationInput.
 *
 * Lifecycle:
 *   1. zip='' → no fetch; all fields empty/null, resolving=false
 *   2. zip changes → in-flight request cancelled; a fresh cache entry
 *      (30-day TTL, see regionCache) resolves synchronously with no fetch;
 *      otherwise prior resolved values are cleared immediately (no stale
 *      leak) and resolving=true
 *   3. API succeeds → rates/stateCode/label populated, cached; resolving=false
 *   4. API fails → full reset to empty (caller degrades gracefully);
 *      failures are never cached
 */

import { useState, useEffect, useRef } from 'react';
import type { RegionLevel } from '@rpe/region-defaults';
import type { LocationRateOverrides } from '../state/simpleBaselines';
import { readRegionCache, writeRegionCache } from '../state/regionCache';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Full regional defaults returned by the /region API, superset of
 * LocationRateOverrides. Carrying extra fields (vacancyRate, appreciationRate,
 * rentGrowthRate, rent, resolvedLevel) future-proofs pro-forma defaults —
 * vacancyRate is informational only; the visible vacancy input always wins
 * in simple-mode evaluation (see LocationRateOverrides docs).
 */
export interface RegionDefaults extends LocationRateOverrides {
  vacancyRate: number;
  appreciationRate: number;
  rentGrowthRate: number;
  resolvedLevel: RegionLevel;
  rent: {
    studio: number | null;
    oneBed: number | null;
    twoBed: number | null;
    threeBed: number | null;
    fourBed: number | null;
  } | null;
}

export interface LocationDefaultsResult {
  /** Rate overrides to pass to applySimpleBaselines(), or null when unresolved. */
  rates: RegionDefaults | null;
  /** Resolved 2-letter state code ('TX', 'CA', …). Empty when not yet resolved. */
  stateCode: string;
  /** Human-readable label for display (e.g. 'Austin, TX (78701)'). */
  label: string;
  /** True while the /region API call is in-flight. */
  resolving: boolean;
  /** True when the last lookup failed (network/HTTP error) — cleared on the next fetch. */
  failed: boolean;
}

// ─── API response type ────────────────────────────────────────────────────────

/** Raw /region response shape — also the unit cached by regionCache. */
export interface RegionApiResponse {
  zip: string;
  stateCode: string;
  label: string;
  propertyTaxRate: number;
  insuranceRate: number;
  vacancyRate: number;
  appreciationRate: number;
  rentGrowthRate: number;
  resolvedLevel: RegionLevel;
  sourceLabel: string;
  rent: {
    studio: number | null;
    oneBed: number | null;
    twoBed: number | null;
    threeBed: number | null;
    fourBed: number | null;
  } | null;
}

const EMPTY: LocationDefaultsResult = {
  rates: null,
  stateCode: '',
  label: '',
  resolving: false,
  failed: false,
};

/** Map a /region response (live or cached) to the hook's resolved state. */
function toResolvedResult(data: RegionApiResponse): LocationDefaultsResult {
  return {
    rates: {
      propertyTaxRate: data.propertyTaxRate,
      insuranceRate: data.insuranceRate,
      vacancyRate: data.vacancyRate,
      appreciationRate: data.appreciationRate,
      rentGrowthRate: data.rentGrowthRate,
      resolvedLevel: data.resolvedLevel,
      sourceLabel: data.sourceLabel,
      rent: data.rent,
    },
    stateCode: data.stateCode,
    label: data.label,
    resolving: false,
    failed: false,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Fetch regional assumption defaults for a ZIP5 code.
 *
 * @param zip     5-digit ZIP code ('' = no location selected).
 * @param apiUrl  Base URL for the apps/api server.
 * @returns       Resolved defaults + display fields + resolving flag.
 */
export function useLocationDefaults(zip: string, apiUrl: string): LocationDefaultsResult {
  const [result, setResult] = useState<LocationDefaultsResult>(EMPTY);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!zip) {
      abortRef.current?.abort();
      setResult(EMPTY);
      return;
    }

    // Cancel any previous in-flight request
    abortRef.current?.abort();

    // Fresh cache entry → resolve synchronously, no network call
    const cached = readRegionCache(zip);
    if (cached) {
      setResult(toResolvedResult(cached));
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    // Clear prior resolved values immediately so a zip change never leaks the
    // previous location's rates/stateCode/label to callers mid-flight (e.g.
    // Evaluator persisting the old stateCode against the new zip).
    setResult({ ...EMPTY, resolving: true });

    fetch(`${apiUrl}/region?zip=${encodeURIComponent(zip)}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<RegionApiResponse>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        writeRegionCache(zip, data);
        setResult(toResolvedResult(data));
      })
      .catch(() => {
        // Guard on the signal (covers both abort rejections AND late
        // failures of an already-superseded request, e.g. a parse error
        // surfacing after the next fetch has started — without this, a
        // stale request would clobber the new one's resolving state).
        if (controller.signal.aborted) return;
        // Network error or non-OK response — full reset so no stale
        // stateCode/label lingers, with failed=true so the UI can tell
        // the user instead of showing the ZIP as pending forever
        setResult({ ...EMPTY, failed: true });
      });

    return () => {
      controller.abort();
    };
  }, [zip, apiUrl]);

  return result;
}
