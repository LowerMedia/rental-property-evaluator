/**
 * RPE-43d: useAutofill hook tests
 *
 * Mocks fetch (the POST /property call) at globalThis level.
 * Uses @testing-library/react's renderHook.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutofill } from '../src/hooks/useAutofill';

// ─── Mock fetch ──────────────────────────────────────────────────────────────

const MOCK_DATA = {
  purchasePrice: 342_000,
  grossRent: 2_150,
  sqft: 1_480,
  units: 1,
  annualTaxes: 4_210,
};

function mockFetchOk(data: unknown) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data }),
  } as unknown as Response);
}

function mockFetchError(status: number, error: string) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error }),
  } as unknown as Response);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useAutofill', () => {
  // Minimal dispatch spy
  const dispatch = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    dispatch.mockClear();
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
    expect(result.current.status).toBe('idle');
    expect(result.current.previewData).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it('transitions idle → loading → preview on successful trigger', async () => {
    mockFetchOk(MOCK_DATA);
    const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));

    await act(async () => { await result.current.trigger('123 Main St'); });

    expect(result.current.status).toBe('preview');
    expect(result.current.previewData).toEqual(MOCK_DATA);
  });

  it('transitions to error on 401 (bad_key)', async () => {
    mockFetchError(401, 'Invalid API key');
    const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));

    await act(async () => { await result.current.trigger('123 Main St'); });

    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toMatch(/api key/i);
  });

  it('transitions to error on 404 (not_found)', async () => {
    mockFetchError(404, 'Property not found');
    const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));

    await act(async () => { await result.current.trigger('unknown address'); });

    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toMatch(/not found/i);
  });

  it('transitions to error on 402 (rate_limit)', async () => {
    mockFetchError(402, 'Rate limit exceeded');
    const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));

    await act(async () => { await result.current.trigger('123 Main St'); });

    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toMatch(/rate limit/i);
  });

  describe('apply()', () => {
    it('dispatches SET_NUMBER for purchasePrice', async () => {
      mockFetchOk(MOCK_DATA);
      const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
      await act(async () => { await result.current.trigger('123 Main St'); });
      act(() => { result.current.apply(); });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_NUMBER', field: 'purchasePrice', value: 342_000 });
    });

    it('dispatches SET_NUMBER for grossRent', async () => {
      mockFetchOk(MOCK_DATA);
      const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
      await act(async () => { await result.current.trigger('123 Main St'); });
      act(() => { result.current.apply(); });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_NUMBER', field: 'grossRent', value: 2_150 });
    });

    it('dispatches SET_EXPENSE_FIXED for taxes when annualTaxes is non-null', async () => {
      mockFetchOk(MOCK_DATA);
      const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
      await act(async () => { await result.current.trigger('123 Main St'); });
      act(() => { result.current.apply(); });
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_EXPENSE_FIXED',
        field: 'taxes',
        amount: 4_210,
        period: 'annual',
      });
    });

    it('dispatches SET_NUMBER for units when units is non-null', async () => {
      mockFetchOk(MOCK_DATA);
      const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
      await act(async () => { await result.current.trigger('123 Main St'); });
      act(() => { result.current.apply(); });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_NUMBER', field: 'units', value: 1 });
    });

    it('dispatches SET_NUMBER for sqft when non-null', async () => {
      mockFetchOk(MOCK_DATA);
      const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
      await act(async () => { await result.current.trigger('123 Main St'); });
      act(() => { result.current.apply(); });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_NUMBER', field: 'sqft', value: 1_480 });
    });

    it('skips sqft dispatch when sqft is null', async () => {
      mockFetchOk({ ...MOCK_DATA, sqft: null });
      const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
      await act(async () => { await result.current.trigger('123 Main St'); });
      act(() => { result.current.apply(); });
      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ field: 'sqft' }),
      );
    });

    it('skips taxes dispatch when annualTaxes is null', async () => {
      mockFetchOk({ ...MOCK_DATA, annualTaxes: null });
      const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
      await act(async () => { await result.current.trigger('123 Main St'); });
      act(() => { result.current.apply(); });
      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ field: 'taxes' }),
      );
    });

    it('returns to idle after apply()', async () => {
      mockFetchOk(MOCK_DATA);
      const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
      await act(async () => { await result.current.trigger('123 Main St'); });
      act(() => { result.current.apply(); });
      expect(result.current.status).toBe('idle');
    });
  });

  describe('dismiss()', () => {
    it('returns to idle from preview state', async () => {
      mockFetchOk(MOCK_DATA);
      const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
      await act(async () => { await result.current.trigger('123 Main St'); });
      act(() => { result.current.dismiss(); });
      expect(result.current.status).toBe('idle');
      expect(result.current.previewData).toBeNull();
    });

    it('returns to idle from error state', async () => {
      mockFetchError(404, 'not found');
      const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
      await act(async () => { await result.current.trigger('x'); });
      act(() => { result.current.dismiss(); });
      expect(result.current.status).toBe('idle');
    });
  });
});
