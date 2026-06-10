/**
 * @rpe/api — Thin HTTP evaluation API (RPE-40)
 *
 * Exposes @rpe/engine's evaluate() over HTTP so external tooling, scripts,
 * and integrations can compute deal metrics without a browser.
 *
 * Endpoints:
 *   GET  /health       → { status: 'ok', version: string }  // version from package.json
 *   POST /evaluate     → { results: Results }
 *
 * POST /evaluate body (JSON):
 *   {
 *     "inputs": DealInputs,
 *     "opts":   { "mode": "screener" | "proforma" }   // optional, default screener
 *   }
 *
 * Minimal DealInputs example (screener mode):
 *   {
 *     "purchasePrice": 300000, "percentDown": 20, "interestRate": 7,
 *     "loanTermYears": 30, "closingCosts": 0, "rollClosingCostsIntoLoan": false,
 *     "grossRent": 2200, "vacancyPct": 5,
 *     "expenses": {
 *       "taxes":     { "amount": 3600, "period": "annual" },
 *       "insurance": { "amount": 1200, "period": "annual" }
 *     }
 *   }
 *
 * Error responses:
 *   400 { error: string }  — malformed JSON, missing inputs, or invalid opts.mode
 *   404 { error: string }  — unknown path
 *   405 { error: string }  — wrong HTTP method
 *   413 { error: string }  — payload exceeds 64 KB
 *   500 { error: string }  — unexpected evaluation error (details logged server-side)
 *
 * Configuration:
 *   PORT env var — integer 1–65535, default 3001
 *   HOST env var — default '0.0.0.0'
 */

import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from '@rpe/engine';
import type { DealInputs, EvalOptions } from '@rpe/engine';
import { handleGeocode, type GeocodeDeps, type GeocodeSuccessBody } from './routes/geocode.js';
import { handleProperty, type PropertyDeps, type PropertySuccessBody } from './routes/property.js';
import {
  handlePropertyContext,
  type PropertyContextDeps,
  type ContextSuccessBody,
} from './routes/propertyContext.js';
import { handleRegion } from './routes/region.js';
import { handleReports, type ValidatedEvalBody } from './routes/reports.js';
import { buildOpenApiSpec, docsHtml } from './openapi.js';
import { handleScrape, type ScrapeDeps, type ScrapeSuccessBody } from './routes/scrape.js';
import { RateLimiter, TtlCache, clientIp } from './services/guardrails.js';
import { Router, logRequest, normalizePath, resolveRequestId, v1Error } from './router.js';
import { ApiKeyStore, extractApiKey, type ApiKeyRecord } from './services/apiKeys.js';
import { toNodeHandler } from 'better-auth/node';
import type { RpeAuth } from '@rpe/db';

// Hoist __filename/__dirname for use in VERSION and the entry-point guard below.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// VERSION is read from package.json at module-load time — single source of truth,
// no hard-coded string to drift from the published version.
const VERSION: string = (
  JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as { version: string }
).version;
const MAX_BODY_BYTES = 64 * 1024; // 64 KB
const VALID_MODES = new Set<string>(['screener', 'proforma']);
const VALID_PERIODS = new Set<string>(['monthly', 'annual']);

// ── CORS (RPE-81) ──────────────────────────────────────────────────────────────
//
// Policy: API keys travel in headers, never cookies, so we NEVER send
// Access-Control-Allow-Credentials — a credential-less '*' default is
// safe for the open SPA/dev surface. Operators scoping browser access
// set RPE_CORS_ORIGINS (comma-separated origins); matching origins are
// echoed (with Vary: Origin), everything else gets no CORS grant.
// Server-to-server callers are unaffected either way.

const CORS_BASE: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Request-Id',
  'Access-Control-Max-Age': '86400',
};

function parseCorsOrigins(raw: string | undefined): string[] | null {
  if (raw === undefined || raw.trim() === '') return null;
  const origins = raw.split(',').map((o) => o.trim()).filter((o) => o !== '');
  return origins.length > 0 ? origins : null;
}

