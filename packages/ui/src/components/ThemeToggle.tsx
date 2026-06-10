/**
 * E-misc — light/dark theme toggle (RPE-69)
 *
 * Sun/moon button in the app header. The pre-paint bootstrap in
 * index.html sets the initial html[data-theme]; this control flips it at
 * runtime and persists the explicit choice (rpe_theme).
 */

import { useState } from 'react';
import { applyTheme, resolveInitialTheme, type Theme } from '../state/theme';

export function ThemeToggle() {
  // The bootstrap already applied the resolved theme to <html>; reading
  // it again here keeps React state and the DOM attribute in agreement.
  const [theme, setTheme] = useState<Theme>(resolveInitialTheme);

  const isLight = theme === 'light';

  const toggle = () => {
    const next: Theme = isLight ? 'dark' : 'light';
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isLight}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      title={isLight ? 'Dark mode' : 'Light mode'}
      className="
        rounded border border-border px-3 py-1.5
        text-xs text-mid
        hover:border-accent hover:text-accent
        transition-colors
      "
    >
      {isLight ? '☾' : '☀'}
    </button>
  );
}
