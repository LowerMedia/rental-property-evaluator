/**
 * E7 — PropertyLookup → DealInputs mapping + needs-review model (RPE-50)
 *
 * Deterministic, pure mapping from a provenance-tagged lookup to a list
 * of DealInputs *patches*. Patches — not mutations — are the
 * never-silently-overwrite mechanism: the caller (review panel, RPE-53)
 * decides which patches to apply, and applyLookupPatches() skips any
 * target the caller marks as user-edited.
 *
 * Period contracts: taxes and insurance map as ANNUAL ExpenseInput
 * amounts; grossRent is the monthly rent suggestion. Confidence is
 * carried through from the lookup; 'low' flags needsReview.
 *
 * bedrooms/bathrooms/yearBuilt have no DealInputs home — they surface in
 * `meta` for display, never as patches.
 */

import type { DealInputs } from '@rpe/engine';
import type { LookupConfidence, LookupField, PropertyLookup } from './types';

// ─── Patch model ──────────────────────────────────────────────────────────────

export type DealPatchTarget =
  | 'purchasePrice'
  | 'grossRent'
  | 'sqft'
  | 'units'
  | 'expenses.taxes'
  | 'expenses.insurance';

export type DealPatchValue =
  | { kind: 'number'; amount: number }
  | { kind: 'expense'; amount: number; period: 'annual' };

export interface DealInputPatch {
  target: DealPatchTarget;
  value: DealPatchValue;
  /** Provider id that produced the value (e.g. 'rentcast', 'paste'). */
  source: string;
  confidence: LookupConfidence;
  /** Low-confidence values must be surfaced for explicit user review. */
  needsReview: boolean;
}

export interface MappedLookup {
  patches: DealInputPatch[];
  /** Display-only property facts with no DealInputs field. */
  meta: {
    bedrooms?: LookupField;
    bathrooms?: LookupField;
    yearBuilt?: LookupField;
  };
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

function numberPatch(
  target: DealPatchTarget,
  f: LookupField,
): DealInputPatch {
  return {
    target,
    value: { kind: 'number', amount: f.value },
    source: f.source,
    confidence: f.confidence,
    needsReview: f.confidence === 'low',
  };
}

function expensePatch(
  target: 'expenses.taxes' | 'expenses.insurance',
  f: LookupField,
): DealInputPatch {
  return {
    target,
    value: { kind: 'expense', amount: f.value, period: 'annual' },
    source: f.source,
    confidence: f.confidence,
    needsReview: f.confidence === 'low',
  };
}

/** Map a lookup to DealInputs patches + display meta. Deterministic and pure. */
export function mapLookupToDealInputs(lookup: PropertyLookup): MappedLookup {
  const patches: DealInputPatch[] = [];

  if (lookup.purchasePrice) patches.push(numberPatch('purchasePrice', lookup.purchasePrice));
  if (lookup.grossRent) patches.push(numberPatch('grossRent', lookup.grossRent));
  if (lookup.sqft) patches.push(numberPatch('sqft', lookup.sqft));
  if (lookup.units) patches.push(numberPatch('units', lookup.units));
  if (lookup.annualTaxes) patches.push(expensePatch('expenses.taxes', lookup.annualTaxes));
  if (lookup.annualInsurance) patches.push(expensePatch('expenses.insurance', lookup.annualInsurance));

  const meta: MappedLookup['meta'] = {};
  if (lookup.bedrooms) meta.bedrooms = lookup.bedrooms;
  if (lookup.bathrooms) meta.bathrooms = lookup.bathrooms;
  if (lookup.yearBuilt) meta.yearBuilt = lookup.yearBuilt;

  return { patches, meta };
}

// ─── Application ──────────────────────────────────────────────────────────────

export interface ApplyResult {
  inputs: DealInputs;
  applied: DealPatchTarget[];
  /** Targets skipped because the caller marked them user-edited. */
  skipped: DealPatchTarget[];
}

/**
 * Apply patches to a copy of `inputs`. Targets in `userEdited` are
 * NEVER written — they are reported in `skipped` so the UI can offer an
 * explicit confirm instead of a silent overwrite. The input object is
 * not mutated.
 */
export function applyLookupPatches(
  inputs: DealInputs,
  patches: readonly DealInputPatch[],
  userEdited: ReadonlySet<DealPatchTarget> = new Set(),
): ApplyResult {
  const next: DealInputs = { ...inputs, expenses: { ...inputs.expenses } };
  const applied: DealPatchTarget[] = [];
  const skipped: DealPatchTarget[] = [];

  for (const patch of patches) {
    if (userEdited.has(patch.target)) {
      skipped.push(patch.target);
      continue;
    }
    // Track the write so a kind-mismatched patch (possible from untyped
    // callers) is never reported as applied
    let written = false;
    switch (patch.target) {
      case 'purchasePrice':
        if (patch.value.kind === 'number') { next.purchasePrice = patch.value.amount; written = true; }
        break;
      case 'grossRent':
        if (patch.value.kind === 'number') { next.grossRent = patch.value.amount; written = true; }
        break;
      case 'sqft':
        if (patch.value.kind === 'number') { next.sqft = patch.value.amount; written = true; }
        break;
      case 'units':
        if (patch.value.kind === 'number') { next.units = patch.value.amount; written = true; }
        break;
      case 'expenses.taxes':
        if (patch.value.kind === 'expense') {
          next.expenses.taxes = { amount: patch.value.amount, period: 'annual' };
          written = true;
        }
        break;
      case 'expenses.insurance':
        if (patch.value.kind === 'expense') {
          next.expenses.insurance = { amount: patch.value.amount, period: 'annual' };
          written = true;
        }
        break;
    }
    if (written) applied.push(patch.target);
  }

  return { inputs: next, applied, skipped };
}