/** Per-request CORS headers under the configured policy. */
function corsHeadersFor(
  requestOrigin: string | undefined,
  allowlist: string[] | null,
): Record<string, string> {
  if (allowlist === null) {
    return { ...CORS_BASE, 'Access-Control-Allow-Origin': '*' };
  }
  if (requestOrigin !== undefined && allowlist.includes(requestOrigin)) {
    return { ...CORS_BASE, 'Access-Control-Allow-Origin': requestOrigin, Vary: 'Origin' };
  }
  return { Vary: 'Origin' }; // no grant for unlisted origins
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  // CORS + security headers are set per-request by the dispatcher via
  // setHeader; writeHead merges them in
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** Raw (non-JSON) response writer for downloads — CORS included (RPE-79). */
function sendRaw(
  res: ServerResponse,
  status: number,
  contentType: string,
  body: Uint8Array | string,
  disposition?: string,
): void {
  const payload = typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body);
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': payload.byteLength,
    ...(disposition !== undefined ? { 'Content-Disposition': disposition } : {}),
  });
  res.end(payload);
}

/**
 * Buffer the request body up to MAX_BODY_BYTES.
 *
 * - Oversize: drains via req.resume() (preserves keep-alive) then rejects.
 * - Abort / early close: rejects when the connection closes before 'end'
 *   (req.complete is false), preventing the Promise from hanging indefinitely.
 * - All listeners are removed once the Promise settles (no leaks).
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
      req.off('close', onClose);
      fn();
    };

    const onData = (chunk: Buffer): void => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.resume(); // drain remaining data without destroying the socket
        settle(() => reject(new Error('Payload too large')));
        return;
      }
      chunks.push(chunk);
    };

    const onEnd = (): void => {
      settle(() => resolve(Buffer.concat(chunks).toString('utf8')));
    };

    const onError = (err: Error): void => {
      settle(() => reject(err));
    };

    const onClose = (): void => {
      // Fires on both normal teardown and mid-stream abort.
      // req.complete is false when the connection closed before 'end' was received.
      if (!req.complete) {
        settle(() => reject(new Error('Request connection closed prematurely')));
      }
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('close', onClose);
  });
}

function validatePort(raw: string | undefined): number {
  const n = Number(raw ?? 3001);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(
      `Invalid PORT: "${raw}". Must be an integer between 1 and 65535.`,
    );
  }
  return n;
}

/**
 * Validates an expense line item is `{ amount: number, period: "monthly" | "annual" }`.
 * Uses own-property checks and explicit type guards to reject coercible-but-wrong values
 * (e.g. `amount: "3600"` or `period: "weekly"`).
 */
function isValidExpenseItem(item: unknown): boolean {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) return false;
  const obj = item as Record<string, unknown>;
  return (
    Object.hasOwn(obj, 'amount') &&
    typeof obj['amount'] === 'number' &&
    Number.isFinite(obj['amount']) &&
    Object.hasOwn(obj, 'period') &&
    typeof obj['period'] === 'string' &&
    VALID_PERIODS.has(obj['period'])
  );
}

// ── Route handlers ─────────────────────────────────────────────────────────────

function handleHealth(req: IncomingMessage, res: ServerResponse): void {
  // Only GET is supported — HEAD is excluded to avoid body/no-body ambiguity.
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed — use GET' });
    return;
  }
  json(res, 200, { status: 'ok', version: VERSION });
}

/**
 * Validate an evaluate/report request body (RPE-79 — shared by
 * handleEvaluate and POST /v1/reports so the contract can't drift).
 * Messages preserved verbatim from the original inline validation.
 */
