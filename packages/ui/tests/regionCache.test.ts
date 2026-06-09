/**
 * RPE-72: regionCache tests — 30-day localStorage cache for /region responses.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  readRegionCache,
  writeRegionCache,
  regionCacheKey,
  REGION_CACHE_TTL_MS,
} from '../src/state/regionCache';
import type { RegionApiResponse } from '../src/hooks/useLocationDefaults';

function makeResponse(overrides: Partial<RegionApiResponse> = {}): RegionApiResponse {
  return {
    zip: '78701',
    stateCode: 'TX',
    label: 'Austin, TX (78701)',
    propertyTaxRate: 0.018,
    insuranceRate: 0.0123,
    vacancyRate: 0.068,
    appreciationRate: 0.04,
    rentGrowthRate: 0.035,
    resolvedLevel: 'state',
    sourceLabel: 'TX state averages (Census ACS / NAIC 2022)',
    rent: { studio: 1050, oneBed: 1230, twoBed: 1500, threeBed: 1900, fourBed: 2200 },
    ...overrides,
  };
}

describe('regionCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the rpe_region_${zip} key from the E9 plan', () => {
    expect(regionCacheKey('78701')).toBe('rpe_region_78701');
  });

  it('returns null on a cold cache', () => {
    expect(readRegionCache('78701')).toBeNull();
  });

  it('round-trips a written response', () => {
    const data = makeResponse();
    writeRegionCache('78701', data);
    expect(readRegionCache('78701')).toEqual(data);
  });

  it('scopes entries by zip', () => {
    writeRegionCache('78701', makeResponse());
    expect(readRegionCache('90001')).toBeNull();
  });

  it('round-trips a null rent block', () => {
    const data = makeResponse({ rent: null });
    writeRegionCache('78701', data);
    expect(readRegionCache('78701')?.rent).toBeNull();
  });

  it('expires entries older than 30 days', () => {
    writeRegionCache('78701', makeResponse());
    const raw = JSON.parse(localStorage.getItem(regionCacheKey('78701'))!);
    raw.ts = Date.now() - REGION_CACHE_TTL_MS - 1;
    localStorage.setItem(regionCacheKey('78701'), JSON.stringify(raw));
    expect(readRegionCache('78701')).toBeNull();
  });

  it('keeps entries younger than 30 days', () => {
    writeRegionCache('78701', makeResponse());
    const raw = JSON.parse(localStorage.getItem(regionCacheKey('78701'))!);
    raw.ts = Date.now() - REGION_CACHE_TTL_MS + 60_000;
    localStorage.setItem(regionCacheKey('78701'), JSON.stringify(raw));
    expect(readRegionCache('78701')).not.toBeNull();
  });

  it('ignores corrupted JSON', () => {
    localStorage.setItem(regionCacheKey('78701'), '{not json');
    expect(readRegionCache('78701')).toBeNull();
  });

  it('ignores a version mismatch', () => {
    writeRegionCache('78701', makeResponse());
    const raw = JSON.parse(localStorage.getItem(regionCacheKey('78701'))!);
    raw.v = 999;
    localStorage.setItem(regionCacheKey('78701'), JSON.stringify(raw));
    expect(readRegionCache('78701')).toBeNull();
  });

  it('ignores an envelope with a missing timestamp', () => {
    localStorage.setItem(
      regionCacheKey('78701'),
      JSON.stringify({ v: 1, data: makeResponse() }),
    );
    expect(readRegionCache('78701')).toBeNull();
  });

  it('ignores foreign-shape data inside a valid envelope', () => {
    localStorage.setItem(
      regionCacheKey('78701'),
      JSON.stringify({ v: 1, ts: Date.now(), data: { hello: 'world' } }),
    );
    expect(readRegionCache('78701')).toBeNull();
  });

  it('ignores data with a non-numeric rate', () => {
    const data = makeResponse();
    localStorage.setItem(
      regionCacheKey('78701'),
      JSON.stringify({
        v: 1,
        ts: Date.now(),
        data: { ...data, propertyTaxRate: '0.018' },
      }),
    );
    expect(readRegionCache('78701')).toBeNull();
  });

  it('ignores data where rent is an array (typeof object, wrong shape)', () => {
    const data = makeResponse();
    localStorage.setItem(
      regionCacheKey('78701'),
      JSON.stringify({ v: 1, ts: Date.now(), data: { ...data, rent: [1050, 1230] } }),
    );
    expect(readRegionCache('78701')).toBeNull();
  });

  it('treats a throwing localStorage.getItem as a miss', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(readRegionCache('78701')).toBeNull();
  });

  it('swallows a throwing localStorage.setItem (quota exceeded)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => writeRegionCache('78701', makeResponse())).not.toThrow();
  });
});
