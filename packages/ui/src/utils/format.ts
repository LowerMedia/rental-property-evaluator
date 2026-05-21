/**
 * Display formatting utilities — thin wrappers around Intl.NumberFormat.
 *
 * Convention:
 *  - All functions accept `number | null`.
 *  - null renders as NULL_DISPLAY ("—").
 *  - Percentage values are stored as percent-points (e.g. 7.5 = 7.5 %, not 0.075).
 */

export const NULL_DISPLAY = '—';

// ─── Formatters (module-level singletons — avoid re-creating per render) ─────

const usdWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const usdCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Format a dollar value.
 * `cents: true` → two decimal places (e.g. "$1,593.25").
 * Default → whole dollars (e.g. "$300,000").
 */
export function fmtCurrency(value: number | null, cents = false): string {
  if (value === null) return NULL_DISPLAY;
  return cents ? usdCents.format(value) : usdWhole.format(value);
}

/**
 * Format a percentage value (e.g. 7.5 → "7.50%").
 * The value is already in percent-points; this just appends the "%" symbol.
 */
export function fmtPercent(value: number | null, decimals = 2): string {
  if (value === null) return NULL_DISPLAY;
  return (
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value) + '%'
  );
}

/**
 * Format a plain number with commas (e.g. 11.36 → "11.36").
 */
export function fmtNumber(value: number | null, decimals = 2): string {
  if (value === null) return NULL_DISPLAY;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a multiplier value (e.g. 1.35 → "1.35×").
 */
export function fmtMultiplier(value: number | null, decimals = 2): string {
  if (value === null) return NULL_DISPLAY;
  return fmtNumber(value, decimals) + '×';
}

/**
 * Format a raw number for an `<input>` element — no currency symbol, no commas.
 * Returns empty string for 0 so placeholder is visible on blank fields.
 */
export function fmtInputValue(value: number, emptyZero = false): string {
  if (emptyZero && value === 0) return '';
  return String(value);
}

/**
 * Parse a user-typed string into a number.
 * Strips commas and currency symbols before parsing.
 * Returns `fallback` (default 0) for empty / non-numeric input.
 */
export function parseInputValue(raw: string, fallback = 0): number {
  const cleaned = raw.replace(/[$,%×]/g, '').replace(/,/g, '').trim();
  if (cleaned === '' || cleaned === '-') return fallback;
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? fallback : parsed;
}
