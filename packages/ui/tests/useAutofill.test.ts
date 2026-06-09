/**
 * RPE-53: tiered import hook tests (rebuilt from the RPE-43d suite).
 *
 * Mocks globalThis.fetch — the only network the providers reach.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAutofill } from '../src/hooks/useAutofill';
import type { DealAction } from '../src/state/dealReducer';

const API_URL = 'http://localhost:3001';

const PROXY_LOOKUP = {
  purchasePrice: { value: 342_000, source: 'rentcast', confidence: 'medium' },
  grossRent:     { value: 2_150,   source: 'rentcast', confidence: 'medium' },
  annualTaxes:   { value: 4_210,   source: 'rentcast', confidence: 'high' },
  bedrooms:      { value: 3,       source: 'rentcast', confidence: 'high' },
};

const PASTED = '$280,000 2 bd 1 ba 900 sqft taxes: $2,100';

function proxyOk(lookup: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data: {}, lookup, cached: false }),
  } as unknown as Response;
}

function proxyErr(status: number, code: string, error: string): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error, code }),
  } as unknown as Response;
}

describe('useAutofill (tiered import)', () => {
  let dispatched: DealAction[];
  let dispatch: (a: DealAction) => void;

  beforeEach(() => {
    vi.restoreAllMocks();
    dispatched = [];
    dispatch = (a) => dispatched.push(a);
  });

  it('imports from an address through the api tier into patches', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(proxyOk(PROXY_LOOKUP));
    const { result } = renderHook(() =>
      useAutofill({ dispatch, apiKey: 'rc_key', apiUrl: API_URL }),
    );

    await act(() => result.current.trigger('123 Main St, Austin TX'));
    await waitFor(() => expect(result.current.status).toBe('preview'));

    expect(fetchSpy).toHaveBeenCalledWith(`${API_URL}/property`, expect.anything());
    const targets = result.current.preview?.patches.map((p) => p.target).sort();
    expect(targets).toEqual(['expenses.taxes', 'grossRent', 'purchasePrice']);
    expect(result.current.preview?.meta.bedrooms?.value).toBe(3);
  });

  it('parses a listing URL and feeds the extracted address to the api tier', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(proxyOk(PROXY_LOOKUP));
    const { result } = renderHook(() =>
      useAutofill({ dispatch, apiKey: 'rc_key', apiUrl: API_URL }),
    );

    await act(() =>
      result.current.trigger('https://www.zillow.com/homedetails/123-Main-St-Austin-TX-78701/29381742_zpid/'),
    );
    await waitFor(() => expect(result.current.status).toBe('preview'));

    const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body)) as { address: string };
    expect(body.address).toBe('123 Main St Austin TX 78701');
  });

  it('imports paste-only without an API key and with zero network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() =>
      useAutofill({ dispatch, apiKey: null, apiUrl: API_URL }),
    );

    await act(() => result.current.trigger('', PASTED));
    await waitFor(() => expect(result.current.status).toBe('preview'));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.preview?.patches.find((p) => p.target === 'purchasePrice')?.source).toBe('paste');
  });

  it('falls through to pasted text when the api tier fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      proxyErr(404, 'not_found', 'Property not found for this address.'),
    );
    const { result } = renderHook(() =>
      useAutofill({ dispatch, apiKey: 'rc_key', apiUrl: API_URL }),
    );

    await act(() => result.current.trigger('123 Main St', PASTED));
    await waitFor(() => expect(result.current.status).toBe('preview'));

    expect(result.current.preview?.attempts.map((a) => a.status)).toEqual(['error', 'skipped', 'ok']);
    expect(result.current.preview?.patches.find((p) => p.target === 'purchasePrice')?.value.amount).toBe(280_000);
  });

  it('reports a Settings/paste hint when nothing can run', async () => {
    const { result } = renderHook(() =>
      useAutofill({ dispatch, apiKey: null, apiUrl: API_URL }),
    );

    await act(() => result.current.trigger('123 Main St'));
    await waitFor(() => expect(result.current.status).toBe('error'));

    expect(result.current.errorMessage).toContain('⚙ Settings');
  });

  it('surfaces the api-tier failure message when there is no fallback data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      proxyErr(401, 'bad_key', 'Invalid or expired API key.'),
    );
    const { result } = renderHook(() =>
      useAutofill({ dispatch, apiKey: 'rc_bad', apiUrl: API_URL }),
    );

    await act(() => result.current.trigger('123 Main St'));
    await waitFor(() => expect(result.current.status).toBe('error'));

    expect(result.current.errorMessage).toContain('Invalid API key');
  });

  it('apply() dispatches only the selected targets and resets', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(proxyOk(PROXY_LOOKUP));
    const { result } = renderHook(() =>
      useAutofill({ dispatch, apiKey: 'rc_key', apiUrl: API_URL }),
    );

    await act(() => result.current.trigger('123 Main St'));
    await waitFor(() => expect(result.current.status).toBe('preview'));

    act(() => result.current.apply(new Set(['purchasePrice', 'expenses.taxes'])));

    expect(dispatched).toEqual([
      { type: 'SET_NUMBER', field: 'purchasePrice', value: 342_000 },
      { type: 'SET_EXPENSE_FIXED', field: 'taxes', amount: 4_210, period: 'annual' },
    ]);
    expect(result.current.status).toBe('idle');
    expect(result.current.preview).toBeNull();
  });

  it('dismiss() clears preview and error state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(proxyOk(PROXY_LOOKUP));
    const { result } = renderHook(() =>
      useAutofill({ dispatch, apiKey: 'rc_key', apiUrl: API_URL }),
    );

    await act(() => result.current.trigger('123 Main St'));
    await waitFor(() => expect(result.current.status).toBe('preview'));

    act(() => result.current.dismiss());
    expect(result.current.status).toBe('idle');
    expect(result.current.preview).toBeNull();
  });

  it('ignores a stale request superseded by a newer trigger', async () => {
    let resolveFirst!: (r: Response) => void;
    const firstGate = new Promise<Response>((r) => { resolveFirst = r; });
    vi.spyOn(globalThis, 'fetch')
      .mockReturnValueOnce(firstGate)
      .mockResolvedValueOnce(proxyOk({
        purchasePrice: { value: 999_999, source: 'rentcast', confidence: 'medium' },
      }));

    const { result } = renderHook(() =>
      useAutofill({ dispatch, apiKey: 'rc_key', apiUrl: API_URL }),
    );

    // First trigger hangs; second completes
    act(() => { void result.current.trigger('1 First St'); });
    await act(() => result.current.trigger('2 Second St'));
    await waitFor(() => expect(result.current.status).toBe('preview'));
    expect(result.current.preview?.patches[0]?.value.amount).toBe(999_999);

    // Now the stale first request lands — it must not clobber the preview
    resolveFirst(proxyOk(PROXY_LOOKUP));
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.preview?.patches[0]?.value.amount).toBe(999_999);
  });

  it('does not call the scrape tier unless enabled', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      proxyErr(404, 'not_found', 'Property not found for this address.'),
    );
    const { result } = renderHook(() =>
      useAutofill({ dispatch, apiKey: 'rc_key', apiUrl: API_URL }),
    );

    await act(() =>
      result.current.trigger('https://www.zillow.com/homedetails/123-Main-St-Austin-TX-78701/1_zpid/'),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));

    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.every((u) => !u.includes('/scrape'))).toBe(true);
  });
});
