import { useState, useCallback, useRef, useEffect } from 'react';
import type { Dispatch } from 'react';
import type { DealAction } from '../state/dealReducer';

export interface PropertyData {
  purchasePrice: number;
  grossRent: number;
  sqft: number | null;
  units: number | null;
  annualTaxes: number | null;
}

type AutofillStatus = 'idle' | 'loading' | 'preview' | 'error';

interface UseAutofillOptions {
  dispatch: Dispatch<DealAction>;
  apiKey: string | null;
  /** Base URL of apps/api, e.g. 'http://localhost:3001'. Defaults to 'http://localhost:3001'. */
  apiUrl?: string;
}

export interface UseAutofillReturn {
  status: AutofillStatus;
  previewData: PropertyData | null;
  errorMessage: string | null;
  trigger: (address: string) => Promise<void>;
  apply: () => void;
  dismiss: () => void;
}

function httpStatusToMessage(status: number): string {
  if (status === 401) return 'Invalid API key — update it in ⚙ Settings.';
  if (status === 404) return 'Property not found. Check the address and try again.';
  if (status === 429) return 'Rate limit reached (50 req/mo on the free tier).';
  return 'Lookup failed. Please try again.';
}

export function useAutofill({
  dispatch,
  apiKey,
  apiUrl,
}: UseAutofillOptions): UseAutofillReturn {
  const [status, setStatus]             = useState<AutofillStatus>('idle');
  const [previewData, setPreviewData]   = useState<PropertyData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolvedApiUrl = apiUrl ?? 'http://localhost:3001';

  // Tracks the AbortController for the latest in-flight request so a new
  // trigger() call can cancel a stale one and avoid out-of-order state updates.
  const abortRef = useRef<AbortController | null>(null);

  // Abort any in-flight request on unmount to prevent state updates on an
  // unmounted component.
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const trigger = useCallback(
    async (address: string) => {
      if (!apiKey || !address.trim()) return;

      // Cancel any in-flight request before starting a new one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus('loading');
      setErrorMessage(null);
      setPreviewData(null);

      try {
        const res = await fetch(`${resolvedApiUrl}/property`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: address.trim(), apiKey }),
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (!res.ok) {
          setStatus('error');
          setErrorMessage(httpStatusToMessage(res.status));
          return;
        }

        const body = (await res.json()) as { data: PropertyData };
        if (controller.signal.aborted) return;
        setPreviewData(body.data);
        setStatus('preview');
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        setStatus('error');
        setErrorMessage('Network error — check that apps/api is running.');
      }
    },
    [apiKey, resolvedApiUrl],
  );

  const apply = useCallback(() => {
    if (!previewData) return;

    dispatch({ type: 'SET_NUMBER', field: 'purchasePrice', value: previewData.purchasePrice });
    dispatch({ type: 'SET_NUMBER', field: 'grossRent', value: previewData.grossRent });

    if (previewData.sqft !== null) {
      dispatch({ type: 'SET_NUMBER', field: 'sqft', value: previewData.sqft });
    }
    if (previewData.units !== null) {
      dispatch({ type: 'SET_NUMBER', field: 'units', value: previewData.units });
    }
    if (previewData.annualTaxes !== null) {
      dispatch({ type: 'SET_EXPENSE_FIXED', field: 'taxes', amount: previewData.annualTaxes, period: 'annual' });
    }

    setPreviewData(null);
    setStatus('idle');
  }, [dispatch, previewData]);

  const dismiss = useCallback(() => {
    setPreviewData(null);
    setErrorMessage(null);
    setStatus('idle');
  }, []);

  return { status, previewData, errorMessage, trigger, apply, dismiss };
}
