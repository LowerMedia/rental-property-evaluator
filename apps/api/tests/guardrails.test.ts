/**
 * RPE-45: proxy cost guardrails — unit tests for the cache/limiter
 * primitives plus /property integration tests (cache hits, per-IP rate
 * limiting, typed error envelope).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import { fetchPropertyData } from '@rpe/rentcast';
import {
  normalizeAddressKey,
  scopeKey,
  TtlCache,
  RateLimiter,
} from '../src/services/guardrails';

vi.mock('@rpe/rentcast', () => ({
  fetchPropertyData: vi.fn(),
  RentCastError: class RentCastError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = 'RentCastError'; }
  },
}));

const mockFetch = vi.mocked(fetchPropertyData);

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

// ─── Unit: address normalization ─────────────────────────────────────────────

describe('normalizeAddressKey', () => {
  it('is case-, punctuation- and whitespace-insensitive', () => {
    expect(normalizeAddressKey('123 Main St, Austin, TX 78701')).toBe(
      normalizeAddressKey('123  MAIN st   austin tx 78701'),
    );
  });

  it('keeps distinct addresses distinct', () => {
    expect(normalizeAddressKey('123 Main St')).not.toBe(normalizeAddressKey('125 Main St'));
  });
});

describe('scopeKey', () => {
  it('scopes the same address by API key', () => {
    expect(scopeKey('key-a', '123 Main St')).not.toBe(scopeKey('key-b', '123 Main St'));
  });

  it('never contains the raw API key', () => {
    expect(scopeKey('rc_super_secret', '123 Main St')).not.toContain('rc_super_secret');
  });
});

// ─── Unit: TtlCache ──────────────────────────────────────────────────────────

describe('TtlCache', () => {
  it('round-trips within the TTL and expires after it', () => {
    let t = 1_000_000;
    const cache = new TtlCache<string>(60_000, 500, () => t);

    cache.set('k', 'v');
    expect(cache.get('k')).toBe('v');

    t += 60_001;
    expect(cache.get('k')).toBeUndefined();
  });

  it('is fully disabled when ttlMs is 0', () => {
    const cache = new TtlCache<string>(0);
    cache.set('k', 'v');
    expect(cache.get('k')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('evicts the stalest entry once maxEntries is reached', () => {
    const cache = new TtlCache<string>(60_000, 2, () => 0);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
  });

  it('re-setting a key refreshes its eviction position', () => {
    const cache = new TtlCache<string>(60_000, 2, () => 0);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('a', '1-again'); // a is now newest
    cache.set('c', '3');       // evicts b, not a
    expect(cache.get('a')).toBe('1-again');
    expect(cache.get('b')).toBeUndefined();
  });
});

// ─── Unit: RateLimiter ───────────────────────────────────────────────────────

describe('RateLimiter', () => {
  it('allows up to rpm requests per minute, then denies with retryAfterSec', () => {
    let t = 0;
    const limiter = new RateLimiter(2, 100, () => t);

    expect(limiter.check('ip').allowed).toBe(true);
    expect(limiter.check('ip').allowed).toBe(true);

    const denied = limiter.check('ip');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBe(60);

    t = 60_000; // next minute window
    expect(limiter.check('ip').allowed).toBe(true);
  });

  it('enforces the daily cap across minute windows', () => {
    let t = 0;
    const limiter = new RateLimiter(10, 3, () => t);

    for (let i = 0; i < 3; i++) {
      expect(limiter.check('ip').allowed).toBe(true);
      t += 61_000; // hop minute windows so only the daily cap binds
    }
    const denied = limiter.check('ip');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThan(0);
  });

  it('tracks keys independently', () => {
    const limiter = new RateLimiter(1, 100, () => 0);
    expect(limiter.check('ip-a').allowed).toBe(true);
    expect(limiter.check('ip-b').allowed).toBe(true);
    expect(limiter.check('ip-a').allowed).toBe(false);
  });

  it('bounds memory under a key-rotation flood by evicting oldest live keys', () => {
    const limiter = new RateLimiter(10, 100, () => 0, 3);
    for (let i = 0; i < 50; i++) {
      expect(limiter.check(`spoofed-${i}`).allowed).toBe(true);
    }
    // Internals: both maps stay at/below maxKeys despite 50 live keys
    const maps = limiter as unknown as { perMinute: Map<string, unknown>; perDay: Map<string, unknown> };
    expect(maps.perMinute.size).toBeLessThanOrEqual(3);
    expect(maps.perDay.size).toBeLessThanOrEqual(3);
  });
});

// ─── Integration: /property with guardrails ──────────────────────────────────

function startServer(config: Parameters<typeof createApp>[0]): Promise<{ server: Server; base: string }> {
  return new Promise((resolve, reject) => {
    const server = createApp(config);
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const addr = server.address() as { port: number };
      resolve({ server, base: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function post(base: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}/property`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /property — guardrails integration', () => {
  let server: Server | undefined;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(async () => {
    if (server) {
      await stopServer(server);
      server = undefined;
    }
  });

  it('serves the second identical lookup from cache without a provider call', async () => {
    mockFetch.mockResolvedValue(MOCK_DATA);
    const s = await startServer({ property: { cacheTtlMs: 60_000, rpm: 100, dailyCap: 1000 } });
    server = s.server;

    const body = { address: '123 Main St, Austin TX', apiKey: 'rc_key' };
    const first = await (await post(s.base, body)).json() as Record<string, unknown>;
    const second = await (await post(s.base, body)).json() as Record<string, unknown>;

    expect(first['cached']).toBe(false);
    expect(second['cached']).toBe(true);
    expect(second['data']).toEqual(MOCK_DATA);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('normalizes the address for cache hits but scopes by apiKey', async () => {
    mockFetch.mockResolvedValue(MOCK_DATA);
    const s = await startServer({ property: { cacheTtlMs: 60_000, rpm: 100, dailyCap: 1000 } });
    server = s.server;

    await post(s.base, { address: '123 Main St, Austin TX', apiKey: 'rc_key' });
    // Same address, different formatting → cache hit
    const variant = await (
      await post(s.base, { address: '123  MAIN st austin tx', apiKey: 'rc_key' })
    ).json() as Record<string, unknown>;
    expect(variant['cached']).toBe(true);

    // Same address, different key → provider call (no cross-key serving)
    const otherKey = await (
      await post(s.base, { address: '123 Main St, Austin TX', apiKey: 'rc_other' })
    ).json() as Record<string, unknown>;
    expect(otherKey['cached']).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('rate limits provider-bound requests per IP with a typed envelope', async () => {
    mockFetch.mockResolvedValue(MOCK_DATA);
    const s = await startServer({ property: { cacheTtlMs: 0, rpm: 2, dailyCap: 1000 } });
    server = s.server;

    const body = { address: '123 Main St', apiKey: 'rc_key' };
    expect((await post(s.base, body)).status).toBe(200);
    expect((await post(s.base, body)).status).toBe(200);

    const limited = await post(s.base, body);
    expect(limited.status).toBe(429);
    const payload = await limited.json() as Record<string, unknown>;
    expect(payload['code']).toBe('proxy_rate_limit');
    expect(typeof payload['retryAfterSec']).toBe('number');
  });

  it('cache hits do not consume rate-limit quota', async () => {
    mockFetch.mockResolvedValue(MOCK_DATA);
    const s = await startServer({ property: { cacheTtlMs: 60_000, rpm: 1, dailyCap: 1000 } });
    server = s.server;

    const body = { address: '123 Main St', apiKey: 'rc_key' };
    expect((await post(s.base, body)).status).toBe(200); // provider call, quota spent
    expect((await post(s.base, body)).status).toBe(200); // cache hit, no quota
    expect((await post(s.base, body)).status).toBe(200); // cache hit, no quota
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('tracks rate limits per X-Forwarded-For client', async () => {
    mockFetch.mockResolvedValue(MOCK_DATA);
    const s = await startServer({ property: { cacheTtlMs: 0, rpm: 1, dailyCap: 1000 } });
    server = s.server;

    const body = { address: '123 Main St', apiKey: 'rc_key' };
    expect((await post(s.base, body, { 'X-Forwarded-For': '1.1.1.1' })).status).toBe(200);
    expect((await post(s.base, body, { 'X-Forwarded-For': '1.1.1.1' })).status).toBe(429);
    expect((await post(s.base, body, { 'X-Forwarded-For': '2.2.2.2' })).status).toBe(200);
  });

  it('omits null record fields from the lookup envelope', async () => {
    mockFetch.mockResolvedValue({
      ...MOCK_DATA,
      sqft: null,
      units: null,
      annualTaxes: null,
      bedrooms: null,
      bathrooms: null,
      yearBuilt: null,
    });
    const s = await startServer({ property: { cacheTtlMs: 0, rpm: 100, dailyCap: 1000 } });
    server = s.server;

    const res = await post(s.base, { address: '123 Main St', apiKey: 'rc_key' });
    const payload = await res.json() as { lookup: Record<string, unknown> };
    expect(Object.keys(payload.lookup).sort()).toEqual(['grossRent', 'purchasePrice']);
  });
});
