/**
 * RPE-83: DB-backed API keys — mint/verify/revoke against the api_key
 * table, idempotent RPE-75 env-record import (old secrets keep
 * working), lastUsedAt persistence, cross-instance refresh, and the
 * store plugged into the live dispatcher gate.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import { mintKey } from '../src/services/apiKeys';
import { DbApiKeyStore } from '../src/services/dbApiKeys';
import { createDb, listApiKeys, type RpeDb } from '@rpe/db';
import { EXAMPLE_DEAL_INPUTS } from '@rpe/engine';

let db: RpeDb;

beforeEach(async () => {
  db = createDb(':memory:');
  await db.applyMigrations();
});

afterEach(() => db.close());

describe('DbApiKeyStore (RPE-83)', () => {
  it('mints into the DB and verifies; the record carries the org id', async () => {
    const store = await DbApiKeyStore.load(db);
    expect(store.size).toBe(0);

    const { record, secret } = await store.mint('org-a', 'acme-prod');
    expect(store.size).toBe(1);

    const verified = store.verify(secret);
    expect(verified?.id).toBe(record.id);
    expect(verified?.organizationId).toBe('org-a');
    expect(store.verify('rpe_live_' + '0'.repeat(48))).toBeNull();

    // lastUsedAt persists after the background write flushes
    await store.flush();
    const rows = await listApiKeys(db);
    expect(rows[0]?.lastUsedAt).toBeInstanceOf(Date);
  });

  it('imports RPE-75 env records idempotently — previously issued secrets keep working', async () => {
    const { record, secret } = mintKey('legacy-consumer');
    const store = await DbApiKeyStore.load(db);

    const first = await store.importEnvRecords('org-legacy', [record]);
    expect(first).toEqual({ imported: 1, skipped: 0 });
    const second = await store.importEnvRecords('org-legacy', [record]);
    expect(second).toEqual({ imported: 0, skipped: 1 });

    const verified = store.verify(secret);
    expect(verified?.id).toBe(record.id);
    expect(verified?.organizationId).toBe('org-legacy');
  });

  it('revocation is instant in-process, persisted, and visible to a fresh instance', async () => {
    const store = await DbApiKeyStore.load(db);
    const { record, secret } = await store.mint('org-a', 'to-revoke');

    expect(store.revoke(record.id)).toBe(true);
    expect(store.verify(secret)).toBeNull();

    await store.flush();
    const other = await DbApiKeyStore.load(db); // another "instance"
    expect(other.verify(secret)).toBeNull();
  });

  it('refresh picks up keys minted by another instance', async () => {
    const a = await DbApiKeyStore.load(db);
    const b = await DbApiKeyStore.load(db);
    const { secret } = await a.mint('org-a', 'minted-elsewhere');

    expect(b.verify(secret)).toBeNull(); // stale mirror
    await b.refresh();
    expect(b.verify(secret)?.organizationId).toBe('org-a');
  });

  it('drives the live dispatcher gate: 401 without, 200 with, 401 after revoke', async () => {
    const store = await DbApiKeyStore.load(db);
    const { record, secret } = await store.mint('org-a', 'gate-test');

    const server: Server = createApp({ auth: { store }, v1RateLimit: { rpm: 1000, dailyCap: 10000 } });
    const port: number = await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve((server.address() as { port: number }).port);
      });
    });
    const base = `http://127.0.0.1:${port}`;
    const evaluateBody = JSON.stringify({ inputs: EXAMPLE_DEAL_INPUTS });
    const post = (key?: string) =>
      fetch(`${base}/v1/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(key !== undefined ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: evaluateBody,
      });

    try {
      expect((await post()).status).toBe(401);
      expect((await post(secret)).status).toBe(200);
      store.revoke(record.id);
      expect((await post(secret)).status).toBe(401);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      await store.flush();
    }
  });
});
