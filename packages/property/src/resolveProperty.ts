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
  TIER_ORDER,
  type LookupFieldKey,
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

/**
 * Sort providers into tier precedence, preserving the caller's relative
 * order within each tier (stable sort).
 */
function inTierOrder(providers: readonly PropertyProvider[]): PropertyProvider[] {
  return [...providers].sort(
    (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier),
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Resolve a property through the tiered provider chain.
 *
 * Pure orchestration: no network of its own, no retries, no timeouts —
 * those belong to the individual providers. Always resolves (never
 * rejects); total failure surfaces as an empty lookup with
 * acceptable=false and per-provider error attempts.
 */
export async function resolveProperty(
  request: LookupRequest,
  providers: readonly PropertyProvider[],
  options: ResolveOptions = {},
): Promise<ResolvedProperty> {
  const acceptable = options.acceptable ?? hasPriceOrRent;
  const lookup: PropertyLookup = {};
  const attempts: ProviderAttempt[] = [];

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
      for (const key of Object.keys(result) as LookupFieldKey[]) {
        const field = result[key];
        if (field === undefined) continue;
        if (lookup[key] !== undefined) continue; // earlier tier wins
        lookup[key] = field;
        contributed.push(key);
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
