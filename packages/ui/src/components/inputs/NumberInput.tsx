import { useState, useCallback, useId } from 'react';
import { parseInputValue } from '../../utils/format';

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Minimum accepted value (default: 0) */
  min?: number;
  /** Maximum accepted value */
  max?: number;
  /** Step for spinbutton behavior (default: 1) */
  step?: number;
  /** Unit label shown as right-gutter suffix (e.g. "yrs") */
  unit?: string;
  hint?: string;
  id?: string;
}

/**
 * Controlled plain-number input (for unitless fields: loan term, units count, sqft, etc.).
 * Commits on blur; rejects non-numeric entry.
 */
export function NumberInput({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  unit,
  hint,
  id: idProp,
}: NumberInputProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const hintId = useId();

  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState('');

  const displayValue = focused ? raw : String(value);

  const handleFocus = useCallback(() => {
    setRaw(String(value));
    setFocused(true);
  }, [value]);

  const handleBlur = useCallback(() => {
    const parsed = parseInputValue(raw, min);
    const clamped = max !== undefined ? Math.min(max, Math.max(min, parsed)) : Math.max(min, parsed);
    onChange(Math.round(clamped / step) * step);
    setFocused(false);
  }, [raw, min, max, step, onChange]);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs text-mid uppercase tracking-widest">
        {label}
      </label>
      <div className="relative flex items-center">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={displayValue}
          aria-describedby={hint ? hintId : undefined}
          onFocus={handleFocus}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={handleBlur}
          className={`
            num w-full rounded border border-border bg-input
            py-2 pl-3 text-sm text-hi
            hover:border-border-2
            focus:border-accent focus:outline-none
            transition-colors
            ${unit ? 'pr-12' : 'pr-3'}
          `}
        />
        {unit && (
          <span
            className="pointer-events-none absolute right-3 text-lo text-xs font-mono select-none"
            aria-hidden="true"
          >
            {unit}
          </span>
        )}
      </div>
      {hint && <p id={hintId} className="text-xs text-lo">{hint}</p>}
    </div>
  );
}
