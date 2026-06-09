/**
 * RPE-49: POST /property/context route tests.
 *
 * Mocks @rpe/rentcast (service-module pattern) so local-server fetches
 * stay real.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import { fetchPropertyContext, RentCastError } from '@rpe/rentcast';

vi.mock('@rpe/rentcast', () => ({
  fetchPropertyData: vi.fn(),
  fetchPropertyContext: vi.fn(),
  RentCastError: class RentCastError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = 'RentCastError'; }
  },
}));

const mockContext = vi.mocked(fetchPropertyContext);

const CONTEXT = {
  rentComps: [{ address: '127 Main St', price: 2_100, distanceMiles: 0.2, sqft: 1_450, bedrooms: 3 }],
  saleComps: [{ address: '125 Main St', price: 350_000, distanceMiles: 0.3, sqft: 1_510, bedrooms: 3 }],
  taxHistory: [{ year: 2023, total: 4_210 }],
  priceHistory: [{ date: '2018-05-12', event: 'Sale', price: 265_000 }],
};

const VALID_BODY = { address: '123 Main St, Austin TX', apiKey: 'rc_key' };

function startServer(config?: Parameters<typeof createApp>[0]): Promise<{ server: Server; base: string }> {
  return new Promise((resolve, reject) => {
    const server = createApp(config ?? { property: { cacheTtlMs: 60_000, rpm: 1000, dailyCap: 10000 } });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const addr = server.address() as { port: number };
      resolve({ server, base: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function post(base: string, body: unknown) {
  return fetch(`${base}/property/context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /property/context', () => {
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

  it('returns the normalized context', async () => {
    mockContext.mockResolvedValue(CONTEXT);
    const res = await post(base, VALID_BODY);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body['cached']).toBe(false);
    expect(body['context']).toEqual(CONTEXT);
    expect(mockContext).toHaveBeenCalledWith(VALID_BODY.address, VALID_BODY.apiKey);
  });

  it('serves repeats from cache without another provider call', async () => {
    mockContext.mockResolvedValue(CONTEXT);
    await post(base, VALID_BODY);
    const second = await (await post(base, VALID_BODY)).json() as Record<string, unknown>;
    expect(second['cached']).toBe(true);
    expect(mockContext).toHaveBeenCalledTimes(1);
  });

  it('shares the provider-call budget with /property', async () => {
    // rpm=1 across BOTH endpoints: a /property/context call exhausts it
    await new Promise<void>((resolve, reject) => {
      server?.close((err) => (err ? reject(err) : resolve()));
    });
    const s = await startServer({ property: { cacheTtlMs: 0, rpm: 1, dailyCap: 1000 } });
    server = s.server;
    mockContext.mockResolvedValue(CONTEXT);

    expect((await post(s.base, VALID_BODY)).status).toBe(200);
    const limited = await post(s.base, VALID_BODY);
    expect(limited.status).toBe(429);
    const body = await limited.json() as Record<string, unknown>;
    expect(body['code']).toBe('proxy_rate_limit');
  });

  it('returns 400 for a missing address or apiKey', async () => {
    expect((await post(base, { apiKey: 'k' })).status).toBe(400);
    expect((await post(base, { address: '123 Main St' })).status).toBe(400);
    expect(mockContext).not.toHaveBeenCalled();
  });

  it('returns 405 for non-POST', async () => {
    const res = await fetch(`${base}/property/context`);
    expect(res.status).toBe(405);
  });

  it('maps RentCastError codes to the typed envelope', async () => {
    mockContext.mockRejectedValue(new RentCastError('rate_limit', 'upstream limit'));
    const res = await post(base, VALID_BODY);
    expect(res.status).toBe(429);
    const body = await res.json() as Record<string, unknown>;
    expect(body['code']).toBe('rate_limit');
    expect(String(body['error'])).not.toContain('rc_key');
  });

  it('does not cache failures', async () => {
    mockContext
      .mockRejectedValueOnce(new RentCastError('unknown', 'boom'))
      .mockResolvedValueOnce(CONTEXT);

    expect((await post(base, VALID_BODY)).status).toBe(502);
    const second = await (await post(base, VALID_BODY)).json() as Record<string, unknown>;
    expect(second['cached']).toBe(false);
    expect(mockContext).toHaveBeenCalledTimes(2);
  });
});
