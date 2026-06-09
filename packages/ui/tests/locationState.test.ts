import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  type LocationState,
  DEFAULT_LOCATION,
  loadLocation,
  saveLocation,
  clearLocationStorage,
  isValidZip5,
} from '../src/state/locationState';

// ─── localStorage mock ────────────────────────────────────────────────────────

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
};

vi.stubGlobal('localStorage', localStorageMock);

beforeEach(() => {
  // Clear the store before each test
  Object.keys(store).forEach((k) => { delete store[k]; });
});

// ─── isValidZip5 ──────────────────────────────────────────────────────────────

describe('isValidZip5', () => {
  it('accepts a 5-digit string', () => {
    expect(isValidZip5('78701')).toBe(true);
    expect(isValidZip5('00001')).toBe(true);
    expect(isValidZip5('99999')).toBe(true);
  });

  it('rejects non-5-digit strings', () => {
    expect(isValidZip5('')).toBe(false);
    expect(isValidZip5('1234')).toBe(false);
    expect(isValidZip5('123456')).toBe(false);
    expect(isValidZip5('7870a')).toBe(false);
    expect(isValidZip5('ABCDE')).toBe(false);
  });

  it('trims surrounding whitespace before validating', () => {
    expect(isValidZip5('  78701  ')).toBe(true);
  });

  it('rejects strings with only whitespace', () => {
    expect(isValidZip5('     ')).toBe(false);
  });
});

// ─── loadLocation ─────────────────────────────────────────────────────────────

describe('loadLocation', () => {
  it('returns DEFAULT_LOCATION when nothing is stored', () => {
    expect(loadLocation()).toEqual(DEFAULT_LOCATION);
  });

  it('returns stored location', () => {
    const loc: LocationState = { zip: '78701', stateCode: 'TX', label: 'TX · 78701' };
    store['rpe_location'] = JSON.stringify(loc);
    expect(loadLocation()).toEqual(loc);
  });

  it('returns DEFAULT_LOCATION when stored value is invalid JSON', () => {
    store['rpe_location'] = '{not json}';
    expect(loadLocation()).toEqual(DEFAULT_LOCATION);
  });

  it('coerces missing fields to empty strings', () => {
    store['rpe_location'] = JSON.stringify({ zip: '78701' });
    expect(loadLocation()).toEqual({ zip: '78701', stateCode: '', label: '' });
  });

  it('coerces non-string fields to empty strings', () => {
    store['rpe_location'] = JSON.stringify({ zip: 12345, stateCode: null, label: 99 });
    expect(loadLocation()).toEqual({ zip: '', stateCode: '', label: '' });
  });
});

// ─── saveLocation ─────────────────────────────────────────────────────────────

describe('saveLocation', () => {
  it('persists a location to localStorage', () => {
    const loc: LocationState = { zip: '90210', stateCode: 'CA', label: 'CA · 90210' };
    saveLocation(loc);
    expect(store['rpe_location']).toBe(JSON.stringify(loc));
  });

  it('does not throw when localStorage throws', () => {
    const throwingMock = {
      getItem: () => null,
      setItem: () => { throw new Error('quota exceeded'); },
      removeItem: () => {},
    };
    vi.stubGlobal('localStorage', throwingMock);
    expect(() => saveLocation({ zip: '12345', stateCode: '', label: '' })).not.toThrow();
    // Restore
    vi.stubGlobal('localStorage', localStorageMock);
  });
});

// ─── clearLocationStorage ─────────────────────────────────────────────────────

describe('clearLocationStorage', () => {
  it('removes the stored location', () => {
    store['rpe_location'] = JSON.stringify({ zip: '78701', stateCode: 'TX', label: '' });
    clearLocationStorage();
    expect(store['rpe_location']).toBeUndefined();
  });

  it('does not throw when key is absent', () => {
    expect(() => clearLocationStorage()).not.toThrow();
  });
});
