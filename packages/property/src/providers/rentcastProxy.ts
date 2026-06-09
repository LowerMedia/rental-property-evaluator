/**
 * E7 — RentCast proxy provider (RPE-48)
 *
 * The primary (tier 'api') PropertyProvider. Calls the apps/api
 * POST /property proxy — which holds the upstream call, normalization
 * (RPE-45), caching, and rate limits — and returns the proxy's
 * provenance-tagged `lookup` directly.
 *
 * Swappable by construction: ATTOM/Estated/etc. implement the same
 * PropertyProvider interface and slot into resolveProperty() unchanged.
 */

import type { LookupRequest, PropertyLookup, PropertyProvider } from '../types';

/** Typed provider failure, carrying the proxy's error code so the
 * resolver's caller can distinguish fall-through-worthy errors
 * (not_found, upstream_error) from terminal ones (bad_key). */
export class ProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface RentCastProxyOptions {
  /** Base URL of the apps/api server (no trailing slash needed). */
  apiUrl: string;
  /** Returns the user's RentCast API key, or null when not configured. */
  getApiKey: () => string | null;
}

interface ProxySuccess {
  lookup?: PropertyLookup;
}

interface ProxyError {
  error?: string;
  code?: string;
}

export function createRentCastProxyProvider(options: RentCastProxyOptions): PropertyProvider {
  const base = options.apiUrl.replace(/\/+$/, '');
  return {
    id: 'rentcast',
    tier: 'api',
    supports(request: LookupRequest): boolean {
      const address = request.address?.trim() ?? '';
      return address !== '' && options.getApiKey() !== null;
    },
    async lookup(request: LookupRequest): Promise<PropertyLookup> {
      const address = request.address?.trim() ?? '';
      const apiKey = options.getApiKey();
      if (address === '' || apiKey === null) {
        throw new ProviderError('bad_request', 'rentcast provider needs an address and an API key');
      }

      let res: Response;
      try {
        res = await fetch(`${base}/property`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, apiKey }),
        });
      } catch (err) {
        throw new ProviderError(
          'network_error',
          err instanceof Error ? err.message : 'property proxy unreachable',
        );
      }

      if (!res.ok) {
        let code = 'upstream_error';
        let message = `property proxy HTTP ${res.status}`;
        try {
          const body = (await res.json()) as ProxyError;
          if (typeof body.code === 'string' && body.code !== '') code = body.code;
          if (typeof body.error === 'string' && body.error !== '') message = body.error;
        } catch {
          // non-JSON error body — keep the HTTP-status message
        }
        throw new ProviderError(code, message);
      }

      const body = (await res.json()) as ProxySuccess;
      if (typeof body.lookup !== 'object' || body.lookup === null) {
        throw new ProviderError('bad_response', 'property proxy returned no lookup');
      }
      return body.lookup;
    },
  };
}
