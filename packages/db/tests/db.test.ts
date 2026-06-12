/**
 * RPE-88: DB foundation — SQLite round-trip (hermetic), pg/sqlite schema
 * parity lock, and the Postgres path when DATABASE_URL is provided.
 */

import { describe, it, expect } from 'vitest';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { createDb, resolveDialect, pgSsl, pgSchema, sqliteSchema, appMetaSqlite } from '../src/index';

describe('resolveDialect', () => {
  it('recognizes postgres and sqlite DSNs and rejects garbage', () => {
    expect(resolveDialect('postgres://u:p@h:5432/db')).toBe('postgres');
    expect(resolveDialect('postgresql://u:p@h/db')).toBe('postgres');
    expect(resolveDialect(':memory:')).toBe('sqlite');
    expect(resolveDialect('file:/tmp/rpe.db')).toBe('sqlite');
    expect(resolveDialect('./local.sqlite')).toBe('sqlite');
    expect(() => resolveDialect('mysql://nope')).toThrow(/Unrecognized DATABASE_URL/);
    expect(() => createDb('')).toThrow(/DATABASE_URL is required/);
  });
});

describe('pgSsl (DATABASE_CA_CERT plumbing, RPE-98)', () => {
  it('returns verified-TLS options only when a CA cert is provided', () => {
    expect(pgSsl(undefined)).toBeUndefined();
    expect(pgSsl('')).toBeUndefined();
    expect(pgSsl('   ')).toBeUndefined();
    expect(pgSsl('-----BEGIN CERTIFICATE-----\nabc')).toEqual({
      ca: '-----BEGIN CERTIFICATE-----\nabc',
      rejectUnauthorized: true,
    });
  });
});

describe('SQLite (hermetic test engine)', () => {
  it('applies checked-in migrations and round-trips the smoke table', async () => {
    const db = createDb(':memory:');
    expect(db.dialect).toBe('sqlite');
    try {
      await db.applyMigrations();

      if (db.dialect !== 'sqlite') throw new Error('expected sqlite');
      const conn = db.sqlite;
      await conn.insert(appMetaSqlite).values({ key: 'smoke', value: 'ok' });
      const rows = await conn.select().from(appMetaSqlite);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ key: 'smoke', value: 'ok' });
      expect(rows[0]?.updatedAt).toBeInstanceOf(Date);

      // Re-applying is idempotent (drizzle journal)
      await db.applyMigrations();
      expect(await conn.select().from(appMetaSqlite)).toHaveLength(1);
    } finally {
      await db.close();
    }
  });
});

describe('pg/sqlite schema parity (the dialect-duplication lock)', () => {
  it('both schemas declare identical tables and column names', () => {
    const pgTables = Object.entries(pgSchema);
    const liteTables = Object.entries(sqliteSchema);
    expect(pgTables.map(([k]) => k).sort()).toEqual(liteTables.map(([k]) => k).sort());

    for (const [key, pgTable] of pgTables) {
      const liteTable = (sqliteSchema as Record<string, (typeof liteTables)[number][1]>)[key]!;
      expect(getTableName(liteTable), key).toBe(getTableName(pgTable));
      const pgCols = Object.keys(getTableColumns(pgTable)).sort();
      const liteCols = Object.keys(getTableColumns(liteTable)).sort();
      expect(liteCols, `${key} columns`).toEqual(pgCols);
    }
  });
});

describe('Postgres (only when DATABASE_URL is provided)', () => {
  const url = process.env['DATABASE_URL'];
  it.skipIf(url === undefined || !/^postgres/i.test(url))(
    'applies migrations and round-trips against the real database',
    async () => {
      const db = createDb(url);
      expect(db.dialect).toBe('postgres');
      try {
        await db.applyMigrations();
        const { appMetaPg } = await import('../src/index');
        if (db.dialect !== 'postgres') throw new Error('expected postgres');
        const conn = db.pg;
        await conn
          .insert(appMetaPg)
          .values({ key: 'smoke', value: 'ok' })
          .onConflictDoUpdate({ target: appMetaPg.key, set: { value: 'ok' } });
        const rows = await conn.select().from(appMetaPg);
        expect(rows.some((r) => r.key === 'smoke')).toBe(true);
      } finally {
        await db.close();
      }
    },
  );
});
