/**
 * E11 — membership lookups + org-scoped helpers (RPE-94)
 *
 * The data-layer half of tenant isolation: membership resolution for
 * the request middleware, and an OrgScope that makes org-filtering the
 * default for row access (hard to forget — cross-org rows throw).
 */

import { and, eq } from 'drizzle-orm';
import type { RpeDb } from './client.js';
import { pgSchema } from './schema.pg.js';
import { sqliteSchema } from './schema.sqlite.js';

export type OrgRole = 'member' | 'admin' | 'owner';

const ROLE_RANK: Record<OrgRole, number> = { member: 1, admin: 2, owner: 3 };

export function roleAtLeast(role: OrgRole, min: OrgRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export interface Membership {
  organizationId: string;
  userId: string;
  role: OrgRole;
}

/** Look up a user's membership in an org — null when not a member. */
export async function findMembership(
  db: RpeDb,
  userId: string,
  organizationId: string,
): Promise<Membership | null> {
  const rows =
    db.dialect === 'postgres'
      ? await db.pg
          .select({
            organizationId: pgSchema.member.organizationId,
            userId: pgSchema.member.userId,
            role: pgSchema.member.role,
          })
          .from(pgSchema.member)
          .where(and(eq(pgSchema.member.userId, userId), eq(pgSchema.member.organizationId, organizationId)))
          .limit(1)
      : await db.sqlite
          .select({
            organizationId: sqliteSchema.member.organizationId,
            userId: sqliteSchema.member.userId,
            role: sqliteSchema.member.role,
          })
          .from(sqliteSchema.member)
          .where(and(eq(sqliteSchema.member.userId, userId), eq(sqliteSchema.member.organizationId, organizationId)))
          .limit(1);

  const row = rows[0];
  if (row === undefined) return null;
  return { organizationId: row.organizationId, userId: row.userId, role: row.role as OrgRole };
}

/** All org ids a user belongs to (with roles) — e.g. for org pickers. */
export async function listMemberships(db: RpeDb, userId: string): Promise<Membership[]> {
  const rows =
    db.dialect === 'postgres'
      ? await db.pg
          .select({
            organizationId: pgSchema.member.organizationId,
            userId: pgSchema.member.userId,
            role: pgSchema.member.role,
          })
          .from(pgSchema.member)
          .where(eq(pgSchema.member.userId, userId))
      : await db.sqlite
          .select({
            organizationId: sqliteSchema.member.organizationId,
            userId: sqliteSchema.member.userId,
            role: sqliteSchema.member.role,
          })
          .from(sqliteSchema.member)
          .where(eq(sqliteSchema.member.userId, userId));
  return rows.map((r) => ({ organizationId: r.organizationId, userId: r.userId, role: r.role as OrgRole }));
}

/** Thrown when code touches a row outside the current org. */
export class TenantIsolationError extends Error {
  constructor(message = 'Row belongs to a different organization') {
    super(message);
    this.name = 'TenantIsolationError';
  }
}

/**
 * Org-scoped row helpers: every org-owned row carries organizationId
 * (E10 stored deals included, per RPE-93); routing access through an
 * OrgScope makes cross-org access throw instead of leak.
 */
export class OrgScope {
  constructor(readonly organizationId: string) {}

  /** Assert a row belongs to this org — returns it typed, else throws. */
  assertOwned<T extends { organizationId: string }>(row: T): T {
    if (row.organizationId !== this.organizationId) throw new TenantIsolationError();
    return row;
  }

  /** Drop rows that belong to other orgs (defense in depth after a query). */
  filter<T extends { organizationId: string }>(rows: T[]): T[] {
    return rows.filter((r) => r.organizationId === this.organizationId);
  }

  /** Stamp a new row with the scope's org id (writes can't cross orgs). */
  stamp<T extends object>(row: T): T & { organizationId: string } {
    return { ...row, organizationId: this.organizationId };
  }
}
