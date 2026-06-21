// @vitest-environment jsdom
/**
 * RPE-110 — last-used view mode persistence + first-run Simple default.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getStoredMode,
  resolveInitialMode,
  persistMode,
  MODE_STORAGE_KEY,
} from '../src/state/modePreference';

beforeEach(() => localStorage.clear());

describe('modePreference (RPE-110)', () => {
  it('first run (no stored, no shared) defaults to Simple / Screener', () => {
    expect(getStoredMode()).toBeNull();
    expect(resolveInitialMode()).toEqual({ uiMode: 'simple', proFormaMode: false });
  });

  it('persist + restore round-trips the last-used mode', () => {
    persistMode({ uiMode: 'complex', proFormaMode: true });
    expect(getStoredMode()).toEqual({ uiMode: 'complex', proFormaMode: true });
    expect(resolveInitialMode()).toEqual({ uiMode: 'complex', proFormaMode: true });
  });

  it('never restores simple + pro-forma (pro-forma needs complex inputs)', () => {
    localStorage.setItem(MODE_STORAGE_KEY, JSON.stringify({ uiMode: 'simple', proFormaMode: true }));
    expect(getStoredMode()).toEqual({ uiMode: 'simple', proFormaMode: false });
  });

  it('ignores malformed stored values', () => {
    localStorage.setItem(MODE_STORAGE_KEY, 'not json');
    expect(getStoredMode()).toBeNull();
    localStorage.setItem(MODE_STORAGE_KEY, JSON.stringify({ uiMode: 'banana' }));
    expect(getStoredMode()).toBeNull();
  });

  it('a shared-link mode overrides the persisted default', () => {
    persistMode({ uiMode: 'complex', proFormaMode: false });
    expect(resolveInitialMode({ uiMode: 'simple', proFormaMode: false })).toEqual({
      uiMode: 'simple',
      proFormaMode: false,
    });
  });
});
