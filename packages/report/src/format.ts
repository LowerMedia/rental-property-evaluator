/**
 * E10 — display formatting (RPE-77; moved from packages/ui so the report
 * module is the single source of truth — the UI re-exports these).
 *
 * Pure Intl.NumberFormat wrappers, Node-safe.
 *
 * Convention:
 *  - All functions accept `number | null`; null renders as NULL_DISPLAY ("—").
 *  - Percentage values are percent-points (7.5 = 7.5 %, not 0.075).
 */

export const NULL_DISPLAY = '—';

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

const decimalFormatters = new Map<number, Intl.NumberFormat>();

function getDecimalFormatter(decimals: number): Intl.NumberFormat {
  let fmt = decimalFormatters.get(decimals);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    decimalFormatters.set(decimals, fmt);
  }
  return fmt;
}

/** Format a dollar value; `cents: true` → two decimals. */
export function fmtCurrency(value: number | null, cents = false): string {
  if (value === null) return NULL_DISPLAY;
  return cents ? usdCents.format(value) : usdWhole.format(value);
}

/** Format a percent-points value (7.5 → "7.50%"). */
export function fmtPercent(value: number | null, decimals = 2): string {
  if (value === null) return NULL_DISPLAY;
  return getDecimalFormatter(decimals).format(value) + '%';
}

/** Format a plain number with commas. */
export function fmtNumber(value: number | null, decimals = 2): string {
  if (value === null) return NULL_DISPLAY;
  return getDecimalFormatter(decimals).format(value);
}

/** Format a multiplier (1.35 → "1.35×"). */
export function fmtMultiplier(value: number | null, decimals = 2): string {
  if (value === null) return NULL_DISPLAY;
  return fmtNumber(value, decimals) + '×';
}
