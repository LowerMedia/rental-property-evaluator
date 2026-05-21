import { useState, useCallback, useId } from 'react';
import { parseInputValue } from '../../utils/format';

interface CurrencyInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Minimum accepted value (default: 0) */
  min?: number;
  /** When true, show an empty field instead of "0" */
  emptyZero?: boolean;
  hint?: string;
  id?: string;
}

/**
 * Controlled dollar-amount input.
 *
 * - Focused:  shows the raw numeric string the user is editing.
 * - Blurred:  shows a comma-formatted integer (no cents, no "$" prefix —
 *             the "$" lives as a static left-gutter character).
 * - Commits on blur; does NOT call onChange on every keystroke.
 */
export function CurrencyInput({
  label,
  value,
  onChange,
  min = 0,
  emptyZero = false,
  hint,
  id: idProp,
}: CurrencyInputProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const hintId = useId();

  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState('');

  const displayValue = focused
    ? raw
    : emptyZero && value === 0
      ? ''
      : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);

  const handleFocus = useCallback(() => {
    setRaw(value === 0 && emptyZero ? '' : String(value));
    setFocused(true);
  }, [value, emptyZero]);

  const handleBlur = useCallback(() => {
    const parsed = parseInputValue(raw);
    const clamped = Math.max(min, parsed);
    onChange(clamped);
    setFocused(false);
  }, [raw, min, onChange]);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs text-mid uppercase tracking-widest">
        {label}
      </label>
      <div className="relative flex items-center">
        <span
          className="pointer-events-none absolute left-3 text-lo text-sm font-mono select-none"
          aria-hidden="true"
        >
          $
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={displayValue}
          placeholder={emptyZero ? '0' : undefined}
          aria-describedby={hint ? hintId : undefined}
          onFocus={handleFocus}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={handleBlur}
          className="
            num w-full rounded border border-border bg-input
            py-2 pl-7 pr-3 text-sm text-hi
            placeholder:text-lo
            hover:border-border-2
            focus:border-accent focus:outline-none
            transition-colors
          "
        />
      </div>
      {hint && <p id={hintId} className="text-xs text-lo">{hint}</p>}
    </div>
  );
}
