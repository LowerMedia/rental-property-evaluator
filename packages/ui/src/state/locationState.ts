/**
 * E9 — Location state for regional assumption defaults (RPE-64)
 *
 * Stores the user's chosen location (ZIP5) and the resolved region info
 * returned by apps/api /region. Persisted to localStorage so the last-used
 * location survives page reloads.
 *
 * Resolution lifecycle:
 *   1. User enters ZIP5 → { zip, stateCode: '', label: '' }  (unresolved)
 *   2. useLocationDefaults resolves → { zip, stateCode: 'TX', label: 'TX · 78701' }
 *   3. User clears → DEFAULT_LOCATION
 *
 * The stateCode and label fields are derived from the apps/api /region response
 * and are cached here for display purposes. They are never trusted for data
 * lookup — the API always re-resolves from the zip.
 */

export interface LocationState {
  /** Raw ZIP5 string (e.g. '78701'). Empty string means no location set. */
  zip: string;
  /** 2-letter US state code returned by the region API. Empty until resolved. */
  stateCode: string;
  /** Human-readable label for display (e.g. 'TX · 78701'). Empty until resolved. */
  label: string;
}

export const DEFAULT_LOCATION: LocationState = {
  zip: '',
  stateCode: '',
  label: '',
};

const STORAGE_KEY = 'rpe_location';

// ─── Persistence ──────────────────────────────────────────────────────────────

/**
 * Load the persisted location from localStorage.
 * Returns DEFAULT_LOCATION if nothing is stored or parsing fails.
 */
export function loadLocation(): LocationState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LOCATION;
    const parsed = JSON.parse(raw) as Partial<LocationState>;
    const zip = typeof parsed.zip === 'string' ? parsed.zip : '';
    const stateCode = typeof parsed.stateCode === 'string' ? parsed.stateCode : '';
    const label = typeof parsed.label === 'string' ? parsed.label : '';
    return { zip, stateCode, label };
  } catch {
    return DEFAULT_LOCATION;
  }
}

/**
 * Persist the location to localStorage.
 * Silently ignores storage errors (private browsing, quota exceeded, etc.).
 */
export function saveLocation(loc: LocationState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
  } catch {
    // ignore
  }
}

/**
 * Remove the persisted location from localStorage.
 */
export function clearLocationStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Returns true if the value is a valid 5-digit US ZIP code. */
export function isValidZip5(value: string): boolean {
  return /^\d{5}$/.test(value.trim());
}
