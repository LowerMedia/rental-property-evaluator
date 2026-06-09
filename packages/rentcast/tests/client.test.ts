/**
 * RPE-43a: fetchPropertyData unit tests
 *
 * All RentCast HTTP calls are intercepted via vi.spyOn(globalThis, 'fetch').
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPropertyData } from '../src/client';
import { RentCastError } from '../src/types';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function mockOk(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function mockFail(status: number): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ message: `HTTP ${status}` }),
  } as unknown as Response;
}

// RentCast response shapes
// Verify field names against https://developers.rentcast.io/reference before shipping.
const AVM_VALUE_RESPONSE   = { price: 342_000, priceRangeLow: 315_000, priceRangeHigh: 369_000 };
const AVM_RENT_RESPONSE    = { rent: 2_150, rentRangeLow: 1_950, rentRangeHigh: 2_350 };
const PROPERTIES_RESPONSE  = [
  {
    squareFootage: 1_480,
    units: 1,
    // propertyTaxes is a record keyed by tax year: { "2023": { total: 4210 } }
    // If the field name or shape differs in the live API, adjust here + in client.ts
    propertyTaxes: { '2023': { total: 4_210 } },
  },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('fetchPropertyData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('happy path', () => {
    it('returns all five fields when all three calls succeed', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(mockOk(AVM_VALUE_RESPONSE))
        .mockResolvedValueOnce(mockOk(AVM_RENT_RESPONSE))
        .mockResolvedValueOnce(mockOk(PROPERTIES_RESPONSE));

      const result = await fetchPropertyData('123 Main St, Austin TX', 'rc_test_key');

      expect(result.purchasePrice).toBe(342_000);
      expect(result.grossRent).toBe(2_150);
      expect(result.sqft).toBe(1_480);
      expect(result.units).toBe(1);
      expect(result.annualTaxes).toBe(4_210);
    });

    it('calls fetch exactly three times (once per endpoint)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValue(mockOk(AVM_VALUE_RESPONSE));

      // Override later calls to return appropriate shapes
      fetchSpy
        .mockResolvedValueOnce(mockOk(AVM_VALUE_RESPONSE))
        .mockResolvedValueOnce(mockOk(AVM_RENT_RESPONSE))
        .mockResolvedValueOnce(mockOk(PROPERTIES_RESPONSE));

      await fetchPropertyData('123 Main St', 'key');
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('partial success', () => {
    it('returns null sqft/units/annualTaxes when /properties returns 404', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(mockOk(AVM_VALUE_RESPONSE))
        .mockResolvedValueOnce(mockOk(AVM_RENT_RESPONSE))
        .mockResolvedValueOnce(mockFail(404));

      const result = await fetchPropertyData('123 Main St', 'key');

      expect(result.purchasePrice).toBe(342_000);
      expect(result.grossRent).toBe(2_150);
      expect(result.sqft).toBeNull();
      expect(result.units).toBeNull();
      expect(result.annualTaxes).toBeNull();
    });

    it('returns null for nullable fields when properties response is empty array', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(mockOk(AVM_VALUE_RESPONSE))
        .mockResolvedValueOnce(mockOk(AVM_RENT_RESPONSE))
        .mockResolvedValueOnce(mockOk([]));

      const result = await fetchPropertyData('123 Main St', 'key');

      expect(result.sqft).toBeNull();
      expect(result.units).toBeNull();
      expect(result.annualTaxes).toBeNull();
    });
  });

  describe('error handling', () => {
    it('throws RentCastError bad_key on 401', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFail(401));

      await expect(fetchPropertyData('123 Main St', 'bad')).rejects.toSatisfy(
        (e: unknown) => e instanceof RentCastError && e.code === 'bad_key',
      );
    });

    it('throws RentCastError bad_key on 403', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFail(403));

      await expect(fetchPropertyData('123 Main St', 'bad')).rejects.toSatisfy(
        (e: unknown) => e instanceof RentCastError && e.code === 'bad_key',
      );
    });

    it('throws RentCastError not_found on 404 from AVM call', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(mockFail(404))
        .mockResolvedValueOnce(mockOk(AVM_RENT_RESPONSE))
        .mockResolvedValueOnce(mockOk(PROPERTIES_RESPONSE));

      await expect(fetchPropertyData('unknown address', 'key')).rejects.toSatisfy(
        (e: unknown) => e instanceof RentCastError && e.code === 'not_found',
      );
    });

    it('throws RentCastError rate_limit on 429', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFail(429));

      await expect(fetchPropertyData('123 Main St', 'key')).rejects.toSatisfy(
        (e: unknown) => e instanceof RentCastError && e.code === 'rate_limit',
      );
    });

    it('throws RentCastError unknown when fetch rejects with a network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(fetchPropertyData('123 Main St', 'key')).rejects.toSatisfy(
        (e: unknown) => e instanceof RentCastError && e.code === 'unknown',
      );
    });

    it('throws RentCastError bad_key when /properties returns 401', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(mockOk(AVM_VALUE_RESPONSE))
        .mockResolvedValueOnce(mockOk(AVM_RENT_RESPONSE))
        .mockResolvedValueOnce(mockFail(401));

      await expect(fetchPropertyData('123 Main St', 'key')).rejects.toSatisfy(
        (e: unknown) => e instanceof RentCastError && e.code === 'bad_key',
      );
    });

    it('throws RentCastError unknown when /properties returns 500', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(mockOk(AVM_VALUE_RESPONSE))
        .mockResolvedValueOnce(mockOk(AVM_RENT_RESPONSE))
        .mockResolvedValueOnce(mockFail(500));

      await expect(fetchPropertyData('123 Main St', 'key')).rejects.toSatisfy(
        (e: unknown) => e instanceof RentCastError && e.code === 'unknown',
      );
    });

    it('throws RentCastError unknown when AVM value response has unexpected shape', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const u = String(url);
        if (u.includes('/avm/value')) {
          return Promise.resolve(new Response(JSON.stringify({ notPrice: 999 }), { status: 200 }));
        }
        if (u.includes('/avm/rent')) {
          return Promise.resolve(new Response(JSON.stringify({ rent: 2000 }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      });
      await expect(fetchPropertyData('123 Main St', 'key')).rejects.toMatchObject({
        code: 'unknown',
        message: expect.stringContaining('unexpected AVM value shape'),
      });
    });
  });
});
