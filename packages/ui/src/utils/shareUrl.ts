import type { DealInputs } from '@rpe/engine';

// ─── Constants ────────────────────────────────────────────────────────────────

/** URL query-param key used for the encoded share payload. */
export const SHARE_PARAM = 's';

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
 * Accepts an optional `base` string (e.g. `window.location.origin + pathname`)
 * for testability.  Preserves any existing query params except `s`.
 */
export function buildShareUrl(inputs: DealInputs, base?: string): string {
  const origin =
    base ??
    (typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : '');
  const search =
    typeof window !== 'undefined' ? window.location.search : '';
  const params = new URLSearchParams(search);
  params.set(SHARE_PARAM, encodeInputs(inputs));
  return `${origin}?${params.toString()}`;
}
