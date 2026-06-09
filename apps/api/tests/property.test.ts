/**
 * RPE-43b: POST /property integration tests
 *
 * Uses vi.mock to stub fetchPropertyData so no real HTTP calls are made.
 * Server lifecycle mirrors apps/api/tests/server.test.ts.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import { fetchPropertyData, RentCastError } from '@rpe/rentcast';

// Vitest hoists vi.mock above all import statements, so @rpe/rentcast is stubbed
// before createApp (and its route module that imports it) is evaluated.
vi.mock('@rpe/rentcast', () => ({
  fetchPropertyData: vi.fn(),
  RentCastError: class RentCastError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = 'RentCastError'; }
  },
}));

const mockFetch = vi.mocked(fetchPropertyData);

const VALID_BODY = { address: '123 Main St, Austin TX 78701', apiKey: 'rc_test_key' };

const MOCK_DATA = {
  purchasePrice: 342_000,
  grossRent: 2_150,
  sqft: 1_480,
  units: 1,
  annualTaxes: 4_210,
  bedrooms: 3,
  bathrooms: 2,
  yearBuilt: 1987,
};

describe('POST /property', () => {
  let server: Server;
  let base: string;

  beforeAll(
    () =>
      new Promise<void>((resolve, reject) => {
        // Guardrails are exercised in guardrails.test.ts — disable the cache
        // here (tests reuse one address with different mocked outcomes) and
        // keep limits far above what this suite generates.
        server = createApp({ property: { cacheTtlMs: 0, rpm: 1000, dailyCap: 10000 } });
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          server.off('error', reject);
          const addr = server.address() as { port: number };
          base = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      }),
  );

  afterAll(
    () => new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  );

  beforeEach(() => { vi.resetAllMocks(); });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('returns 200 with PropertyData on success', async () => {
    mockFetch.mockResolvedValue(MOCK_DATA);

    const res = await fetch(`${base}/property`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body['data']).toEqual(MOCK_DATA);
    // RPE-45 envelope: provenance-tagged lookup + cache flag
    expect(body['cached']).toBe(false);
    expect(body['lookup']).toEqual({
      purchasePrice: { value: 342_000, source: 'rentcast', confidence: 'medium' },
      grossRent:     { value: 2_150,   source: 'rentcast', confidence: 'medium' },
      sqft:          { value: 1_480,   source: 'rentcast', confidence: 'high' },
      units:         { value: 1,       source: 'rentcast', confidence: 'high' },
      annualTaxes:   { value: 4_210,   source: 'rentcast', confidence: 'high' },
      bedrooms:      { value: 3,       source: 'rentcast', confidence: 'high' },
      bathrooms:     { value: 2,       source: 'rentcast', confidence: 'high' },
      yearBuilt:     { value: 1987,    source: 'rentcast', confidence: 'high' },
    });
  });

  it('calls fetchPropertyData with the address and apiKey from the request', async () => {
    mockFetch.mockResolvedValue(MOCK_DATA);

    await fetch(`${base}/property`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });

    expect(mockFetch).toHaveBeenCalledWith(VALID_BODY.address, VALID_BODY.apiKey);
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it('returns 400 when address is missing', async () => {
    const res = await fetch(`${base}/property`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'key' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when apiKey is missing', async () => {
    const res = await fetch(`${base}/property`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: '123 Main St' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 405 for non-POST methods', async () => {
    const res = await fetch(`${base}/property`);
    expect(res.status).toBe(405);
  });

  // ── RentCast error mapping ──────────────────────────────────────────────────

  it('returns 401 with code bad_key when fetchPropertyData throws bad_key', async () => {
    mockFetch.mockRejectedValue(new RentCastError('bad_key', 'bad key'));
    const res = await fetch(`${base}/property`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(401);
    const body = await res.json() as Record<string, unknown>;
    expect(body['code']).toBe('bad_key');
  });

  it('returns 404 when fetchPropertyData throws not_found', async () => {
    mockFetch.mockRejectedValue(new RentCastError('not_found', 'not found'));
    const res = await fetch(`${base}/property`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(404);
  });

  it('returns 429 when fetchPropertyData throws rate_limit', async () => {
    mockFetch.mockRejectedValue(new RentCastError('rate_limit', 'rate limit'));
    const res = await fetch(`${base}/property`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(429);
  });

  it('returns 502 when fetchPropertyData throws unknown RentCast error', async () => {
    mockFetch.mockRejectedValue(new RentCastError('unknown', 'unknown error'));
    const res = await fetch(`${base}/property`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(502);
  });

  // ── Security ────────────────────────────────────────────────────────────────

  it('apiKey value does not appear in response body on error', async () => {
    mockFetch.mockRejectedValue(new RentCastError('bad_key', 'bad key'));
    const res = await fetch(`${base}/property`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_BODY, apiKey: 'SECRET_KEY_VALUE' }),
    });
    const text = await res.text();
    expect(text).not.toContain('SECRET_KEY_VALUE');
  });
});
