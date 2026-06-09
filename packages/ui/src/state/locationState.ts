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

/** Exported so tests and other modules can reference the key without duplicating the string. */
export const STORAGE_KEY = 'rpe:location:v1';

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
    // Normalise on load: trim whitespace, uppercase stateCode
    const zip = typeof parsed.zip === 'string' ? parsed.zip.trim() : '';
    const stateCode = typeof parsed.stateCode === 'string' ? parsed.stateCode.trim().toUpperCase() : '';
    const label = typeof parsed.label === 'string' ? parsed.label.trim() : '';
    // Guard: if a non-empty zip survived the parse but is not a valid ZIP5, discard the entry.
    // This protects against corrupted/legacy storage that would propagate an invalid ZIP downstream.
    if (zip && !isValidZip5(zip)) return DEFAULT_LOCATION;
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
    const zip = loc.zip.trim();
    // Guard: never persist an invalid ZIP — callers should always pass a valid ZIP5 or ''.
    // This prevents bypassing UI validation from entraining corrupt data in localStorage.
    if (zip && !isValidZip5(zip)) return;
    // Normalise before persisting so stored payload is always clean
    const normalized: LocationState = {
      zip,
      stateCode: loc.stateCode.trim().toUpperCase(),
      label: loc.label.trim(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
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
