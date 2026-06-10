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

/** E10 Phase 2 (RPE-83) — org-scoped stored deals (see schema.pg.ts). */
export const dealLite = sqliteTable('deal', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  name: text('name').notNull(),
  inputs: text('inputs', { mode: 'json' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** RPE-83 — DB-backed API keys (see schema.pg.ts). */
export const apiKeyLite = sqliteTable('api_key', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  label: text('label').notNull(),
  hash: text('hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
});

import { account as authAccountLite, invitation as authInvitationLite, member as authMemberLite, organization as authOrganizationLite, session as authSessionLite, user as authUserLite, verification as authVerificationLite } from './schema.auth.sqlite.js';

export const sqliteSchema = {
  appMeta,
  user: authUserLite,
  session: authSessionLite,
  account: authAccountLite,
  verification: authVerificationLite,
  organization: authOrganizationLite,
  member: authMemberLite,
  invitation: authInvitationLite,
  deal: dealLite,
  apiKey: apiKeyLite,
};
