/**
 * E10 Phase 2 — DB-backed API key store (RPE-83)
 *
 * The DB is the source of truth; verification stays on the RPE-75 sync
 * hot path via an in-memory mirror hydrated at boot. Writes flow back
 * asynchronously:
 *   - verify() marks lastUsedAt in the mirror and queues a persist
 *   - revoke() is instant in-process and persisted immediately
 *   - refresh() re-pulls the table (other instances see revocations on
 *     their next refresh — wire an interval in deploys; single-process
 *     deployments are instant)
 *
 * Drop-in for ApiKeyStore at the dispatcher gate: same verify/revoke/
 * size surface, same record shape (organizationId added for tenant
 * scoping in RPE-84).
 */

import {
  importApiKeyRecords,
  insertApiKey,
  listApiKeys,
  markKeyRevoked,
  touchKeyLastUsed,
  type RpeDb,
} from '@rpe/db';
import { ApiKeyStore, hashSecret, KEY_PREFIX, type ApiKeyRecord } from './apiKeys.js';
import { randomBytes } from 'node:crypto';

export interface DbApiKeyRecord extends ApiKeyRecord {
  organizationId: string;
}

export class DbApiKeyStore {
  private mirror: ApiKeyStore;
  private orgByKeyId = new Map<string, string>();
  private pending: Promise<void> = Promise.resolve();

  private constructor(
    private readonly db: RpeDb,
    records: ApiKeyRecord[],
    orgs: Map<string, string>,
  ) {
    this.mirror = new ApiKeyStore(records);
    this.orgByKeyId = orgs;
  }

  /** Hydrate the sync mirror from the api_key table. */
  static async load(db: RpeDb): Promise<DbApiKeyStore> {
    const rows = await listApiKeys(db);
    const records = rows.map((row) => ({
      id: row.id,
      label: row.label,
      hash: row.hash,
      createdAt: row.createdAt.toISOString(),
      revokedAt: row.revokedAt === null ? null : row.revokedAt.toISOString(),
      lastUsedAt: row.lastUsedAt === null ? null : row.lastUsedAt.toISOString(),
    }));
    return new DbApiKeyStore(db, records, new Map(rows.map((r) => [r.id, r.organizationId])));
  }

  get size(): number {
    return this.mirror.size;
  }

  /** Sync verify against the mirror; lastUsedAt persists in the background. */
  verify(secret: string, now: () => number = Date.now): DbApiKeyRecord | null {
    const record = this.mirror.verify(secret, now);
    if (record === null) return null;
    const when = new Date(now());
    this.queue(() => touchKeyLastUsed(this.db, record.id, when));
    return { ...record, organizationId: this.orgByKeyId.get(record.id) ?? '' };
  }

  /** Instant in-process revocation, persisted to the DB. */
  revoke(id: string, now: () => number = Date.now): boolean {
    const revoked = this.mirror.revoke(id, now);
    if (revoked) {
      const when = new Date(now());
      this.queue(() => markKeyRevoked(this.db, id, when).then(() => undefined));
    }
    return revoked;
  }

  /** Mint + persist a key for an org; the secret is returned exactly once. */
  async mint(organizationId: string, label: string, now: () => number = Date.now): Promise<{
    record: DbApiKeyRecord;
    secret: string;
  }> {
    const secret = `${KEY_PREFIX}${randomBytes(24).toString('hex')}`;
    const row = await insertApiKey(this.db, {
      organizationId,
      label,
      hash: hashSecret(secret),
      createdAt: new Date(now()),
    });
    await this.refresh();
    return {
      record: {
        id: row.id,
        label: row.label,
        hash: row.hash,
        createdAt: row.createdAt.toISOString(),
        revokedAt: null,
        lastUsedAt: null,
        organizationId,
      },
      secret,
    };
  }

  /** Idempotent RPE-75 migration: env/file records → DB rows under an org. */
  async importEnvRecords(
    organizationId: string,
    records: readonly ApiKeyRecord[],
  ): Promise<{ imported: number; skipped: number }> {
    const result = await importApiKeyRecords(this.db, organizationId, records);
    await this.refresh();
    return result;
  }

  /** Re-pull the table — picks up revocations/mints from other instances. */
  async refresh(): Promise<void> {
    await this.flush();
    const reloaded = await DbApiKeyStore.load(this.db);
    this.mirror = reloaded.mirror;
    this.orgByKeyId = reloaded.orgByKeyId;
  }

  /** Await queued background writes — tests and graceful shutdown. */
  async flush(): Promise<void> {
    await this.pending;
  }

  private queue(work: () => Promise<void>): void {
    this.pending = this.pending.then(work).catch((err: unknown) => {
      console.error('api key store: background write failed —', err instanceof Error ? err.message : String(err));
    });
  }
}
