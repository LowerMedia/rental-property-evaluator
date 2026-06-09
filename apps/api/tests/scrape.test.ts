/**
 * RPE-51: POST /scrape route tests.
 *
 * Mocks the scrapePage service module so no listing site is ever hit;
 * htmlToText is unit-tested with the real implementation in a separate
 * import (it is pure).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import { fetchListingPageText } from '../src/services/scrapePage.js';

vi.mock('../src/services/scrapePage.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/services/scrapePage.js')>();
  return { ...original, fetchListingPageText: vi.fn() };
});

const mockFetchPage = vi.mocked(fetchListingPageText);

const LISTING_TEXT =
  '$342,000 3 bd 2 ba 1,480 sqft 123 Main St Austin TX 78701 Built in 1987 Rent estimate: $2,150/mo';

const ZILLOW_URL = 'https://www.zillow.com/homedetails/123-Main-St-Austin-TX-78701/29381742_zpid/';

function startServer(config?: Parameters<typeof createApp>[0]): Promise<{ server: Server; base: string }> {
  return new Promise((resolve, reject) => {
    const server = createApp(config ?? { scrape: { enabled: true, rpm: 1000, dailyCap: 10000 } });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const addr = server.address() as { port: number };
      resolve({ server, base: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function post(base: string, body: unknown) {
  return fetch(`${base}/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /scrape', () => {
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

  it('is disabled by default — 403 scrape_disabled without touching the page service', async () => {
    await new Promise<void>((resolve, reject) => {
      server?.close((err) => (err ? reject(err) : resolve()));
    });
    const s = await startServer({});
    server = s.server;

    const res = await post(s.base, { url: ZILLOW_URL });
    expect(res.status).toBe(403);
    const body = await res.json() as Record<string, unknown>;
    expect(body['code']).toBe('scrape_disabled');
    expect(mockFetchPage).not.toHaveBeenCalled();
  });

  it('parses the fetched page and forces source scrape / confidence low', async () => {
    mockFetchPage.mockResolvedValue(LISTING_TEXT);

    const res = await post(base, { url: ZILLOW_URL });
    const body = await res.json() as { lookup: Record<string, { value: number; source: string; confidence: string }> };

    expect(res.status).toBe(200);
    expect(body.lookup['purchasePrice']?.value).toBe(342_000);
    // grossRent parses as medium from the heuristics — the route must demote it
    expect(Object.values(body.lookup).every((f) => f.source === 'scrape' && f.confidence === 'low')).toBe(true);
  });

  it('rejects non-allowlisted hosts and non-https URLs (SSRF containment)', async () => {
    for (const url of [
      'https://evil.example.com/homedetails/x/1_zpid/',
      'https://zillow.com.evil.io/homedetails/x/1_zpid/',
      'http://www.zillow.com/homedetails/x/1_zpid/',
      'https://localhost:3001/admin',
      'https://169.254.169.254/latest/meta-data/',
      'not a url',
    ]) {
      const res = await post(base, { url });
      expect(res.status, url).toBe(400);
    }
    expect(mockFetchPage).not.toHaveBeenCalled();
  });

  it('serves repeats from cache without re-fetching', async () => {
    mockFetchPage.mockResolvedValue(LISTING_TEXT);
    await post(base, { url: ZILLOW_URL });
    const second = await (await post(base, { url: ZILLOW_URL })).json() as Record<string, unknown>;
    expect(second['cached']).toBe(true);
    expect(mockFetchPage).toHaveBeenCalledTimes(1);
  });

  it('rate limits page-bound requests with the typed envelope', async () => {
    await new Promise<void>((resolve, reject) => {
      server?.close((err) => (err ? reject(err) : resolve()));
    });
    const s = await startServer({ property: { cacheTtlMs: 0 }, scrape: { enabled: true, rpm: 1, dailyCap: 100 } });
    server = s.server;
    mockFetchPage.mockResolvedValue(LISTING_TEXT);

    expect((await post(s.base, { url: ZILLOW_URL })).status).toBe(200);
    const limited = await post(s.base, { url: `${ZILLOW_URL}?x=2` });
    expect(limited.status).toBe(429);
    const body = await limited.json() as Record<string, unknown>;
    expect(body['code']).toBe('proxy_rate_limit');
  });

  it('returns 502 and does not cache when the page cannot be fetched', async () => {
    mockFetchPage.mockResolvedValueOnce(null).mockResolvedValueOnce(LISTING_TEXT);

    expect((await post(base, { url: ZILLOW_URL })).status).toBe(502);
    const second = await (await post(base, { url: ZILLOW_URL })).json() as Record<string, unknown>;
    expect(second['cached']).toBe(false);
    expect(mockFetchPage).toHaveBeenCalledTimes(2);
  });
});

describe('fetchListingPageText — redirect SSRF containment', () => {
  it('drops a response whose final URL left the allowlist', async () => {
    const { fetchListingPageText: realFetchPage } = await vi.importActual<
      typeof import('../src/services/scrapePage.js')
    >('../src/services/scrapePage.js');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      url: 'https://internal.attacker.example/payload',
      text: () => Promise.resolve('<html>$342,000</html>'),
    } as unknown as Response);

    const result = await realFetchPage('https://www.zillow.com/homedetails/x/1_zpid/');
    expect(result).toBeNull();
  });

  it('accepts a redirect that stays on an allowlisted host', async () => {
    const { fetchListingPageText: realFetchPage } = await vi.importActual<
      typeof import('../src/services/scrapePage.js')
    >('../src/services/scrapePage.js');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      url: 'https://www.zillow.com/homedetails/x-renamed/1_zpid/',
      text: () => Promise.resolve('<html>List price: $342,000</html>'),
    } as unknown as Response);

    const result = await realFetchPage('https://www.zillow.com/homedetails/x/1_zpid/');
    expect(result).toContain('$342,000');
  });
});

describe('htmlToText', () => {
  it('strips scripts, styles, comments and tags; decodes common entities', async () => {
    const { htmlToText } = await vi.importActual<typeof import('../src/services/scrapePage.js')>(
      '../src/services/scrapePage.js',
    );
    const html = `
      <html><head><style>.x{color:red}</style><script>var a=1;</script></head>
      <body><!-- hidden --><h1>List price:</h1> <span>&#36;342,000</span>
      <p>3&nbsp;bd &amp; 2 ba</p></body></html>`;
    expect(htmlToText(html)).toBe('List price: $342,000 3 bd & 2 ba');
  });
});
