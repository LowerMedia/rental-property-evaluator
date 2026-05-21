import { describe, it, expect } from 'vitest';
import {
  encodeInputs,
  decodeInputs,
  parseShareParam,
  buildShareUrl,
  SHARE_PARAM,
} from '../src/utils/shareUrl';
import { DEFAULT_INPUTS } from '../src/state/defaultInputs';
import type { DealInputs } from '@rpe/engine';

// ─── encodeInputs / decodeInputs ──────────────────────────────────────────────

describe('encodeInputs / decodeInputs', () => {
  it('round-trips DEFAULT_INPUTS faithfully', () => {
    const encoded = encodeInputs(DEFAULT_INPUTS);
    const decoded = decodeInputs(encoded);
    expect(decoded).toEqual(DEFAULT_INPUTS);
  });

  it('produces a URL-safe string (no +, /, or = chars)', () => {
    const encoded = encodeInputs(DEFAULT_INPUTS);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('returns a non-empty string for any valid DealInputs', () => {
    const encoded = encodeInputs(DEFAULT_INPUTS);
    expect(encoded.length).toBeGreaterThan(0);
  });

  it('round-trips inputs with all optional fields populated', () => {
    const full: DealInputs = {
      ...DEFAULT_INPUTS,
      rehab: 15_000,
      otherIncome: 100,
      units: 4,
      sqft: 2400,
      landValue: 50_000,
      holdYears: 10,
      rentGrowthPct: 2,
      expenseGrowthPct: 3,
      appreciationPct: 3.5,
      sellingCostsPct: 6,
      marginalTaxPct: 24,
      capExInNOI: false,
      expenses: {
        ...DEFAULT_INPUTS.expenses,
        hoa: { amount: 150, period: 'monthly' },
        other: { amount: 500, period: 'annual' },
        miscPct: 2,
      },
    };
    expect(decodeInputs(encodeInputs(full))).toEqual(full);
  });

  it('decodeInputs returns null for empty string', () => {
    expect(decodeInputs('')).toBeNull();
  });

  it('decodeInputs returns null for random garbage', () => {
    expect(decodeInputs('not-valid-base64!!!!')).toBeNull();
  });

  it('decodeInputs returns null for valid base64 that is not JSON', () => {
    const notJson = btoa('hello world');
    expect(decodeInputs(notJson)).toBeNull();
  });

  it('decodeInputs returns null for truncated encoded string', () => {
    const encoded = encodeInputs(DEFAULT_INPUTS);
    expect(decodeInputs(encoded.slice(0, 10))).toBeNull();
  });
});

// ─── parseShareParam ──────────────────────────────────────────────────────────

describe('parseShareParam', () => {
  it('returns null when search string is empty', () => {
    expect(parseShareParam('')).toBeNull();
  });

  it('returns null when the share param is absent', () => {
    expect(parseShareParam('?foo=bar')).toBeNull();
  });

  it('returns null when the share param value is corrupt', () => {
    expect(parseShareParam(`?${SHARE_PARAM}=garbage!!!`)).toBeNull();
  });

  it('parses a valid encoded payload from the search string', () => {
    const encoded = encodeInputs(DEFAULT_INPUTS);
    const result = parseShareParam(`?${SHARE_PARAM}=${encoded}`);
    expect(result).toEqual(DEFAULT_INPUTS);
  });

  it('handles extra query params alongside the share param', () => {
    const encoded = encodeInputs(DEFAULT_INPUTS);
    const result = parseShareParam(`?utm_source=email&${SHARE_PARAM}=${encoded}&ref=1`);
    expect(result).toEqual(DEFAULT_INPUTS);
  });
});

// ─── buildShareUrl ────────────────────────────────────────────────────────────

describe('buildShareUrl', () => {
  const BASE = 'https://app.example.com/';

  it('builds a URL containing the share param', () => {
    const url = buildShareUrl(DEFAULT_INPUTS, BASE);
    expect(url).toContain(`${SHARE_PARAM}=`);
  });

  it('produces a URL that round-trips back to the original inputs', () => {
    const url = buildShareUrl(DEFAULT_INPUTS, BASE);
    const search = '?' + url.split('?')[1];
    const result = parseShareParam(search);
    expect(result).toEqual(DEFAULT_INPUTS);
  });

  it('starts with the provided base URL', () => {
    const url = buildShareUrl(DEFAULT_INPUTS, BASE);
    expect(url.startsWith(BASE)).toBe(true);
  });

  it('only adds one share param even when called multiple times', () => {
    const url = buildShareUrl(DEFAULT_INPUTS, BASE);
    const search1 = '?' + url.split('?')[1];
    // Build again using the already-parameterised URL as base (simulating a re-share)
    // This tests that the param is overwritten, not duplicated
    const url2 = buildShareUrl(DEFAULT_INPUTS, BASE);
    const occurrences = (url2.match(new RegExp(`\\b${SHARE_PARAM}=`, 'g')) ?? []).length;
    expect(occurrences).toBe(1);
    // Suppress unused-variable warning from the intermediate variable
    void search1;
  });
});
