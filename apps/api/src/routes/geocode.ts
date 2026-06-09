/**
 * GET /geocode?q=<freeform address> — address normalization (RPE-46)
 *
 * Geocodes freeform input to canonical candidates via the keyless US
 * Census geocoder. Ambiguous input returns the full candidate list for
 * disambiguation — the server never guesses.
 *
 * Responses:
 *   200 { query: string, candidates: GeocodeCandidate[], cached: boolean }
 *       (candidates may be empty — no match)
 *   400 { error, code: 'bad_request' }        — missing/blank/overlong q
 *   405 { error, code: 'method_not_allowed' }
 *   502 { error, code: 'upstream_error' }     — geocoder unavailable
 *
 * Successful responses are cached by normalized query (TTL shared with
 * the app's guardrail config) — address geometry does not move.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { geocodeAddress, type GeocodeCandidate } from '../services/censusGeocoder.js';
import { normalizeAddressKey, type TtlCache } from '../services/guardrails.js';

type JsonFn = (res: ServerResponse, status: number, body: unknown) => void;

const MAX_QUERY_LENGTH = 256;

export interface GeocodeSuccessBody {
  query: string;
  candidates: GeocodeCandidate[];
  cached: boolean;
}

export interface GeocodeDeps {
  cache: TtlCache<GeocodeSuccessBody>;
}

export async function handleGeocode(
  req: IncomingMessage,
  res: ServerResponse,
  json: JsonFn,
  deps: GeocodeDeps,
): Promise<void> {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed — use GET', code: 'method_not_allowed' });
    return;
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  const query = url.searchParams.get('q')?.trim() ?? '';
  if (query === '') {
    json(res, 400, { error: 'q is required — a freeform address to geocode', code: 'bad_request' });
    return;
  }
  if (query.length > MAX_QUERY_LENGTH) {
    json(res, 400, {
      error: `q must be at most ${MAX_QUERY_LENGTH} characters`,
      code: 'bad_request',
    });
    return;
  }

  const cacheKey = normalizeAddressKey(query);
  const hit = deps.cache.get(cacheKey);
  if (hit !== undefined) {
    json(res, 200, { ...hit, cached: true });
    return;
  }

  const candidates = await geocodeAddress(query);
  if (candidates === null) {
    json(res, 502, { error: 'Geocoding service unavailable.', code: 'upstream_error' });
    return;
  }

  const body: GeocodeSuccessBody = { query, candidates, cached: false };
  deps.cache.set(cacheKey, body);
  json(res, 200, body);
}
