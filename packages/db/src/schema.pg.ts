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

import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Key/value app metadata — the migration smoke table. */
export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

/**
 * E10 Phase 2 (RPE-83) — org-scoped stored deals. `inputs` is the
 * engine's DealInputs as JSON; the engine stays the single source of
 * shape truth, so the DB column is schemaless on purpose.
 */
export const deal = pgTable('deal', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  name: text('name').notNull(),
  inputs: jsonb('inputs').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

/**
 * RPE-83 — DB-backed API keys (RPE-75 model: sha256 hash at rest),
 * attached to an organization per the one-identity-layer decision.
 */
export const apiKey = pgTable('api_key', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  label: text('label').notNull(),
  hash: text('hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
});

import { account as authAccountPg, invitation as authInvitationPg, member as authMemberPg, organization as authOrganizationPg, session as authSessionPg, user as authUserPg, verification as authVerificationPg } from './schema.auth.pg.js';

export const pgSchema = {
  appMeta,
  user: authUserPg,
  session: authSessionPg,
  account: authAccountPg,
  verification: authVerificationPg,
  organization: authOrganizationPg,
  member: authMemberPg,
  invitation: authInvitationPg,
  deal,
  apiKey,
};
