import { useState, useRef, useEffect, useCallback } from 'react';
import type { DealInputs } from '@rpe/engine';
import type { SavedDeal } from '../state/savedDealsSchema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SavedDealsPanelProps {
  /** Current deal inputs — used for the save operation. */
  currentInputs: DealInputs;
  deals: SavedDeal[];
  onSave: (name: string) => void;
  onLoad: (deal: SavedDeal) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SavedDealsPanel({
  deals,
  onSave,
  onLoad,
  onDelete,
  onRename,
}: SavedDealsPanelProps) {
  // ── Save-as state ──
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const saveInputRef = useRef<HTMLInputElement>(null);

  // ── Deals dropdown state ──
  const [dealsOpen, setDealsOpen] = useState(false);
  const dealsRef = useRef<HTMLDivElement>(null);

  // ── Rename state ──
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus save input when it appears
  useEffect(() => {
    if (saving) saveInputRef.current?.focus();
  }, [saving]);

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  // Close deals dropdown on outside click
  useEffect(() => {
    if (!dealsOpen) return;
    function handleClick(e: MouseEvent) {
      if (dealsRef.current && !dealsRef.current.contains(e.target as Node)) {
        setDealsOpen(false);
        setRenamingId(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dealsOpen]);

  // ── Handlers ──

  const handleOpenSave = useCallback(() => {
    setDealsOpen(false);
    setSaveName('');
    setSaving(true);
  }, []);

  const handleCommitSave = useCallback(() => {
    if (!saveName.trim()) {
      setSaving(false);
      return;
    }
    onSave(saveName.trim());
    setSaving(false);
    setSaveName('');
  }, [saveName, onSave]);

  const handleSaveKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleCommitSave();
      if (e.key === 'Escape') setSaving(false);
    },
    [handleCommitSave],
  );

  const handleStartRename = useCallback((deal: SavedDeal) => {
    setRenamingId(deal.id);
    setRenamingValue(deal.name);
  }, []);

  const handleCommitRename = useCallback(
    (id: string) => {
      if (renamingValue.trim()) onRename(id, renamingValue.trim());
      setRenamingId(null);
    },
    [renamingValue, onRename],
  );

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      if (e.key === 'Enter') handleCommitRename(id);
      if (e.key === 'Escape') setRenamingId(null);
    },
    [handleCommitRename],
  );

  // ── Render ──

  return (
    <div className="flex items-center gap-2">
      {/* ── Save button / inline name input ── */}
      {saving ? (
        <div className="flex items-center gap-1.5">
          <input
            ref={saveInputRef}
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={handleSaveKeyDown}
            onBlur={() => setSaving(false)}
            placeholder="Deal name…"
            className="
              rounded border border-accent bg-input
              px-2.5 py-1 text-xs text-hi
              placeholder:text-lo focus:outline-none
              w-36
            "
          />
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault(); // prevent blur from firing first
              handleCommitSave();
            }}
            className="rounded border border-accent px-2.5 py-1 text-xs text-accent hover:bg-accent hover:text-base transition-colors"
          >
            Save
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setSaving(false);
            }}
            className="text-lo hover:text-mid text-xs px-1"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleOpenSave}
          className="
            rounded border border-border px-3 py-1.5
            text-xs text-mid uppercase tracking-widest
            hover:border-accent hover:text-accent
            transition-colors
          "
        >
          Save
        </button>
      )}

      {/* ── Deals dropdown ── */}
      <div ref={dealsRef} className="relative">
        <button
          type="button"
          onClick={() => {
            setSaving(false);
            setDealsOpen((o) => !o);
          }}
          className="
            rounded border border-border px-3 py-1.5
            text-xs text-mid uppercase tracking-widest
            hover:border-border-2 hover:text-hi
            transition-colors
          "
          aria-expanded={dealsOpen}
          aria-haspopup="listbox"
        >
          Deals{deals.length > 0 && (
            <span className="ml-1.5 text-accent font-mono">{deals.length}</span>
          )}
        </button>

        {dealsOpen && (
          <div
            role="listbox"
            className="
              absolute right-0 top-full mt-1.5 z-50
              w-72 rounded border border-border bg-surface
              shadow-[0_8px_24px_rgba(0,0,0,0.5)]
              overflow-hidden
            "
          >
            {deals.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-lo">
                No saved deals yet.
                <br />
                <span className="text-mid">Click Save to store the current inputs.</span>
              </p>
            ) : (
              <ul className="max-h-80 overflow-y-auto divide-y divide-border">
                {deals.map((deal) => (
                  <li
                    key={deal.id}
                    role="option"
                    aria-selected={false}
                    className="group flex items-center gap-2 px-4 py-3 hover:bg-raised transition-colors"
                  >
                    {/* Name / rename input */}
                    <div className="flex-1 min-w-0">
                      {renamingId === deal.id ? (
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={renamingValue}
                          onChange={(e) => setRenamingValue(e.target.value)}
                          onKeyDown={(e) => handleRenameKeyDown(e, deal.id)}
                          onBlur={() => handleCommitRename(deal.id)}
                          className="
                            w-full rounded border border-accent bg-input
                            px-2 py-0.5 text-xs text-hi focus:outline-none
                          "
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onLoad(deal);
                            setDealsOpen(false);
                          }}
                          className="block w-full text-left"
                        >
                          <span className="text-sm text-hi truncate block">{deal.name}</span>
                          <span className="text-[10px] text-lo">{fmtRelativeTime(deal.savedAt)}</span>
                        </button>
                      )}
                    </div>

                    {/* Actions — visible on hover */}
                    {renamingId !== deal.id && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartRename(deal)}
                          title="Rename"
                          className="p-1 text-lo hover:text-mid transition-colors"
                        >
                          {/* pencil icon */}
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M8.5 1.5a1.5 1.5 0 0 1 2 2L4 10l-2.5.5.5-2.5L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(deal.id)}
                          title="Delete"
                          className="p-1 text-lo hover:text-fail transition-colors"
                        >
                          {/* trash icon */}
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M2 3h8M5 3V2h2v1M4.5 3v6.5h3V3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
