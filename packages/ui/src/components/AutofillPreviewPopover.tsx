/**
 * E7 — import review/override panel (RPE-53; evolved from the RPE-43d preview)
 *
 * Lists every patch the tiered import produced with its source badge,
 * confidence chip, and an accept checkbox. Selection defaults encode the
 * never-silently-overwrite contract:
 *   - needs-review (low confidence) rows start UNCHECKED
 *   - rows that would overwrite a non-empty, differing current value
 *     start UNCHECKED (explicit confirm)
 *   - everything else starts checked
 */

import { useEffect, useMemo, useState } from 'react';
import type { DealInputPatch, DealPatchTarget, MappedLookup } from '@rpe/property';
import { fmtCurrency } from '../utils/format';
import { DEFAULT_INPUTS } from '../state/defaultInputs';

export interface CurrentFormValues {
  purchasePrice?: number | null;
  grossRent?: number | null;
  sqft?: number | null;
  units?: number | null;
  annualTaxes?: number | null;
  annualInsurance?: number | null;
}

interface AutofillPreviewPopoverProps {
  patches: DealInputPatch[];
  meta: MappedLookup['meta'];
  onApply: (selected: ReadonlySet<DealPatchTarget>) => void;
  onDismiss: () => void;
  currentValues?: CurrentFormValues;
}

const TARGET_LABELS: Record<DealPatchTarget, string> = {
  purchasePrice: 'Purchase Price',
  grossRent: 'Gross Rent (mo)',
  sqft: 'Square Footage',
  units: 'Units',
  'expenses.taxes': 'Property Taxes (yr)',
  'expenses.insurance': 'Insurance (yr)',
};

const SOURCE_LABELS: Record<string, string> = {
  rentcast: 'RentCast',
  scrape: 'Scraped — unverified',
  paste: 'Pasted text',
};

function currentFor(target: DealPatchTarget, cur: CurrentFormValues): number | null | undefined {
  switch (target) {
    case 'purchasePrice': return cur.purchasePrice;
    case 'grossRent': return cur.grossRent;
    case 'sqft': return cur.sqft;
    case 'units': return cur.units;
    case 'expenses.taxes': return cur.annualTaxes;
    case 'expenses.insurance': return cur.annualInsurance;
  }
}

/** App default for a target — a current value still at its default was
 * never edited by the user, so importing over it is not an overwrite. */
function defaultFor(target: DealPatchTarget): number | undefined {
  switch (target) {
    case 'purchasePrice': return DEFAULT_INPUTS.purchasePrice;
    case 'grossRent': return DEFAULT_INPUTS.grossRent;
    case 'sqft': return DEFAULT_INPUTS.sqft;
    case 'units': return DEFAULT_INPUTS.units;
    case 'expenses.taxes': return DEFAULT_INPUTS.expenses.taxes.amount;
    case 'expenses.insurance': return DEFAULT_INPUTS.expenses.insurance?.amount;
  }
}

function fmtValue(target: DealPatchTarget, amount: number): string {
  if (target === 'sqft') return `${amount.toLocaleString()} sqft`;
  if (target === 'units') return String(amount);
  return fmtCurrency(amount);
}

function confidenceClasses(confidence: DealInputPatch['confidence']): string {
  if (confidence === 'high') return 'text-green-400 border-green-400/40';
  if (confidence === 'medium') return 'text-amber-300 border-amber-300/40';
  return 'text-red-400 border-red-400/40';
}

export function AutofillPreviewPopover({
  patches,
  meta,
  onApply,
  onDismiss,
  currentValues,
}: AutofillPreviewPopoverProps) {
  // Dismiss on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDismiss]);

  const cur = useMemo(() => currentValues ?? {}, [currentValues]);

  const defaultSelection = useMemo(() => {
    const selected = new Set<DealPatchTarget>();
    for (const patch of patches) {
      if (patch.needsReview) continue; // low confidence — explicit opt-in
      const existing = currentFor(patch.target, cur);
      const userEdited =
        existing != null && existing !== 0 &&
        existing !== defaultFor(patch.target) && // untouched defaults are not edits
        patch.value.amount !== existing;
      if (userEdited) continue; // user typed a value here — confirm, never silent
      selected.add(patch.target);
    }
    return selected;
  }, [patches, cur]);

  const [selected, setSelected] = useState<Set<DealPatchTarget>>(defaultSelection);

  // A new import while the panel is open replaces the patches — re-derive
  // the selection defaults rather than carrying stale choices over
  useEffect(() => {
    setSelected(defaultSelection);
  }, [defaultSelection]);

  const toggle = (target: DealPatchTarget) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(target)) next.delete(target);
      else next.add(target);
      return next;
    });
  };

  const metaBits = [
    meta.bedrooms !== undefined ? `${meta.bedrooms.value} bd` : null,
    meta.bathrooms !== undefined ? `${meta.bathrooms.value} ba` : null,
    meta.yearBuilt !== undefined ? `built ${meta.yearBuilt.value}` : null,
  ].filter((b): b is string => b !== null);

  return (
    <div
      className="rounded border border-accent/50 bg-raised shadow-lg overflow-hidden"
      role="dialog"
      aria-label="Import review"
    >
      {/* Header */}
      <div className="flex items-center justify-between bg-accent/10 px-4 py-2 border-b border-border">
        <span className="text-xs font-medium text-accent">⚡ Review imported values</span>
        {metaBits.length > 0 && (
          <span className="text-xs text-mid">{metaBits.join(' · ')}</span>
        )}
      </div>

      {/* Patch rows */}
      <div>
        {patches.map((patch, i) => {
          const existing = currentFor(patch.target, cur);
          const isOn = selected.has(patch.target);
          return (
            <label
              key={patch.target}
              className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 items-center px-4 py-2 text-xs cursor-pointer ${
                i % 2 === 1 ? 'bg-base' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={isOn}
                onChange={() => toggle(patch.target)}
                aria-label={`Apply ${TARGET_LABELS[patch.target]}`}
                className="accent-current"
              />
              <span className="text-mid">
                {TARGET_LABELS[patch.target]}
                <span
                  className={`ml-2 rounded border px-1 py-px text-[10px] uppercase tracking-wide ${confidenceClasses(patch.confidence)}`}
                  title={`Confidence: ${patch.confidence}`}
                >
                  {patch.needsReview ? 'needs review' : patch.confidence}
                </span>
              </span>
              <span className="text-lo text-[10px] uppercase tracking-wide" title={`Source: ${patch.source}`}>
                {SOURCE_LABELS[patch.source] ?? patch.source}
              </span>
              <span className="text-lo line-through">
                {existing != null && existing !== 0 ? fmtValue(patch.target, existing) : '—'}
              </span>
              <span className={isOn ? 'text-green-400 font-medium' : 'text-lo'}>
                {fmtValue(patch.target, patch.value.amount)}
              </span>
            </label>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 border-t border-border px-4 py-2">
        <button
          type="button"
          onClick={onDismiss}
          className="
            rounded border border-border px-3 py-1 text-xs text-mid
            hover:border-accent hover:text-accent transition-colors
          "
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onApply(selected)}
          disabled={selected.size === 0}
          className="
            rounded bg-accent px-3 py-1 text-xs font-medium text-base
            hover:opacity-90 transition-opacity
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          Apply {selected.size > 0 ? `${selected.size} ` : ''}→
        </button>
      </div>
    </div>
  );
}
