import { useState, useCallback, useId } from 'react';
import { parseInputValue } from '../../utils/format';

interface PercentInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Minimum accepted value (default: 0) */
  min?: number;
  /** Maximum accepted value (default: 100) */
  max?: number;
  /** Decimal places shown on blur (default: 2) */
  decimals?: number;
  hint?: string;
  id?: string;
}

/**
 * Controlled percentage input (values stored as percent-points, e.g. 7.5 = 7.5%).
 *
 * - Focused:  shows the raw numeric string.
 * - Blurred:  shows the value formatted to `decimals` places.
 * - The "%" suffix lives as a static right-gutter character.
 * - Commits on blur.
 */
export function PercentInput({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  decimals = 2,
  hint,
  id: idProp,
}: PercentInputProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const hintId = useId();

  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState('');

  const displayValue = focused
    ? raw
    : new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value);

  const handleFocus = useCallback(() => {
    setRaw(String(value));
    setFocused(true);
  }, [value]);

  const handleBlur = useCallback(() => {
    const parsed = parseInputValue(raw);
    const clamped = Math.min(max, Math.max(min, parsed));
    onChange(clamped);
    setFocused(false);
  }, [raw, min, max, onChange]);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs text-mid uppercase tracking-widest">
        {label}
      </label>
      <div className="relative flex items-center">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={displayValue}
          aria-describedby={hint ? hintId : undefined}
          onFocus={handleFocus}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={handleBlur}
          className="
            num w-full rounded border border-border bg-input
            py-2 pl-3 pr-7 text-sm text-hi
            hover:border-border-2
            focus:border-accent focus:outline-none
            transition-colors
          "
        />
        <span
          className="pointer-events-none absolute right-3 text-lo text-sm font-mono select-none"
          aria-hidden="true"
        >
          %
        </span>
      </div>
      {hint && <p id={hintId} className="text-xs text-lo">{hint}</p>}
    </div>
  );
}
