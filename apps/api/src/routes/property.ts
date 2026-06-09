/**
 * POST /property — RentCast proxy route (RPE-43b, hardened in RPE-45)
 *
 * Receives { address: string, apiKey: string } and returns:
 *   200 { data: PropertyData, lookup: PropertyLookup, cached: boolean }
 *
 * `lookup` is the provenance-tagged shape consumed by the client-side
 * tiered resolver (@rpe/property, RPE-44). `data` is kept for the
 * existing autofill UI.
 *
 * Errors carry a typed envelope { error: string, code: PropertyErrorCode }
 * so the resolver can decide whether to fall through to a lower tier:
 *   400 bad_request          — malformed body
 *   401 bad_key              — provider rejected the API key
 *   404 not_found            — no property for this address
 *   405 method_not_allowed
 *   413 payload_too_large
 *   429 rate_limit           — upstream (RentCast plan) limit
 *   429 proxy_rate_limit     — this proxy's cost guardrail (retryAfterSec set)
 *   502 upstream_error       — provider failed
 *   500 internal
 *
 * Cost guardrails (RPE-45): successful lookups are cached by
 * key-scoped normalized address (TTL), and calls that would hit the
 * provider are rate limited per client IP (rpm + daily cap). Cache hits
 * do not consume rate-limit quota.
 *
 * The apiKey is forwarded to RentCast and never written to any log output.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { fetchPropertyData, RentCastError, type RentCastErrorCode } from '@rpe/rentcast';
import type { PropertyData } from '@rpe/rentcast';
import type { PropertyLookup } from '@rpe/property';
import { toPropertyLookup } from '../services/propertyLookup.js';
import { clientIp, scopeKey, type RateLimiter, type TtlCache } from '../services/guardrails.js';

// Imported from the parent module — passed in to avoid circular imports.
type JsonFn = (res: ServerResponse, status: number, body: unknown) => void;
type ReadBodyFn = (req: IncomingMessage) => Promise<string>;

export type PropertyErrorCode =
  | 'bad_request'
  | 'method_not_allowed'
  | 'payload_too_large'
  | 'bad_key'
  | 'not_found'
  | 'rate_limit'
  | 'proxy_rate_limit'
  | 'upstream_error'
  | 'internal';

export interface PropertySuccessBody {
  data: PropertyData;
  lookup: PropertyLookup;
  cached: boolean;
}

/** Guardrail instances owned by the app (per-process). */
export interface PropertyDeps {
  cache: TtlCache<PropertySuccessBody>;
  limiter: RateLimiter;
}

export async function handleProperty(
  req: IncomingMessage,
  res: ServerResponse,
  json: JsonFn,
  readBody: ReadBodyFn,
  deps: PropertyDeps,
): Promise<void> {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed — use POST', code: 'method_not_allowed' });
    return;
  }

  let body: string;
  try {
    body = await readBody(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to read request body';
    const tooLarge = msg === 'Payload too large';
    json(res, tooLarge ? 413 : 400, {
      error: msg,
      code: tooLarge ? 'payload_too_large' : 'bad_request',
    });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    json(res, 400, { error: 'Invalid JSON', code: 'bad_request' });
    return;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    json(res, 400, {
      error: 'Request body must be { address: string, apiKey: string }',
      code: 'bad_request',
    });
    return;
  }
  const obj = parsed as Record<string, unknown>;
  if (!Object.hasOwn(obj, 'address') || typeof obj['address'] !== 'string' || obj['address'].trim() === '') {
    json(res, 400, {
      error: 'address is required and must be a non-empty string',
      code: 'bad_request',
    });
    return;
  }
  if (!Object.hasOwn(obj, 'apiKey') || typeof obj['apiKey'] !== 'string' || obj['apiKey'].trim() === '') {
    json(res, 400, {
      error: 'apiKey is required and must be a non-empty string',
      code: 'bad_request',
    });
    return;
  }

  const address = obj['address'].trim();
  const apiKey  = obj['apiKey'].trim();

  // Cache hit: no provider call, no rate-limit charge
  const cacheKey = scopeKey(apiKey, address);
  const hit = deps.cache.get(cacheKey);
  if (hit !== undefined) {
    json(res, 200, { ...hit, cached: true });
    return;
  }

  // Cost guardrail: only requests that would reach the provider count
  const decision = deps.limiter.check(clientIp(req));
  if (!decision.allowed) {
    json(res, 429, {
      error: 'Too many lookups from this client — try again later.',
      code: 'proxy_rate_limit',
      retryAfterSec: decision.retryAfterSec,
    });
    return;
  }

  try {
    const data = await fetchPropertyData(address, apiKey);
    const success: PropertySuccessBody = { data, lookup: toPropertyLookup(data), cached: false };
    deps.cache.set(cacheKey, success);
    json(res, 200, success);
  } catch (err) {
    if (err instanceof RentCastError) {
      // Map RentCast error codes to HTTP status codes.
      // Never include apiKey in error response or logs.
      const statusMap: Record<RentCastErrorCode, number> = {
        bad_key:    401,
        not_found:  404,
        rate_limit: 429,
        unknown:    502,
      };
      const codeMap: Record<RentCastErrorCode, PropertyErrorCode> = {
        bad_key:    'bad_key',
        not_found:  'not_found',
        rate_limit: 'rate_limit',
        unknown:    'upstream_error',
      };
      // Use sanitised messages — never forward err.message which may contain
      // the encoded address query string from the upstream RentCast request.
      const clientMessages: Record<RentCastErrorCode, string> = {
        bad_key:    'Invalid or expired API key.',
        not_found:  'Property not found for this address.',
        rate_limit: 'Rate limit reached. Check your RentCast plan.',
        unknown:    'RentCast lookup failed.',
      };
      json(res, statusMap[err.code], { error: clientMessages[err.code], code: codeMap[err.code] });
      return;
    }
    // Log address only — never apiKey
    console.error('Property lookup error for address:', address, err instanceof Error ? err.stack : String(err));
    json(res, 500, { error: 'Internal server error', code: 'internal' });
  }
}
