/**
 * RPE-110 — last-used view mode (uiMode + proFormaMode) persistence.
 *
 * First-run default is Simple / Screener (the fast triage path); thereafter the
 * last-used mode is restored. Persisted to localStorage, so it survives across
 * sessions for both anonymous and signed-in users on the same browser. (Account-
 * scoped cross-device sync would need a server-side preference store — follow-up.)
 *
 * A shared-scenario link (?s=) may carry its own mode (?m=) which overrides the
 * persisted default at the call site — see resolveInitialMode().
 */

import type { UiMode } from './uiMode';

export const MODE_STORAGE_KEY = 'rpe_mode';

export interface ModePreference {
  uiMode: UiMode;
  proFormaMode: boolean;
}

const FIRST_RUN_DEFAULT: ModePreference = { uiMode: 'simple', proFormaMode: false };

function isUiMode(value: unknown): value is UiMode {
  return value === 'simple' || value === 'complex';
}

/** Stored last-used mode, or null when the user never set one. */
export function getStoredMode(): ModePreference | null {
  try {
    const raw = localStorage.getItem(MODE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ModePreference>;
    if (!isUiMode(parsed.uiMode)) return null;
    // Pro-forma requires complex inputs; never restore simple + pro-forma.
    const proFormaMode = parsed.uiMode === 'complex' && Boolean(parsed.proFormaMode);
    return { uiMode: parsed.uiMode, proFormaMode };
  } catch {
    return null; // private browsing / SSR
  }
}

/**
 * Initial mode for a fresh load. A shared-link mode (when present) overrides the
 * persisted default; otherwise the stored mode, falling back to first-run Simple.
 */
export function resolveInitialMode(sharedMode?: ModePreference | null): ModePreference {
  if (sharedMode) return sharedMode;
  return getStoredMode() ?? FIRST_RUN_DEFAULT;
}

/** Persist the last-used mode. */
export function persistMode(pref: ModePreference): void {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, JSON.stringify(pref));
  } catch {
    // storage unavailable — mode still applies for this session
  }
}
