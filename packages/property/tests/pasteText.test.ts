/**
 * RPE-52: paste-listing-text parser tests.
 */

import { describe, it, expect } from 'vitest';
import { parseListingText, createPasteTextProvider, resolveProperty } from '../src/index';

const ZILLOW_STYLE = `
$342,000
3 bd | 2 ba | 1,480 sqft
123 Main St, Austin, TX 78701
Built in 1987
Rent Zestimate: $2,150/mo
Annual tax amount: $4,210
`;

describe('parseListingText', () => {
  it('parses a Zillow-style copied listing', () => {
    const lookup = parseListingText(ZILLOW_STYLE);
    expect(lookup.purchasePrice?.value).toBe(342_000);
    expect(lookup.bedrooms?.value).toBe(3);
    expect(lookup.bathrooms?.value).toBe(2);
    expect(lookup.sqft?.value).toBe(1_480);
    expect(lookup.yearBuilt?.value).toBe(1987);
    expect(lookup.grossRent?.value).toBe(2_150);
    expect(lookup.annualTaxes?.value).toBe(4_210);
  });

  it('tags labeled dollar amounts medium and bare/structural finds low', () => {
    const lookup = parseListingText(ZILLOW_STYLE);
    expect(lookup.purchasePrice?.confidence).toBe('low'); // bare leading $
    expect(lookup.grossRent?.confidence).toBe('medium');
    expect(lookup.annualTaxes?.confidence).toBe('medium');
    expect(lookup.bedrooms?.confidence).toBe('low');
    expect(Object.values(lookup).every((f) => f?.source === 'paste')).toBe(true);
  });

  it('parses a labeled list price at medium confidence', () => {
    const lookup = parseListingText('List price: $950K · charming duplex');
    expect(lookup.purchasePrice).toEqual({ value: 950_000, source: 'paste', confidence: 'medium' });
  });

  it('handles K/M suffixes and decimal millions', () => {
    expect(parseListingText('asking $1.2M').purchasePrice?.value).toBe(1_200_000);
    expect(parseListingText('priced at 425k').purchasePrice?.value).toBe(425_000);
  });

  it('parses rent from a per-month amount without a label', () => {
    const lookup = parseListingText('Great cash flow at $1,850/mo with long-term tenants');
    expect(lookup.grossRent?.value).toBe(1_850);
  });

  it('parses half baths', () => {
    expect(parseListingText('2 bd 1.5 ba cottage').bathrooms?.value).toBe(1.5);
  });

  it('rejects implausible values instead of guessing', () => {
    const lookup = parseListingText('99 beds 99 baths $5 price 50 sqft built in 1492');
    expect(lookup.purchasePrice).toBeUndefined(); // $5 below price floor
    expect(lookup.bedrooms).toBeUndefined();      // 99 beyond cap
    expect(lookup.sqft).toBeUndefined();          // 50 below floor
    expect(lookup.yearBuilt).toBeUndefined();     // 1492 before floor
  });

  it('returns an empty lookup for empty or unrelated text', () => {
    expect(parseListingText('')).toEqual({});
    expect(parseListingText('hello world, nothing to see')).toEqual({});
  });

  it('survives values split across lines', () => {
    const lookup = parseListingText('Property taxes\n$3,900\nList price\n$280,000');
    expect(lookup.annualTaxes?.value).toBe(3_900);
    expect(lookup.purchasePrice?.value).toBe(280_000);
  });
});

describe('createPasteTextProvider', () => {
  it('is the paste tier and only supports requests with pasted text', () => {
    const p = createPasteTextProvider();
    expect(p.tier).toBe('paste');
    expect(p.supports({ pastedText: ZILLOW_STYLE })).toBe(true);
    expect(p.supports({ pastedText: '   ' })).toBe(false);
    expect(p.supports({ address: '123 Main St' })).toBe(false);
  });

  it('acts as the final tier through resolveProperty', async () => {
    const failingApi = {
      id: 'rentcast',
      tier: 'api' as const,
      supports: () => true,
      lookup: async () => {
        throw new Error('proxy down');
      },
    };

    const resolved = await resolveProperty(
      { address: '123 Main St', pastedText: ZILLOW_STYLE },
      [failingApi, createPasteTextProvider()],
    );

    expect(resolved.acceptable).toBe(true);
    expect(resolved.lookup.purchasePrice?.source).toBe('paste');
    expect(resolved.attempts.map((a) => a.status)).toEqual(['error', 'ok']);
  });
});