export function validateEvaluateBody(parsed: unknown): ValidatedEvalBody {
  const parsedObj = parsed as Record<string, unknown>;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Object.hasOwn(parsedObj, 'inputs') ||
    typeof parsedObj['inputs'] !== 'object' ||
    parsedObj['inputs'] === null
  ) {
    return {
      ok: false,
      message: 'Request body must be { inputs: DealInputs, opts?: { mode: "screener" | "proforma" } }',
    };
  }

  // Guard: opts, if present, must be a plain object — not a string, number, null, or array.
  // Own-property check prevents prototype-chain values from satisfying the presence guard.
  const rawOpts = Object.hasOwn(parsedObj, 'opts') ? parsedObj['opts'] : undefined;
  if (
    rawOpts !== undefined &&
    (typeof rawOpts !== 'object' || rawOpts === null || Array.isArray(rawOpts))
  ) {
    return { ok: false, message: 'opts must be an object, e.g. { "mode": "screener" }' };
  }

  const { inputs, opts } = parsed as { inputs: DealInputs; opts?: EvalOptions };

  if (opts?.mode !== undefined && !VALID_MODES.has(opts.mode)) {
    return { ok: false, message: `opts.mode must be "screener" or "proforma", got "${opts.mode}"` };
  }

  // Validate required top-level fields — both presence AND type.
  // Engine normalises absent/null numerics to 0 and non-boolean rollClosingCostsIntoLoan
  // via Boolean() to false, both producing misleading results without a prior 400.
  const REQUIRED_NUMERIC = [
    'purchasePrice', 'percentDown', 'interestRate', 'loanTermYears',
    'closingCosts', 'grossRent', 'vacancyPct',
  ] as const;
  const REQUIRED_BOOLEAN = ['rollClosingCostsIntoLoan'] as const;
  const rawInputs = inputs as unknown as Record<string, unknown>;

  const invalidFields: string[] = [
    ...REQUIRED_NUMERIC.filter(
      (k) =>
        !Object.hasOwn(rawInputs, k) ||
        typeof rawInputs[k] !== 'number' ||
        !Number.isFinite(rawInputs[k] as number),
    ),
    ...REQUIRED_BOOLEAN.filter(
      (k) => !Object.hasOwn(rawInputs, k) || typeof rawInputs[k] !== 'boolean',
    ),
  ];
  if (invalidFields.length > 0) {
    return { ok: false, message: `Invalid or missing required input fields: ${invalidFields.join(', ')}` };
  }

  // Guard: expenses must be a plain object — not null, not array.
  const expField = Object.hasOwn(rawInputs, 'expenses') ? rawInputs['expenses'] : undefined;
  if (typeof expField !== 'object' || expField === null || Array.isArray(expField)) {
    return {
      ok: false,
      message:
        'inputs.expenses must be an object including taxes and insurance, each { amount: number, period: "monthly" | "annual" }',
    };
  }
  const expObj = expField as Record<string, unknown>;

  if (!Object.hasOwn(expObj, 'taxes') || !Object.hasOwn(expObj, 'insurance')) {
    return {
      ok: false,
      message:
        'inputs.expenses must include taxes and insurance, each { amount: number, period: "monthly" | "annual" }',
    };
  }

  const EXPENSE_ITEM_KEYS = new Set(['taxes', 'insurance', 'hoa', 'other']);
  const EXPENSE_PCT_KEYS = new Set(['capExPct', 'maintPct', 'mgmtPct', 'miscPct']);

  const invalidItemKeys = Object.keys(expObj).filter(
    (k) => EXPENSE_ITEM_KEYS.has(k) && !isValidExpenseItem(expObj[k]),
  );
  if (invalidItemKeys.length > 0) {
    const qualifiedItemKeys = invalidItemKeys.map((k) => `inputs.expenses.${k}`).join(', ');
    return { ok: false, message: `${qualifiedItemKeys} must each be { amount: number, period: "monthly" | "annual" }` };
  }

  const invalidPctKeys = Object.keys(expObj).filter(
    (k) =>
      EXPENSE_PCT_KEYS.has(k) &&
      (typeof expObj[k] !== 'number' || !Number.isFinite(expObj[k] as number)),
  );
  if (invalidPctKeys.length > 0) {
    const qualifiedPctKeys = invalidPctKeys.map((k) => `inputs.expenses.${k}`).join(', ');
    return { ok: false, message: `${qualifiedPctKeys} must each be a finite number` };
  }

  const format = Object.hasOwn(parsedObj, 'format') && typeof parsedObj['format'] === 'string'
    ? parsedObj['format']
    : null;

  return { ok: true, inputs, opts, format };
}

async function handleEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed — use POST' });
    return;
  }

  let body: string;
  try {
    body = await readBody(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to read request body';
    const status = msg === 'Payload too large' ? 413 : 400;
    json(res, status, { error: msg });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    json(res, 400, { error: 'Invalid JSON' });
    return;
  }

  const validated = validateEvaluateBody(parsed);
  if (!validated.ok) {
    json(res, 400, { error: validated.message });
    return;
  }

  try {
    const results = evaluate(validated.inputs, validated.opts);
    json(res, 200, { results });
  } catch (err) {
    // Log full details server-side; return a generic message to clients.
    console.error('Evaluation error:', err instanceof Error ? err.stack : String(err));
    json(res, 500, { error: 'Internal server error' });
  }
}

// ── App factory ────────────────────────────────────────────────────────────────

/**
 * /property cost-guardrail config (RPE-45). Env defaults:
 *   RPE_PROPERTY_CACHE_TTL_MS — success-response cache TTL, default 24 h, 0 disables
 *   RPE_PROPERTY_RPM          — per-IP requests/minute reaching the provider, default 30
 *   RPE_PROPERTY_DAILY_CAP    — per-IP daily provider-call cap, default 300
 */
