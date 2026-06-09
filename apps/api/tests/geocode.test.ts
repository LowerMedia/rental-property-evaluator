/**
 * RPE-46: GET /geocode route tests.
 *
 * Mocks the censusGeocoder service module (mirrors region.test.ts) so
 * test HTTP calls to the local server use the real fetch while the
 * upstream geocoder is stubbed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index';

vi.mock('../src/services/censusGeocoder.js', () => ({
  geocodeAddress: vi.fn(),
}));

import { geocodeAddress } from '../src/services/censusGeocoder.js';
const mockGeocode = vi.mocked(geocodeAddress);

const CANDIDATE = {
  formatted: '123 MAIN ST, AUSTIN, TX, 78701',
  lat: 30.27,
  lng: -97.74,
  county: 'Travis',
  stateCode: 'TX',
  zip: '78701',
};

function startServer(): Promise<{ server: Server; base: string }> {
  return new Promise((resolve, reject) => {
    const server = createApp({ property: { cacheTtlMs: 60_000, rpm: 1000, dailyCap: 10000 } });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const addr = server.address() as { port: number };
      resolve({ server, base: `http://127.0.0.1:${addr.port}` });
    });
  });
}

describe('GET /geocode', () => {
  let server: Server | undefined;
  let base: string;

  beforeEach(async () => {
    vi.resetAllMocks();
    const s = await startServer();
    server = s.server;
    base = s.base;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server?.close((err) => (err ? reject(err) : resolve()));
    });
    server = undefined;
  });

  it('returns candidates from the geocoder', async () => {
    mockGeocode.mockResolvedValue([CANDIDATE]);

    const res = await fetch(`${base}/geocode?q=${encodeURIComponent('123 Main St, Austin TX')}`);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body['cached']).toBe(false);
    expect(body['candidates']).toEqual([CANDIDATE]);
    expect(mockGeocode).toHaveBeenCalledWith('123 Main St, Austin TX');
  });

  it('returns an empty candidate list when there is no match', async () => {
    mockGeocode.mockResolvedValue([]);
    const res = await fetch(`${base}/geocode?q=${encodeURIComponent('nowhere at all')}`);
    const body = await res.json() as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(body['candidates']).toEqual([]);
  });

  it('returns multiple candidates for ambiguous input — no guessing', async () => {
    mockGeocode.mockResolvedValue([
      CANDIDATE,
      { ...CANDIDATE, formatted: '123 MAIN ST, AUSTIN, TX, 78702', zip: '78702' },
    ]);
    const res = await fetch(`${base}/geocode?q=${encodeURIComponent('123 Main St Austin')}`);
    const body = await res.json() as { candidates: unknown[] };
    expect(body.candidates).toHaveLength(2);
  });

  it('serves repeat queries from cache, normalized — geocoder called once', async () => {
    mockGeocode.mockResolvedValue([CANDIDATE]);

    await fetch(`${base}/geocode?q=${encodeURIComponent('123 Main St, Austin TX')}`);
    const second = await fetch(`${base}/geocode?q=${encodeURIComponent('123  MAIN st austin tx')}`);
    const body = await second.json() as Record<string, unknown>;

    expect(body['cached']).toBe(true);
    expect(mockGeocode).toHaveBeenCalledTimes(1);
  });

  it('returns 400 with code bad_request when q is missing or blank', async () => {
    for (const path of ['/geocode', '/geocode?q=', '/geocode?q=%20%20']) {
      const res = await fetch(`${base}${path}`);
      expect(res.status).toBe(400);
      const body = await res.json() as Record<string, unknown>;
      expect(body['code']).toBe('bad_request');
    }
    expect(mockGeocode).not.toHaveBeenCalled();
  });

  it('returns 400 when q exceeds the length cap', async () => {
    const res = await fetch(`${base}/geocode?q=${'a'.repeat(300)}`);
    expect(res.status).toBe(400);
    expect(mockGeocode).not.toHaveBeenCalled();
  });

  it('returns 405 for non-GET methods', async () => {
    const res = await fetch(`${base}/geocode?q=x`, { method: 'POST' });
    expect(res.status).toBe(405);
    const body = await res.json() as Record<string, unknown>;
    expect(body['code']).toBe('method_not_allowed');
  });

  it('returns 502 with code upstream_error and does not cache the failure', async () => {
    mockGeocode.mockResolvedValueOnce(null).mockResolvedValueOnce([CANDIDATE]);

    const first = await fetch(`${base}/geocode?q=${encodeURIComponent('123 Main St')}`);
    expect(first.status).toBe(502);
    const errBody = await first.json() as Record<string, unknown>;
    expect(errBody['code']).toBe('upstream_error');

    const second = await fetch(`${base}/geocode?q=${encodeURIComponent('123 Main St')}`);
    const body = await second.json() as Record<string, unknown>;
    expect(second.status).toBe(200);
    expect(body['cached']).toBe(false);
    expect(mockGeocode).toHaveBeenCalledTimes(2);
  });
});
