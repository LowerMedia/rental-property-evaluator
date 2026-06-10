/**
 * RPE-48: RentCast proxy provider tests — global fetch spied (no local
 * server in this suite), provider exercised directly and through
 * resolveProperty.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createRentCastProxyProvider,
  ProviderError,
  resolveProperty,
  type PropertyLookup,
} from '../src/index';

const LOOKUP: PropertyLookup = {
  purchasePrice: { value: 342_000, source: 'rentcast', confidence: 'medium' },
  bedrooms: { value: 3, source: 'rentcast', confidence: 'high' },
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeProvider(key: string | null = 'rc_key') {
  return createRentCastProxyProvider({
    apiUrl: 'http://localhost:3001/',
    getApiKey: () => key,
  });
}

describe('createRentCastProxyProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is the api tier with id rentcast', () => {
    const p = makeProvider();
    expect(p.id).toBe('rentcast');
    expect(p.tier).toBe('api');
  });

  it('supports only requests with an address and a configured key', () => {
    const p = makeProvider();
    expect(p.supports({ address: '123 Main St' })).toBe(true);
    expect(p.supports({ address: '   ' })).toBe(false);
    expect(p.supports({ url: 'https://zillow.com/x' })).toBe(false);
    expect(makeProvider(null).supports({ address: '123 Main St' })).toBe(false);
  });

  it('POSTs to the proxy (trailing slash trimmed) and returns the lookup', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { data: {}, lookup: LOOKUP, cached: false }),
    );

    const result = await makeProvider().lookup({ address: '123 Main St' });

    expect(result).toEqual(LOOKUP);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3001/property',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toEqual({ address: '123 Main St', apiKey: 'rc_key' });
  });

  it('throws a ProviderError carrying the proxy error code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(404, { error: 'Property not found for this address.', code: 'not_found' }),
    );

    await expect(makeProvider().lookup({ address: '123 Main St' })).rejects.toMatchObject({
      name: 'ProviderError',
      code: 'not_found',
      message: 'Property not found for this address.',
    });
  });

  it('falls back to upstream_error when the error body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error('not json')),
    } as unknown as Response);

    await expect(makeProvider().lookup({ address: '123 Main St' })).rejects.toMatchObject({
      code: 'upstream_error',
      message: 'property proxy HTTP 502',
    });
  });

  it('throws network_error when the proxy is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(makeProvider().lookup({ address: '123 Main St' })).rejects.toMatchObject({
      code: 'network_error',
    });
  });

  it('throws bad_response when the success body has no lookup', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { data: {} }));
    await expect(makeProvider().lookup({ address: '123 Main St' })).rejects.toMatchObject({
      code: 'bad_response',
    });
  });

  it('ProviderError is an Error with its code preserved', () => {
    const err = new ProviderError('rate_limit', 'slow down');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('rate_limit');
  });
});

describe('rentcast provider through resolveProperty', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves acceptably from the api tier alone', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { data: {}, lookup: LOOKUP, cached: true }),
    );

    const resolved = await resolveProperty({ address: '123 Main St' }, [makeProvider()]);

    expect(resolved.acceptable).toBe(true);
    expect(resolved.lookup.purchasePrice?.value).toBe(342_000);
    expect(resolved.attempts[0]).toMatchObject({ providerId: 'rentcast', status: 'ok' });
  });

  it('records the typed failure and stays graceful when the proxy errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(401, { error: 'Invalid or expired API key.', code: 'bad_key' }),
    );

    const resolved = await resolveProperty({ address: '123 Main St' }, [makeProvider()]);

    expect(resolved.acceptable).toBe(false);
    expect(resolved.attempts[0]).toMatchObject({
      providerId: 'rentcast',
      status: 'error',
      error: 'Invalid or expired API key.',
    });
  });

  it('is skipped when no API key is configured', async () => {
    const resolved = await resolveProperty({ address: '123 Main St' }, [makeProvider(null)]);
    expect(resolved.attempts[0]).toMatchObject({ providerId: 'rentcast', status: 'skipped' });
  });
});
