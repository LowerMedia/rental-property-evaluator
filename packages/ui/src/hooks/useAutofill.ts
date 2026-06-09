import { useState, useCallback } from 'react';
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
  /** Base URL of apps/api, e.g. 'http://localhost:3001'. Defaults to VITE_API_URL or http://localhost:3001 */
  apiUrl?: string;
}

export interface UseAutofillReturn {
  status: AutofillStatus;
  previewData: PropertyData | null;
  errorMessage: string | null;
  trigger: (address: string) => void;
  apply: () => void;
  dismiss: () => void;
}

function httpStatusToMessage(status: number): string {
  if (status === 401) return 'Invalid API key — update it in ⚙ Settings.';
  if (status === 404) return 'Property not found. Check the address and try again.';
  if (status === 402) return 'Rate limit reached (50 req/mo on the free tier).';
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

  const trigger = useCallback(
    async (address: string) => {
      if (!apiKey || !address.trim()) return;

      setStatus('loading');
      setErrorMessage(null);

      try {
        const res = await fetch(`${resolvedApiUrl}/property`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: address.trim(), apiKey }),
        });

        if (!res.ok) {
          setStatus('error');
          setErrorMessage(httpStatusToMessage(res.status));
          return;
        }

        const body = (await res.json()) as { data: PropertyData };
        setPreviewData(body.data);
        setStatus('preview');
      } catch {
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
