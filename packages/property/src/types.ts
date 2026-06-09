/**
 * E7 — property lookup types (RPE-44)
 *
 * Framework-agnostic types for the tiered property-lookup chain:
 * licensed API → scrape fallback → paste-text. Every looked-up field
 * carries provenance (which provider, at what confidence) so the UI can
 * badge values and flag low-confidence ones for review.
 *
 * This package is pure: no network, no React. Providers are injected
 * into resolveProperty(); concrete integrations (RentCast, scrapers,
 * paste parsers) live in their own packages/stories.
 */

// ─── Tiers and provenance ─────────────────────────────────────────────────────

/**
 * Lookup tiers, in fallback order. The resolver always exhausts cheaper,
 * licensed tiers before riskier/noisier ones.
 */
export type LookupTier = 'api' | 'scrape' | 'paste';

/** Tier precedence used by resolveProperty — index 0 runs first. */
export const TIER_ORDER: readonly LookupTier[] = ['api', 'scrape', 'paste'];

/**
 * Per-field confidence. 'low' values should be surfaced as "needs review"
 * by the mapping/UI layers.
 */
export type LookupConfidence = 'high' | 'medium' | 'low';

/** A single looked-up value plus where it came from. */
export interface LookupField {
  value: number;
  /** Provider id that produced the value (e.g. 'rentcast'). */
  source: string;
  confidence: LookupConfidence;
}

// ─── Lookup result ────────────────────────────────────────────────────────────

/**
 * Field keys a lookup can populate. Names align with DealInputs
 * (purchasePrice, grossRent, sqft, units) and with the flat annualTaxes /
 * annualInsurance amounts that the mapping story (RPE-50) converts into
 * DealInputs.expenses entries.
 */
export type LookupFieldKey =
  | 'purchasePrice'
  | 'grossRent'
  | 'sqft'
  | 'units'
  | 'annualTaxes'
  | 'annualInsurance'
  | 'yearBuilt';

/**
 * A partial, provenance-tagged set of deal inputs — the result of one
 * provider lookup or of the merged tiered chain.
 */
export type PropertyLookup = Partial<Record<LookupFieldKey, LookupField>>;

// ─── Provider contract ────────────────────────────────────────────────────────

/**
 * Input to a lookup. Exactly one of the fields is typically set; providers
 * declare what they can handle via supports().
 */
export interface LookupRequest {
  /** Free-text street address. */
  address?: string;
  /** Listing URL (Zillow/Redfin/…); parsed by URL-aware providers. */
  url?: string;
  /** Raw listing text pasted by the user. */
  pastedText?: string;
}

/** A pluggable property-data source. */
export interface PropertyProvider {
  /** Stable identifier, used as LookupField.source (e.g. 'rentcast'). */
  id: string;
  tier: LookupTier;
  /** Whether this provider can act on the given request at all. */
  supports(request: LookupRequest): boolean;
  /**
   * Perform the lookup. Resolves to a (possibly empty) PropertyLookup;
   * rejects on provider failure — the resolver records the error and
   * continues down the chain.
   */
  lookup(request: LookupRequest): Promise<PropertyLookup>;
}

// ─── Resolver result ──────────────────────────────────────────────────────────

/** Outcome of one provider in the chain, for diagnostics and UI messaging. */
export interface ProviderAttempt {
  providerId: string;
  tier: LookupTier;
  status: 'ok' | 'error' | 'skipped';
  /** Field keys this provider contributed to the merged result. */
  contributed: LookupFieldKey[];
  /** Present when status is 'error'. */
  error?: string;
}

/** Merged result of the tiered chain plus a per-provider audit trail. */
export interface ResolvedProperty {
  lookup: PropertyLookup;
  attempts: ProviderAttempt[];
  /** True when the accept predicate was satisfied. */
  acceptable: boolean;
}

/** Options for resolveProperty. */
export interface ResolveOptions {
  /**
   * Predicate deciding when the merged lookup is good enough to stop the
   * chain. Default: a purchase price or a gross rent is present — without
   * at least one of those the evaluator has nothing useful to prefill.
   */
  acceptable?: (lookup: PropertyLookup) => boolean;
}
