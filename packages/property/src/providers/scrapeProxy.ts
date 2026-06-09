/**
 * E7 — scrape-tier PropertyProvider (RPE-51)
 *
 * Calls the flag-gated POST /scrape proxy. Doubly gated: the provider is
 * constructed with enabled=false by default (supports() refuses), and
 * the server returns 403 scrape_disabled unless its own flag is on.
 * Results arrive pre-labeled source 'scrape' / confidence 'low'
 * (unverified source) by the route.
 */

import type { LookupRequest, PropertyLookup, PropertyProvider } from '../types';
import { ProviderError } from './rentcastProxy';

export interface ScrapeProxyOptions {
  apiUrl: string;
  /** OFF by default — enabling scrape is a product/legal call. */
  enabled?: boolean;
}

interface ScrapeSuccess {
  lookup?: PropertyLookup;
}

interface ScrapeError {
  error?: string;
  code?: string;
}

export function createScrapeProxyProvider(options: ScrapeProxyOptions): PropertyProvider {
  const base = options.apiUrl.replace(/\/+$/, '');
  const enabled = options.enabled ?? false;
  return {
    id: 'scrape',
    tier: 'scrape',
    supports(request: LookupRequest): boolean {
      return enabled && (request.url?.trim() ?? '') !== '';
    },
    async lookup(request: LookupRequest): Promise<PropertyLookup> {
      const url = request.url?.trim() ?? '';
      if (!enabled || url === '') {
        throw new ProviderError('bad_request', 'scrape provider disabled or no url');
      }

      let res: Response;
      try {
        res = await fetch(`${base}/scrape`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
      } catch (err) {
        throw new ProviderError(
          'network_error',
          err instanceof Error ? err.message : 'scrape proxy unreachable',
        );
      }

      if (!res.ok) {
        let code = 'upstream_error';
        let message = `scrape proxy HTTP ${res.status}`;
        try {
          const body = (await res.json()) as ScrapeError;
          if (typeof body.code === 'string' && body.code !== '') code = body.code;
          if (typeof body.error === 'string' && body.error !== '') message = body.error;
        } catch {
          // non-JSON error body
        }
        throw new ProviderError(code, message);
      }

      const body = (await res.json()) as ScrapeSuccess;
      if (typeof body.lookup !== 'object' || body.lookup === null) {
        throw new ProviderError('bad_response', 'scrape proxy returned no lookup');
      }
      return body.lookup;
    },
  };
}
