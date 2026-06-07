/**
 * frontend.tsx — View script for rpe/evaluator (RPE-36).
 *
 * Runs on the WordPress frontend. Finds every container div output by the
 * PHP render_callback (RPE-37) and mounts a full <Evaluator /> React app
 * into each one. Self-contained: bundles React + @rpe/ui + @rpe/engine.
 *
 * Container selector: [data-rpe-block="evaluator"]
 */

import './style.css';
import { createRoot } from 'react-dom/client';
import { Evaluator } from '@rpe/ui';

function mount() {
  const containers = document.querySelectorAll<HTMLElement>(
    '[data-rpe-block="evaluator"]',
  );

  containers.forEach((el) => {
    // Guard: skip if already mounted (e.g. duplicate DOMContentLoaded)
    if (el.dataset['rpeMounted'] === '1') return;
    el.dataset['rpeMounted'] = '1';

    const root = createRoot(el);
    root.render(<Evaluator />);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  // DOMContentLoaded already fired (deferred/async script)
  mount();
}
