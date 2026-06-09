/**
 * RPE-44: tiered resolver tests — pure, no network, providers injected.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  resolveProperty,
  hasPriceOrRent,
  TIER_ORDER,
  type LookupField,
  type LookupRequest,
  type LookupTier,
  type PropertyLookup,
  type PropertyProvider,
} from '../src/index';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const REQUEST: LookupRequest = { address: '123 Main St, Austin, TX 78701' };

function field(value: number, source: string, confidence: LookupField['confidence'] = 'high'): LookupField {
  return { value, source, confidence };
}

interface FakeProviderOpts {
  id: string;
  tier: LookupTier;
  result?: PropertyLookup;
  error?: Error;
  supports?: boolean | (() => boolean);
}

function fakeProvider(opts: FakeProviderOpts): PropertyProvider & { lookupSpy: ReturnType<typeof vi.fn> } {
  const lookupSpy = vi.fn(async (): Promise<PropertyLookup> => {
    if (opts.error) throw opts.error;
    return opts.result ?? {};
  });
  return {
    id: opts.id,
    tier: opts.tier,
    supports:
      typeof opts.supports === 'function'
        ? opts.supports
        : () => opts.supports !== false,
    lookup: lookupSpy,
    lookupSpy,
  };
}

// ─── Tier ordering ───────────────────────────────────────────────────────────

describe('resolveProperty — tier ordering', () => {
  it('exports tiers in api → scrape → paste precedence', () => {
    expect(TIER_ORDER).toEqual(['api', 'scrape', 'paste']);
  });

  it('runs api before scrape before paste regardless of array order', async () => {
    const calls: string[] = [];
    const make = (id: string, tier: LookupTier): PropertyProvider => ({
      id,
      tier,
      supports: () => true,
      lookup: async () => {
        calls.push(id);
        return {};
      },
    });

    await resolveProperty(REQUEST, [
      make('paste', 'paste'),
      make('scrape', 'scrape'),
      make('api', 'api'),
    ]);

    expect(calls).toEqual(['api', 'scrape', 'paste']);
  });

  it('preserves caller order within the same tier (stable sort)', async () => {
    const calls: string[] = [];
    const make = (id: string): PropertyProvider => ({
      id,
      tier: 'api',
      supports: () => true,
      lookup: async () => {
        calls.push(id);
        return {};
      },
    });

    await resolveProperty(REQUEST, [make('first'), make('second'), make('third')]);

    expect(calls).toEqual(['first', 'second', 'third']);
  });

  it('runs an unrecognised tier last, never ahead of trusted tiers', async () => {
    const calls: string[] = [];
    const make = (id: string, tier: string): PropertyProvider => ({
      id,
      tier: tier as LookupTier,
      supports: () => true,
      lookup: async () => {
        calls.push(id);
        return {};
      },
    });

    await resolveProperty(REQUEST, [
      make('mystery', 'telepathy'),
      make('paste', 'paste'),
      make('api', 'api'),
    ]);

    expect(calls).toEqual(['api', 'paste', 'mystery']);
  });

  it('runs providers sequentially — a later provider never starts before an earlier one finishes', async () => {
    const events: string[] = [];
    const slow: PropertyProvider = {
      id: 'slow-api',
      tier: 'api',
      supports: () => true,
      lookup: async () => {
        events.push('slow-start');
        await new Promise((r) => setTimeout(r, 10));
        events.push('slow-end');
        return {};
      },
    };
    const fast: PropertyProvider = {
      id: 'fast-scrape',
      tier: 'scrape',
      supports: () => true,
      lookup: async () => {
        events.push('fast-start');
        return {};
      },
    };

    await resolveProperty(REQUEST, [fast, slow]);

    expect(events).toEqual(['slow-start', 'slow-end', 'fast-start']);
  });
});

// ─── Early exit and merging ──────────────────────────────────────────────────

describe('resolveProperty — early exit and merging', () => {
  it('stops the chain after the first acceptable result', async () => {
    const api = fakeProvider({
      id: 'rentcast',
      tier: 'api',
      result: { purchasePrice: field(300000, 'rentcast') },
    });
    const scrape = fakeProvider({ id: 'zillow-scrape', tier: 'scrape' });

    const resolved = await resolveProperty(REQUEST, [api, scrape]);

    expect(resolved.acceptable).toBe(true);
    expect(resolved.lookup.purchasePrice?.value).toBe(300000);
    expect(scrape.lookupSpy).not.toHaveBeenCalled();
    expect(resolved.attempts).toHaveLength(1);
  });

  it('falls through and merges fields when the first tier is not acceptable', async () => {
    const api = fakeProvider({
      id: 'rentcast',
      tier: 'api',
      result: { sqft: field(1400, 'rentcast', 'medium') },
    });
    const scrape = fakeProvider({
      id: 'zillow-scrape',
      tier: 'scrape',
      result: {
        purchasePrice: field(310000, 'zillow-scrape', 'low'),
        sqft: field(9999, 'zillow-scrape', 'low'),
      },
    });

    const resolved = await resolveProperty(REQUEST, [api, scrape]);

    expect(resolved.acceptable).toBe(true);
    // Field from the unacceptable-but-useful first tier is kept…
    expect(resolved.lookup.sqft).toEqual(field(1400, 'rentcast', 'medium'));
    // …and never overwritten by a later tier
    expect(resolved.lookup.purchasePrice).toEqual(field(310000, 'zillow-scrape', 'low'));
    expect(resolved.attempts[1].contributed).toEqual(['purchasePrice']);
  });

  it('keeps per-field provenance and confidence untouched through the merge', async () => {
    const paste = fakeProvider({
      id: 'paste-parser',
      tier: 'paste',
      result: { grossRent: field(2100, 'paste-parser', 'low') },
    });

    const resolved = await resolveProperty(REQUEST, [paste]);

    expect(resolved.lookup.grossRent).toEqual({
      value: 2100,
      source: 'paste-parser',
      confidence: 'low',
    });
  });

  it('drops foreign keys returned by a wild provider', async () => {
    const wild = fakeProvider({
      id: 'paste-parser',
      tier: 'paste',
      result: {
        grossRent: field(2000, 'paste-parser', 'low'),
        hoaFee: field(150, 'paste-parser', 'low'),
        listingAgent: field(0, 'paste-parser', 'low'),
      } as PropertyLookup,
    });

    const resolved = await resolveProperty(REQUEST, [wild]);

    expect(Object.keys(resolved.lookup)).toEqual(['grossRent']);
    expect(resolved.attempts[0].contributed).toEqual(['grossRent']);
  });

  it('returns an ok attempt with empty contribution when all fields were already set', async () => {
    const api1 = fakeProvider({
      id: 'api-one',
      tier: 'api',
      result: { sqft: field(1400, 'api-one') },
    });
    const api2 = fakeProvider({
      id: 'api-two',
      tier: 'api',
      result: { sqft: field(1500, 'api-two') },
    });

    const resolved = await resolveProperty(REQUEST, [api1, api2]);

    expect(resolved.lookup.sqft?.source).toBe('api-one');
    expect(resolved.attempts[1]).toMatchObject({ providerId: 'api-two', status: 'ok', contributed: [] });
  });
});

// ─── Skipping and failure handling ───────────────────────────────────────────

describe('resolveProperty — skipping and failures', () => {
  it('skips providers whose supports() is false without calling lookup', async () => {
    const urlOnly = fakeProvider({ id: 'url-parser', tier: 'api', supports: false });
    const addressApi = fakeProvider({
      id: 'rentcast',
      tier: 'api',
      result: { grossRent: field(1900, 'rentcast') },
    });

    const resolved = await resolveProperty(REQUEST, [urlOnly, addressApi]);

    expect(urlOnly.lookupSpy).not.toHaveBeenCalled();
    expect(resolved.attempts[0]).toMatchObject({ providerId: 'url-parser', status: 'skipped' });
    expect(resolved.acceptable).toBe(true);
  });

  it('records a provider error and continues down the chain', async () => {
    const api = fakeProvider({ id: 'rentcast', tier: 'api', error: new Error('rate limited') });
    const scrape = fakeProvider({
      id: 'zillow-scrape',
      tier: 'scrape',
      result: { purchasePrice: field(295000, 'zillow-scrape', 'low') },
    });

    const resolved = await resolveProperty(REQUEST, [api, scrape]);

    expect(resolved.attempts[0]).toMatchObject({
      providerId: 'rentcast',
      status: 'error',
      error: 'rate limited',
    });
    expect(resolved.acceptable).toBe(true);
    expect(resolved.lookup.purchasePrice?.value).toBe(295000);
  });

  it('treats a throwing supports() as an error and continues', async () => {
    const broken: PropertyProvider = {
      id: 'broken',
      tier: 'api',
      supports: () => {
        throw new Error('boom');
      },
      lookup: async () => ({ purchasePrice: field(1, 'broken') }),
    };
    const ok = fakeProvider({
      id: 'rentcast',
      tier: 'api',
      result: { purchasePrice: field(300000, 'rentcast') },
    });

    const resolved = await resolveProperty(REQUEST, [broken, ok]);

    expect(resolved.attempts[0]).toMatchObject({ providerId: 'broken', status: 'error', error: 'boom' });
    expect(resolved.lookup.purchasePrice?.source).toBe('rentcast');
  });

  it('stringifies non-Error throws', async () => {
    const api = fakeProvider({ id: 'rentcast', tier: 'api' });
    api.lookup = async () => {
      throw 'plain string failure';
    };

    const resolved = await resolveProperty(REQUEST, [api]);

    expect(resolved.attempts[0].error).toBe('plain string failure');
  });

  it('returns an empty unacceptable result when every provider fails', async () => {
    const api = fakeProvider({ id: 'rentcast', tier: 'api', error: new Error('down') });
    const scrape = fakeProvider({ id: 'zillow-scrape', tier: 'scrape', error: new Error('blocked') });

    const resolved = await resolveProperty(REQUEST, [api, scrape]);

    expect(resolved.lookup).toEqual({});
    expect(resolved.acceptable).toBe(false);
    expect(resolved.attempts.map((a) => a.status)).toEqual(['error', 'error']);
  });

  it('handles an empty provider list', async () => {
    const resolved = await resolveProperty(REQUEST, []);
    expect(resolved).toEqual({ lookup: {}, attempts: [], acceptable: false });
  });
});

// ─── Accept predicate ────────────────────────────────────────────────────────

describe('resolveProperty — accept predicate', () => {
  it('default predicate accepts price-only and rent-only lookups', () => {
    expect(hasPriceOrRent({ purchasePrice: field(1, 'x') })).toBe(true);
    expect(hasPriceOrRent({ grossRent: field(1, 'x') })).toBe(true);
    expect(hasPriceOrRent({ sqft: field(1400, 'x') })).toBe(false);
    expect(hasPriceOrRent({})).toBe(false);
  });

  it('honours a custom acceptable predicate', async () => {
    const api = fakeProvider({
      id: 'rentcast',
      tier: 'api',
      result: { purchasePrice: field(300000, 'rentcast') },
    });
    const scrape = fakeProvider({
      id: 'zillow-scrape',
      tier: 'scrape',
      result: { grossRent: field(2000, 'zillow-scrape', 'low') },
    });

    // Require BOTH price and rent — price alone must not stop the chain
    const resolved = await resolveProperty(REQUEST, [api, scrape], {
      acceptable: (l) => l.purchasePrice !== undefined && l.grossRent !== undefined,
    });

    expect(scrape.lookupSpy).toHaveBeenCalled();
    expect(resolved.acceptable).toBe(true);
    expect(resolved.lookup.purchasePrice?.source).toBe('rentcast');
    expect(resolved.lookup.grossRent?.source).toBe('zillow-scrape');
  });

  it('fires no provider when an empty lookup already satisfies a custom predicate', async () => {
    const api = fakeProvider({
      id: 'rentcast',
      tier: 'api',
      result: { purchasePrice: field(300000, 'rentcast') },
    });

    const resolved = await resolveProperty(REQUEST, [api], { acceptable: () => true });

    expect(api.lookupSpy).not.toHaveBeenCalled();
    expect(resolved).toEqual({ lookup: {}, attempts: [], acceptable: true });
  });

  it('reports acceptable=false when the chain ends below the custom bar', async () => {
    const api = fakeProvider({
      id: 'rentcast',
      tier: 'api',
      result: { purchasePrice: field(300000, 'rentcast') },
    });

    const resolved = await resolveProperty(REQUEST, [api], {
      acceptable: (l) => l.purchasePrice !== undefined && l.grossRent !== undefined,
    });

    expect(resolved.acceptable).toBe(false);
    expect(resolved.lookup.purchasePrice?.value).toBe(300000);
  });
});
