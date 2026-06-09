/**
 * RPE-50: PropertyLookup → DealInputs mapping + needs-review model.
 */

import { describe, it, expect } from 'vitest';
import type { DealInputs } from '@rpe/engine';
import {
  mapLookupToDealInputs,
  applyLookupPatches,
  type DealPatchTarget,
  type PropertyLookup,
} from '../src/index';

const LOOKUP: PropertyLookup = {
  purchasePrice: { value: 342_000, source: 'rentcast', confidence: 'medium' },
  grossRent:     { value: 2_150,   source: 'rentcast', confidence: 'medium' },
  sqft:          { value: 1_480,   source: 'rentcast', confidence: 'high' },
  units:         { value: 2,       source: 'rentcast', confidence: 'high' },
  annualTaxes:   { value: 4_210,   source: 'rentcast', confidence: 'high' },
  bedrooms:      { value: 3,       source: 'rentcast', confidence: 'high' },
  yearBuilt:     { value: 1987,    source: 'paste',    confidence: 'low' },
};

function baseInputs(): DealInputs {
  return {
    purchasePrice: 0,
    percentDown: 20,
    interestRate: 7,
    loanTermYears: 30,
    closingCosts: 0,
    rollClosingCostsIntoLoan: false,
    grossRent: 0,
    vacancyPct: 5,
    expenses: {
      taxes: { amount: 0, period: 'annual' },
      insurance: { amount: 1_200, period: 'annual' },
    },
  };
}

describe('mapLookupToDealInputs', () => {
  it('maps deal fields to patches and property facts to meta', () => {
    const { patches, meta } = mapLookupToDealInputs(LOOKUP);

    expect(patches.map((p) => p.target).sort()).toEqual([
      'expenses.taxes', 'grossRent', 'purchasePrice', 'sqft', 'units',
    ]);
    expect(meta.bedrooms?.value).toBe(3);
    expect(meta.yearBuilt?.value).toBe(1987);
    expect(meta.bathrooms).toBeUndefined();
  });

  it('maps taxes as an annual expense patch', () => {
    const { patches } = mapLookupToDealInputs(LOOKUP);
    const taxes = patches.find((p) => p.target === 'expenses.taxes');
    expect(taxes?.value).toEqual({ kind: 'expense', amount: 4_210, period: 'annual' });
  });

  it('flags low-confidence patches as needsReview and keeps provenance', () => {
    const { patches } = mapLookupToDealInputs({
      purchasePrice: { value: 280_000, source: 'paste', confidence: 'low' },
      grossRent: { value: 1_850, source: 'paste', confidence: 'medium' },
    });
    const price = patches.find((p) => p.target === 'purchasePrice');
    const rent = patches.find((p) => p.target === 'grossRent');
    expect(price).toMatchObject({ needsReview: true, source: 'paste', confidence: 'low' });
    expect(rent).toMatchObject({ needsReview: false, confidence: 'medium' });
  });

  it('returns no patches for an empty lookup', () => {
    expect(mapLookupToDealInputs({})).toEqual({ patches: [], meta: {} });
  });

  it('is deterministic', () => {
    expect(mapLookupToDealInputs(LOOKUP)).toEqual(mapLookupToDealInputs(LOOKUP));
  });
});

describe('applyLookupPatches', () => {
  it('applies patches onto a copy without mutating the original', () => {
    const inputs = baseInputs();
    const { patches } = mapLookupToDealInputs(LOOKUP);

    const result = applyLookupPatches(inputs, patches);

    expect(result.inputs.purchasePrice).toBe(342_000);
    expect(result.inputs.grossRent).toBe(2_150);
    expect(result.inputs.sqft).toBe(1_480);
    expect(result.inputs.units).toBe(2);
    expect(result.inputs.expenses.taxes).toEqual({ amount: 4_210, period: 'annual' });
    // untouched fields preserved
    expect(result.inputs.expenses.insurance).toEqual({ amount: 1_200, period: 'annual' });
    // original untouched
    expect(inputs.purchasePrice).toBe(0);
    expect(inputs.expenses.taxes.amount).toBe(0);
    expect(result.applied).toHaveLength(5);
    expect(result.skipped).toHaveLength(0);
  });

  it('never writes a user-edited target — reports it as skipped', () => {
    const inputs = { ...baseInputs(), purchasePrice: 999_999, grossRent: 3_000 };
    const { patches } = mapLookupToDealInputs(LOOKUP);
    const userEdited = new Set<DealPatchTarget>(['purchasePrice', 'grossRent']);

    const result = applyLookupPatches(inputs, patches, userEdited);

    expect(result.inputs.purchasePrice).toBe(999_999);
    expect(result.inputs.grossRent).toBe(3_000);
    expect(result.inputs.sqft).toBe(1_480); // non-protected still applied
    expect(result.skipped.sort()).toEqual(['grossRent', 'purchasePrice']);
  });

  it('applies an insurance expense patch', () => {
    const { patches } = mapLookupToDealInputs({
      annualInsurance: { value: 1_900, source: 'rentcast', confidence: 'high' },
    });
    const result = applyLookupPatches(baseInputs(), patches);
    expect(result.inputs.expenses.insurance).toEqual({ amount: 1_900, period: 'annual' });
  });

  it('handles an empty patch list as a no-op copy', () => {
    const inputs = baseInputs();
    const result = applyLookupPatches(inputs, []);
    expect(result.inputs).toEqual(inputs);
    expect(result.inputs).not.toBe(inputs);
  });
});
