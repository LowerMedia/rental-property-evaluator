import { useMemo } from 'react';
import { evaluate } from '@rpe/engine';
import type { DealInputs, ScreenerResults } from '@rpe/engine';

/**
 * Synchronously evaluate DealInputs → ScreenerResults.
 *
 * Memoized on the `inputs` reference — dispatch always produces a new object
 * reference, so re-evaluation fires on every committed change (not on every
 * keystroke, since inputs are committed on blur).
 */
export function useEvaluate(inputs: DealInputs): ScreenerResults {
  return useMemo(() => evaluate(inputs) as ScreenerResults, [inputs]);
}
