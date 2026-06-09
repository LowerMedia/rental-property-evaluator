/**
 * E9 — useLocationDefaults hook (RPE-66)
 *
 * Fetches regional assumption defaults for a given ZIP5 code from the
 * apps/api /region endpoint. Returns the resolved rates plus resolved
 * stateCode and label for display in LocationInput.
 *
 * Lifecycle:
 *   1. zip='' → no fetch; all fields empty/null, resolving=false
 *   2. zip changes → in-flight request cancelled; prior resolved values
 *      cleared immediately (no stale leak); resolving=true
 *   3. API succeeds → rates/stateCode/label populated; resolving=false
 *   4. API fails → full reset to empty (caller degrades gracefully)
 */

import { useState, useEffect, useRef } from 'react';
import type { LocationRateOverrides } from '../state/simpleBaselines';

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
  resolvedLevel: string;
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
}

// ─── Internal API response type ───────────────────────────────────────────────

interface RegionApiResponse {
  zip: string;
  stateCode: string;
  label: string;
  propertyTaxRate: number;
  insuranceRate: number;
  vacancyRate: number;
  appreciationRate: number;
  rentGrowthRate: number;
  resolvedLevel: string;
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
};

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
        const rates: RegionDefaults = {
          propertyTaxRate: data.propertyTaxRate,
          insuranceRate: data.insuranceRate,
          vacancyRate: data.vacancyRate,
          appreciationRate: data.appreciationRate,
          rentGrowthRate: data.rentGrowthRate,
          resolvedLevel: data.resolvedLevel,
          sourceLabel: data.sourceLabel,
          rent: data.rent,
        };
        setResult({
          rates,
          stateCode: data.stateCode,
          label: data.label,
          resolving: false,
        });
      })
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return;
        // Network error or non-OK response — full reset so no stale
        // stateCode/label lingers in the UI or syncs into persisted state
        setResult(EMPTY);
      });

    return () => {
      controller.abort();
    };
  }, [zip, apiUrl]);

  return result;
}
