/**
 * RPE-88: apps/api connects through @rpe/db — hermetic SQLite proof of
 * the acceptance criterion ("apps/api connects … from the same schema").
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { appMetaSqlite, seedDev } from '@rpe/db';
import { getDb, resetDb } from '../src/db';

describe('apps/api db accessor', () => {
  afterEach(async () => {
    await resetDb();
    vi.unstubAllEnvs();
  });

  it('connects via DATABASE_URL, migrates, seeds, and reads back', async () => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    const db = getDb();
    expect(db.dialect).toBe('sqlite');
    expect(getDb()).toBe(db); // singleton

    await db.applyMigrations();
    await seedDev(db, () => 1_700_000_000_000);

    if (db.dialect !== 'sqlite') throw new Error('expected sqlite');
    const rows = await db.sqlite.select().from(appMetaSqlite);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe('seededAt');
  });

  it('fails loudly without DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', '');
    expect(() => getDb()).toThrow(/DATABASE_URL is required/);
  });
});
