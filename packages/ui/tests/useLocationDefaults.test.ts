/**
 * RPE-66: useLocationDefaults hook tests
 *
 * Mocks globalThis.fetch via vi.spyOn so real network calls are never made.
 * Uses @testing-library/react's renderHook.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLocationDefaults } from '../src/hooks/useLocationDefaults';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const API_URL = 'http://localhost:3001';

function makeMockRegionResponse(overrides: Partial<{
  stateCode: string;
  label: string;
  propertyTaxRate: number;
  insuranceRate: number;
  vacancyRate: number;
  appreciationRate: number;
  rentGrowthRate: number;
  resolvedLevel: string;
  sourceLabel: string;
}> = {}) {
  return {
    zip: '78701',
    stateCode: 'TX',
    label: 'Austin, TX (78701)',
    propertyTaxRate: 0.018,
    insuranceRate: 0.0123,
    vacancyRate: 0.068,
    appreciationRate: 0.04,
    rentGrowthRate: 0.035,
    resolvedLevel: 'state',
    sourceLabel: 'TX state averages (Census ACS / NAIC 2022)',
    rent: { studio: 1050, oneBed: 1230, twoBed: 1500, threeBed: 1900, fourBed: 2200 },
    ...overrides,
  };
}

function mockFetchOk(data: unknown) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  } as unknown as Response);
}

function mockFetchError(status = 500) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error: 'error' }),
  } as unknown as Response);
}

function mockFetchNetworkError() {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network failure'));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useLocationDefaults', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with empty state when zip is empty and makes no fetch call', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() =>
      useLocationDefaults('', API_URL),
    );
    expect(result.current.rates).toBeNull();
    expect(result.current.stateCode).toBe('');
    expect(result.current.label).toBe('');
    expect(result.current.resolving).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sets resolving=true immediately when zip is provided', () => {
    mockFetchOk(makeMockRegionResponse());
    const { result } = renderHook(() =>
      useLocationDefaults('78701', API_URL),
    );
    // Synchronously after mount, resolving should be true (async effect)
    // The fetch mock is async so we can check resolving before it settles
    expect(result.current.resolving).toBe(true);
  });

  it('populates rates, stateCode and label on successful API response', async () => {
    mockFetchOk(makeMockRegionResponse());
    const { result } = renderHook(() =>
      useLocationDefaults('78701', API_URL),
    );

    await waitFor(() => {
      expect(result.current.resolving).toBe(false);
    });

    expect(result.current.stateCode).toBe('TX');
    expect(result.current.label).toBe('Austin, TX (78701)');
    expect(result.current.rates).not.toBeNull();
    expect(result.current.rates?.propertyTaxRate).toBeCloseTo(0.018, 3);
    expect(result.current.rates?.insuranceRate).toBeCloseTo(0.0123, 3);
    expect(result.current.rates?.vacancyRate).toBeCloseTo(0.068, 3);
    expect(result.current.rates?.sourceLabel).toBe('TX state averages (Census ACS / NAIC 2022)');
  });

  it('passes the correct URL to fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeMockRegionResponse()),
    } as unknown as Response);

    const { result } = renderHook(() =>
      useLocationDefaults('78701', API_URL),
    );
    await waitFor(() => expect(result.current.resolving).toBe(false));

    expect(fetchSpy).toHaveBeenCalledWith(
      `${API_URL}/region?zip=78701`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('resets to empty state when zip changes to empty', async () => {
    mockFetchOk(makeMockRegionResponse());
    const { result, rerender } = renderHook(
      ({ zip }) => useLocationDefaults(zip, API_URL),
      { initialProps: { zip: '78701' } },
    );

    await waitFor(() => expect(result.current.stateCode).toBe('TX'));

    act(() => { rerender({ zip: '' }); });

    expect(result.current.rates).toBeNull();
    expect(result.current.stateCode).toBe('');
    expect(result.current.resolving).toBe(false);
  });

  it('clears prior resolved values immediately on zip→zip change and refetches', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(makeMockRegionResponse()),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(makeMockRegionResponse({
          stateCode: 'CA',
          label: 'Los Angeles, CA (90001)',
          propertyTaxRate: 0.0075,
          sourceLabel: 'CA state averages (Census ACS / NAIC 2022)',
        })),
      } as unknown as Response);

    const { result, rerender } = renderHook(
      ({ zip }) => useLocationDefaults(zip, API_URL),
      { initialProps: { zip: '78701' } },
    );

    await waitFor(() => expect(result.current.stateCode).toBe('TX'));

    act(() => { rerender({ zip: '90001' }); });

    // Stale TX values must be cleared synchronously — never leak the previous
    // location's stateCode/label/rates while the new fetch is in flight
    expect(result.current.stateCode).toBe('');
    expect(result.current.label).toBe('');
    expect(result.current.rates).toBeNull();
    expect(result.current.resolving).toBe(true);

    await waitFor(() => expect(result.current.stateCode).toBe('CA'));
    expect(result.current.label).toBe('Los Angeles, CA (90001)');
    expect(result.current.rates?.propertyTaxRate).toBeCloseTo(0.0075, 4);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenLastCalledWith(
      `${API_URL}/region?zip=90001`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('fully resets stateCode and label (not just rates) on fetch error', async () => {
    // First resolve successfully, then fail on a new zip — no stale TX metadata may survive
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(makeMockRegionResponse()),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'boom' }),
      } as unknown as Response);

    const { result, rerender } = renderHook(
      ({ zip }) => useLocationDefaults(zip, API_URL),
      { initialProps: { zip: '78701' } },
    );
    await waitFor(() => expect(result.current.stateCode).toBe('TX'));

    act(() => { rerender({ zip: '90001' }); });
    await waitFor(() => expect(result.current.resolving).toBe(false));

    expect(result.current.rates).toBeNull();
    expect(result.current.stateCode).toBe('');
    expect(result.current.label).toBe('');
    expect(result.current.failed).toBe(true);
  });

  it('degrades gracefully on HTTP error response and sets failed', async () => {
    mockFetchError(404);
    const { result } = renderHook(() =>
      useLocationDefaults('99999', API_URL),
    );

    await waitFor(() => expect(result.current.resolving).toBe(false));

    expect(result.current.rates).toBeNull();
    expect(result.current.stateCode).toBe('');
    expect(result.current.failed).toBe(true);
  });

  it('degrades gracefully on network error and sets failed', async () => {
    mockFetchNetworkError();
    const { result } = renderHook(() =>
      useLocationDefaults('12345', API_URL),
    );

    await waitFor(() => expect(result.current.resolving).toBe(false));

    expect(result.current.rates).toBeNull();
    expect(result.current.failed).toBe(true);
  });

  it('clears failed when a new fetch starts and on success', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(makeMockRegionResponse()),
      } as unknown as Response);

    const { result, rerender } = renderHook(
      ({ zip }) => useLocationDefaults(zip, API_URL),
      { initialProps: { zip: '78701' } },
    );
    await waitFor(() => expect(result.current.failed).toBe(true));

    act(() => { rerender({ zip: '90001' }); });
    // failed clears synchronously when the new fetch starts
    expect(result.current.failed).toBe(false);
    expect(result.current.resolving).toBe(true);

    await waitFor(() => expect(result.current.stateCode).toBe('TX'));
    expect(result.current.failed).toBe(false);
  });

  it('includes national rates when resolvedLevel is "national"', async () => {
    mockFetchOk(makeMockRegionResponse({
      stateCode: '',
      label: '00000',
      resolvedLevel: 'national',
      sourceLabel: 'National averages',
      propertyTaxRate: 0.0112,
      insuranceRate: 0.0066,
    }));
    const { result } = renderHook(() =>
      useLocationDefaults('00000', API_URL),
    );

    await waitFor(() => expect(result.current.resolving).toBe(false));

    expect(result.current.rates?.resolvedLevel).toBe('national');
    expect(result.current.rates?.sourceLabel).toBe('National averages');
  });
});
