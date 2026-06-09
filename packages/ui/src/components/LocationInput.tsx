import { useState } from 'react';
import { isValidZip5 } from '../state/locationState';

export interface LocationInputProps {
  /** Current ZIP ('' = not yet set). */
  zip: string;
  /** Resolved state code ('TX', 'CA', …) — empty string until resolved. */
  stateCode: string;
  /** Human-readable label for the resolved location (e.g. 'TX · 78701'). */
  label: string;
  /** True while useLocationDefaults is fetching the region. */
  resolving?: boolean;
  /** Called with a valid ZIP5 when the user submits. */
  onZipChange: (zip: string) => void;
  /** Called when the user clears the location. */
  onClear: () => void;
}

/**
 * Location input for regional assumption defaults (RPE-64).
 *
 * Render states:
 * 1. Resolved: shows a chip "TX · 78701 ×" — input hidden.
 * 2. Unresolved/empty: shows a ZIP5 text input + "Set" button.
 * 3. Resolving: input disabled, loading indicator shown.
 *
 * Accepts either plain ZIP5 ("78701") or "City, ST XXXXX" (the ZIP is extracted).
 */
export function LocationInput({
  zip,
  stateCode,
  label,
  resolving = false,
  onZipChange,
  onClear,
}: LocationInputProps) {
  const [draft, setDraft] = useState('');
  const [validationError, setValidationError] = useState('');

  const isResolved = zip !== '' && stateCode !== '';

  const extractZip = (value: string): string => {
    const trimmed = value.trim();
    // All-digit input: require exactly 5 — never silently truncate "123456" → "23456"
    if (/^\d+$/.test(trimmed)) {
      return /^\d{5}$/.test(trimmed) ? trimmed : '';
    }
    // "City, ST XXXXX" format: trailing ZIP5 must be preceded by a non-digit
    const match = trimmed.match(/(?:[^\d])(\d{5})$/);
    return match ? (match[1] ?? '') : '';
  };

  const handleSubmit = () => {
    const z = extractZip(draft);
    if (!isValidZip5(z)) {
      setValidationError('Enter a 5-digit ZIP code.');
      return;
    }
    setValidationError('');
    setDraft('');
    onZipChange(z);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit();
  };

  const handleClear = () => {
    setDraft('');
    setValidationError('');
    onClear();
  };

  // ── Resolved chip ────────────────────────────────────────────────────────────
  if (isResolved) {
    return (
      <div className="px-5 py-2.5 border-b border-border flex items-center gap-2">
        <span className="text-xs text-lo uppercase tracking-widest select-none">📍 Location</span>
        <span
          className="
            inline-flex items-center gap-1.5 rounded-full
            bg-raised border border-border
            px-2.5 py-0.5 text-xs text-mid
          "
        >
          {label || `${stateCode} · ${zip}`}
          <button
            type="button"
            onClick={handleClear}
            aria-label={`Clear location ${label || zip}`}
            className="
              text-lo hover:text-fail transition-colors
              leading-none rounded-full focus:outline-none focus:ring-1 focus:ring-accent
            "
          >
            ×
          </button>
        </span>
      </div>
    );
  }

  // ── Unresolved / input state ─────────────────────────────────────────────────
  return (
    <div className="px-5 py-2.5 border-b border-border space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-lo uppercase tracking-widest select-none">📍 Location</span>
        <div className="flex flex-1 gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setValidationError(''); }}
            onKeyDown={handleKeyDown}
            placeholder="ZIP code (e.g. 78701)"
            disabled={resolving}
            aria-label="ZIP code for local defaults"
            aria-describedby={validationError ? 'location-error' : undefined}
            className="
              flex-1 rounded border border-border bg-base px-3 py-1 text-xs text-hi
              placeholder:text-lo
              focus:border-accent focus:outline-none
              disabled:opacity-50
            "
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={resolving || !draft.trim()}
            aria-label="Look up location defaults"
            className="
              rounded border border-border px-3 py-1 text-xs text-mid uppercase tracking-widest
              hover:border-accent hover:text-accent transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            {resolving ? '…' : 'Set'}
          </button>
        </div>
      </div>
      {zip !== '' && stateCode === '' && (
        <div className="flex items-center gap-2">
          <p className="text-xs text-yellow-400/80">
            {resolving ? `Resolving ${zip}…` : `${zip} pending`}
          </p>
          <button
            type="button"
            onClick={handleClear}
            aria-label={`Clear pending location ${zip}`}
            className="
              text-xs text-lo hover:text-fail transition-colors
              leading-none rounded-full focus:outline-none focus:ring-1 focus:ring-accent
            "
          >
            ×
          </button>
        </div>
      )}
      {validationError && (
        <p id="location-error" className="text-xs text-red-400" role="alert">
          {validationError}
        </p>
      )}
    </div>
  );
}
