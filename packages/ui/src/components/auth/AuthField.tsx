/**
 * E11 — accessible labeled field for the auth forms (RPE-96):
 * explicit label association, aria-invalid + aria-describedby wiring,
 * themed via the RPE-69 tokens.
 */

import { useId } from 'react';

export interface AuthFieldProps {
  label: string;
  type: 'text' | 'email' | 'password';
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  error?: string;
  required?: boolean;
}

export function AuthField({ label, type, value, onChange, autoComplete, error, required }: AuthFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hasError = error !== undefined && error !== '';

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-mid">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-border bg-surface px-3 py-2 text-sm text-hi"
      />
      {hasError ? (
        <p id={errorId} role="alert" className="text-xs text-fail">
          {error}
        </p>
      ) : null}
    </div>
  );
}
