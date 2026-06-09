/**
 * RPE-47: listing URL parser tests — pure string parsing, no fetches.
 */

import { describe, it, expect } from 'vitest';
import { parseListingUrl } from '../src/index';

function listing(input: string) {
  const result = parseListingUrl(input);
  if (result.kind !== 'listing') throw new Error(`expected listing, got ${result.kind}`);
  return result.listing;
}

describe('parseListingUrl — zillow', () => {
  it('extracts address and zpid from a homedetails URL', () => {
    const l = listing('https://www.zillow.com/homedetails/123-Main-St-Austin-TX-78701/29381742_zpid/');
    expect(l.host).toBe('zillow');
    expect(l.address).toBe('123 Main St Austin TX 78701');
    expect(l.listingId).toBe('29381742');
  });

  it('tolerates a missing scheme', () => {
    const l = listing('zillow.com/homedetails/4-Oak-Dr-Cedar-Rapids-IA-52402/1111_zpid/');
    expect(l.host).toBe('zillow');
    expect(l.address).toBe('4 Oak Dr Cedar Rapids IA 52402');
  });

  it('falls back when the path has no homedetails segment', () => {
    expect(parseListingUrl('https://www.zillow.com/austin-tx/').kind).toBe('address');
  });

  it('keeps the zpid from an id-only homedetails link (no address slug)', () => {
    const l = listing('https://www.zillow.com/homedetails/29381742_zpid/');
    expect(l.address).toBeNull();
    expect(l.listingId).toBe('29381742');
  });
});

describe('parseListingUrl — redfin', () => {
  it('builds the address from state/city/street segments and keeps the home id', () => {
    const l = listing('https://www.redfin.com/TX/Austin/123-Main-St-78701/home/123456');
    expect(l.host).toBe('redfin');
    expect(l.address).toBe('123 Main St Austin TX 78701');
    expect(l.listingId).toBe('123456');
  });

  it('handles a detail path without the /home/<id> suffix', () => {
    const l = listing('https://www.redfin.com/IA/Cedar-Rapids/420-1st-Ave-52401');
    expect(l.address).toBe('420 1st Ave Cedar Rapids IA 52401');
    expect(l.listingId).toBeNull();
  });

  it('handles a street slug without a trailing ZIP', () => {
    const l = listing('https://www.redfin.com/IA/Marion/9-Elm-Ct/home/777');
    expect(l.address).toBe('9 Elm Ct Marion IA');
  });
});

describe('parseListingUrl — realtor', () => {
  it('extracts address parts and the M-id', () => {
    const l = listing('https://www.realtor.com/realestateandhomes-detail/123-Main-St_Austin_TX_78701_M1234-56789');
    expect(l.host).toBe('realtor');
    expect(l.address).toBe('123 Main St Austin TX 78701');
    expect(l.listingId).toBe('M1234-56789');
  });

  it('parses a slug without an M-id', () => {
    const l = listing('https://www.realtor.com/realestateandhomes-detail/9-Elm-Ct_Marion_IA_52302');
    expect(l.address).toBe('9 Elm Ct Marion IA 52302');
    expect(l.listingId).toBeNull();
  });
});

describe('parseListingUrl — trulia', () => {
  it('parses the /p/ double-dash form', () => {
    const l = listing('https://www.trulia.com/p/tx/austin/123-main-st-austin-tx-78701--2089382929');
    expect(l.host).toBe('trulia');
    expect(l.address).toBe('123 main st austin tx 78701');
    expect(l.listingId).toBe('2089382929');
  });

  it('parses the /home/ trailing-id form', () => {
    const l = listing('https://www.trulia.com/home/123-main-st-austin-tx-78701-2089382929');
    expect(l.address).toBe('123 main st austin tx 78701');
    expect(l.listingId).toBe('2089382929');
  });
});

describe('parseListingUrl — homes.com', () => {
  it('extracts the property slug and id segment', () => {
    const l = listing('https://www.homes.com/property/123-main-st-austin-tx-78701/id-400-1234567/');
    expect(l.host).toBe('homes');
    expect(l.address).toBe('123 main st austin tx 78701');
    expect(l.listingId).toBe('400-1234567');
  });
});

describe('parseListingUrl — fallbacks', () => {
  it('treats a plain street address as an address, untouched', () => {
    const result = parseListingUrl('123 Main St, Austin, TX 78701');
    expect(result).toEqual({ kind: 'address', address: '123 Main St, Austin, TX 78701' });
  });

  it('treats an unsupported host as a freeform address', () => {
    const result = parseListingUrl('https://www.example.com/listing/123-main-st');
    expect(result.kind).toBe('address');
  });

  it('treats garbage as a freeform address without throwing', () => {
    expect(parseListingUrl('https://').kind).toBe('address');
    expect(parseListingUrl('not a url at all !!!').kind).toBe('address');
    expect(parseListingUrl('').kind).toBe('address');
  });

  it('does not match host substrings like zillow.com.evil.io', () => {
    const result = parseListingUrl('https://zillow.com.evil.io/homedetails/123-Main-St/1_zpid/');
    expect(result.kind).toBe('address');
  });

  it('matches real subdomains', () => {
    const l = listing('https://m.zillow.com/homedetails/123-Main-St-Austin-TX-78701/42_zpid/');
    expect(l.host).toBe('zillow');
  });
});
