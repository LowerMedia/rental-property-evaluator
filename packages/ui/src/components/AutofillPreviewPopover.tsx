import { useEffect } from 'react';
import { fmtCurrency } from '../utils/format';
import type { PropertyData } from '../hooks/useAutofill';

export interface CurrentFormValues {
  purchasePrice?: number | null;
  grossRent?: number | null;
  sqft?: number | null;
  units?: number | null;
  annualTaxes?: number | null;
}

interface AutofillPreviewPopoverProps {
  data: PropertyData;
  onApply: () => void;
  onDismiss: () => void;
  currentValues?: CurrentFormValues;
}

interface DiffRow {
  label: string;
  currentValue: string;
  value: string;
}

/**
 * Shows incoming RentCast values alongside current form values.
 * All non-null RentCast fields are listed (not filtered to changed-only).
 * Dismiss on Escape or Cancel; apply on Apply.
 */
export function AutofillPreviewPopover({ data, onApply, onDismiss, currentValues }: AutofillPreviewPopoverProps) {
  // Dismiss on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDismiss]);

  const cur = currentValues ?? {};
  const fmtCurrent = (v: number | null | undefined, fmt: (n: number) => string) =>
    v != null ? fmt(v) : '—';

  const rows: DiffRow[] = [
    { label: 'Purchase Price',    currentValue: fmtCurrent(cur.purchasePrice, fmtCurrency),     value: fmtCurrency(data.purchasePrice) },
    { label: 'Gross Rent (mo)',   currentValue: fmtCurrent(cur.grossRent, fmtCurrency),         value: fmtCurrency(data.grossRent) },
    ...(data.annualTaxes !== null
      ? [{ label: 'Property Taxes (yr)', currentValue: fmtCurrent(cur.annualTaxes, fmtCurrency), value: fmtCurrency(data.annualTaxes) }]
      : []),
    ...(data.sqft !== null
      ? [{ label: 'Square Footage', currentValue: fmtCurrent(cur.sqft, n => `${n.toLocaleString()} sqft`), value: `${data.sqft.toLocaleString()} sqft` }]
      : []),
    ...(data.units !== null
      ? [{ label: 'Units', currentValue: fmtCurrent(cur.units, String), value: String(data.units) }]
      : []),
  ];

  return (
    <div
      className="rounded border border-accent/50 bg-raised shadow-lg overflow-hidden"
      role="dialog"
      aria-label="Autofill preview"
    >
      {/* Header */}
      <div className="flex items-center justify-between bg-accent/10 px-4 py-2 border-b border-border">
        <span className="text-xs font-medium text-accent">⚡ RentCast found this property</span>
      </div>

      {/* Diff rows */}
      <div>
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={`grid grid-cols-[1fr_auto_auto] gap-3 items-center px-4 py-2 text-xs ${
              i % 2 === 1 ? 'bg-base' : ''
            }`}
          >
            <span className="text-mid">{row.label}</span>
            <span className="text-lo line-through">{row.currentValue}</span>
            <span className="text-green-400 font-medium">{row.value}</span>
          </div>
        ))}
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
          onClick={onApply}
          className="
            rounded bg-accent px-3 py-1 text-xs font-medium text-base
            hover:opacity-90 transition-opacity
          "
        >
          Apply →
        </button>
      </div>
    </div>
  );
}
