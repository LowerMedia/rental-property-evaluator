/**
 * RPE-74: API foundation — router unit tests + /v1 surface integration.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { createApp } from '../src/index';
import { Router, normalizePath, resolveRequestId, v1Error } from '../src/router';

// region/property handlers fetch upstream only when configured — these
// tests never set tokens/keys, so no network mocking is needed beyond
// avoiding real lookups.

describe('Router (unit)', () => {
  it('dispatches on method + normalized path', () => {
    const router = new Router();
    const get = vi.fn();
    const post = vi.fn();
    router.on('GET', '/thing/', get).on('POST', '/thing', post);

    expect(router.resolve('GET', '/thing')).toBe(get);
    expect(router.resolve('post', '/thing/')).toBe(post);
    expect(router.resolve('GET', '/other')).toBeUndefined();
  });

  it('falls back method-agnostically so handlers own their 405s', () => {
    const router = new Router();
    const post = vi.fn();
    router.on('POST', '/thing', post);
    expect(router.resolve('GET', '/thing')).toBe(post);
  });

  it('normalizePath strips trailing slashes but keeps root', () => {
    expect(normalizePath('/a/b/')).toBe('/a/b');
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('')).toBe('/');
  });

  it('resolveRequestId echoes sane client ids and regenerates garbage', () => {
    const reqWith = (v?: string) => ({ headers: { 'x-request-id': v } }) as unknown as IncomingMessage;
    expect(resolveRequestId(reqWith('abc-123.DEF'))).toBe('abc-123.DEF');
    expect(resolveRequestId(reqWith('bad id with spaces'))).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId(reqWith('x'.repeat(100)))).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId(reqWith(undefined))).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('v1Error builds the standard envelope', () => {
    expect(v1Error('not_found', 'nope', 'rid')).toEqual({
      error: { code: 'not_found', message: 'nope', requestId: 'rid' },
    });
  });
});

describe('/v1 surface (integration)', () => {
  let server: Server;
  let base: string;

  beforeAll(
    () =>
      new Promise<void>((resolve, reject) => {
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

  it('every response carries X-Request-Id; client ids are echoed', async () => {
    const fresh = await fetch(`${base}/health`);
    expect(fresh.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);

    const echoed = await fetch(`${base}/health`, { headers: { 'X-Request-Id': 'my-trace-1' } });
    expect(echoed.headers.get('x-request-id')).toBe('my-trace-1');
  });

  it('GET /v1/health returns status + version + apiVersion + gitSha', async () => {
    const res = await fetch(`${base}/v1/health`);
    const body = await res.json() as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(body['status']).toBe('ok');
    expect(typeof body['version']).toBe('string');
    expect(body['apiVersion']).toBe('v1');
    expect('gitSha' in body).toBe(true);
  });

  it('aliases legacy routes under /v1 with identical behavior', async () => {
    // /evaluate works identically with and without the prefix
    const inputs = {
      purchasePrice: 300000, percentDown: 20, interestRate: 7,
      loanTermYears: 30, closingCosts: 0, rollClosingCostsIntoLoan: false,
      grossRent: 2200, vacancyPct: 5,
      expenses: {
        taxes: { amount: 3600, period: 'annual' },
        insurance: { amount: 1200, period: 'annual' },
      },
    };
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inputs }) };
    const legacy = await (await fetch(`${base}/evaluate`, opts)).json() as { results: Record<string, unknown> };
    const v1 = await (await fetch(`${base}/v1/evaluate`, opts)).json() as { results: Record<string, unknown> };
    expect(v1.results).toEqual(legacy.results);
  });

  it('unknown /v1 routes return the standard nested envelope', async () => {
    const res = await fetch(`${base}/v1/nope`, { headers: { 'X-Request-Id': 'trace-404' } });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: Record<string, unknown> };
    expect(body.error['code']).toBe('not_found');
    expect(body.error['requestId']).toBe('trace-404');
    expect(typeof body.error['message']).toBe('string');
  });

  it('unknown legacy routes keep the flat shape, now with requestId', async () => {
    const res = await fetch(`${base}/nope`, { headers: { 'X-Request-Id': 'trace-legacy' } });
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body['error']).toBe('string');
    expect(body['requestId']).toBe('trace-legacy');
  });

  it('preserves legacy /health untouched semantics', async () => {
    const res = await fetch(`${base}/health`);
    const body = await res.json() as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(body['status']).toBe('ok');
    expect('apiVersion' in body).toBe(false); // legacy shape unchanged
  });

  it('handler-emitted errors include the requestId (self-review round 1)', async () => {
    const res = await fetch(`${base}/v1/property`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'trace-400' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body['code']).toBe('bad_request');
    expect(body['requestId']).toBe('trace-400');
  });

  it('emits a structured log line per request', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await fetch(`${base}/health`, { headers: { 'X-Request-Id': 'log-check' } });
    await vi.waitFor(() => {
      const line = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.includes('log-check'));
      expect(line).toBeDefined();
      const parsed = JSON.parse(line as string) as Record<string, unknown>;
      expect(parsed['evt']).toBe('request');
      expect(parsed['method']).toBe('GET');
      expect(parsed['path']).toBe('/health');
      expect(parsed['status']).toBe(200);
      expect(typeof parsed['latencyMs']).toBe('number');
    });
    logSpy.mockRestore();
  });
});
