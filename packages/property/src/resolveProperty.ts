/**
 * E7 — tiered property resolver (RPE-44)
 *
 * Runs injected providers in tier order (api → scrape → paste), merging
 * each provider's fields into an accumulated PropertyLookup. A field set
 * by an earlier (more trusted) tier is never overwritten by a later one.
 * The chain stops as soon as the merged result satisfies the accept
 * predicate; provider failures are recorded and the chain continues.
 *
 * Providers run sequentially, never in parallel — later tiers cost money,
 * carry ToS risk, or need user input, so they must not fire when an
 * earlier tier already produced an acceptable result.
 */

import {
  LOOKUP_FIELD_KEYS,
  TIER_ORDER,
  type LookupFieldKey,
  type LookupTier,
  type LookupRequest,
  type PropertyLookup,
  type PropertyProvider,
  type ProviderAttempt,
  type ResolveOptions,
  type ResolvedProperty,
} from './types';

/** Default accept predicate — see ResolveOptions.acceptable. */
export function hasPriceOrRent(lookup: PropertyLookup): boolean {
  return lookup.purchasePrice !== undefined || lookup.grossRent !== undefined;
}

/** All keys a provider may legitimately contribute — foreign keys from
 * untyped providers (wild scrape/paste parsers) are dropped on merge. */
const KNOWN_KEYS: ReadonlySet<string> = new Set(LOOKUP_FIELD_KEYS);

/**
 * Sort providers into tier precedence, preserving the caller's relative
 * order within each tier (stable sort). An unrecognised tier (possible
 * from untyped JS callers) runs last, never ahead of trusted tiers.
 */
function inTierOrder(providers: readonly PropertyProvider[]): PropertyProvider[] {
  const rank = (tier: LookupTier): number => {
    const idx = TIER_ORDER.indexOf(tier);
    return idx === -1 ? TIER_ORDER.length : idx;
  };
  return [...providers].sort((a, b) => rank(a.tier) - rank(b.tier));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Resolve a property through the tiered provider chain.
 *
 * Pure orchestration: no network of its own, no retries, no timeouts —
 * those belong to the individual providers. Never rejects on provider
 * failure; total failure surfaces as an empty lookup with
 * acceptable=false and per-provider error attempts. (A throwing custom
 * accept predicate is a caller bug and propagates — fail fast.)
 */
export async function resolveProperty(
  request: LookupRequest,
  providers: readonly PropertyProvider[],
  options: ResolveOptions = {},
): Promise<ResolvedProperty> {
  const acceptable = options.acceptable ?? hasPriceOrRent;
  const lookup: PropertyLookup = {};
  const attempts: ProviderAttempt[] = [];

  // Already acceptable with nothing looked up (custom predicate) — no
  // provider should fire
  if (acceptable(lookup)) {
    return { lookup, attempts, acceptable: true };
  }

  for (const provider of inTierOrder(providers)) {
    let supported: boolean;
    try {
      supported = provider.supports(request);
    } catch (err) {
      // A broken supports() must not kill the chain — treat as unsupported
      attempts.push({
        providerId: provider.id,
        tier: provider.tier,
        status: 'error',
        contributed: [],
        error: errorMessage(err),
      });
      continue;
    }

    if (!supported) {
      attempts.push({
        providerId: provider.id,
        tier: provider.tier,
        status: 'skipped',
        contributed: [],
      });
      continue;
    }

    try {
      const result = await provider.lookup(request);
      const contributed: LookupFieldKey[] = [];
      for (const key of Object.keys(result)) {
        if (!KNOWN_KEYS.has(key)) continue; // foreign key from a wild provider
        const fieldKey = key as LookupFieldKey;
        const field = result[fieldKey];
        if (field === undefined) continue;
        if (lookup[fieldKey] !== undefined) continue; // earlier tier wins
        lookup[fieldKey] = field;
        contributed.push(fieldKey);
      }
      attempts.push({
        providerId: provider.id,
        tier: provider.tier,
        status: 'ok',
        contributed,
      });
    } catch (err) {
      attempts.push({
        providerId: provider.id,
        tier: provider.tier,
        status: 'error',
        contributed: [],
        error: errorMessage(err),
      });
      continue;
    }

    if (acceptable(lookup)) {
      return { lookup, attempts, acceptable: true };
    }
  }

  return { lookup, attempts, acceptable: acceptable(lookup) };
}
