/**
 * E-misc — runtime light/dark theme state (RPE-69)
 *
 * The palette itself lives in apps/web/src/index.css: the default
 * Midnight Ledger variables on :root and a light override on
 * html[data-theme="light"]. This module owns the STATE: resolve the
 * initial theme (stored choice → OS preference → dark), persist explicit
 * choices, and flip the html dataset attribute.
 *
 * index.html runs an inline pre-paint bootstrap with the same logic so
 * the first frame is already correct — keep the two in sync.
 */

export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'rpe_theme';

function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

/** Explicit stored choice, or null when the user never chose. */
export function getStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : null;
  } catch {
    return null; // private browsing / SSR
  }
}

/** Stored choice → OS preference → dark. */
export function resolveInitialTheme(): Theme {
  const stored = getStoredTheme();
  if (stored !== null) return stored;
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Flip the live theme and persist the explicit choice. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // storage unavailable — theme still applies for this session
  }
}
