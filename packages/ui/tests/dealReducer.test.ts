/**
 * RPE-22: dealReducer tests
 *
 * Covers all action types including RESET, which must restore DEFAULT_INPUTS
 * exactly — verified structurally so future default changes don't silently break reset.
 */
import { describe, it, expect } from 'vitest';
import { dealReducer } from '../src/state/dealReducer';
import { DEFAULT_INPUTS } from '../src/state/defaultInputs';
import type { DealInputs } from '@rpe/engine';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Deep-clone so tests don't share references. */
const clone = (s: DealInputs): DealInputs => JSON.parse(JSON.stringify(s));

const base = clone(DEFAULT_INPUTS);

// ─── SET_NUMBER ───────────────────────────────────────────────────────────────

describe('SET_NUMBER', () => {
  it('updates purchasePrice', () => {
    const next = dealReducer(base, { type: 'SET_NUMBER', field: 'purchasePrice', value: 400_000 });
    expect(next.purchasePrice).toBe(400_000);
    expect(next).not.toBe(base); // new reference
  });

  it('updates percentDown', () => {
    const next = dealReducer(base, { type: 'SET_NUMBER', field: 'percentDown', value: 25 });
    expect(next.percentDown).toBe(25);
  });

  it('does not mutate original state', () => {
    dealReducer(base, { type: 'SET_NUMBER', field: 'purchasePrice', value: 999 });
    expect(base.purchasePrice).toBe(DEFAULT_INPUTS.purchasePrice);
  });

  it('updates optional field rehab', () => {
    const next = dealReducer(base, { type: 'SET_NUMBER', field: 'rehab', value: 15_000 });
    expect(next.rehab).toBe(15_000);
  });
});

// ─── SET_BOOL ─────────────────────────────────────────────────────────────────

describe('SET_BOOL', () => {
  it('toggles rollClosingCostsIntoLoan', () => {
    const next = dealReducer(base, {
      type: 'SET_BOOL',
      field: 'rollClosingCostsIntoLoan',
      value: true,
    });
    expect(next.rollClosingCostsIntoLoan).toBe(true);
  });

  it('toggles capExInNOI off', () => {
    const next = dealReducer(base, { type: 'SET_BOOL', field: 'capExInNOI', value: false });
    expect(next.capExInNOI).toBe(false);
  });
});

// ─── SET_EXPENSE_PCT ──────────────────────────────────────────────────────────

describe('SET_EXPENSE_PCT', () => {
  it('updates capExPct', () => {
    const next = dealReducer(base, { type: 'SET_EXPENSE_PCT', field: 'capExPct', value: 8 });
    expect(next.expenses.capExPct).toBe(8);
    expect(next.expenses).not.toBe(base.expenses); // new reference
  });

  it('updates mgmtPct without touching other expense fields', () => {
    const next = dealReducer(base, { type: 'SET_EXPENSE_PCT', field: 'mgmtPct', value: 12 });
    expect(next.expenses.mgmtPct).toBe(12);
    expect(next.expenses.capExPct).toBe(base.expenses.capExPct);
    expect(next.expenses.maintPct).toBe(base.expenses.maintPct);
  });

  it('updates miscPct', () => {
    const next = dealReducer(base, { type: 'SET_EXPENSE_PCT', field: 'miscPct', value: 2 });
    expect(next.expenses.miscPct).toBe(2);
  });
});

// ─── SET_EXPENSE_FIXED ────────────────────────────────────────────────────────

describe('SET_EXPENSE_FIXED', () => {
  it('updates taxes amount', () => {
    const next = dealReducer(base, {
      type: 'SET_EXPENSE_FIXED',
      field: 'taxes',
      amount: 6_000,
      period: 'annual',
    });
    expect(next.expenses.taxes.amount).toBe(6_000);
    expect(next.expenses.taxes.period).toBe('annual');
  });

  it('changes insurance to monthly period', () => {
    const next = dealReducer(base, {
      type: 'SET_EXPENSE_FIXED',
      field: 'insurance',
      amount: 150,
      period: 'monthly',
    });
    expect(next.expenses.insurance.amount).toBe(150);
    expect(next.expenses.insurance.period).toBe('monthly');
  });

  it('sets hoa', () => {
    const next = dealReducer(base, {
      type: 'SET_EXPENSE_FIXED',
      field: 'hoa',
      amount: 200,
      period: 'monthly',
    });
    expect(next.expenses.hoa?.amount).toBe(200);
    expect(next.expenses.hoa?.period).toBe('monthly');
  });

  it('does not touch unrelated expense fields', () => {
    const next = dealReducer(base, {
      type: 'SET_EXPENSE_FIXED',
      field: 'taxes',
      amount: 5_000,
      period: 'annual',
    });
    expect(next.expenses.insurance.amount).toBe(base.expenses.insurance.amount);
    expect(next.expenses.capExPct).toBe(base.expenses.capExPct);
  });
});

// ─── RESET ────────────────────────────────────────────────────────────────────

describe('RESET', () => {
  it('returns a new object equal to DEFAULT_INPUTS', () => {
    // Mutate state heavily first
    let state = clone(DEFAULT_INPUTS);
    state = dealReducer(state, { type: 'SET_NUMBER', field: 'purchasePrice', value: 999_999 });
    state = dealReducer(state, { type: 'SET_NUMBER', field: 'grossRent', value: 9_999 });
    state = dealReducer(state, { type: 'SET_BOOL', field: 'rollClosingCostsIntoLoan', value: true });
    state = dealReducer(state, { type: 'SET_EXPENSE_PCT', field: 'capExPct', value: 20 });
    state = dealReducer(state, {
      type: 'SET_EXPENSE_FIXED',
      field: 'taxes',
      amount: 99_999,
      period: 'monthly',
    });

    const reset = dealReducer(state, { type: 'RESET' });

    expect(reset).toEqual(DEFAULT_INPUTS);
  });

  it('reset result is a fresh object (not the DEFAULT_INPUTS reference)', () => {
    const reset = dealReducer(base, { type: 'RESET' });
    expect(reset).not.toBe(DEFAULT_INPUTS); // shallow spread, not same ref
  });

  it('mutating reset result does not affect DEFAULT_INPUTS', () => {
    const reset = dealReducer(base, { type: 'RESET' });
    reset.purchasePrice = 1;
    // DEFAULT_INPUTS is unchanged because RESET spreads a new object
    expect(DEFAULT_INPUTS.purchasePrice).toBe(300_000);
  });

  it('all top-level numeric fields match after reset', () => {
    const mutated = dealReducer(clone(DEFAULT_INPUTS), {
      type: 'SET_NUMBER',
      field: 'interestRate',
      value: 0,
    });
    const reset = dealReducer(mutated, { type: 'RESET' });
    expect(reset.interestRate).toBe(DEFAULT_INPUTS.interestRate);
    expect(reset.purchasePrice).toBe(DEFAULT_INPUTS.purchasePrice);
    expect(reset.percentDown).toBe(DEFAULT_INPUTS.percentDown);
    expect(reset.loanTermYears).toBe(DEFAULT_INPUTS.loanTermYears);
    expect(reset.grossRent).toBe(DEFAULT_INPUTS.grossRent);
    expect(reset.vacancyPct).toBe(DEFAULT_INPUTS.vacancyPct);
  });
});

// ─── Unknown action falls through ────────────────────────────────────────────

describe('unknown action', () => {
  it('returns state unchanged', () => {
    // @ts-expect-error — testing runtime default branch
    const next = dealReducer(base, { type: 'UNKNOWN_ACTION' });
    expect(next).toBe(base);
  });
});
