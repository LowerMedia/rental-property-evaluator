/**
 * E10 Phase 2 — org-scoped deal persistence (RPE-83)
 *
 * Data-access layer for stored deals. Every function takes the org id
 * explicitly and filters on it IN THE QUERY — cross-tenant reads/writes
 * are impossible by construction (the RPE-94 contract), and a miss is
 * indistinguishable between "doesn't exist" and "not yours".
 *
 * `inputs` is the engine's DealInputs as JSON — the engine remains the
 * single source of shape truth; this layer stores and returns it opaque.
 *
 * Dialect note: Drizzle's pg/sqlite builders don't share a callable
 * type, so each operation branches explicitly (same caveat as orgs.ts).
 */

import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { RpeDb } from './client.js';
import { pgSchema } from './schema.pg.js';
import { sqliteSchema } from './schema.sqlite.js';

export interface DealRecord {
  id: string;
  organizationId: string;
  name: string;
  inputs: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface DealPage {
  deals: DealRecord[];
  total: number;
}

export async function createDeal(
  db: RpeDb,
  organizationId: string,
  data: { name: string; inputs: unknown },
): Promise<DealRecord> {
  const now = new Date();
  const record: DealRecord = {
    id: randomUUID(),
    organizationId,
    name: data.name,
    inputs: data.inputs,
    createdAt: now,
    updatedAt: now,
  };
  if (db.dialect === 'postgres') {
    await db.pg.insert(pgSchema.deal).values(record);
  } else {
    await db.sqlite.insert(sqliteSchema.deal).values(record);
  }
  return record;
}

export async function getDeal(
  db: RpeDb,
  organizationId: string,
  dealId: string,
): Promise<DealRecord | null> {
  const rows: DealRecord[] =
    db.dialect === 'postgres'
      ? await db.pg
          .select()
          .from(pgSchema.deal)
          .where(and(eq(pgSchema.deal.id, dealId), eq(pgSchema.deal.organizationId, organizationId)))
          .limit(1)
      : await db.sqlite
          .select()
          .from(sqliteSchema.deal)
          .where(and(eq(sqliteSchema.deal.id, dealId), eq(sqliteSchema.deal.organizationId, organizationId)))
          .limit(1);
  return rows[0] ?? null;
}

export async function listDeals(
  db: RpeDb,
  organizationId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<DealPage> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const rows: DealRecord[] =
    db.dialect === 'postgres'
      ? await db.pg
          .select()
          .from(pgSchema.deal)
          .where(eq(pgSchema.deal.organizationId, organizationId))
          .orderBy(desc(pgSchema.deal.updatedAt))
          .limit(limit)
          .offset(offset)
      : await db.sqlite
          .select()
          .from(sqliteSchema.deal)
          .where(eq(sqliteSchema.deal.organizationId, organizationId))
          .orderBy(desc(sqliteSchema.deal.updatedAt))
          .limit(limit)
          .offset(offset);

  const counted: Array<{ count: number }> =
    db.dialect === 'postgres'
      ? await db.pg
          .select({ count: sql<number>`count(*)` })
          .from(pgSchema.deal)
          .where(eq(pgSchema.deal.organizationId, organizationId))
      : await db.sqlite
          .select({ count: sql<number>`count(*)` })
          .from(sqliteSchema.deal)
          .where(eq(sqliteSchema.deal.organizationId, organizationId));

  return { deals: rows, total: Number(counted[0]?.count ?? 0) };
}

export async function updateDeal(
  db: RpeDb,
  organizationId: string,
  dealId: string,
  patch: { name?: string; inputs?: unknown },
): Promise<DealRecord | null> {
  const existing = await getDeal(db, organizationId, dealId);
  if (existing === null) return null;

  const values = {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.inputs !== undefined ? { inputs: patch.inputs } : {}),
    updatedAt: new Date(),
  };
  if (db.dialect === 'postgres') {
    await db.pg
      .update(pgSchema.deal)
      .set(values)
      .where(and(eq(pgSchema.deal.id, dealId), eq(pgSchema.deal.organizationId, organizationId)));
  } else {
    await db.sqlite
      .update(sqliteSchema.deal)
      .set(values)
      .where(and(eq(sqliteSchema.deal.id, dealId), eq(sqliteSchema.deal.organizationId, organizationId)));
  }
  return getDeal(db, organizationId, dealId);
}

export async function deleteDeal(
  db: RpeDb,
  organizationId: string,
  dealId: string,
): Promise<boolean> {
  const existing = await getDeal(db, organizationId, dealId);
  if (existing === null) return false;
  if (db.dialect === 'postgres') {
    await db.pg
      .delete(pgSchema.deal)
      .where(and(eq(pgSchema.deal.id, dealId), eq(pgSchema.deal.organizationId, organizationId)));
  } else {
    await db.sqlite
      .delete(sqliteSchema.deal)
      .where(and(eq(sqliteSchema.deal.id, dealId), eq(sqliteSchema.deal.organizationId, organizationId)));
  }
  return true;
}
