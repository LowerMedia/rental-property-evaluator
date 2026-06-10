/**
 * E10 Phase 2 — DB-backed API keys (RPE-83)
 *
 * Row CRUD for the api_key table. Keys keep the RPE-75 model — sha256
 * hash at rest, secret never stored — and gain an organizationId per
 * the one-identity-layer decision (E11). The apps/api DbApiKeyStore
 * hydrates from these rows; this module is just the data access.
 */

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { RpeDb } from './client.js';
import { pgSchema } from './schema.pg.js';
import { sqliteSchema } from './schema.sqlite.js';

export interface ApiKeyRow {
  id: string;
  organizationId: string;
  label: string;
  hash: string;
  createdAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
}

export async function insertApiKey(
  db: RpeDb,
  data: { organizationId: string; label: string; hash: string; id?: string; createdAt?: Date },
): Promise<ApiKeyRow> {
  const row: ApiKeyRow = {
    id: data.id ?? `key_${randomUUID().slice(0, 8)}`,
    organizationId: data.organizationId,
    label: data.label,
    hash: data.hash,
    createdAt: data.createdAt ?? new Date(),
    revokedAt: null,
    lastUsedAt: null,
  };
  if (db.dialect === 'postgres') {
    await db.pg.insert(pgSchema.apiKey).values(row);
  } else {
    await db.sqlite.insert(sqliteSchema.apiKey).values(row);
  }
  return row;
}

/** All keys, revoked included — the store filters; ops tooling lists. */
export async function listApiKeys(db: RpeDb): Promise<ApiKeyRow[]> {
  return db.dialect === 'postgres'
    ? await db.pg.select().from(pgSchema.apiKey)
    : await db.sqlite.select().from(sqliteSchema.apiKey);
}

export async function markKeyRevoked(db: RpeDb, id: string, when: Date): Promise<boolean> {
  if (db.dialect === 'postgres') {
    const res = await db.pg
      .update(pgSchema.apiKey)
      .set({ revokedAt: when })
      .where(eq(pgSchema.apiKey.id, id))
      .returning({ id: pgSchema.apiKey.id });
    return res.length > 0;
  }
  const res = await db.sqlite
    .update(sqliteSchema.apiKey)
    .set({ revokedAt: when })
    .where(eq(sqliteSchema.apiKey.id, id))
    .returning({ id: sqliteSchema.apiKey.id });
  return res.length > 0;
}

export async function touchKeyLastUsed(db: RpeDb, id: string, when: Date): Promise<void> {
  if (db.dialect === 'postgres') {
    await db.pg.update(pgSchema.apiKey).set({ lastUsedAt: when }).where(eq(pgSchema.apiKey.id, id));
    return;
  }
  await db.sqlite.update(sqliteSchema.apiKey).set({ lastUsedAt: when }).where(eq(sqliteSchema.apiKey.id, id));
}

/**
 * Migration path (RPE-75 → DB): bring existing env/file records into the
 * DB under an org. The hash IS the credential, so previously issued
 * secrets keep working. Existing ids are preserved; duplicates (by id)
 * are skipped so the import is idempotent.
 */
export async function importApiKeyRecords(
  db: RpeDb,
  organizationId: string,
  records: ReadonlyArray<{
    id: string;
    label: string;
    hash: string;
    createdAt: string;
    revokedAt: string | null;
    lastUsedAt?: string | null;
  }>,
): Promise<{ imported: number; skipped: number }> {
  const existing = new Set((await listApiKeys(db)).map((k) => k.id));
  let imported = 0;
  let skipped = 0;
  for (const record of records) {
    if (existing.has(record.id)) {
      skipped += 1;
      continue;
    }
    const row: ApiKeyRow = {
      id: record.id,
      organizationId,
      label: record.label,
      hash: record.hash,
      createdAt: new Date(record.createdAt),
      revokedAt: record.revokedAt === null ? null : new Date(record.revokedAt),
      lastUsedAt: record.lastUsedAt == null ? null : new Date(record.lastUsedAt),
    };
    if (db.dialect === 'postgres') {
      await db.pg.insert(pgSchema.apiKey).values(row);
    } else {
      await db.sqlite.insert(sqliteSchema.apiKey).values(row);
    }
    imported += 1;
  }
  return { imported, skipped };
}
