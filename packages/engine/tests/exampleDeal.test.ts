/**
 * RPE-68: golden Example deal — locks the engine to hand-verified
 * outputs. If this fails, the engine's math changed; re-verify against
 * brain/02-calculations-spec.md before touching the fixture.
 */

import { describe, it, expect } from 'vitest';
import { evaluate, EXAMPLE_DEAL_INPUTS, EXAMPLE_DEAL_EXPECTED } from '../src/index';

describe('EXAMPLE_DEAL golden fixture', () => {
  it('evaluate(EXAMPLE_DEAL_INPUTS) reproduces every locked value exactly', () => {
    const results = evaluate(EXAMPLE_DEAL_INPUTS) as unknown as Record<string, unknown>;
    for (const [key, expected] of Object.entries(EXAMPLE_DEAL_EXPECTED)) {
      expect(results[key], key).toBe(expected);
    }
  });

  it('locks the headline numbers a human eyeballs in the UI', () => {
    const results = evaluate(EXAMPLE_DEAL_INPUTS);
    expect(results.noiMonthly).toBe(1_100);
    expect(results.capRate).toBeCloseTo(4.4, 10);
    expect(results.cashFlowMonthly).toBeCloseTo(-496.73, 2);
    expect(results.totalCashInvested).toBe(66_000);
  });
});
