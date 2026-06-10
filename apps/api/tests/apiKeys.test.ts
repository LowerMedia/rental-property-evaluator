/**
 * RPE-75: API key auth — store unit tests + /v1 enforcement integration.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import {
  ApiKeyStore,
  extractApiKey,
  hashSecret,
  mintKey,
  parseKeyRecords,
  KEY_PREFIX,
} from '../src/services/apiKeys';

describe('apiKeys (unit)', () => {
  it('mints prefixed secrets whose plaintext never lands in the record', () => {
    const { record, secret } = mintKey('acme');
    expect(secret.startsWith(KEY_PREFIX)).toBe(true);
    expect(secret.length).toBeGreaterThan(KEY_PREFIX.length + 40);
    expect(JSON.stringify(record)).not.toContain(secret);
    expect(record.hash).toBe(hashSecret(secret));
    expect(record.revokedAt).toBeNull();
  });

  it('verifies a minted key and rejects unknown/garbage/unprefixed input', () => {
    const { record, secret } = mintKey('acme');
    const store = new ApiKeyStore([record]);
    expect(store.verify(secret)?.id).toBe(record.id);
    expect(store.verify(`${KEY_PREFIX}deadbeef`)).toBeNull();
    expect(store.verify('not-a-key')).toBeNull();
    expect(store.verify('')).toBeNull();
  });

  it('revocation takes effect on the next verify', () => {
    const { record, secret } = mintKey('acme');
    const store = new ApiKeyStore([record]);
    expect(store.verify(secret)).not.toBeNull();
    expect(store.revoke(record.id)).toBe(true);
    expect(store.verify(secret)).toBeNull();
    expect(store.revoke(record.id)).toBe(false); // already revoked
  });

  it('tracks lastUsedAt in-memory on successful verify', () => {
    const { record, secret } = mintKey('acme');
    const store = new ApiKeyStore([record]);
    expect(record.lastUsedAt).toBeNull();
    store.verify(secret, () => 1_700_000_000_000);
    expect(record.lastUsedAt).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('parseKeyRecords drops malformed entries instead of failing', () => {
    const { record } = mintKey('acme');
    const json = JSON.stringify([record, { id: 'broken' }, 42]);
    expect(parseKeyRecords(json, 'test')).toHaveLength(1);
    expect(parseKeyRecords('not json', 'test')).toEqual([]);
    expect(parseKeyRecords('{"not":"array"}', 'test')).toEqual([]);
  });

  it('extractApiKey reads Bearer and X-API-Key', () => {
    expect(extractApiKey({ authorization: 'Bearer abc' })).toBe('abc');
    expect(extractApiKey({ authorization: 'bearer abc' })).toBe('abc');
    expect(extractApiKey({ 'x-api-key': ' xyz ' })).toBe('xyz');
    expect(extractApiKey({ authorization: 'Basic abc' })).toBeNull();
    expect(extractApiKey({})).toBeNull();
  });
});

describe('/v1 auth enforcement (integration)', () => {
  const acme = mintKey('acme');
  const revoked = mintKey('old-consumer');
  revoked.record.revokedAt = '2026-01-01T00:00:00.000Z';

  let server: Server;
  let base: string;

  beforeAll(
    () =>
      new Promise<void>((resolve, reject) => {
        server = createApp({ auth: { keys: [acme.record, revoked.record] } });
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

  const EVAL_BODY = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputs: {
        purchasePrice: 300000, percentDown: 20, interestRate: 7,
        loanTermYears: 30, closingCosts: 0, rollClosingCostsIntoLoan: false,
        grossRent: 2200, vacancyPct: 5,
        expenses: {
          taxes: { amount: 3600, period: 'annual' },
          insurance: { amount: 1200, period: 'annual' },
        },
      },
    }),
  };

  it('rejects /v1 without a key — standard envelope', async () => {
    const res = await fetch(`${base}/v1/evaluate`, EVAL_BODY);
    expect(res.status).toBe(401);
    const body = await res.json() as { error: Record<string, unknown> };
    expect(body.error['code']).toBe('unauthorized');
    expect(typeof body.error['requestId']).toBe('string');
  });

  it('rejects invalid and revoked keys', async () => {
    const bad = await fetch(`${base}/v1/evaluate`, {
      ...EVAL_BODY,
      headers: { ...EVAL_BODY.headers, Authorization: 'Bearer rpe_live_wrong' },
    });
    expect(bad.status).toBe(401);

    const rev = await fetch(`${base}/v1/evaluate`, {
      ...EVAL_BODY,
      headers: { ...EVAL_BODY.headers, Authorization: `Bearer ${revoked.secret}` },
    });
    expect(rev.status).toBe(401);
  });

  it('accepts a valid key via Bearer and via X-API-Key', async () => {
    const bearer = await fetch(`${base}/v1/evaluate`, {
      ...EVAL_BODY,
      headers: { ...EVAL_BODY.headers, Authorization: `Bearer ${acme.secret}` },
    });
    expect(bearer.status).toBe(200);

    const header = await fetch(`${base}/v1/evaluate`, {
      ...EVAL_BODY,
      headers: { ...EVAL_BODY.headers, 'X-API-Key': acme.secret },
    });
    expect(header.status).toBe(200);
  });

  it('leaves /v1/health and legacy unprefixed routes open', async () => {
    expect((await fetch(`${base}/v1/health`)).status).toBe(200);
    expect((await fetch(`${base}/health`)).status).toBe(200);
    expect((await fetch(`${base}/evaluate`, EVAL_BODY)).status).toBe(200);
  });

  it('enforces nothing when no keys are configured (zero-config dev)', async () => {
    await new Promise<void>((resolve, reject) => {
      const open = createApp({});
      open.listen(0, '127.0.0.1', async () => {
        const addr = open.address() as { port: number };
        const res = await fetch(`http://127.0.0.1:${addr.port}/v1/evaluate`, EVAL_BODY);
        expect(res.status).toBe(200);
        open.close((err) => (err ? reject(err) : resolve()));
      });
    });
  });
});
