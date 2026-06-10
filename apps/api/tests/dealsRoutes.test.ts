/**
 * RPE-84: /v1/deals over live HTTP — CRUD walk, validation, tenant
 * isolation (uniform 404 across orgs), report retrieval in all formats
 * with structural cache invalidation, and the org-less key 403.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import { mintKey } from '../src/services/apiKeys';
import { DbApiKeyStore } from '../src/services/dbApiKeys';
import { createDb, type RpeDb } from '@rpe/db';
import { EXAMPLE_DEAL_INPUTS } from '@rpe/engine';

let db: RpeDb;
let server: Server;
let base: string;
let orgAKey: string;
let orgBKey: string;
let orglessKey: string;

beforeAll(async () => {
  db = createDb(':memory:');
  await db.applyMigrations();
  const store = await DbApiKeyStore.load(db);
  orgAKey = (await store.mint('org-a', 'a')).secret;
  orgBKey = (await store.mint('org-b', 'b')).secret;
  const legacy = mintKey('legacy-no-org');
  await store.importEnvRecords('', [legacy.record]); // org-less import
  orglessKey = legacy.secret;

  server = createApp({
    auth: { store },
    deals: { db, reportCacheTtlMs: 60_000 },
    v1RateLimit: { rpm: 10000, dailyCap: 100000 },
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await db.close();
});

function call(method: string, path: string, key: string, body?: unknown) {
  return fetch(`${base}/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe('/v1/deals (RPE-84)', () => {
  let dealId: string;

  it('full CRUD walk: create → fetch → list → patch → (delete later)', async () => {
    const created = await call('POST', '/deals', orgAKey, { name: 'Maple St', inputs: EXAMPLE_DEAL_INPUTS });
    expect(created.status).toBe(201);
    const deal = await created.json() as { id: string; name: string };
    expect(deal.name).toBe('Maple St');
    dealId = deal.id;

    const fetched = await call('GET', `/deals/${dealId}`, orgAKey);
    expect(fetched.status).toBe(200);
    expect(((await fetched.json()) as { inputs: unknown }).inputs).toEqual(EXAMPLE_DEAL_INPUTS);

    const list = await call('GET', '/deals?limit=10', orgAKey);
    const page = await list.json() as { deals: Array<{ id: string }>; total: number };
    expect(page.total).toBe(1);
    expect(page.deals[0]?.id).toBe(dealId);

    const patched = await call('PATCH', `/deals/${dealId}`, orgAKey, { name: 'Maple St duplex' });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { name: string }).name).toBe('Maple St duplex');
  });

  it('validates: missing fields 400, bad inputs 400 via the shared evaluate validator', async () => {
    expect((await call('POST', '/deals', orgAKey, { name: 'No inputs' })).status).toBe(400);
    const badInputs = await call('POST', '/deals', orgAKey, { name: 'Bad', inputs: { purchasePrice: 'lots' } });
    expect(badInputs.status).toBe(400);
  });

  it('TENANT ISOLATION: org B gets a uniform 404 for org A\'s deal — read, patch, delete, report', async () => {
    for (const [method, path, body] of [
      ['GET', `/deals/${dealId}`, undefined],
      ['PATCH', `/deals/${dealId}`, { name: 'steal' }],
      ['DELETE', `/deals/${dealId}`, undefined],
      ['GET', `/deals/${dealId}/report`, undefined],
    ] as const) {
      const res = await call(method, path, orgBKey, body);
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    // ghost id gets the same body shape as a foreign id
    const foreign = await call('GET', `/deals/${dealId}`, orgBKey);
    const ghost = await call('GET', '/deals/does-not-exist', orgBKey);
    const a = await foreign.json() as { error: { code: string; message: string } };
    const b = await ghost.json() as { error: { code: string; message: string } };
    expect(a.error.message).toBe(b.error.message);
  });

  it('org-less keys (env allowlist) are rejected with 403, not silently scoped', async () => {
    const res = await call('GET', '/deals', orglessKey);
    expect(res.status).toBe(403);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain('organization-attached');
  });

  it('report retrieval: json/csv/pdf with cache miss → hit, and patch rotates the cache key', async () => {
    const first = await call('GET', `/deals/${dealId}/report?format=json`, orgAKey);
    expect(first.status).toBe(200);
    expect(first.headers.get('x-report-cache')).toBe('miss');
    const report = await first.json() as { meta: { reportVersion: number }; score: unknown };
    expect(report.meta.reportVersion).toBe(1);

    const second = await call('GET', `/deals/${dealId}/report?format=json`, orgAKey);
    expect(second.headers.get('x-report-cache')).toBe('hit');

    const csv = await call('GET', `/deals/${dealId}/report?format=csv`, orgAKey);
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(csv.headers.get('content-disposition')).toContain('.csv');

    const pdf = await call('GET', `/deals/${dealId}/report?format=pdf`, orgAKey);
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
    expect((await pdf.arrayBuffer()).byteLength).toBeGreaterThan(500);

    expect((await call('GET', `/deals/${dealId}/report?format=xml`, orgAKey)).status).toBe(406);

    // update → updatedAt changes → structural cache invalidation
    await call('PATCH', `/deals/${dealId}`, orgAKey, { inputs: { ...EXAMPLE_DEAL_INPUTS, grossRentMonthly: 2500 } });
    const after = await call('GET', `/deals/${dealId}/report?format=json`, orgAKey);
    expect(after.headers.get('x-report-cache')).toBe('miss');
  });

  it('delete → 204, then 404; deals storage 404s cleanly when not configured', async () => {
    expect((await call('DELETE', `/deals/${dealId}`, orgAKey)).status).toBe(204);
    expect((await call('GET', `/deals/${dealId}`, orgAKey)).status).toBe(404);

    const bare = createApp({});
    await new Promise<void>((resolve) => {
      bare.listen(0, '127.0.0.1', async () => {
        const port = (bare.address() as { port: number }).port;
        const res = await fetch(`http://127.0.0.1:${port}/v1/deals`);
        expect(res.status).toBe(404);
        bare.close(() => resolve());
      });
    });
  });
});
