import { describe, it, expect } from 'vitest';
import { resolveRegionalRates, NATIONAL_RATES, STATE_RATES } from '../src/index';

describe('resolveRegionalRates', () => {
  // ── Known state lookups ────────────────────────────────────────────────────

  it('returns TX state rates for "TX"', () => {
    const r = resolveRegionalRates('TX');
    expect(r.resolvedLevel).toBe('state');
    expect(r.propertyTaxRate).toBeCloseTo(0.018, 3);
    expect(r.insuranceRate).toBeCloseTo(0.0123, 3);
    expect(r.sourceLabel).toContain('TX');
  });

  it('is case-insensitive (accepts lowercase "tx")', () => {
    const r = resolveRegionalRates('tx');
    expect(r.resolvedLevel).toBe('state');
    expect(r.propertyTaxRate).toBe(STATE_RATES['TX']!.taxRate);
  });

  it('trims whitespace before lookup', () => {
    const r = resolveRegionalRates('  CA  ');
    expect(r.resolvedLevel).toBe('state');
    expect(r.propertyTaxRate).toBe(STATE_RATES['CA']!.taxRate);
  });

  it('NJ has the highest property tax rate in the dataset', () => {
    const r = resolveRegionalRates('NJ');
    expect(r.propertyTaxRate).toBeCloseTo(0.0213, 3);
  });

  it('HI has the lowest property tax rate in the dataset', () => {
    const r = resolveRegionalRates('HI');
    expect(r.propertyTaxRate).toBeCloseTo(0.0026, 3);
  });

  it('FL has notably high insurance rate', () => {
    const r = resolveRegionalRates('FL');
    expect(r.insuranceRate).toBeCloseTo(0.0142, 3);
  });

  // ── All 50 states are present ──────────────────────────────────────────────

  it('resolves all 50 US states at state level', () => {
    const states = [
      'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
      'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
      'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
      'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
      'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
    ];
    for (const code of states) {
      const r = resolveRegionalRates(code);
      expect(r.resolvedLevel, `${code} should resolve at state level`).toBe('state');
      expect(r.propertyTaxRate, `${code} tax rate should be positive`).toBeGreaterThan(0);
      expect(r.insuranceRate, `${code} insurance rate should be positive`).toBeGreaterThan(0);
    }
  });

  // ── Fallback to national ───────────────────────────────────────────────────

  it('falls back to national defaults for unknown code "XX"', () => {
    const r = resolveRegionalRates('XX');
    expect(r.resolvedLevel).toBe('national');
    expect(r.propertyTaxRate).toBe(NATIONAL_RATES.taxRate);
    expect(r.insuranceRate).toBe(NATIONAL_RATES.insuranceRate);
    expect(r.sourceLabel).toBe('National averages');
  });

  it('falls back to national for empty string', () => {
    const r = resolveRegionalRates('');
    expect(r.resolvedLevel).toBe('national');
  });

  // ── Shared national rates ──────────────────────────────────────────────────

  it('uses NATIONAL_RATES for vacancy, appreciation, rent growth at all levels', () => {
    const state = resolveRegionalRates('CA');
    expect(state.vacancyRate).toBe(NATIONAL_RATES.vacancyRate);
    expect(state.appreciationRate).toBe(NATIONAL_RATES.appreciationRate);
    expect(state.rentGrowthRate).toBe(NATIONAL_RATES.rentGrowthRate);

    const national = resolveRegionalRates('ZZ');
    expect(national.vacancyRate).toBe(NATIONAL_RATES.vacancyRate);
    expect(national.appreciationRate).toBe(NATIONAL_RATES.appreciationRate);
    expect(national.rentGrowthRate).toBe(NATIONAL_RATES.rentGrowthRate);
  });

  // ── Source labels ──────────────────────────────────────────────────────────

  it('includes the state code in the sourceLabel', () => {
    const r = resolveRegionalRates('WA');
    expect(r.sourceLabel).toContain('WA');
  });

  it('national sourceLabel is "National averages"', () => {
    const r = resolveRegionalRates('ZZ');
    expect(r.sourceLabel).toBe('National averages');
  });
});
