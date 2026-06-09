import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getRentCastKey, setRentCastKey, clearRentCastKey } from '../src/state/connectorStorage';

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

describe('connectorStorage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new LocalStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getRentCastKey returns null when nothing is stored', () => {
    expect(getRentCastKey()).toBeNull();
  });

  it('setRentCastKey + getRentCastKey roundtrip', () => {
    setRentCastKey('rc_live_abc123');
    expect(getRentCastKey()).toBe('rc_live_abc123');
  });

  it('clearRentCastKey makes getRentCastKey return null', () => {
    setRentCastKey('rc_live_abc123');
    clearRentCastKey();
    expect(getRentCastKey()).toBeNull();
  });

  it('setRentCastKey overwrites an existing key', () => {
    setRentCastKey('old_key');
    setRentCastKey('new_key');
    expect(getRentCastKey()).toBe('new_key');
  });

  it('getRentCastKey returns null when localStorage throws', () => {
    const broken = { ...localStorage, getItem: () => { throw new Error('denied'); } };
    vi.stubGlobal('localStorage', broken);
    expect(getRentCastKey()).toBeNull();
    vi.unstubAllGlobals();
  });
});
