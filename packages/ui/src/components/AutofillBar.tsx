/**
 * E7 — import bar (RPE-43d, extended into the paste/import bar in RPE-53)
 *
 * Accepts a street address OR a listing URL, with a collapsible
 * "paste listing text" area as the zero-key fallback. Paste-only imports
 * work without a RentCast key (local heuristics), so the bar stays
 * functional even before Settings are configured.
 */

import { useState } from 'react';
import { useAutofill } from '../hooks/useAutofill';
import { AutofillPreviewPopover, type CurrentFormValues } from './AutofillPreviewPopover';
import type { Dispatch } from 'react';
import type { DealAction } from '../state/dealReducer';

interface AutofillBarProps {
  dispatch: Dispatch<DealAction>;
  apiKey: string | null;
  apiUrl?: string;
  /** Scrape tier opt-in — OFF by default (RPE-51 product/legal gate). */
  scrapeEnabled?: boolean;
  currentValues?: CurrentFormValues;
}

export function AutofillBar({ dispatch, apiKey, apiUrl, scrapeEnabled, currentValues }: AutofillBarProps) {
  const [input, setInput] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const { status, preview, errorMessage, trigger, apply, dismiss } = useAutofill({
    dispatch,
    apiKey,
    apiUrl,
    scrapeEnabled,
  });

  const busy = status === 'loading' || status === 'preview';
  const canTrigger = input.trim() !== '' || pastedText.trim() !== '';

  const handleTrigger = () => {
    if (canTrigger) void trigger(input, pastedText);
  };

  const reset = () => {
    setInput('');
    setPastedText('');
    setPasteOpen(false);
  };

  return (
    <div className="px-5 py-3 border-b border-border space-y-2">
      {/* Label */}
      <p className="text-xs uppercase tracking-widest text-lo">⚡ Import from address, listing URL, or pasted text</p>

      {!apiKey && (
        <p className="text-xs text-lo italic">
          Connect RentCast in <span className="text-mid not-italic">⚙ Settings</span> for full
          lookups — or paste the listing text below.
        </p>
      )}

      {/* Input row */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleTrigger(); }}
          placeholder="123 Main St, Austin TX — or a Zillow/Redfin/… listing URL"
          disabled={busy}
          className="
            flex-1 rounded border border-border bg-base px-3 py-1.5
            text-xs text-hi placeholder:text-lo
            focus:border-accent focus:outline-none
            disabled:opacity-50
          "
          aria-label="Property address or listing URL for import"
        />
        <button
          type="button"
          onClick={() => setPasteOpen((open) => !open)}
          disabled={busy}
          aria-expanded={pasteOpen}
          className="
            rounded border border-border px-3 py-1.5 text-xs text-mid
            hover:border-accent hover:text-accent transition-colors
            disabled:opacity-40
          "
        >
          {pasteOpen ? 'Hide paste' : 'Paste text'}
        </button>
        <button
          type="button"
          onClick={handleTrigger}
          disabled={busy || !canTrigger}
          className="
            rounded border border-border px-3 py-1.5 text-xs text-mid uppercase tracking-widest
            hover:border-accent hover:text-accent transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed
          "
          aria-label={status === 'loading' ? 'Importing property…' : 'Import property data'}
        >
          {status === 'loading' ? '…' : 'Import'}
        </button>
      </div>

      {/* Paste area */}
      {pasteOpen && (
        <textarea
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          placeholder="Paste the listing's copied text here — price, beds/baths, sqft, taxes are picked up automatically."
          disabled={busy}
          rows={4}
          className="
            w-full rounded border border-border bg-base px-3 py-1.5
            text-xs text-hi placeholder:text-lo
            focus:border-accent focus:outline-none
            disabled:opacity-50
          "
          aria-label="Pasted listing text"
        />
      )}

      {/* Error message */}
      {status === 'error' && errorMessage && (
        <p className="text-xs text-red-400" role="alert">{errorMessage}</p>
      )}

      {/* Review panel */}
      {status === 'preview' && preview && (
        <AutofillPreviewPopover
          patches={preview.patches}
          meta={preview.meta}
          onApply={(selected) => { apply(selected); reset(); }}
          onDismiss={() => { dismiss(); reset(); }}
          currentValues={currentValues}
        />
      )}
    </div>
  );
}
