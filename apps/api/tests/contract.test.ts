/**
 * RPE-81: public-API contract + hardening suite.
 *
 * The one file that locks the Phase 1 contract end-to-end: CORS policy,
 * security headers, fuzz/abuse handling (envelope always, stack traces
 * never), and the auth → throttle → validate → format happy paths.
 * RPE-85 runs this per release.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import { mintKey } from '../src/services/apiKeys';

const acme = mintKey('acme');

const INPUTS = {
  purchasePrice: 300000, percentDown: 20, interestRate: 7,
  loanTermYears: 30, closingCosts: 6000, rollClosingCostsIntoLoan: false,
  grossRent: 2200, vacancyPct: 5,
  expenses: {
    taxes: { amount: 4800, period: 'annual' },
    insurance: { amount: 1800, period: 'annual' },
  },
};

function start(config: Parameters<typeof createApp>[0]): Promise<{ server: Server; base: string }> {
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

const stop = (server: Server) =>
  new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

describe('CORS policy', () => {
  it('defaults to credential-less * and never sends Allow-Credentials', async () => {
    const { server, base } = await start({});
    try {
      const res = await fetch(`${base}/v1/health`, { headers: { Origin: 'https://any.example' } });
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    } finally {
      await stop(server);
    }
  });

  it('echoes only allowlisted origins when scoped, with Vary: Origin', async () => {
    const { server, base } = await start({ cors: { origins: ['https://app.example'] } });
    try {
      const allowed = await fetch(`${base}/v1/health`, { headers: { Origin: 'https://app.example' } });
      expect(allowed.headers.get('access-control-allow-origin')).toBe('https://app.example');
      expect(allowed.headers.get('vary')).toContain('Origin');

      const denied = await fetch(`${base}/v1/health`, { headers: { Origin: 'https://evil.example' } });
      expect(denied.headers.get('access-control-allow-origin')).toBeNull();
      expect(denied.status).toBe(200); // server-to-server unaffected — only the browser grant is withheld
    } finally {
      await stop(server);
    }
  });

  it('answers preflight with the policy headers', async () => {
    const { server, base } = await start({});
    try {
      const res = await fetch(`${base}/v1/reports`, { method: 'OPTIONS', headers: { Origin: 'https://any.example' } });
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-headers')).toContain('Authorization');
      expect(res.headers.get('access-control-allow-headers')).toContain('X-API-Key');
    } finally {
      await stop(server);
    }
  });
});

describe('security headers + caching', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    ({ server, base } = await start({ auth: { keys: [acme.record] }, v1RateLimit: { rpm: 1000, dailyCap: 10000 } }));
  });
  afterAll(() => stop(server));

  it('sets nosniff + referrer policy on every response', async () => {
    for (const path of ['/health', '/v1/health', '/nope']) {
      const res = await fetch(`${base}${path}`);
      expect(res.headers.get('x-content-type-options'), path).toBe('nosniff');
      expect(res.headers.get('referrer-policy'), path).toBe('no-referrer');
    }
  });

  it('no-stores /v1 responses but allows caching the docs surface', async () => {
    const report = await fetch(`${base}/v1/health`);
    expect(report.headers.get('cache-control')).toBe('no-store');
    const spec = await fetch(`${base}/v1/openapi.json`);
    expect(spec.headers.get('cache-control')).toBe('public, max-age=300');
    const legacy = await fetch(`${base}/health`);
    expect(legacy.headers.get('cache-control')).toBeNull(); // legacy surface untouched
  });
});

describe('fuzz/abuse — envelope always, stack traces never', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    ({ server, base } = await start({ auth: { keys: [acme.record] }, v1RateLimit: { rpm: 1000, dailyCap: 10000 } }));
  });
  afterAll(() => stop(server));

  const authed = { Authorization: `Bearer ${acme.secret}`, 'Content-Type': 'application/json' };

  const CASES: Array<{ name: string; body: string; expectStatus: number }> = [
    { name: 'malformed JSON', body: '{not json', expectStatus: 400 },
    { name: 'JSON scalar', body: '42', expectStatus: 400 },
    { name: 'JSON array', body: '[1,2,3]', expectStatus: 400 },
    { name: 'wrong types', body: JSON.stringify({ inputs: { ...INPUTS, purchasePrice: 'lots' } }), expectStatus: 400 },
    { name: 'NaN-ish numerics', body: JSON.stringify({ inputs: { ...INPUTS, interestRate: null } }), expectStatus: 400 },
    { name: 'opts as string', body: JSON.stringify({ inputs: INPUTS, opts: 'proforma' }), expectStatus: 400 },
    {
      name: 'deeply nested payload',
      body: JSON.stringify({ inputs: JSON.parse('{"a":'.repeat(2000) + 'null' + '}'.repeat(2000)) }),
      expectStatus: 400,
    },
    { name: 'oversized payload', body: `{"inputs":"${'x'.repeat(70 * 1024)}"}`, expectStatus: 413 },
  ];

  for (const fuzz of CASES) {
    it(`handles ${fuzz.name} with the envelope on both endpoints`, async () => {
      for (const path of ['/v1/evaluate', '/v1/reports']) {
        const res = await fetch(`${base}${path}`, { method: 'POST', headers: authed, body: fuzz.body });
        expect(res.status, `${path}: ${fuzz.name}`).toBe(fuzz.expectStatus);
        const text = await res.text();
        expect(text, `${path}: ${fuzz.name} leaked internals`).not.toMatch(/\bat\s+\w+.*\d+:\d+|node_modules|internal\//);
        const body = JSON.parse(text) as Record<string, unknown>;
        expect('error' in body).toBe(true);
      }
    });
  }

  it('ignores a misleading content-type (body still parsed as JSON)', async () => {
    const res = await fetch(`${base}/v1/evaluate`, {
      method: 'POST',
      headers: { ...authed, 'Content-Type': 'text/plain' },
      body: JSON.stringify({ inputs: INPUTS }),
    });
    expect(res.status).toBe(200);
  });
});

describe('contract happy paths (per-release gate seed)', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    ({ server, base } = await start({ auth: { keys: [acme.record] }, v1RateLimit: { rpm: 3, dailyCap: 10000 } }));
  });
  afterAll(() => stop(server));

  it('walks 401 → 200 json → 429 in order', async () => {
    const noKey = await fetch(`${base}/v1/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: INPUTS }),
    });
    expect(noKey.status).toBe(401);

    const authedHeaders = { Authorization: `Bearer ${acme.secret}`, 'Content-Type': 'application/json' };
    const ok = await fetch(`${base}/v1/evaluate`, {
      method: 'POST', headers: authedHeaders, body: JSON.stringify({ inputs: INPUTS }),
    });
    expect(ok.status).toBe(200);
    const results = await ok.json() as { results: Record<string, unknown> };
    // No %-of-rent expenses in this fixture: 2,090 EGI − 550 fixed = 1,540
    expect(results.results['noiMonthly']).toBe(1540);

    // burn the rpm=3 budget (one spent above)
    await fetch(`${base}/v1/evaluate`, { method: 'POST', headers: authedHeaders, body: JSON.stringify({ inputs: INPUTS }) });
    await fetch(`${base}/v1/evaluate`, { method: 'POST', headers: authedHeaders, body: JSON.stringify({ inputs: INPUTS }) });
    const limited = await fetch(`${base}/v1/evaluate`, {
      method: 'POST', headers: authedHeaders, body: JSON.stringify({ inputs: INPUTS }),
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).not.toBeNull();
  });
});
