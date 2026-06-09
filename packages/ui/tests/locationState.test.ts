import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  type LocationState,
  DEFAULT_LOCATION,
  STORAGE_KEY,
  loadLocation,
  saveLocation,
  clearLocationStorage,
  isValidZip5,
  extractZip,
} from '../src/state/locationState';

// ─── localStorage mock ────────────────────────────────────────────────────────

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
};

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageMock);
  // Reset store before each test so tests are order-independent
  Object.keys(store).forEach((k) => { delete store[k]; });
});

afterEach(() => {
  vi.unstubAllGlobals();
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

// ─── extractZip ───────────────────────────────────────────────────────────────

describe('extractZip', () => {
  it('accepts a plain ZIP5', () => {
    expect(extractZip('78701')).toBe('78701');
    expect(extractZip('  78701  ')).toBe('78701');
  });

  it('rejects all-digit input of the wrong length (no silent truncation)', () => {
    expect(extractZip('1234')).toBe('');
    expect(extractZip('123456')).toBe('');
  });

  it('extracts the ZIP5 prefix from ZIP+4', () => {
    expect(extractZip('78701-1234')).toBe('78701');
    expect(extractZip('  78701-1234  ')).toBe('78701');
  });

  it('rejects a malformed +4 suffix', () => {
    expect(extractZip('78701-12')).toBe('');
  });

  it('extracts a trailing ZIP5 from "City, ST XXXXX" input', () => {
    expect(extractZip('Austin, TX 78701')).toBe('78701');
    expect(extractZip('Austin, TX 78701-1234')).toBe('78701');
  });

  it('never extracts a ZIP from a longer trailing digit run', () => {
    expect(extractZip('City, ST 123456')).toBe('');
  });

  it('returns empty string when no ZIP is present', () => {
    expect(extractZip('')).toBe('');
    expect(extractZip('Austin, TX')).toBe('');
  });
});

// ─── loadLocation ─────────────────────────────────────────────────────────────

describe('loadLocation', () => {
  it('returns DEFAULT_LOCATION when nothing is stored', () => {
    expect(loadLocation()).toEqual(DEFAULT_LOCATION);
  });

  it('returns stored location', () => {
    const loc: LocationState = { zip: '78701', stateCode: 'TX', label: 'TX · 78701' };
    store[STORAGE_KEY] = JSON.stringify(loc);
    expect(loadLocation()).toEqual(loc);
  });

  it('returns DEFAULT_LOCATION when stored value is invalid JSON', () => {
    store[STORAGE_KEY] = '{not json}';
    expect(loadLocation()).toEqual(DEFAULT_LOCATION);
  });

  it('coerces missing fields to empty strings', () => {
    store[STORAGE_KEY] = JSON.stringify({ zip: '78701' });
    expect(loadLocation()).toEqual({ zip: '78701', stateCode: '', label: '' });
  });

  it('coerces non-string fields to empty strings', () => {
    store[STORAGE_KEY] = JSON.stringify({ zip: 12345, stateCode: null, label: 99 });
    expect(loadLocation()).toEqual({ zip: '', stateCode: '', label: '' });
  });

  it('trims whitespace and uppercases stateCode on load', () => {
    store[STORAGE_KEY] = JSON.stringify({ zip: ' 78701 ', stateCode: 'tx', label: ' TX · 78701 ' });
    expect(loadLocation()).toEqual({ zip: '78701', stateCode: 'TX', label: 'TX · 78701' });
  });

  it('returns DEFAULT_LOCATION when stored zip is non-empty but not a valid ZIP5', () => {
    // A corrupt/legacy entry with an invalid ZIP should be discarded entirely
    store[STORAGE_KEY] = JSON.stringify({ zip: '1234', stateCode: 'TX', label: '' });
    expect(loadLocation()).toEqual(DEFAULT_LOCATION);
  });
});

// ─── saveLocation ─────────────────────────────────────────────────────────────

describe('saveLocation', () => {
  it('persists a location to localStorage', () => {
    const loc: LocationState = { zip: '90210', stateCode: 'CA', label: 'CA · 90210' };
    saveLocation(loc);
    expect(store[STORAGE_KEY]).toBe(JSON.stringify(loc));
  });

  it('normalises whitespace and casing before persisting', () => {
    saveLocation({ zip: ' 78701 ', stateCode: 'tx', label: ' TX · 78701 ' });
    const stored = JSON.parse(store[STORAGE_KEY]!) as LocationState;
    expect(stored).toEqual({ zip: '78701', stateCode: 'TX', label: 'TX · 78701' });
  });

  it('does not throw when localStorage throws', () => {
    const throwingMock = {
      getItem: () => null,
      setItem: () => { throw new Error('quota exceeded'); },
      removeItem: () => {},
    };
    vi.stubGlobal('localStorage', throwingMock);
    expect(() => saveLocation({ zip: '12345', stateCode: '', label: '' })).not.toThrow();
    // afterEach will unstubAllGlobals; no manual restore needed
  });

  it('does not persist when zip is non-empty but not a valid ZIP5', () => {
    // Guard: callers that bypass UI validation should not corrupt localStorage
    saveLocation({ zip: '1234', stateCode: 'TX', label: '' });
    expect(store[STORAGE_KEY]).toBeUndefined();
  });
});

// ─── clearLocationStorage ─────────────────────────────────────────────────────

describe('clearLocationStorage', () => {
  it('removes the stored location', () => {
    store[STORAGE_KEY] = JSON.stringify({ zip: '78701', stateCode: 'TX', label: '' });
    clearLocationStorage();
    expect(store[STORAGE_KEY]).toBeUndefined();
  });

  it('does not throw when key is absent', () => {
    expect(() => clearLocationStorage()).not.toThrow();
  });
});
