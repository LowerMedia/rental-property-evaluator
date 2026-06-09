import { useState } from 'react';
import { useAutofill } from '../hooks/useAutofill';
import { AutofillPreviewPopover } from './AutofillPreviewPopover';
import type { Dispatch } from 'react';
import type { DealAction } from '../state/dealReducer';

interface AutofillBarProps {
  dispatch: Dispatch<DealAction>;
  apiKey: string | null;
}

/**
 * Persistent address input bar rendered above the Acquisition section.
 * Wraps useAutofill — handles all four states: idle, loading, error, preview.
 *
 * When apiKey is null (user hasn't connected RentCast), shows a prompt
 * directing them to ⚙ Settings instead of the input.
 */
export function AutofillBar({ dispatch, apiKey }: AutofillBarProps) {
  const [address, setAddress] = useState('');
  const { status, previewData, errorMessage, trigger, apply, dismiss } = useAutofill({ dispatch, apiKey });

  if (!apiKey) {
    return (
      <div className="px-5 py-3 border-b border-border bg-raised/50">
        <p className="text-xs text-lo italic">
          Connect RentCast in{' '}
          <span className="text-mid not-italic">⚙ Settings</span>{' '}
          to enable address autofill.
        </p>
      </div>
    );
  }

  const handleTrigger = () => {
    if (address.trim()) trigger(address);
  };

  return (
    <div className="px-5 py-3 border-b border-border space-y-2">
      {/* Label */}
      <p className="text-xs uppercase tracking-widest text-lo">⚡ Autofill from address</p>

      {/* Input row */}
      <div className="flex gap-2">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleTrigger(); }}
          placeholder="123 Main St, Austin TX 78701"
          disabled={status === 'loading' || status === 'preview'}
          className="
            flex-1 rounded border border-border bg-base px-3 py-1.5
            text-xs text-hi placeholder:text-lo
            focus:border-accent focus:outline-none
            disabled:opacity-50
          "
          aria-label="Property address for autofill"
        />
        <button
          type="button"
          onClick={handleTrigger}
          disabled={status === 'loading' || status === 'preview' || !address.trim()}
          className="
            rounded border border-border px-3 py-1.5 text-xs text-mid uppercase tracking-widest
            hover:border-accent hover:text-accent transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed
          "
          aria-label={status === 'loading' ? 'Looking up property…' : 'Autofill from address'}
        >
          {status === 'loading' ? '…' : 'Fill'}
        </button>
      </div>

      {/* Error message */}
      {status === 'error' && errorMessage && (
        <p className="text-xs text-red-400" role="alert">{errorMessage}</p>
      )}

      {/* Preview popover */}
      {status === 'preview' && previewData && (
        <AutofillPreviewPopover
          data={previewData}
          onApply={() => { apply(); setAddress(''); }}
          onDismiss={dismiss}
        />
      )}
    </div>
  );
}
