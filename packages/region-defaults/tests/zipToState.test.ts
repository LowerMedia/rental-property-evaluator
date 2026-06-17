/**
 * RPE-113: ZIP3-prefix → state derivation.
 *
 * Verifies stateForZip across representative ZIPs (one per region band),
 * the reported-bug ZIP (52240 → IA), and the unmappable/garbage cases that
 * must return '' so the API degrades to national defaults.
 */

import { describe, it, expect } from 'vitest';
import { stateForZip, STATE_RATES } from '../src/index';

describe('stateForZip', () => {
  it('resolves the reported-bug ZIP 52240 to IA (Iowa City)', () => {
    expect(stateForZip('52240')).toBe('IA');
  });

  it('resolves representative ZIPs across the country', () => {
    const cases: Array<[string, string]> = [
      ['78701', 'TX'], // Austin
      ['90001', 'CA'], // Los Angeles
      ['10001', 'NY'], // Manhattan
      ['33101', 'FL'], // Miami
      ['60601', 'IL'], // Chicago
      ['98101', 'WA'], // Seattle
      ['02108', 'MA'], // Boston
      ['80201', 'CO'], // Denver
      ['99501', 'AK'], // Anchorage
      ['96801', 'HI'], // Honolulu
      ['97201', 'OR'], // Portland
      ['85001', 'AZ'], // Phoenix
      ['20001', 'DC'], // Washington DC
      ['07001', 'NJ'], // New Jersey
      ['00601', 'PR'], // Puerto Rico
    ];
    for (const [zip, state] of cases) {
      expect(stateForZip(zip), `${zip} should be ${state}`).toBe(state);
    }
  });

  it('uses only the first 3 digits (ZIP+4 and trailing chars ignored)', () => {
    expect(stateForZip('52240-1234')).toBe('IA');
    expect(stateForZip('522401234')).toBe('IA');
  });

  it("returns '' for unmappable or malformed input", () => {
    expect(stateForZip('00000')).toBe(''); // prefix 000 — below the lowest range
    expect(stateForZip('09001')).toBe(''); // 090 — AE military gap (070-089 NJ, 100+ NY)
    expect(stateForZip('')).toBe('');
    expect(stateForZip('abcde')).toBe('');
    expect(stateForZip('12')).toBe(''); // fewer than 3 digits
  });

  it('every mapped state (except DC/PR territories) has rates in STATE_RATES', () => {
    // Sanity: the codes stateForZip emits for the 50 states must be lookupable.
    for (const zip of ['52240', '78701', '90001', '10001', '33101']) {
      const st = stateForZip(zip);
      expect(STATE_RATES[st]).toBeDefined();
    }
  });
});
