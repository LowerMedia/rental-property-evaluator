/**
 * RPE-51: scrape-tier provider tests — global fetch spied (no local server).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createScrapeProxyProvider, type PropertyLookup } from '../src/index';

const LOOKUP: PropertyLookup = {
  purchasePrice: { value: 342_000, source: 'scrape', confidence: 'low' },
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const URL_REQ = { url: 'https://www.zillow.com/homedetails/x/1_zpid/' };

describe('createScrapeProxyProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is disabled by default — supports() refuses even with a url', () => {
    const p = createScrapeProxyProvider({ apiUrl: 'http://localhost:3001' });
    expect(p.tier).toBe('scrape');
    expect(p.supports(URL_REQ)).toBe(false);
  });

  it('supports url requests only when explicitly enabled', () => {
    const p = createScrapeProxyProvider({ apiUrl: 'http://localhost:3001', enabled: true });
    expect(p.supports(URL_REQ)).toBe(true);
    expect(p.supports({ address: '123 Main St' })).toBe(false);
  });

  it('POSTs the url and returns the pre-labeled lookup', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { lookup: LOOKUP, cached: false }),
    );
    const p = createScrapeProxyProvider({ apiUrl: 'http://localhost:3001/', enabled: true });

    const result = await p.lookup(URL_REQ);

    expect(result).toEqual(LOOKUP);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3001/scrape',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('carries the scrape_disabled code through ProviderError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(403, { error: 'Scrape fallback is disabled on this server.', code: 'scrape_disabled' }),
    );
    const p = createScrapeProxyProvider({ apiUrl: 'http://localhost:3001', enabled: true });

    await expect(p.lookup(URL_REQ)).rejects.toMatchObject({ code: 'scrape_disabled' });
  });
});
