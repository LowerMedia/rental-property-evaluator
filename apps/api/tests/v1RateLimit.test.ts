/**
 * RPE-76: /v1 per-key throttle — quota headers, 429 envelope, payload cap.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import { mintKey } from '../src/services/apiKeys';
import { RateLimiter } from '../src/services/guardrails';

describe('RateLimiter quota reporting (unit)', () => {
  it('reports limit/remaining/reset and counts down', () => {
    let t = 0;
    const limiter = new RateLimiter(3, 100, () => t);

    const first = limiter.check('k');
    expect(first).toMatchObject({ allowed: true, limit: 3, remaining: 2, resetSec: 60 });
    t = 30_000;
    expect(limiter.check('k')).toMatchObject({ allowed: true, remaining: 1, resetSec: 30 });
    limiter.check('k');
    const denied = limiter.check('k');
    expect(denied).toMatchObject({ allowed: false, remaining: 0, retryAfterSec: 30 });

    // Window reset restores the full quota
    t = 60_000;
    expect(limiter.check('k')).toMatchObject({ allowed: true, remaining: 2, resetSec: 60 });
  });

  it('reports remaining 0 on a daily-cap denial with the daily retry', () => {
    let t = 0;
    const limiter = new RateLimiter(10, 2, () => t);
    limiter.check('k');
    t = 61_000;
    limiter.check('k');
    t = 122_000;
    const denied = limiter.check('k');
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterSec).toBeGreaterThan(3600);
  });
});

describe('/v1 throttle (integration)', () => {
  const acme = mintKey('acme');
  const other = mintKey('other');

  let server: Server;
  let base: string;

  beforeAll(
    () =>
      new Promise<void>((resolve, reject) => {
        server = createApp({
          auth: { keys: [acme.record, other.record] },
          v1RateLimit: { rpm: 3, dailyCap: 1000 },
        });
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

  const health = (key: string) =>
    fetch(`${base}/v1/health`, { headers: { Authorization: `Bearer ${key}` } });

  it('emits quota headers on success and 429 + Retry-After when exceeded, per key', async () => {
    const first = await health(acme.secret);
    expect(first.status).toBe(200);
    expect(first.headers.get('x-ratelimit-limit')).toBe('3');
    expect(Number(first.headers.get('x-ratelimit-remaining'))).toBe(2);
    expect(Number(first.headers.get('x-ratelimit-reset'))).toBeGreaterThan(0);

    await health(acme.secret);
    await health(acme.secret);
    const denied = await health(acme.secret);
    expect(denied.status).toBe(429);
    expect(denied.headers.get('x-ratelimit-remaining')).toBe('0');
    expect(Number(denied.headers.get('retry-after'))).toBeGreaterThan(0);
    const body = await denied.json() as { error: Record<string, unknown> };
    expect(body.error['code']).toBe('rate_limited');
    expect(typeof body.error['requestId']).toBe('string');

    // A different key is unaffected — limits are per identity
    const otherRes = await health(other.secret);
    expect(otherRes.status).toBe(200);
  });

  it('does not throttle legacy unprefixed routes', async () => {
    for (let i = 0; i < 6; i++) {
      expect((await fetch(`${base}/health`)).status).toBe(200);
    }
    const legacy = await fetch(`${base}/health`);
    expect(legacy.headers.get('x-ratelimit-limit')).toBeNull();
  });

  it('returns 413 for oversized /v1 payloads', async () => {
    const res = await fetch(`${base}/v1/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${other.secret}` },
      body: `{"inputs": "${'x'.repeat(70 * 1024)}"}`,
    });
    expect(res.status).toBe(413);
  });
});

describe('/v1 throttle — per-IP fallback (zero-config)', () => {
  it('throttles unauthenticated /v1 traffic by IP', async () => {
    await new Promise<void>((resolve, reject) => {
      const open = createApp({ v1RateLimit: { rpm: 2, dailyCap: 100 } });
      open.listen(0, '127.0.0.1', async () => {
        try {
          const addr = open.address() as { port: number };
          const b = `http://127.0.0.1:${addr.port}`;
          expect((await fetch(`${b}/v1/health`)).status).toBe(200);
          expect((await fetch(`${b}/v1/health`)).status).toBe(200);
          expect((await fetch(`${b}/v1/health`)).status).toBe(429);
          open.close((err) => (err ? reject(err) : resolve()));
        } catch (err) {
          open.close(() => reject(err as Error));
        }
      });
    });
  });
});
