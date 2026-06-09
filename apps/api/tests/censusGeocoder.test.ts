/**
 * RPE-46: Census geocoder service unit tests.
 *
 * No local server here, so globalThis.fetch can be spied directly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geocodeAddress } from '../src/services/censusGeocoder';

function censusResponse(matches: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ result: { addressMatches: matches } }),
  } as unknown as Response;
}

const FULL_MATCH = {
  matchedAddress: '123 MAIN ST, AUSTIN, TX, 78701',
  coordinates: { x: -97.74, y: 30.27 },
  addressComponents: { state: 'TX', zip: '78701' },
  geographies: { Counties: [{ BASENAME: 'Travis' }] },
};

describe('geocodeAddress', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps a full Census match to a GeocodeCandidate', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(censusResponse([FULL_MATCH]));

    const candidates = await geocodeAddress('123 Main St, Austin TX');

    expect(candidates).toEqual([
      {
        formatted: '123 MAIN ST, AUSTIN, TX, 78701',
        lat: 30.27,
        lng: -97.74,
        county: 'Travis',
        stateCode: 'TX',
        zip: '78701',
      },
    ]);
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toContain('geocoding.geo.census.gov');
    expect(url).toContain('benchmark=Public_AR_Current');
    expect(url).toContain('layers=Counties');
    expect(url).toContain(encodeURIComponent('123 Main St, Austin TX').replace(/%20/g, '+'));
  });

  it('nulls missing county/state/zip components', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(censusResponse([
      { matchedAddress: 'X', coordinates: { x: 1, y: 2 } },
    ]));
    const candidates = await geocodeAddress('x');
    expect(candidates).toEqual([
      { formatted: 'X', lat: 2, lng: 1, county: null, stateCode: null, zip: null },
    ]);
  });

  it('filters rows without coordinates or matched address', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(censusResponse([
      FULL_MATCH,
      { matchedAddress: 'NO COORDS' },
      { coordinates: { x: 1, y: 2 } },
      { matchedAddress: 'BAD COORDS', coordinates: { x: 'a', y: 'b' } },
    ]));
    const candidates = await geocodeAddress('123 Main St');
    expect(candidates).toHaveLength(1);
  });

  it('returns null on HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    } as unknown as Response);
    expect(await geocodeAddress('123 Main St')).toBeNull();
  });

  it('returns null on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'));
    expect(await geocodeAddress('123 Main St')).toBeNull();
  });

  it('returns null on a foreign response shape', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ unexpected: true }),
    } as unknown as Response);
    expect(await geocodeAddress('123 Main St')).toBeNull();
  });

  it('returns an empty list (not null) when Census matches nothing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(censusResponse([]));
    expect(await geocodeAddress('nowhere')).toEqual([]);
  });
});
