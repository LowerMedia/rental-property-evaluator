/**
 * E11 — local-dev seed (RPE-88)
 *
 * Idempotent: stamps the smoke table so a fresh local database is
 * visibly initialized. Run via:
 *   DATABASE_URL=file:./local.db npx tsx -e \
 *     "import('./packages/db/src/index.ts').then(async m => { const db = m.createDb(); await db.applyMigrations(); await m.seedDev(db); await db.close(); })"
 */

import { appMeta as appMetaPg } from './schema.pg.js';
import { appMeta as appMetaSqlite } from './schema.sqlite.js';
import type { RpeDb } from './client.js';

export async function seedDev(db: RpeDb, now: () => number = Date.now): Promise<void> {
  const stamp = new Date(now()).toISOString();
  if (db.dialect === 'postgres') {
    await db.pg
      .insert(appMetaPg)
      .values({ key: 'seededAt', value: stamp })
      .onConflictDoUpdate({ target: appMetaPg.key, set: { value: stamp } });
    return;
  }
  await db.sqlite
    .insert(appMetaSqlite)
    .values({ key: 'seededAt', value: stamp })
    .onConflictDoUpdate({ target: appMetaSqlite.key, set: { value: stamp } });
}
