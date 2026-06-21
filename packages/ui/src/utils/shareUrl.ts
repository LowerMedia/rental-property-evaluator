import type { DealInputs } from '@rpe/engine';

// ─── Constants ────────────────────────────────────────────────────────────────

/** URL query-param key used for the encoded share payload. */
export const SHARE_PARAM = 's';

/** URL query-param key for the encoded view mode (RPE-110). */
export const MODE_PARAM = 'm';

/** View mode carried by a share link: uiMode + pro-forma flag. */
export type ShareMode = { uiMode: 'simple' | 'complex'; proFormaMode: boolean };

/** Encode a view mode as a 2-char code: [s|c][s|p]. */
function encodeMode(mode: ShareMode): string {
  return `${mode.uiMode === 'simple' ? 's' : 'c'}${mode.proFormaMode ? 'p' : 's'}`;
}

/**
 * Parse the view mode from the `?m=` param of a shared link (RPE-110).
 * Returns null when absent or malformed. Pro-forma is only valid in complex mode.
 */
export function parseShareMode(search?: string): ShareMode | null {
  const qs = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const code = new URLSearchParams(qs).get(MODE_PARAM);
  if (code !== 'ss' && code !== 'cs' && code !== 'cp') return null;
  return { uiMode: code[0] === 's' ? 'simple' : 'complex', proFormaMode: code === 'cp' };
}

// ─── Encode / decode ──────────────────────────────────────────────────────────

/**
 * Serialise a DealInputs object to a URL-safe base64 string.
 *
 * Encoding pipeline: JSON.stringify → btoa → URL-safe base64
 * (replace `+`→`-`, `/`→`_`, strip `=` padding).
 */
export function encodeInputs(inputs: DealInputs): string {
  const json = JSON.stringify(inputs);
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Deserialise a URL-safe base64 string back to DealInputs.
 * Returns `null` on any parse / decode failure.
 */
export function decodeInputs(encoded: string): DealInputs | null {
  try {
    // Restore standard base64 padding and characters
    const padded = encoded + '=='.slice(0, (4 - (encoded.length % 4)) % 4);
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    return JSON.parse(json) as DealInputs;
  } catch {
    return null;
  }
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

/**
 * Parse encoded DealInputs from the `?s=` query param.
 *
 * Accepts an optional `search` string (e.g. `window.location.search`) so the
 * function is easily testable without a DOM environment.
 */
export function parseShareParam(search?: string): DealInputs | null {
  const qs = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const encoded = new URLSearchParams(qs).get(SHARE_PARAM);
  if (!encoded) return null;
  return decodeInputs(encoded);
}

/**
 * Build a shareable URL for the given inputs.
 *
 * Constructs from `base` (when provided — useful for tests) or from the current
 * `window.location.href`.  Preserves any existing query params and overwrites
 * any previous `?s=` value so the share param is never duplicated.
 *
 * Returns `''` if no URL can be constructed (e.g. SSR without `base`).
 */
export function buildShareUrl(inputs: DealInputs, base?: string, mode?: ShareMode): string {
  let url: URL;
  try {
    url = new URL(base ?? (typeof window !== 'undefined' ? window.location.href : ''));
  } catch {
    return '';
  }
  url.searchParams.set(SHARE_PARAM, encodeInputs(inputs));
  if (mode) url.searchParams.set(MODE_PARAM, encodeMode(mode));
  return url.toString();
}
