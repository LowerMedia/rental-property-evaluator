import { useState, useCallback, useEffect } from 'react';
import type { Dispatch } from 'react';
import type { DealInputs } from '@rpe/engine';
import type { DealAction } from '../state/dealReducer';
import {
  createScenario,
  addScenario,
  removeScenario,
  renameScenario,
  applyDealAction,
  replaceInputs,
  type Scenario,
} from '../state/scenarios';
import { DEFAULT_INPUTS } from '../state/defaultInputs';
import { parseShareParam, SHARE_PARAM } from '../utils/shareUrl';

// ─── Public interface ─────────────────────────────────────────────────────────

export interface UseScenariosReturn {
  scenarios: Scenario[];
  activeIdx: number;
  setActiveIdx: (idx: number) => void;
  /** Inputs for the currently active scenario. */
  activeInputs: DealInputs;
  /** Dispatch a DealAction to the currently active scenario. */
  dispatchToActive: Dispatch<DealAction>;
  /** Dispatch a DealAction to a specific scenario by index. */
  dispatchToIdx: (idx: number, action: DealAction) => void;
  /** Add a new scenario (clone of active inputs, or defaults). */
  addScenario: () => void;
  /** Remove scenario at idx; adjusts activeIdx if needed. */
  removeScenario: (idx: number) => void;
  /** Rename scenario at idx. */
  renameScenario: (idx: number, name: string) => void;
  /** Replace all inputs for scenario at idx (e.g. load from saved deal). */
  replaceScenarioInputs: (idx: number, inputs: DealInputs) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useScenarios(): UseScenariosReturn {
  const [scenarios, setScenarios] = useState<Scenario[]>(() => {
    const sharedInputs = parseShareParam();
    return [createScenario('Scenario 1', sharedInputs ?? { ...DEFAULT_INPUTS })];
  });

  // After hydrating from the share param, clean it from the URL so bookmarks
  // and back-navigation don't re-apply stale inputs.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.has(SHARE_PARAM)) {
      url.searchParams.delete(SHARE_PARAM);
      window.history.replaceState(null, '', url.toString());
    }
  }, []); // intentionally empty — run once on mount only
  const [activeIdx, setActiveIdxState] = useState(0);

  const setActiveIdx = useCallback((idx: number) => {
    setActiveIdxState(idx);
  }, []);

  const dispatchToActive = useCallback(
    (action: DealAction) => {
      setScenarios((prev) => applyDealAction(prev, activeIdx, action));
    },
    [activeIdx],
  );

  const dispatchToIdx = useCallback((idx: number, action: DealAction) => {
    setScenarios((prev) => applyDealAction(prev, idx, action));
  }, []);

  const handleAddScenario = useCallback(() => {
    setScenarios((prev) => {
      const activeInputs = prev[activeIdx]?.inputs ?? { ...DEFAULT_INPUTS };
      return addScenario(prev, { ...activeInputs });
    });
    // Activate the newly added scenario
    setScenarios((prev) => {
      setActiveIdxState(prev.length - 1);
      return prev;
    });
  }, [activeIdx]);

  const handleRemoveScenario = useCallback(
    (idx: number) => {
      setScenarios((prev) => {
        const result = removeScenario(prev, idx);
        setActiveIdxState(result.activeIdx);
        return result.scenarios;
      });
    },
    [],
  );

  const handleRenameScenario = useCallback((idx: number, name: string) => {
    setScenarios((prev) => renameScenario(prev, idx, name));
  }, []);

  const replaceScenarioInputs = useCallback((idx: number, inputs: DealInputs) => {
    setScenarios((prev) => replaceInputs(prev, idx, inputs));
  }, []);

  // Safe access — always defined since we start with at least one scenario
  const activeInputs = scenarios[activeIdx]?.inputs ?? { ...DEFAULT_INPUTS };

  return {
    scenarios,
    activeIdx,
    setActiveIdx,
    activeInputs,
    dispatchToActive,
    dispatchToIdx,
    addScenario: handleAddScenario,
    removeScenario: handleRemoveScenario,
    renameScenario: handleRenameScenario,
    replaceScenarioInputs,
  };
}
