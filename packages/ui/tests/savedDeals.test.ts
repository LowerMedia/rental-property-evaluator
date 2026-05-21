import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createEmptyStore,
  loadStore,
  persistStore,
  migrateStore,
  SCHEMA_VERSION,
  STORAGE_KEY,
} from '../src/state/savedDealsSchema';
import type { SavedDealsStore } from '../src/state/savedDealsSchema';
import { DEFAULT_INPUTS } from '../src/state/defaultInputs';

// ─── localStorage stub ────────────────────────────────────────────────────────

class LocalStorageMock {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key)
      ? (this.store[key] ?? null)
      : null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = value;
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new LocalStorageMock());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── createEmptyStore ─────────────────────────────────────────────────────────

describe('createEmptyStore', () => {
  it('returns the current schema version', () => {
    expect(createEmptyStore().schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('returns an empty deals array', () => {
    expect(createEmptyStore().deals).toEqual([]);
  });
});

// ─── migrateStore ─────────────────────────────────────────────────────────────

describe('migrateStore', () => {
  it('returns a valid store unchanged', () => {
    const store: SavedDealsStore = { schemaVersion: 1, deals: [] };
    expect(migrateStore(store)).toEqual(store);
  });

  it('returns empty store for null', () => {
    expect(migrateStore(null)).toEqual(createEmptyStore());
  });

  it('returns empty store for a plain string', () => {
    expect(migrateStore('garbage')).toEqual(createEmptyStore());
  });

  it('returns empty store when schemaVersion is missing', () => {
    expect(migrateStore({ deals: [] })).toEqual(createEmptyStore());
  });

  it('returns empty store when schemaVersion is wrong', () => {
    expect(migrateStore({ schemaVersion: 99, deals: [] })).toEqual(createEmptyStore());
  });

  it('returns empty store when deals is not an array', () => {
    expect(migrateStore({ schemaVersion: 1, deals: 'bad' })).toEqual(createEmptyStore());
  });

  it('preserves deals array when store is valid', () => {
    const deal = {
      id: 'deal_abc',
      name: 'Test',
      savedAt: 1_000_000,
      inputs: DEFAULT_INPUTS,
    };
    const store: SavedDealsStore = { schemaVersion: 1, deals: [deal] };
    expect(migrateStore(store).deals).toHaveLength(1);
    expect(migrateStore(store).deals[0]?.name).toBe('Test');
  });
});

// ─── loadStore ────────────────────────────────────────────────────────────────

describe('loadStore', () => {
  it('returns empty store when localStorage is empty', () => {
    expect(loadStore()).toEqual(createEmptyStore());
  });

  it('returns empty store when stored value is invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{invalid json}');
    expect(loadStore()).toEqual(createEmptyStore());
  });

  it('returns empty store when stored schema version is unknown', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 99, deals: [] }));
    expect(loadStore()).toEqual(createEmptyStore());
  });

  it('rehydrates a valid stored store', () => {
    const store: SavedDealsStore = {
      schemaVersion: 1,
      deals: [
        { id: 'x', name: 'My Deal', savedAt: 1_234_567_890, inputs: DEFAULT_INPUTS },
      ],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    const loaded = loadStore();
    expect(loaded.schemaVersion).toBe(1);
    expect(loaded.deals).toHaveLength(1);
    expect(loaded.deals[0]?.name).toBe('My Deal');
  });

  it('returns empty store when STORAGE_KEY is absent (null)', () => {
    // Key was never set — getItem returns null
    const result = loadStore();
    expect(result).toEqual(createEmptyStore());
  });
});

// ─── persistStore ─────────────────────────────────────────────────────────────

describe('persistStore', () => {
  it('writes serialised store to localStorage', () => {
    const store = createEmptyStore();
    persistStore(store);
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(store);
  });

  it('round-trips a store with deals', () => {
    const store: SavedDealsStore = {
      schemaVersion: 1,
      deals: [
        { id: 'a1', name: 'Duplex', savedAt: 999, inputs: DEFAULT_INPUTS },
      ],
    };
    persistStore(store);
    const loaded = loadStore();
    expect(loaded.deals[0]?.id).toBe('a1');
    expect(loaded.deals[0]?.name).toBe('Duplex');
  });

  it('overwrites a previous write', () => {
    const first = createEmptyStore();
    persistStore(first);

    const second: SavedDealsStore = {
      schemaVersion: 1,
      deals: [{ id: 'z', name: 'New', savedAt: 1, inputs: DEFAULT_INPUTS }],
    };
    persistStore(second);

    const loaded = loadStore();
    expect(loaded.deals).toHaveLength(1);
    expect(loaded.deals[0]?.id).toBe('z');
  });

  it('does not throw when localStorage throws (quota exceeded simulation)', () => {
    const faultyStorage = new LocalStorageMock();
    faultyStorage.setItem = () => {
      throw new DOMException('QuotaExceededError');
    };
    vi.stubGlobal('localStorage', faultyStorage);
    expect(() => persistStore(createEmptyStore())).not.toThrow();
  });
});
