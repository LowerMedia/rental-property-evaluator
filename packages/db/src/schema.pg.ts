/**
 * E11 — Postgres schema (RPE-88)
 *
 * Production schema. Drizzle requires dialect-specific table builders,
 * so SQLite test parity lives in schema.sqlite.ts with the SAME tables
 * and columns — the parity test locks the two together (see
 * tests/parity.test.ts). Keep both files in lockstep; that duplication
 * is the documented dialect caveat.
 *
 * Only the smoke table lives here — auth/org tables land with their own
 * stories (RPE-89+, better-auth-generated per ADR 0001).
 */

import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Key/value app metadata — the migration smoke table. */
export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export const pgSchema = { appMeta };
