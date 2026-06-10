/**
 * POST /property/context — comps & history proxy route (RPE-49)
 *
 * Receives { address: string, apiKey: string } and returns:
 *   200 { context: PropertyContext, cached: boolean }
 *
 * Read-only supporting data (rent/sale comps, tax history, price
 * history) — surfaced next to the deal, never auto-applied to inputs.
 *
 * Shares the SAME cost guardrails as /property: its own TTL cache
 * (key-scoped normalized address), and the same per-IP limiter instance
 * so property + context lookups draw from one provider-call budget.
 * Error envelope matches /property (PropertyErrorCode).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { fetchPropertyContext, RentCastError, type RentCastErrorCode } from '@rpe/rentcast';
import type { PropertyContext } from '@rpe/rentcast';
import type { PropertyErrorCode } from './property.js';
import { clientIp, scopeKey, type RateLimiter, type TtlCache } from '../services/guardrails.js';

type JsonFn = (res: ServerResponse, status: number, body: unknown) => void;
type ReadBodyFn = (req: IncomingMessage) => Promise<string>;

export interface ContextSuccessBody {
  context: PropertyContext;
  cached: boolean;
}

export interface PropertyContextDeps {
  cache: TtlCache<ContextSuccessBody>;
  /** Shared with /property — one provider-call budget per client. */
  limiter: RateLimiter;
}

export async function handlePropertyContext(
  req: IncomingMessage,
  res: ServerResponse,
  json: JsonFn,
  readBody: ReadBodyFn,
  deps: PropertyContextDeps,
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
    json(res, 400, { error: 'address is required and must be a non-empty string', code: 'bad_request' });
    return;
  }
  if (!Object.hasOwn(obj, 'apiKey') || typeof obj['apiKey'] !== 'string' || obj['apiKey'].trim() === '') {
    json(res, 400, { error: 'apiKey is required and must be a non-empty string', code: 'bad_request' });
    return;
  }

  const address = obj['address'].trim();
  const apiKey  = obj['apiKey'].trim();

  const cacheKey = scopeKey(apiKey, address);
  const hit = deps.cache.get(cacheKey);
  if (hit !== undefined) {
    json(res, 200, { ...hit, cached: true });
    return;
  }

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
    const context = await fetchPropertyContext(address, apiKey);
    const success: ContextSuccessBody = { context, cached: false };
    deps.cache.set(cacheKey, success);
    json(res, 200, success);
  } catch (err) {
    if (err instanceof RentCastError) {
      const statusMap: Record<RentCastErrorCode, number> = {
        bad_key: 401, not_found: 404, rate_limit: 429, unknown: 502,
      };
      const codeMap: Record<RentCastErrorCode, PropertyErrorCode> = {
        bad_key: 'bad_key', not_found: 'not_found', rate_limit: 'rate_limit', unknown: 'upstream_error',
      };
      const clientMessages: Record<RentCastErrorCode, string> = {
        bad_key:    'Invalid or expired API key.',
        not_found:  'Property not found for this address.',
        rate_limit: 'Rate limit reached. Check your RentCast plan.',
        unknown:    'RentCast context lookup failed.',
      };
      json(res, statusMap[err.code], { error: clientMessages[err.code], code: codeMap[err.code] });
      return;
    }
    console.error('Property context error for address:', address, err instanceof Error ? err.stack : String(err));
    json(res, 500, { error: 'Internal server error', code: 'internal' });
  }
}
