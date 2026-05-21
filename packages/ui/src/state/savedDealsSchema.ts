import type { DealInputs } from '@rpe/engine';

// ─── Schema ───────────────────────────────────────────────────────────────────

export const STORAGE_KEY = 'rpe:deals:v1';
export const SCHEMA_VERSION = 1 as const;

export interface SavedDeal {
  id: string;
  name: string;
  savedAt: number; // Date.now()
  inputs: DealInputs;
}

export interface SavedDealsStore {
  schemaVersion: typeof SCHEMA_VERSION;
  deals: SavedDeal[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function createEmptyStore(): SavedDealsStore {
  return { schemaVersion: SCHEMA_VERSION, deals: [] };
}

/**
 * Migrate a raw parsed value to the current store shape.
 *
 * Strategy: accept only stores that already carry the current schemaVersion.
 * All other shapes (legacy, corrupt, future) are discarded and replaced with
 * an empty store.  As new versions are introduced, add an upgrade path here
 * before bumping SCHEMA_VERSION.
 */
export function migrateStore(raw: unknown): SavedDealsStore {
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'schemaVersion' in raw &&
    (raw as Record<string, unknown>)['schemaVersion'] === SCHEMA_VERSION &&
    'deals' in raw &&
    Array.isArray((raw as Record<string, unknown>)['deals'])
  ) {
    return raw as SavedDealsStore;
  }
  return createEmptyStore();
}

/** Read the store from localStorage; returns an empty store on any failure. */
export function loadStore(): SavedDealsStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyStore();
    return migrateStore(JSON.parse(raw) as unknown);
  } catch {
    return createEmptyStore();
  }
}

/** Persist the store to localStorage; silently swallows quota / security errors. */
export function persistStore(store: SavedDealsStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage unavailable or quota exceeded — degrade gracefully
  }
}
