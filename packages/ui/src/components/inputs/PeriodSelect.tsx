import { useId } from 'react';
import type { Period } from '@rpe/engine';

interface PeriodSelectProps {
  value: Period;
  onChange: (period: Period) => void;
  /** Hidden label for accessibility */
  ariaLabel?: string;
  id?: string;
}

/**
 * Compact dropdown for selecting 'monthly' | 'annual'.
 * Designed to sit inline beside a CurrencyInput for fixed expense rows.
 */
export function PeriodSelect({ value, onChange, ariaLabel, id: idProp }: PeriodSelectProps) {
  const autoId = useId();
  const id = idProp ?? autoId;

  return (
    <select
      id={id}
      aria-label={ariaLabel ?? 'Expense period'}
      value={value}
      onChange={(e) => onChange(e.target.value as Period)}
      className="
        num rounded border border-border bg-input
        py-2 pl-2 pr-6 text-xs text-mid
        hover:border-border-2
        focus:border-accent focus:outline-none
        transition-colors appearance-none cursor-pointer
        bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%235a5652%22%20d%3D%22M6%208L1%203h10z%22%2F%3E%3C%2Fsvg%3E')]
        bg-no-repeat bg-[right_6px_center]
      "
    >
      <option value="monthly">/mo</option>
      <option value="annual">/yr</option>
    </select>
  );
}
