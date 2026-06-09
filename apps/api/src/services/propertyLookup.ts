/**
 * E7 — RentCast → PropertyLookup normalization (RPE-45)
 *
 * Maps the flat PropertyData returned by @rpe/rentcast into the
 * provenance-tagged PropertyLookup shape from @rpe/property so the
 * client-side tiered resolver (RPE-44) can consume proxy responses
 * directly.
 *
 * Confidence: AVM estimates (price, rent) are models, not records —
 * 'medium'. Property-record fields (sqft, units, taxes) are county/MLS
 * data — 'high'.
 */

import type { PropertyData } from '@rpe/rentcast';
import type { LookupField, PropertyLookup } from '@rpe/property';

const SOURCE = 'rentcast';

function field(value: number, confidence: LookupField['confidence']): LookupField {
  return { value, source: SOURCE, confidence };
}

export function toPropertyLookup(data: PropertyData): PropertyLookup {
  const lookup: PropertyLookup = {};
  if (Number.isFinite(data.purchasePrice)) {
    lookup.purchasePrice = field(data.purchasePrice, 'medium');
  }
  if (Number.isFinite(data.grossRent)) {
    lookup.grossRent = field(data.grossRent, 'medium');
  }
  if (data.sqft !== null && Number.isFinite(data.sqft)) {
    lookup.sqft = field(data.sqft, 'high');
  }
  if (data.units !== null && Number.isFinite(data.units)) {
    lookup.units = field(data.units, 'high');
  }
  if (data.annualTaxes !== null && Number.isFinite(data.annualTaxes)) {
    lookup.annualTaxes = field(data.annualTaxes, 'high');
  }
  if (data.bedrooms !== null && Number.isFinite(data.bedrooms)) {
    lookup.bedrooms = field(data.bedrooms, 'high');
  }
  if (data.bathrooms !== null && Number.isFinite(data.bathrooms)) {
    lookup.bathrooms = field(data.bathrooms, 'high');
  }
  if (data.yearBuilt !== null && Number.isFinite(data.yearBuilt)) {
    lookup.yearBuilt = field(data.yearBuilt, 'high');
  }
  return lookup;
}
