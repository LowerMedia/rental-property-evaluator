/**
 * E11 — SQLite schema (RPE-88)
 *
 * Test/local parity twin of schema.pg.ts — same tables, same column
 * names. Dialect caveats (documented):
 *   - timestamps are integer epoch-millis (`mode: 'timestamp_ms'`)
 *     instead of timestamptz; Drizzle maps both to JS Date
 *   - SQLite has no DEFAULT now() with timezone — the default is
 *     unixepoch-based via sql
 * The parity test asserts table/column lockstep with the pg schema.
 */

import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Key/value app metadata — the migration smoke table. */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const sqliteSchema = { appMeta };
