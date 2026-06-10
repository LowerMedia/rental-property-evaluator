/**
 * RPE-49: fetchPropertyContext tests — comps & history normalization.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPropertyContext, RentCastError } from '../src/index';

function mockOk(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function mockErr(status: number): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ message: `HTTP ${status}` }),
  } as unknown as Response;
}

const VALUE_RESPONSE = {
  price: 342_000,
  comparables: [
    { formattedAddress: '125 Main St, Austin, TX', price: 350_000, distance: 0.3, squareFootage: 1_510, bedrooms: 3 },
    { formattedAddress: '12 Oak Dr, Austin, TX', price: 332_500, distance: 0.8, squareFootage: 1_420, bedrooms: 3 },
    { price: -5 }, // implausible — dropped
    'garbage',     // malformed — dropped
  ],
};

const RENT_RESPONSE = {
  rent: 2_150,
  comparables: [
    { formattedAddress: '127 Main St, Austin, TX', price: 2_100, distance: 0.2, squareFootage: 1_450, bedrooms: 3 },
  ],
};

const PROPERTIES_RESPONSE = [
  {
    squareFootage: 1_480,
    propertyTaxes: {
      '2022': { total: 3_980 },
      '2023': { total: 4_210 },
      '2021': { total: 3_750 },
      bogus: { total: 1 }, // non-year key — dropped
    },
    history: {
      '2018-05-12': { event: 'Sale', price: 265_000 },
      '2009-03-02': { event: 'Sale', price: 187_000 },
      '2018-01-01': { price: 259_000 }, // no event label — kept, event null
      '2020-01-01': { event: 'Listing' }, // no price — dropped
    },
  },
];

describe('fetchPropertyContext', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes comps, tax history (sorted), and price history (sorted)', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockOk(VALUE_RESPONSE))
      .mockResolvedValueOnce(mockOk(RENT_RESPONSE))
      .mockResolvedValueOnce(mockOk(PROPERTIES_RESPONSE));

    const ctx = await fetchPropertyContext('123 Main St, Austin TX', 'rc_key');

    expect(ctx.saleComps).toHaveLength(2);
    expect(ctx.saleComps[0]).toEqual({
      address: '125 Main St, Austin, TX',
      price: 350_000,
      distanceMiles: 0.3,
      sqft: 1_510,
      bedrooms: 3,
    });
    expect(ctx.rentComps).toHaveLength(1);
    expect(ctx.rentComps[0]?.price).toBe(2_100);

    expect(ctx.taxHistory).toEqual([
      { year: 2021, total: 3_750 },
      { year: 2022, total: 3_980 },
      { year: 2023, total: 4_210 },
    ]);
    expect(ctx.priceHistory.map((e) => e.date)).toEqual(['2009-03-02', '2018-01-01', '2018-05-12']);
    expect(ctx.priceHistory[1]).toEqual({ date: '2018-01-01', event: null, price: 259_000 });
  });

  it('requests comps from both AVM endpoints', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockOk({}));
    await fetchPropertyContext('123 Main St', 'rc_key');
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/avm/value') && u.includes('compCount=5'))).toBe(true);
    expect(urls.some((u) => u.includes('/avm/rent/long-term') && u.includes('compCount=5'))).toBe(true);
  });

  it('degrades to empty arrays for individual upstream failures', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockErr(500))                  // value fails
      .mockResolvedValueOnce(mockOk(RENT_RESPONSE))         // rent ok
      .mockResolvedValueOnce(mockErr(404));                 // properties 404

    const ctx = await fetchPropertyContext('123 Main St', 'rc_key');

    expect(ctx.saleComps).toEqual([]);
    expect(ctx.rentComps).toHaveLength(1);
    expect(ctx.taxHistory).toEqual([]);
    expect(ctx.priceHistory).toEqual([]);
  });

  it('throws the first RentCastError only when all three calls fail', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockErr(401))
      .mockResolvedValueOnce(mockErr(401))
      .mockResolvedValueOnce(mockErr(401));

    await expect(fetchPropertyContext('123 Main St', 'rc_key')).rejects.toMatchObject({
      name: 'RentCastError',
      code: 'bad_key',
    });
  });

  it('tolerates AVM responses without comparables', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockOk({ price: 342_000 }))
      .mockResolvedValueOnce(mockOk({ rent: 2_150 }))
      .mockResolvedValueOnce(mockOk([{}]));

    const ctx = await fetchPropertyContext('123 Main St', 'rc_key');
    expect(ctx).toEqual({ saleComps: [], rentComps: [], taxHistory: [], priceHistory: [] });
  });

  it('exports RentCastError consistently for instanceof checks', () => {
    expect(new RentCastError('unknown', 'x')).toBeInstanceOf(Error);
  });
});
