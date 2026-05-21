/**
 * RPE-21: Format utility tests
 *
 * Verifies all formatters correctly handle null ("—"), negative values,
 * zero, and extreme inputs. The engine guarantees no NaN/Infinity on results,
 * but format.ts must still be defensive.
 */
import { describe, it, expect } from 'vitest';
import {
  fmtCurrency,
  fmtPercent,
  fmtNumber,
  fmtMultiplier,
  fmtInputValue,
  parseInputValue,
  NULL_DISPLAY,
} from '../src/utils/format';

describe('NULL_DISPLAY sentinel', () => {
  it('is an em dash', () => {
    expect(NULL_DISPLAY).toBe('—');
  });
});

// ─── fmtCurrency ─────────────────────────────────────────────────────────────

describe('fmtCurrency', () => {
  it('null → "—"', () => {
    expect(fmtCurrency(null)).toBe('—');
  });

  it('whole dollars — no cents by default', () => {
    expect(fmtCurrency(300_000)).toBe('$300,000');
  });

  it('cents mode', () => {
    expect(fmtCurrency(1593.25, true)).toBe('$1,593.25');
  });

  it('zero', () => {
    expect(fmtCurrency(0)).toBe('$0');
  });

  it('negative value', () => {
    // Negative cash flows are valid
    expect(fmtCurrency(-425)).toBe('-$425');
  });

  it('rounds to nearest dollar in whole mode', () => {
    expect(fmtCurrency(1234.6)).toBe('$1,235');
  });
});

// ─── fmtPercent ──────────────────────────────────────────────────────────────

describe('fmtPercent', () => {
  it('null → "—"', () => {
    expect(fmtPercent(null)).toBe('—');
  });

  it('standard value with 2 decimals', () => {
    expect(fmtPercent(5.82)).toBe('5.82%');
  });

  it('zero', () => {
    expect(fmtPercent(0)).toBe('0.00%');
  });

  it('negative percentage (vacancy, growth rate)', () => {
    expect(fmtPercent(-2.5)).toBe('-2.50%');
  });

  it('custom decimal places', () => {
    expect(fmtPercent(80.1, 1)).toBe('80.1%');
  });

  it('100%', () => {
    expect(fmtPercent(100, 0)).toBe('100%');
  });
});

// ─── fmtNumber ───────────────────────────────────────────────────────────────

describe('fmtNumber', () => {
  it('null → "—"', () => {
    expect(fmtNumber(null)).toBe('—');
  });

  it('formats with default 2 decimals', () => {
    expect(fmtNumber(11.36)).toBe('11.36');
  });

  it('adds thousands separators', () => {
    expect(fmtNumber(1_000_000, 0)).toBe('1,000,000');
  });

  it('zero', () => {
    expect(fmtNumber(0, 0)).toBe('0');
  });

  it('negative', () => {
    expect(fmtNumber(-3.5, 1)).toBe('-3.5');
  });
});

// ─── fmtMultiplier ───────────────────────────────────────────────────────────

describe('fmtMultiplier', () => {
  it('null → "—"', () => {
    expect(fmtMultiplier(null)).toBe('—');
  });

  it('appends × symbol', () => {
    expect(fmtMultiplier(1.35)).toBe('1.35×');
  });

  it('DSCR exactly at threshold', () => {
    expect(fmtMultiplier(1.25)).toBe('1.25×');
  });
});

// ─── fmtInputValue ───────────────────────────────────────────────────────────

describe('fmtInputValue', () => {
  it('non-zero value → string', () => {
    expect(fmtInputValue(300_000)).toBe('300000');
  });

  it('zero → "0" by default', () => {
    expect(fmtInputValue(0)).toBe('0');
  });

  it('zero with emptyZero → ""', () => {
    expect(fmtInputValue(0, true)).toBe('');
  });
});

// ─── parseInputValue ─────────────────────────────────────────────────────────

describe('parseInputValue', () => {
  it('plain integer string', () => {
    expect(parseInputValue('300000')).toBe(300_000);
  });

  it('strips commas', () => {
    expect(parseInputValue('300,000')).toBe(300_000);
  });

  it('strips dollar sign', () => {
    expect(parseInputValue('$1,500')).toBe(1_500);
  });

  it('strips percent sign', () => {
    expect(parseInputValue('7.5%')).toBe(7.5);
  });

  it('strips × symbol', () => {
    expect(parseInputValue('1.35×')).toBe(1.35);
  });

  it('empty string → fallback 0', () => {
    expect(parseInputValue('')).toBe(0);
  });

  it('whitespace-only → fallback', () => {
    expect(parseInputValue('   ')).toBe(0);
  });

  it('non-numeric string → fallback', () => {
    expect(parseInputValue('abc')).toBe(0);
  });

  it('custom fallback', () => {
    expect(parseInputValue('', 5)).toBe(5);
  });

  it('negative value preserved', () => {
    expect(parseInputValue('-2.5')).toBe(-2.5);
  });

  it('decimal value', () => {
    expect(parseInputValue('6.875')).toBe(6.875);
  });
});
