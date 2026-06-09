/**
 * E9 — 30-day localStorage cache for /region lookups (RPE-72)
 *
 * Key: `rpe_region_${zip}` (per the E9 plan). Entries are wrapped in a
 * versioned envelope so a future shape change can invalidate old entries
 * by bumping CACHE_VERSION instead of migrating them.
 *
 * Regional averages move on an annual publication cadence (Census ACS,
 * NAIC, HUD FMR), so a 30-day TTL is conservative.
 *
 * All storage access is wrapped in try/catch: private browsing, quota
 * exhaustion, or SSR must degrade to a cache miss, never an exception.
 */

import type { RegionApiResponse } from '../hooks/useLocationDefaults';

export const REGION_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const CACHE_VERSION = 1;

interface CacheEnvelope {
  v: number;
  ts: number;
  data: RegionApiResponse;
}

export function regionCacheKey(zip: string): string {
  return `rpe_region_${zip}`;
}

function isRegionApiResponse(value: unknown): value is RegionApiResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.stateCode === 'string' &&
    typeof v.label === 'string' &&
    typeof v.sourceLabel === 'string' &&
    typeof v.resolvedLevel === 'string' &&
    typeof v.propertyTaxRate === 'number' &&
    typeof v.insuranceRate === 'number' &&
    typeof v.vacancyRate === 'number' &&
    typeof v.appreciationRate === 'number' &&
    typeof v.rentGrowthRate === 'number' &&
    (v.rent === null || (typeof v.rent === 'object' && !Array.isArray(v.rent)))
  );
}

/**
 * Read a cached /region response for a ZIP. Returns null on miss, expiry,
 * version mismatch, corrupted JSON, foreign shape, or unavailable storage —
 * every null is safe to treat as "fetch it".
 */
export function readRegionCache(zip: string): RegionApiResponse | null {
  try {
    const raw = localStorage.getItem(regionCacheKey(zip));
    if (raw === null) return null;
    const envelope = JSON.parse(raw) as Partial<CacheEnvelope>;
    if (
      envelope === null ||
      typeof envelope !== 'object' ||
      envelope.v !== CACHE_VERSION ||
      typeof envelope.ts !== 'number'
    ) {
      return null;
    }
    if (Date.now() - envelope.ts > REGION_CACHE_TTL_MS) return null;
    if (!isRegionApiResponse(envelope.data)) return null;
    return envelope.data;
  } catch {
    // Corrupted JSON or storage unavailable (private browsing, SSR)
    return null;
  }
}

/** Cache a successful /region response. Failures are silently ignored. */
export function writeRegionCache(zip: string, data: RegionApiResponse): void {
  const envelope: CacheEnvelope = { v: CACHE_VERSION, ts: Date.now(), data };
  try {
    localStorage.setItem(regionCacheKey(zip), JSON.stringify(envelope));
  } catch {
    // Storage quota exceeded or unavailable — caching is best-effort
  }
}
