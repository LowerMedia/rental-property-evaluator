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

// ─── Normalisation ────────────────────────────────────────────────────────────

/**
 * Normalise a (possibly partial/untrusted) location: trim all fields, uppercase
 * stateCode. Single source of truth for the load and save paths so the
 * round-trip invariant can't drift.
 */
function normalizeLocation(loc: Partial<LocationState>): LocationState {
  return {
    zip: typeof loc.zip === 'string' ? loc.zip.trim() : '',
    stateCode: typeof loc.stateCode === 'string' ? loc.stateCode.trim().toUpperCase() : '',
    label: typeof loc.label === 'string' ? loc.label.trim() : '',
  };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

/**
 * Load the persisted location from localStorage.
 * Returns DEFAULT_LOCATION if nothing is stored or parsing fails.
 */
export function loadLocation(): LocationState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LOCATION;
    const normalized = normalizeLocation(JSON.parse(raw) as Partial<LocationState>);
    // Guard: if a non-empty zip survived the parse but is not a valid ZIP5, discard the entry.
    // This protects against corrupted/legacy storage that would propagate an invalid ZIP downstream.
    if (normalized.zip && !isValidZip5(normalized.zip)) return DEFAULT_LOCATION;
    return normalized;
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
    const normalized = normalizeLocation(loc);
    // Guard: never persist an invalid ZIP — callers should always pass a valid ZIP5 or ''.
    // This prevents bypassing UI validation from entraining corrupt data in localStorage.
    if (normalized.zip && !isValidZip5(normalized.zip)) return;
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

/**
 * Extract a ZIP5 from free-form location input.
 *
 * Accepts plain ZIP5 ("78701"), ZIP+4 ("78701-1234", the +4 is dropped),
 * or "City, ST XXXXX" / "City, ST XXXXX-XXXX" (the trailing ZIP5 is extracted).
 * Returns '' when no unambiguous ZIP5 is present — an all-digit input of the
 * wrong length ("123456") or a trailing run longer than 5 digits is rejected
 * rather than silently truncated.
 */
export function extractZip(value: string): string {
  const trimmed = value.trim();
  // All-digit input: require exactly 5 — never silently truncate "123456" → "23456"
  if (/^\d+$/.test(trimmed)) {
    return /^\d{5}$/.test(trimmed) ? trimmed : '';
  }
  // ZIP+4 or "City, ST XXXXX[-XXXX]": trailing ZIP5 (optionally +4, which is
  // dropped) must start the string or be preceded by a non-digit — never
  // extract a ZIP from a longer digit run ("City, ST 123456" → '')
  const match = trimmed.match(/(?:^|[^\d])(\d{5})(?:-\d{4})?$/);
  return match ? (match[1] ?? '') : '';
}
