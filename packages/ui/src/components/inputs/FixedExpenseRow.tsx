import { useState, useCallback, useId } from 'react';
import { parseInputValue } from '../../utils/format';
import { PeriodSelect } from './PeriodSelect';
import type { Period } from '@rpe/engine';

interface FixedExpenseRowProps {
  label: string;
  amount: number;
  period: Period;
  onAmountChange: (amount: number) => void;
  onPeriodChange: (period: Period) => void;
  hint?: string;
}

/**
 * Combined amount + period input for fixed expense fields (taxes, insurance, HOA).
 * The currency amount commits on blur; the period select commits immediately.
 */
export function FixedExpenseRow({
  label,
  amount,
  period,
  onAmountChange,
  onPeriodChange,
  hint,
}: FixedExpenseRowProps) {
  const amountId = useId();
  const periodId = useId();

  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState('');

  const displayValue = focused
    ? raw
    : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount);

  const handleFocus = useCallback(() => {
    setRaw(amount === 0 ? '' : String(amount));
    setFocused(true);
  }, [amount]);

  const handleBlur = useCallback(() => {
    const parsed = parseInputValue(raw);
    onAmountChange(Math.max(0, parsed));
    setFocused(false);
  }, [raw, onAmountChange]);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={amountId} className="text-xs text-mid uppercase tracking-widest">
        {label}
      </label>
      <div className="flex gap-2 items-stretch">
        {/* Amount field */}
        <div className="relative flex items-center flex-1">
          <span
            className="pointer-events-none absolute left-3 text-lo text-sm font-mono select-none"
            aria-hidden="true"
          >
            $
          </span>
          <input
            id={amountId}
            type="text"
            inputMode="decimal"
            value={displayValue}
            placeholder="0"
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
        {/* Period select */}
        <PeriodSelect
          id={periodId}
          ariaLabel={`${label} period`}
          value={period}
          onChange={onPeriodChange}
        />
      </div>
      {hint && <p className="text-xs text-lo">{hint}</p>}
    </div>
  );
}
