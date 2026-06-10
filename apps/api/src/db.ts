/**
 * E11 — apps/api database accessor (RPE-88)
 *
 * Lazy singleton over @rpe/db: nothing connects until the first feature
 * actually needs the database (auth/org stories, RPE-83 stored deals),
 * so the zero-DB deployment of the v1 surface keeps working unchanged.
 */

import { createDb, type RpeDb } from '@rpe/db';

let instance: RpeDb | null = null;

/** Connect (once) using DATABASE_URL. Throws if the env is unset. */
export function getDb(): RpeDb {
  instance ??= createDb();
  return instance;
}

/** Test hook: close and forget the singleton. */
export async function resetDb(): Promise<void> {
  if (instance !== null) {
    await instance.close();
    instance = null;
  }
}
