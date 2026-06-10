import type { DealInputs } from '@rpe/engine';
import { dealReducer } from './dealReducer';
import type { DealAction } from './dealReducer';
import { DEFAULT_INPUTS } from './defaultInputs';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Scenario {
  id: string;
  name: string;
  inputs: DealInputs;
}

export const MIN_SCENARIOS = 1;
export const MAX_SCENARIOS = 4;

// ─── ID generation ────────────────────────────────────────────────────────────

export function generateScenarioId(): string {
  return `sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createScenario(name: string, inputs?: DealInputs): Scenario {
  return { id: generateScenarioId(), name, inputs: inputs ?? structuredClone(DEFAULT_INPUTS) };
}

// ─── Pure state transformations ───────────────────────────────────────────────

/**
 * Append a new scenario (clone of baseInputs or defaults) up to MAX_SCENARIOS.
 * No-op if already at the maximum.
 */
export function addScenario(
  scenarios: Scenario[],
  baseInputs?: DealInputs,
): Scenario[] {
  if (scenarios.length >= MAX_SCENARIOS) return scenarios;
  const n = scenarios.length + 1;
  return [
    ...scenarios,
    createScenario(`Scenario ${n}`, baseInputs ?? structuredClone(DEFAULT_INPUTS)),
  ];
}

/**
 * Append a scenario with an explicit name and inputs (RPE-68 — used by
 * "Load Example"). No-op at MAX_SCENARIOS, same as addScenario.
 */
export function addNamedScenario(
  scenarios: Scenario[],
  name: string,
  inputs: DealInputs,
): Scenario[] {
  if (scenarios.length >= MAX_SCENARIOS) return scenarios;
  return [...scenarios, createScenario(name, structuredClone(inputs))];
}

/**
 * Remove scenario at idx.  No-op if already at MIN_SCENARIOS or idx is out of bounds.
 * Returns the new scenarios array + the corrected activeIdx.
 */
export function removeScenario(
  scenarios: Scenario[],
  idx: number,
): { scenarios: Scenario[]; activeIdx: number } {
  if (scenarios.length <= MIN_SCENARIOS) return { scenarios, activeIdx: 0 };
  if (idx < 0 || idx >= scenarios.length) return { scenarios, activeIdx: 0 };
  const next = scenarios.filter((_, i) => i !== idx);
  const activeIdx = Math.min(idx, next.length - 1);
  return { scenarios: next, activeIdx };
}

/**
 * Rename scenario at idx.  No-op on blank name or out-of-bounds.
 */
export function renameScenario(
  scenarios: Scenario[],
  idx: number,
  name: string,
): Scenario[] {
  const trimmed = name.trim();
  if (!trimmed || idx < 0 || idx >= scenarios.length) return scenarios;
  return scenarios.map((s, i) => (i === idx ? { ...s, name: trimmed } : s));
}

/**
 * Apply a DealAction to the scenario at idx via dealReducer.
 */
export function applyDealAction(
  scenarios: Scenario[],
  idx: number,
  action: DealAction,
): Scenario[] {
  if (idx < 0 || idx >= scenarios.length) return scenarios;
  return scenarios.map((s, i) =>
    i === idx ? { ...s, inputs: dealReducer(s.inputs, action) } : s,
  );
}

/**
 * Replace the inputs of scenario at idx wholesale (e.g. from a saved deal).
 */
export function replaceInputs(
  scenarios: Scenario[],
  idx: number,
  inputs: DealInputs,
): Scenario[] {
  if (idx < 0 || idx >= scenarios.length) return scenarios;
  return scenarios.map((s, i) => (i === idx ? { ...s, inputs } : s));
}
