/**
 * E7 — tiered property import hook (RPE-43d, rebuilt on the resolver in RPE-53)
 *
 * Accepts a street address OR a listing URL (parsed via parseListingUrl,
 * never fetched) plus optional pasted listing text, runs the tiered
 * provider chain (RentCast api → flagged scrape → paste heuristics), and
 * maps the merged PropertyLookup into DealInputs PATCHES for the review
 * panel. apply() dispatches only the targets the user accepted — the
 * never-silently-overwrite contract lives in the panel + patch model.
 *
 * Paste-only imports work WITHOUT a RentCast key: the paste tier is
 * local heuristics, zero network.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Dispatch } from 'react';
import {
  createPasteTextProvider,
  createRentCastProxyProvider,
  createScrapeProxyProvider,
  mapLookupToDealInputs,
  parseListingUrl,
  resolveProperty,
  type DealInputPatch,
  type DealPatchTarget,
  type LookupRequest,
  type MappedLookup,
  type ProviderAttempt,
} from '@rpe/property';
import type { DealAction } from '../state/dealReducer';

type AutofillStatus = 'idle' | 'loading' | 'preview' | 'error';

export interface ImportPreview {
  patches: DealInputPatch[];
  meta: MappedLookup['meta'];
  attempts: ProviderAttempt[];
}

interface UseAutofillOptions {
  dispatch: Dispatch<DealAction>;
  apiKey: string | null;
  /** Base URL of apps/api, e.g. 'http://localhost:3001'. Defaults to 'http://localhost:3001'. */
  apiUrl?: string;
  /** Scrape tier opt-in — OFF by default (ToS/product call, RPE-51). */
  scrapeEnabled?: boolean;
}

export interface UseAutofillReturn {
  status: AutofillStatus;
  preview: ImportPreview | null;
  errorMessage: string | null;
  /** input: address or listing URL; pastedText: copied listing text. */
  trigger: (input: string, pastedText?: string) => Promise<void>;
  /** Dispatch only the accepted targets into the deal form. */
  apply: (selected: ReadonlySet<DealPatchTarget>) => void;
  dismiss: () => void;
}

function attemptsToMessage(attempts: ProviderAttempt[]): string {
  const codes = attempts.filter((a) => a.status === 'error').map((a) => a.error ?? '');
  const text = codes.join(' ');
  if (text.includes('Invalid or expired API key')) return 'Invalid API key — update it in ⚙ Settings.';
  if (text.includes('not found')) return 'Property not found. Check the address and try again.';
  if (text.includes('Rate limit') || text.includes('Too many')) return 'Rate limit reached — try again later.';
  if (attempts.every((a) => a.status === 'skipped')) {
    return 'Nothing to import — connect RentCast in ⚙ Settings or paste the listing text.';
  }
  return 'Import found no usable data. Try pasting the listing text.';
}

export function useAutofill({
  dispatch,
  apiKey,
  apiUrl,
  scrapeEnabled = false,
}: UseAutofillOptions): UseAutofillReturn {
  const [status, setStatus]             = useState<AutofillStatus>('idle');
  const [preview, setPreview]           = useState<ImportPreview | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolvedApiUrl = apiUrl ?? 'http://localhost:3001';

  // resolveProperty has no abort signal — a monotonic request id makes
  // stale completions no-ops (same guarantee the old AbortController gave).
  const requestIdRef = useRef(0);
  useEffect(() => () => { requestIdRef.current += 1; }, []);

  const apiKeyRef = useRef(apiKey);
  apiKeyRef.current = apiKey;

  const providers = useMemo(
    () => [
      createRentCastProxyProvider({ apiUrl: resolvedApiUrl, getApiKey: () => apiKeyRef.current }),
      createScrapeProxyProvider({ apiUrl: resolvedApiUrl, enabled: scrapeEnabled }),
      createPasteTextProvider(),
    ],
    [resolvedApiUrl, scrapeEnabled],
  );

  const trigger = useCallback(
    async (input: string, pastedText?: string) => {
      const trimmed = input.trim();
      const pasted = pastedText?.trim() ?? '';
      if (trimmed === '' && pasted === '') return;

      const requestId = ++requestIdRef.current;
      setStatus('loading');
      setErrorMessage(null);
      setPreview(null);

      // A listing URL becomes { url, address? } — the URL itself is only
      // ever fetched by the (flagged) scrape tier; the parsed address
      // feeds the licensed API tier.
      const request: LookupRequest = {};
      if (trimmed !== '') {
        const parsedInput = parseListingUrl(trimmed);
        if (parsedInput.kind === 'listing') {
          request.url = trimmed;
          if (parsedInput.listing.address !== null) request.address = parsedInput.listing.address;
        } else {
          request.address = parsedInput.address;
        }
      }
      if (pasted !== '') request.pastedText = pasted;

      const resolved = await resolveProperty(request, providers);
      if (requestId !== requestIdRef.current) return; // stale — superseded or unmounted

      const mapped = mapLookupToDealInputs(resolved.lookup);
      if (mapped.patches.length === 0) {
        setStatus('error');
        setErrorMessage(attemptsToMessage(resolved.attempts));
        return;
      }

      setPreview({ patches: mapped.patches, meta: mapped.meta, attempts: resolved.attempts });
      setStatus('preview');
    },
    [providers],
  );

  const apply = useCallback(
    (selected: ReadonlySet<DealPatchTarget>) => {
      if (!preview) return;

      for (const patch of preview.patches) {
        if (!selected.has(patch.target)) continue;
        switch (patch.target) {
          case 'purchasePrice':
          case 'grossRent':
          case 'sqft':
          case 'units':
            if (patch.value.kind === 'number') {
              dispatch({ type: 'SET_NUMBER', field: patch.target, value: patch.value.amount });
            }
            break;
          case 'expenses.taxes':
            if (patch.value.kind === 'expense') {
              dispatch({ type: 'SET_EXPENSE_FIXED', field: 'taxes', amount: patch.value.amount, period: 'annual' });
            }
            break;
          case 'expenses.insurance':
            if (patch.value.kind === 'expense') {
              dispatch({ type: 'SET_EXPENSE_FIXED', field: 'insurance', amount: patch.value.amount, period: 'annual' });
            }
            break;
        }
      }

      setPreview(null);
      setStatus('idle');
    },
    [dispatch, preview],
  );

  const dismiss = useCallback(() => {
    setPreview(null);
    setErrorMessage(null);
    setStatus('idle');
  }, []);

  return { status, preview, errorMessage, trigger, apply, dismiss };
}
