/**
 * Display formatting utilities.
 *
 * The pure value formatters moved to @rpe/report (RPE-77) so reports and
 * the UI share one source of truth — re-exported here so existing imports
 * keep working. Input-field helpers below remain UI-only.
 */

export {
  NULL_DISPLAY,
  fmtCurrency,
  fmtMultiplier,
  fmtNumber,
  fmtPercent,
} from '@rpe/report';

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
