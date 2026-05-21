import { describe, it, expect } from 'vitest';
import {
  createScenario,
  addScenario,
  removeScenario,
  renameScenario,
  applyDealAction,
  replaceInputs,
  MIN_SCENARIOS,
  MAX_SCENARIOS,
} from '../src/state/scenarios';
import { DEFAULT_INPUTS } from '../src/state/defaultInputs';

// ─── createScenario ───────────────────────────────────────────────────────────

describe('createScenario', () => {
  it('uses provided name', () => {
    expect(createScenario('My Deal').name).toBe('My Deal');
  });

  it('defaults to DEFAULT_INPUTS when no inputs given', () => {
    const s = createScenario('X');
    expect(s.inputs.purchasePrice).toBe(DEFAULT_INPUTS.purchasePrice);
  });

  it('uses provided inputs', () => {
    const inputs = { ...DEFAULT_INPUTS, purchasePrice: 500_000 };
    expect(createScenario('Y', inputs).inputs.purchasePrice).toBe(500_000);
  });

  it('generates a unique id on each call', () => {
    const a = createScenario('A');
    const b = createScenario('B');
    expect(a.id).not.toBe(b.id);
  });
});

// ─── addScenario ─────────────────────────────────────────────────────────────

describe('addScenario', () => {
  it('appends a new scenario', () => {
    const s1 = [createScenario('S1')];
    const result = addScenario(s1);
    expect(result).toHaveLength(2);
  });

  it('new scenario gets an auto-numbered name', () => {
    const s1 = [createScenario('Scenario 1')];
    const result = addScenario(s1);
    expect(result[1]?.name).toBe('Scenario 2');
  });

  it('clones provided baseInputs', () => {
    const s1 = [createScenario('S1')];
    const base = { ...DEFAULT_INPUTS, purchasePrice: 999_000 };
    const result = addScenario(s1, base);
    expect(result[1]?.inputs.purchasePrice).toBe(999_000);
  });

  it('does not exceed MAX_SCENARIOS', () => {
    let scenarios = [createScenario('S1')];
    for (let i = 1; i < MAX_SCENARIOS; i++) {
      scenarios = addScenario(scenarios);
    }
    expect(scenarios).toHaveLength(MAX_SCENARIOS);
    // One more attempt should be a no-op
    const capped = addScenario(scenarios);
    expect(capped).toHaveLength(MAX_SCENARIOS);
    expect(capped).toBe(scenarios); // same reference (no mutation)
  });

  it('does not mutate the input array', () => {
    const original = [createScenario('S1')];
    const frozen = Object.freeze([...original]);
    const result = addScenario(frozen as typeof original);
    expect(result).not.toBe(frozen);
    expect(frozen).toHaveLength(1);
  });
});

// ─── removeScenario ───────────────────────────────────────────────────────────

describe('removeScenario', () => {
  it('removes a scenario by index', () => {
    const scenarios = [createScenario('A'), createScenario('B'), createScenario('C')];
    const { scenarios: result } = removeScenario(scenarios, 1);
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe('A');
    expect(result[1]?.name).toBe('C');
  });

  it('does not go below MIN_SCENARIOS', () => {
    const single = [createScenario('Only')];
    const { scenarios: result } = removeScenario(single, 0);
    expect(result).toHaveLength(MIN_SCENARIOS);
    expect(result).toBe(single);
  });

  it('returns activeIdx = 0 when removing the first of two', () => {
    const scenarios = [createScenario('A'), createScenario('B')];
    const { activeIdx } = removeScenario(scenarios, 0);
    expect(activeIdx).toBe(0);
  });

  it('returns adjusted activeIdx when removing last scenario', () => {
    const scenarios = [createScenario('A'), createScenario('B'), createScenario('C')];
    const { activeIdx } = removeScenario(scenarios, 2);
    expect(activeIdx).toBe(1);
  });

  it('ignores out-of-bounds idx', () => {
    const scenarios = [createScenario('A'), createScenario('B')];
    const { scenarios: result } = removeScenario(scenarios, 99);
    expect(result).toBe(scenarios);
  });
});

// ─── renameScenario ───────────────────────────────────────────────────────────

describe('renameScenario', () => {
  it('renames the scenario at the given idx', () => {
    const scenarios = [createScenario('Old')];
    const result = renameScenario(scenarios, 0, 'New Name');
    expect(result[0]?.name).toBe('New Name');
  });

  it('trims whitespace from the name', () => {
    const scenarios = [createScenario('Old')];
    const result = renameScenario(scenarios, 0, '  Trimmed  ');
    expect(result[0]?.name).toBe('Trimmed');
  });

  it('ignores blank names', () => {
    const scenarios = [createScenario('Keep')];
    const result = renameScenario(scenarios, 0, '   ');
    expect(result[0]?.name).toBe('Keep');
    expect(result).toBe(scenarios);
  });

  it('ignores out-of-bounds idx', () => {
    const scenarios = [createScenario('A')];
    const result = renameScenario(scenarios, 5, 'X');
    expect(result).toBe(scenarios);
  });

  it('does not mutate other scenarios', () => {
    const scenarios = [createScenario('A'), createScenario('B')];
    const result = renameScenario(scenarios, 0, 'A2');
    expect(result[1]?.name).toBe('B');
  });
});

// ─── applyDealAction ──────────────────────────────────────────────────────────

describe('applyDealAction', () => {
  it('applies SET_NUMBER to the target scenario', () => {
    const scenarios = [createScenario('S1'), createScenario('S2')];
    const result = applyDealAction(scenarios, 0, {
      type: 'SET_NUMBER',
      field: 'purchasePrice',
      value: 400_000,
    });
    expect(result[0]?.inputs.purchasePrice).toBe(400_000);
    // S2 unchanged
    expect(result[1]?.inputs.purchasePrice).toBe(DEFAULT_INPUTS.purchasePrice);
  });

  it('applies RESET to the target scenario', () => {
    const modified = { ...DEFAULT_INPUTS, purchasePrice: 999_999 };
    const scenarios = [createScenario('S1', modified)];
    const result = applyDealAction(scenarios, 0, { type: 'RESET' });
    expect(result[0]?.inputs.purchasePrice).toBe(DEFAULT_INPUTS.purchasePrice);
  });

  it('ignores out-of-bounds idx', () => {
    const scenarios = [createScenario('S1')];
    const result = applyDealAction(scenarios, 99, { type: 'RESET' });
    expect(result).toBe(scenarios);
  });
});

// ─── replaceInputs ────────────────────────────────────────────────────────────

describe('replaceInputs', () => {
  it('replaces inputs for the target scenario', () => {
    const scenarios = [createScenario('S1')];
    const newInputs = { ...DEFAULT_INPUTS, grossRent: 3_500 };
    const result = replaceInputs(scenarios, 0, newInputs);
    expect(result[0]?.inputs.grossRent).toBe(3_500);
  });

  it('does not affect other scenarios', () => {
    const scenarios = [createScenario('S1'), createScenario('S2')];
    const newInputs = { ...DEFAULT_INPUTS, grossRent: 9_000 };
    const result = replaceInputs(scenarios, 0, newInputs);
    expect(result[1]?.inputs.grossRent).toBe(DEFAULT_INPUTS.grossRent);
  });

  it('ignores out-of-bounds idx', () => {
    const scenarios = [createScenario('S1')];
    const result = replaceInputs(scenarios, 10, DEFAULT_INPUTS);
    expect(result).toBe(scenarios);
  });
});
