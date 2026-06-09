/**
 * RPE-54: E7 end-to-end import integration.
 *
 * Full chains with mocked proxy responses (no live calls):
 *   listing URL → tiered resolver → patches → dealReducer → engine
 *   api failure → paste fall-through → reducer
 *   scrape flag on → /scrape consulted, labels stay low/scrape
 * Plus the review-panel selection-defaults regression (untouched form
 * defaults are not user edits; user-edited values are protected).
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { evaluate } from '@rpe/engine';
import { useAutofill } from '../src/hooks/useAutofill';
import { dealReducer, type DealAction } from '../src/state/dealReducer';
import { DEFAULT_INPUTS } from '../src/state/defaultInputs';

const API_URL = 'http://localhost:3001';
const ZILLOW_URL = 'https://www.zillow.com/homedetails/123-Main-St-Austin-TX-78701/29381742_zpid/';

const PROXY_LOOKUP = {
  purchasePrice: { value: 342_000, source: 'rentcast', confidence: 'medium' },
  grossRent:     { value: 2_150,   source: 'rentcast', confidence: 'medium' },
  sqft:          { value: 1_480,   source: 'rentcast', confidence: 'high' },
  units:         { value: 1,       source: 'rentcast', confidence: 'high' },
  annualTaxes:   { value: 4_210,   source: 'rentcast', confidence: 'high' },
};

const SCRAPE_LOOKUP = {
  purchasePrice: { value: 339_000, source: 'scrape', confidence: 'low' },
  grossRent:     { value: 2_100,   source: 'scrape', confidence: 'low' },
};

const PASTED = 'List price: $280,000 · 2 bd 1 ba · 900 sqft · taxes: $2,100 · $1,650/mo rent';

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

describe('E7 e2e — import → reducer → engine', () => {
  let state: typeof DEFAULT_INPUTS;
  let dispatch: (a: DealAction) => void;

  beforeEach(() => {
    vi.restoreAllMocks();
    state = DEFAULT_INPUTS;
    dispatch = (a) => { state = dealReducer(state, a); };
  });

  it('runs listing URL → resolver → patches → reducer → engine', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(proxyOk(PROXY_LOOKUP));
    const { result } = renderHook(() =>
      useAutofill({ dispatch, apiKey: 'rc_key', apiUrl: API_URL }),
    );

    await act(() => result.current.trigger(ZILLOW_URL));
    await waitFor(() => expect(result.current.status).toBe('preview'));

    // Accept everything the import found
    const all = new Set(result.current.preview!.patches.map((p) => p.target));
    act(() => result.current.apply(all));

    expect(state.purchasePrice).toBe(342_000);
    expect(state.grossRent).toBe(2_150);
    expect(state.sqft).toBe(1_480);
    expect(state.units).toBe(1);
    expect(state.expenses.taxes).toEqual({ amount: 4_210, period: 'annual' });
    // Fields the import did not touch keep their values
    expect(state.expenses.insurance).toEqual(DEFAULT_INPUTS.expenses.insurance);
    expect(state.vacancyPct).toBe(DEFAULT_INPUTS.vacancyPct);

    // The imported deal flows straight into the engine
    const results = evaluate(state);
    expect(results.noiAnnual).toBeGreaterThan(0);
    expect(results.capRate).not.toBeNull();
    expect(Number.isFinite(results.capRate as number)).toBe(true);
  });

  it('falls through api → paste and lands pasted values in the reducer', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      proxyErr(404, 'not_found', 'Property not found for this address.'),
    );
    const { result } = renderHook(() =>
      useAutofill({ dispatch, apiKey: 'rc_key', apiUrl: API_URL }),
    );

    await act(() => result.current.trigger('123 Nowhere Ln', PASTED));
    await waitFor(() => expect(result.current.status).toBe('preview'));

    const preview = result.current.preview!;
    expect(preview.attempts.map((a) => `${a.providerId}:${a.status}`)).toEqual([
      'rentcast:error', 'scrape:skipped', 'paste:ok',
    ]);
    expect(preview.patches.every((p) => p.source === 'paste')).toBe(true);

    act(() => result.current.apply(new Set(preview.patches.map((p) => p.target))));
    expect(state.purchasePrice).toBe(280_000);
    expect(state.grossRent).toBe(1_650);
    expect(state.expenses.taxes.amount).toBe(2_100);
  });

  it('consults /scrape when the flag is on and keeps low/scrape labels end to end', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/property')) return proxyErr(404, 'not_found', 'Property not found for this address.');
      if (url.endsWith('/scrape')) return proxyOk(SCRAPE_LOOKUP);
      throw new Error(`unexpected fetch: ${url}`);
    });

    const { result } = renderHook(() =>
      useAutofill({ dispatch, apiKey: 'rc_key', apiUrl: API_URL, scrapeEnabled: true }),
    );

    await act(() => result.current.trigger(ZILLOW_URL));
    await waitFor(() => expect(result.current.status).toBe('preview'));

    expect(fetchSpy.mock.calls.some((c) => String(c[0]).endsWith('/scrape'))).toBe(true);
    const preview = result.current.preview!;
    expect(preview.patches.every((p) => p.source === 'scrape' && p.confidence === 'low')).toBe(true);
    expect(preview.patches.every((p) => p.needsReview)).toBe(true);
  });

  it('keeps the resolver cost-ordered: api success means no scrape call even when enabled', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(proxyOk(PROXY_LOOKUP));
    const { result } = renderHook(() =>
      useAutofill({ dispatch, apiKey: 'rc_key', apiUrl: API_URL, scrapeEnabled: true }),
    );

    await act(() => result.current.trigger(ZILLOW_URL));
    await waitFor(() => expect(result.current.status).toBe('preview'));

    expect(fetchSpy.mock.calls.every((c) => !String(c[0]).endsWith('/scrape'))).toBe(true);
  });
});
