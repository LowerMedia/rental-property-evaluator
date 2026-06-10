/**
 * RPE-69: theme state + ThemeToggle.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  applyTheme,
  getStoredTheme,
  resolveInitialTheme,
  THEME_STORAGE_KEY,
} from '../src/state/theme';
import { ThemeToggle } from '../src/components/ThemeToggle';

function mockMatchMedia(lightPreferred: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('light') ? lightPreferred : !lightPreferred,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('theme state (RPE-69)', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves stored choice over OS preference', () => {
    mockMatchMedia(true); // OS says light
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(resolveInitialTheme()).toBe('dark');
  });

  it('falls back to OS preference, then dark', () => {
    mockMatchMedia(true);
    expect(resolveInitialTheme()).toBe('light');
    mockMatchMedia(false);
    expect(resolveInitialTheme()).toBe('dark');
  });

  it('ignores garbage stored values', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(getStoredTheme()).toBeNull();
    expect(resolveInitialTheme()).toBe('dark');
  });

  it('applyTheme flips the html dataset and persists', () => {
    applyTheme('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });
});

describe('ThemeToggle (RPE-69)', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
    mockMatchMedia(false);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('toggles theme, dataset, persistence, and aria-pressed', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: /Switch to light mode/ });
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(btn);
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.getAttribute('aria-label')).toBe('Switch to dark mode');

    fireEvent.click(btn);
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('initialises from a stored light choice', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /Switch to dark mode/ }).getAttribute('aria-pressed')).toBe('true');
  });
});
