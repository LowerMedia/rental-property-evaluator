/**
 * POST /scrape — flag-gated listing-page scrape fallback (RPE-51)
 *
 * OFF by default (RPE_SCRAPE_ENABLED). Scraping listing sites violates
 * their ToS and is anti-bot-fragile — enabling this in production is a
 * product/legal decision, not a technical one. The route exists so the
 * tiered resolver has a complete chain when that call is made.
 *
 * Receives { url: string } and returns:
 *   200 { lookup: PropertyLookup, cached: boolean }
 *   403 { error, code: 'scrape_disabled' }   — flag off
 *   400 { error, code: 'bad_request' }       — missing/invalid/non-allowlisted URL
 *   429 { error, code: 'proxy_rate_limit' }
 *   502 { error, code: 'upstream_error' }    — page unreachable/empty
 *
 * Containment:
 *   - SSRF: only https URLs whose hostname is one of the five supported
 *     listing hosts are ever fetched — never an open proxy
 *   - every parsed field is forced to source 'scrape' / confidence 'low'
 *     ("unverified source") regardless of what the heuristics report
 *   - isolated path: nothing on /property depends on this route
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseListingText, type PropertyLookup } from '@rpe/property';
import { fetchListingPageText, isAllowedListingUrl } from '../services/scrapePage.js';
import { clientIp, type RateLimiter, type TtlCache } from '../services/guardrails.js';

type JsonFn = (res: ServerResponse, status: number, body: unknown) => void;
type ReadBodyFn = (req: IncomingMessage) => Promise<string>;

export interface ScrapeSuccessBody {
  lookup: PropertyLookup;
  cached: boolean;
}

export interface ScrapeDeps {
  enabled: boolean;
  cache: TtlCache<ScrapeSuccessBody>;
  limiter: RateLimiter;
}

/** Force every field to the unverified-source label, whatever the heuristics said. */
function forceLowConfidence(lookup: PropertyLookup): PropertyLookup {
  const result: PropertyLookup = {};
  for (const [key, field] of Object.entries(lookup)) {
    if (field === undefined) continue;
    result[key as keyof PropertyLookup] = {
      ...field,
      source: 'scrape',
      confidence: 'low',
    };
  }
  return result;
}

export async function handleScrape(
  req: IncomingMessage,
  res: ServerResponse,
  json: JsonFn,
  readBody: ReadBodyFn,
  deps: ScrapeDeps,
): Promise<void> {
  if (!deps.enabled) {
    json(res, 403, {
      error: 'Scrape fallback is disabled on this server.',
      code: 'scrape_disabled',
    });
    return;
  }

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
    json(res, tooLarge ? 413 : 400, { error: msg, code: tooLarge ? 'payload_too_large' : 'bad_request' });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    json(res, 400, { error: 'Invalid JSON', code: 'bad_request' });
    return;
  }
  const obj = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>;
  const rawUrl = typeof obj['url'] === 'string' ? obj['url'].trim() : '';
  if (rawUrl === '') {
    json(res, 400, { error: 'url is required and must be a non-empty string', code: 'bad_request' });
    return;
  }

  // SSRF containment: https + supported listing hosts only
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    json(res, 400, { error: 'url must be a valid absolute URL', code: 'bad_request' });
    return;
  }
  if (!isAllowedListingUrl(url)) {
    json(res, 400, {
      error: 'url must be an https listing page on a supported host',
      code: 'bad_request',
    });
    return;
  }

  const cacheKey = url.toString();
  const hit = deps.cache.get(cacheKey);
  if (hit !== undefined) {
    json(res, 200, { ...hit, cached: true });
    return;
  }

  const decision = deps.limiter.check(clientIp(req));
  if (!decision.allowed) {
    json(res, 429, {
      error: 'Too many scrape requests from this client — try again later.',
      code: 'proxy_rate_limit',
      retryAfterSec: decision.retryAfterSec,
    });
    return;
  }

  const text = await fetchListingPageText(url.toString());
  if (text === null || text === '') {
    json(res, 502, { error: 'Listing page could not be fetched.', code: 'upstream_error' });
    return;
  }

  const lookup = forceLowConfidence(parseListingText(text));
  const success: ScrapeSuccessBody = { lookup, cached: false };
  deps.cache.set(cacheKey, success);
  json(res, 200, success);
}
