import { useId } from 'react';

interface ToggleInputProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  /** Short description shown below the label */
  hint?: string;
  id?: string;
}

/**
 * Accessible boolean toggle (pill-style switch).
 * The track transitions amber when on, muted when off.
 */
export function ToggleInput({ label, value, onChange, hint, id: idProp }: ToggleInputProps) {
  const autoId = useId();
  const id = idProp ?? autoId;

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-0.5 flex-1">
        <label htmlFor={id} className="text-xs text-mid uppercase tracking-widest cursor-pointer">
          {label}
        </label>
        {hint && <p className="text-xs text-lo">{hint}</p>}
      </div>

      {/* Toggle switch */}
      <button
        id={id}
        role="switch"
        type="button"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`
          relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full
          border-2 border-transparent transition-colors duration-150
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent
          ${value ? 'bg-accent' : 'bg-muted'}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-hi shadow
            transition-transform duration-150
            ${value ? 'translate-x-4' : 'translate-x-0.5'}
          `}
        />
        <span className="sr-only">{label}</span>
      </button>
    </div>
  );
}
