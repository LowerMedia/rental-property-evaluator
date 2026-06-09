import { useState, useEffect, useId, useRef } from 'react';
import { getRentCastKey, setRentCastKey, clearRentCastKey } from '../state/connectorStorage';

interface ConnectorSettingsModalProps {
  onClose: () => void;
}

/**
 * Settings modal — Data Connectors section.
 *
 * Opened by the ⚙ Settings button in the Evaluator header.
 * Manages the RentCast API key (read/write/clear to localStorage).
 * Designed to grow: additional settings (dark mode, etc.) slot in below.
 */
export function ConnectorSettingsModal({ onClose }: ConnectorSettingsModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [storedKey, setStoredKey] = useState<string | null>(() => getRentCastKey());
  const [inputValue, setInputValue]   = useState('');
  const [isEditing, setIsEditing]     = useState(storedKey === null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    panel.addEventListener('keydown', handler);
    return () => panel.removeEventListener('keydown', handler);
  }, [isEditing]); // re-query focusable elements when editing state changes

  const handleSave = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setRentCastKey(trimmed);
    const persisted = getRentCastKey();
    setStoredKey(persisted);
    setInputValue('');
    setIsEditing(persisted === null);
  };

  const handleRemove = () => {
    clearRentCastKey();
    const persisted = getRentCastKey();
    setStoredKey(persisted);
    setInputValue('');
    setIsEditing(persisted === null);
  };

  const handleChange = () => {
    setInputValue('');
    setIsEditing(true);
  };

  // Mask key: show last 4 chars, mask the rest (prefix-agnostic)
  const maskedKey = storedKey
    ? `${'•'.repeat(Math.max(0, storedKey.length - 4))}${storedKey.slice(-4)}`
    : null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-lg border border-border bg-base shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id={titleId} className="text-sm font-semibold text-hi">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-lo hover:text-hi transition-colors"
            aria-label="Close settings"
            autoFocus={storedKey !== null && !isEditing}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Section label */}
          <p className="text-xs uppercase tracking-widest text-lo">Data Connectors</p>

          {/* RentCast row */}
          <div className="rounded border border-border bg-raised p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-hi">RentCast</span>
                {storedKey && (
                  <span className="rounded-full bg-green-900/50 px-2 py-0.5 text-xs text-green-400">
                    ● Connected
                  </span>
                )}
              </div>
              {storedKey && !isEditing && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>

            {isEditing ? (
              <div className="flex gap-2">
                <input
                  type="password"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                  placeholder="rc_live_…"
                  className="
                    flex-1 rounded border border-border bg-base px-3 py-1.5
                    text-xs text-hi placeholder:text-lo
                    focus:border-accent focus:outline-none
                  "
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="RentCast API key"
                />
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!inputValue.trim()}
                  className="
                    rounded border border-accent px-3 py-1.5 text-xs text-accent
                    hover:bg-accent hover:text-base transition-colors
                    disabled:opacity-40 disabled:cursor-not-allowed
                  "
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="flex gap-2 items-center">
                <code
                  className="flex-1 rounded border border-border bg-base px-3 py-1.5 text-xs text-lo font-mono overflow-hidden break-all"
                  aria-label={storedKey ? `API key ending in ${storedKey.slice(-4)}` : undefined}
                >
                  {maskedKey}
                </code>
                <button
                  type="button"
                  onClick={handleChange}
                  className="
                    rounded border border-border px-3 py-1.5 text-xs text-mid
                    hover:border-accent hover:text-accent transition-colors
                  "
                >
                  Change
                </button>
              </div>
            )}

            <p className="text-xs text-lo">
              Free tier: 50 req/mo ·{' '}
              <a
                href="https://app.rentcast.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                Get a key at app.rentcast.io ↗
              </a>
            </p>
          </div>

          {/* Future connectors placeholder */}
          <div className="rounded border border-dashed border-border px-4 py-3">
            <p className="text-xs text-lo">+ Add another connector <span className="opacity-50">(coming soon)</span></p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="
              rounded border border-border px-4 py-1.5 text-xs text-mid
              hover:border-accent hover:text-accent transition-colors
            "
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
