/**
 * RPE-83: deal persistence — CRUD round-trips, JSON inputs fidelity,
 * pagination, and the tenant-scoping contract (org-filtered queries:
 * cross-org access is a uniform miss, never a leak).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createDb,
  createDeal,
  deleteDeal,
  getDeal,
  listDeals,
  updateDeal,
  type RpeDb,
} from '../src/index';

let db: RpeDb;

const INPUTS = { purchasePrice: 300000, grossRent: 2200, vacancyPct: 5 };

beforeAll(async () => {
  db = createDb(':memory:');
  await db.applyMigrations();
});

afterAll(() => db.close());

describe('deal persistence (RPE-83)', () => {
  it('creates and round-trips a deal with JSON inputs intact', async () => {
    const deal = await createDeal(db, 'org-a', { name: 'Maple St duplex', inputs: INPUTS });
    expect(deal.id).toMatch(/^[0-9a-f-]{36}$/);

    const fetched = await getDeal(db, 'org-a', deal.id);
    expect(fetched?.name).toBe('Maple St duplex');
    expect(fetched?.inputs).toEqual(INPUTS);
    expect(fetched?.createdAt).toBeInstanceOf(Date);
  });

  it('tenant scoping: another org gets a miss for the same id — read, update, and delete', async () => {
    const deal = await createDeal(db, 'org-a', { name: 'Private', inputs: INPUTS });

    expect(await getDeal(db, 'org-b', deal.id)).toBeNull();
    expect(await updateDeal(db, 'org-b', deal.id, { name: 'stolen' })).toBeNull();
    expect(await deleteDeal(db, 'org-b', deal.id)).toBe(false);

    // untouched for the owner
    const still = await getDeal(db, 'org-a', deal.id);
    expect(still?.name).toBe('Private');
  });

  it('updates name/inputs and bumps updatedAt; delete removes the row', async () => {
    const deal = await createDeal(db, 'org-a', { name: 'v1', inputs: INPUTS });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await updateDeal(db, 'org-a', deal.id, {
      name: 'v2',
      inputs: { ...INPUTS, grossRent: 2400 },
    });
    expect(updated?.name).toBe('v2');
    expect((updated?.inputs as { grossRent: number }).grossRent).toBe(2400);
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(deal.updatedAt.getTime());

    expect(await deleteDeal(db, 'org-a', deal.id)).toBe(true);
    expect(await getDeal(db, 'org-a', deal.id)).toBeNull();
  });

  it('lists only the org\'s deals, newest-updated first, with total + pagination', async () => {
    const fresh = createDb(':memory:');
    await fresh.applyMigrations();
    try {
      for (let i = 0; i < 5; i++) {
        await createDeal(fresh, 'org-mine', { name: `deal-${i}`, inputs: INPUTS });
      }
      await createDeal(fresh, 'org-other', { name: 'not-mine', inputs: INPUTS });

      const page = await listDeals(fresh, 'org-mine', { limit: 3 });
      expect(page.total).toBe(5);
      expect(page.deals).toHaveLength(3);
      expect(page.deals.every((d) => d.organizationId === 'org-mine')).toBe(true);

      const rest = await listDeals(fresh, 'org-mine', { limit: 3, offset: 3 });
      expect(rest.deals).toHaveLength(2);
    } finally {
      await fresh.close();
    }
  });
});