export interface AppConfig {
  property?: {
    cacheTtlMs?: number;
    rpm?: number;
    dailyCap?: number;
  };
  /** /geocode guardrails (RPE-46). Env: RPE_GEOCODE_RPM (default 60),
   * RPE_GEOCODE_DAILY_CAP (default 1000); cache shares the property TTL knob. */
  geocode?: {
    rpm?: number;
    dailyCap?: number;
  };
  /** CORS allowlist (RPE-81). Overrides RPE_CORS_ORIGINS; null/absent =
   * credential-less '*' (we never send Allow-Credentials). */
  cors?: {
    origins?: string[];
  };
  /** /v1 API key auth (RPE-75). Enforced on the /v1 surface (except
   * /v1/health) whenever the key store is non-empty; legacy unprefixed
   * routes stay open for the SPA. Records via config (tests), the
   * RPE_API_KEYS env JSON, or RPE_API_KEYS_FILE. */
  auth?: {
    keys?: ApiKeyRecord[];
  };
  /** /v1 public-surface throttle (RPE-76) — keyed by api key id, per-IP
   * for unauthenticated paths. In-memory fixed windows: a shared store
   * (e.g. Redis) is required before horizontal scaling. Env:
   * RPE_V1_RPM (default 120), RPE_V1_DAILY_CAP (default 10000). */
  v1RateLimit?: {
    rpm?: number;
    dailyCap?: number;
  };
  /** Cookie-session auth (RPE-89, ADR 0001). Inject a configured
   * better-auth instance (createAuth from @rpe/db — the caller owns the
   * db lifecycle + migrations). When absent, /v1/auth/* returns 404 and
   * the API runs key-only as before. */
  session?: {
    auth: RpeAuth;
  };
  /** /scrape fallback (RPE-51). OFF unless RPE_SCRAPE_ENABLED=1/true —
   * enabling in production is a product/legal call. Env: RPE_SCRAPE_RPM
   * (default 5), RPE_SCRAPE_DAILY_CAP (default 50). */
  scrape?: {
    enabled?: boolean;
    rpm?: number;
    dailyCap?: number;
  };
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function createApp(config: AppConfig = {}) {
  const propertyDeps: PropertyDeps = {
    cache: new TtlCache<PropertySuccessBody>(
      config.property?.cacheTtlMs ?? envInt('RPE_PROPERTY_CACHE_TTL_MS', 24 * 60 * 60 * 1000),
    ),
    limiter: new RateLimiter(
      config.property?.rpm ?? envInt('RPE_PROPERTY_RPM', 30),
      config.property?.dailyCap ?? envInt('RPE_PROPERTY_DAILY_CAP', 300),
    ),
  };

  // Comps/history share the /property limiter — one provider-call budget
  // per client across both endpoints (RPE-49)
  const propertyContextDeps: PropertyContextDeps = {
    cache: new TtlCache<ContextSuccessBody>(
      config.property?.cacheTtlMs ?? envInt('RPE_PROPERTY_CACHE_TTL_MS', 24 * 60 * 60 * 1000),
    ),
    limiter: propertyDeps.limiter,
  };

  const scrapeDeps: ScrapeDeps = {
    enabled:
      config.scrape?.enabled ??
      ['1', 'true'].includes((process.env['RPE_SCRAPE_ENABLED'] ?? '').toLowerCase()),
    cache: new TtlCache<ScrapeSuccessBody>(
      config.property?.cacheTtlMs ?? envInt('RPE_PROPERTY_CACHE_TTL_MS', 24 * 60 * 60 * 1000),
    ),
    limiter: new RateLimiter(
      config.scrape?.rpm ?? envInt('RPE_SCRAPE_RPM', 5),
      config.scrape?.dailyCap ?? envInt('RPE_SCRAPE_DAILY_CAP', 50),
    ),
  };

  // Address geometry does not move — geocode answers cache on the same
  // TTL knob as property lookups (RPE-46)
  const geocodeDeps: GeocodeDeps = {
    cache: new TtlCache<GeocodeSuccessBody>(
      config.property?.cacheTtlMs ?? envInt('RPE_PROPERTY_CACHE_TTL_MS', 24 * 60 * 60 * 1000),
    ),
    limiter: new RateLimiter(
      config.geocode?.rpm ?? envInt('RPE_GEOCODE_RPM', 60),
      config.geocode?.dailyCap ?? envInt('RPE_GEOCODE_DAILY_CAP', 1000),
    ),
  };

  const corsAllowlist =
    config.cors?.origins ?? parseCorsOrigins(process.env['RPE_CORS_ORIGINS']);

  const apiKeys = ApiKeyStore.fromEnv(config.auth?.keys);
  const sessionAuthHandler =
    config.session !== undefined ? toNodeHandler(config.session.auth) : null;

  const v1Limiter = new RateLimiter(
    config.v1RateLimit?.rpm ?? envInt('RPE_V1_RPM', 120),
    config.v1RateLimit?.dailyCap ?? envInt('RPE_V1_DAILY_CAP', 10000),
  );

  // Handler-emitted error bodies carry the request id too (RPE-74) —
  // the dispatcher sets X-Request-Id on the response before dispatch, so
  // the wrapper recovers it without per-request closures
  const jsonWithRequestId: typeof json = (rs, status, body) => {
    const rid = String(rs.getHeader('X-Request-Id') ?? '');
    if (status >= 400 && body !== null && typeof body === 'object' && !Array.isArray(body) && rid !== '') {
      json(rs, status, { ...(body as Record<string, unknown>), requestId: rid });
      return;
    }
    json(rs, status, body);
  };

  // ── Routes (RPE-74) — registered once; /v1 aliases resolve by prefix-strip
  const router = new Router()
    .on('GET', '/health', (rq, rs) => handleHealth(rq, rs))
    .on('POST', '/evaluate', (rq, rs) => handleEvaluate(rq, rs))
    .on('POST', '/property/context', (rq, rs) => handlePropertyContext(rq, rs, jsonWithRequestId, readBody, propertyContextDeps))
    .on('POST', '/property', (rq, rs) => handleProperty(rq, rs, jsonWithRequestId, readBody, propertyDeps))
    .on('GET', '/region', (rq, rs) => handleRegion(rq, rs, jsonWithRequestId))
    .on('GET', '/geocode', (rq, rs) => handleGeocode(rq, rs, jsonWithRequestId, geocodeDeps))
    .on('POST', '/scrape', (rq, rs) => handleScrape(rq, rs, jsonWithRequestId, readBody, scrapeDeps));

  // /v1-native routes (RPE-79) — never exposed on the legacy unprefixed surface
  const v1Router = new Router()
    .on('GET', '/openapi.json', (rq, rs) => json(rs, 200, buildOpenApiSpec(VERSION)))
    .on('GET', '/docs', (rq, rs) => sendRaw(rs, 200, 'text/html; charset=utf-8', docsHtml()))
    .on('POST', '/reports', (rq, rs) =>
      handleReports(rq, rs, jsonWithRequestId, readBody, {
        validate: validateEvaluateBody,
        engineVersion: VERSION,
        sendRaw,
      }));

  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const startedAt = Date.now();
    const requestId = resolveRequestId(req);
    res.setHeader('X-Request-Id', requestId);

    // Security + CORS headers on every response (RPE-81)
    const cors = corsHeadersFor(
      Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin,
      corsAllowlist,
    );
    for (const [name, value] of Object.entries(cors)) res.setHeader(name, value);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');

    const rawPath = normalizePath(req.url?.split('?')[0] ?? '/');
    const isV1 = rawPath === '/v1' || rawPath.startsWith('/v1/');
    const path = isV1 ? normalizePath(rawPath.slice(3)) : rawPath;
    let apiKeyId: string | null = null;

    res.on('finish', () => {
      logRequest({
        method: req.method ?? 'GET',
        path: rawPath,
        status: res.statusCode,
        latencyMs: Date.now() - startedAt,
        requestId,
        ...(apiKeyId !== null ? { apiKeyId } : {}),
      });
    });

    // Handle CORS preflight globally before routing (headers already set)
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // /v1 auth (RPE-75): enforced when keys are configured; /v1/health
    // stays open for load balancers, legacy unprefixed routes stay open
    // for the SPA
    if (isV1) {
      res.setHeader(
        'Cache-Control',
        path === '/openapi.json' || path === '/docs' ? 'public, max-age=300' : 'no-store',
      );
    }

    const isV1Session = isV1 && (path === '/auth' || path.startsWith('/auth/'));
    const isV1Open =
      isV1 &&
      ((req.method === 'GET' &&
        (path === '/health' || path === '/openapi.json' || path === '/docs')) ||
        isV1Session); // cookie surface — better-auth owns its own auth + CSRF
    const isV1Health = isV1 && path === '/health' && req.method === 'GET';
    if (isV1 && apiKeys.size > 0) {
      const presented = extractApiKey(req.headers);
      const record = presented !== null ? apiKeys.verify(presented) : null;
      if (record !== null) {
        apiKeyId = record.id;
      } else if (!isV1Open) {
        // health/docs identify but never reject (load balancers and browsers don't auth);
        // everything else on /v1 requires a valid key
        json(res, 401, v1Error(
          'unauthorized',
          'A valid API key is required — send Authorization: Bearer <key> or X-API-Key.',
          requestId,
        ));
        return;
      }
    }

    // /v1 throttle (RPE-76): keyed by api key identity, per-IP fallback
    // for unauthenticated paths (health, zero-config dev). Quota headers
    // on every /v1 response.
    if (isV1) {
      const decision = v1Limiter.check(apiKeyId ?? `ip:${clientIp(req)}`);
      if (decision.limit !== undefined) res.setHeader('X-RateLimit-Limit', String(decision.limit));
      if (decision.remaining !== undefined) res.setHeader('X-RateLimit-Remaining', String(decision.remaining));
      if (decision.resetSec !== undefined) res.setHeader('X-RateLimit-Reset', String(decision.resetSec));
      if (!decision.allowed) {
        res.setHeader('Retry-After', String(decision.retryAfterSec ?? 60));
        json(res, 429, v1Error(
          'rate_limited',
          'Rate limit exceeded — slow down and retry after the indicated interval.',
          requestId,
        ));
        return;
      }
    }

    // /v1-native: versioned health with API metadata
    if (isV1Health) {
      json(res, 200, {
        status: 'ok',
        version: VERSION,
        apiVersion: 'v1',
        gitSha: process.env['GIT_SHA'] ?? null,
      });
      return;
    }

    // Cookie-session surface (RPE-89): better-auth handles everything
    // under /v1/auth — its own routing, cookies, and CSRF origin checks.
    // Runs after the per-IP throttle (brute-force pre-protection).
    if (isV1Session) {
      if (sessionAuthHandler === null) {
        json(res, 404, v1Error('not_found', 'Session auth is not enabled on this server.', requestId));
        return;
      }
      // Resolve the client IP under the RPE-76 trust boundary (XFF
      // first hop, socket fallback) so the login throttle never
      // collapses direct connections into one shared bucket
      req.headers['x-rpe-client-ip'] = clientIp(req);
      sessionAuthHandler(req, res).catch((err: unknown) => {
        console.error('Auth handler error:', err instanceof Error ? err.stack : String(err), 'requestId:', requestId);
        if (!res.headersSent) {
          json(res, 500, v1Error('internal', 'Internal server error', requestId));
        }
      });
      return;
    }

    const handler = (isV1 ? v1Router.resolve(req.method, path) : undefined)
      ?? router.resolve(req.method, path);
    if (handler === undefined) {
      // Unknown route: standard envelope on the /v1 surface, legacy flat
      // shape (now with requestId) for unprefixed callers
      if (isV1) {
        json(res, 404, v1Error('not_found', `Unknown endpoint: ${rawPath}`, requestId));
      } else {
        json(res, 404, { error: `Unknown endpoint: ${rawPath}`, requestId });
      }
      return;
    }

    // Catch unhandled rejections so every request gets a response
    // (createServer does not propagate Promise rejections).
    Promise.resolve(handler(req, res)).catch((err: unknown) => {
      console.error('Unhandled request error:', err instanceof Error ? err.stack : String(err), 'requestId:', requestId);
      if (!res.headersSent) {
        json(res, 500, isV1
          ? v1Error('internal', 'Internal server error', requestId)
          : { error: 'Internal server error', requestId });
      }
    });
  });
}

// ── Entry point (skipped when imported by tests/other modules) ────────────────

if (resolve(process.argv[1] ?? '') === __filename) {
  const port = validatePort(process.env['PORT']);
  const host = process.env['HOST'] ?? '0.0.0.0';
  const server = createApp();
  server.listen(port, host, () => {
    console.log(`@rpe/api ${VERSION} listening on http://${host}:${port}`);
    console.log('  GET  /health');
    console.log('  POST /evaluate');
    console.log('  POST /property');
    console.log('  POST /property/context');
    console.log('  GET  /region?zip=XXXXX');
    console.log('  GET  /geocode?q=<address>');
    console.log('  POST /v1/reports (json|csv|pdf)');
  });
  server.on('error', (err) => {
    console.error('Server error:', err);
    process.exit(1);
  });
}
