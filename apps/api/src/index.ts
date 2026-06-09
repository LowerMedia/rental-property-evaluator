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
import { handleRegion } from './routes/region.js';
import { RateLimiter, TtlCache } from './services/guardrails.js';

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

// ── CORS ───────────────────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    ...CORS_HEADERS,
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

  const parsedObj = parsed as Record<string, unknown>;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Object.hasOwn(parsedObj, 'inputs') ||
    typeof parsedObj['inputs'] !== 'object' ||
    parsedObj['inputs'] === null
  ) {
    json(res, 400, {
      error:
        'Request body must be { inputs: DealInputs, opts?: { mode: "screener" | "proforma" } }',
    });
    return;
  }

  // Guard: opts, if present, must be a plain object — not a string, number, null, or array.
  // Without this check, `opts: "screener"` or `opts: null` would silently pass through
  // the mode validation and reach evaluate() with the wrong shape.
  // Own-property check prevents prototype-chain values from satisfying the presence guard.
  const rawOpts = Object.hasOwn(parsedObj, 'opts') ? parsedObj['opts'] : undefined;
  if (
    rawOpts !== undefined &&
    (typeof rawOpts !== 'object' || rawOpts === null || Array.isArray(rawOpts))
  ) {
    json(res, 400, { error: 'opts must be an object, e.g. { "mode": "screener" }' });
    return;
  }

  const { inputs, opts } = parsed as { inputs: DealInputs; opts?: EvalOptions };

  if (opts?.mode !== undefined && !VALID_MODES.has(opts.mode)) {
    json(res, 400, {
      error: `opts.mode must be "screener" or "proforma", got "${opts.mode}"`,
    });
    return;
  }

  // Validate required top-level fields — both presence AND type.
  // Engine normalises absent/null numerics to 0 and non-boolean rollClosingCostsIntoLoan
  // via Boolean() to false, both producing misleading results without a prior 400.
  // Non-finite numbers (Infinity, NaN) are also rejected — consistent with isValidExpenseItem.
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
    json(res, 400, {
      error: `Invalid or missing required input fields: ${invalidFields.join(', ')}`,
    });
    return;
  }

  // Guard: expenses must be a plain object — not null, not array.
  const expField = Object.hasOwn(rawInputs, 'expenses') ? rawInputs['expenses'] : undefined;
  if (typeof expField !== 'object' || expField === null || Array.isArray(expField)) {
    json(res, 400, {
      error:
        'inputs.expenses must be an object including taxes and insurance, each { amount: number, period: "monthly" | "annual" }',
    });
    return;
  }
  const expObj = expField as Record<string, unknown>;

  // taxes and insurance are required ExpenseInput fields.
  if (!Object.hasOwn(expObj, 'taxes') || !Object.hasOwn(expObj, 'insurance')) {
    json(res, 400, {
      error:
        'inputs.expenses must include taxes and insurance, each { amount: number, period: "monthly" | "annual" }',
    });
    return;
  }

  // DealExpenses has two field categories — validate each appropriately:
  //   ExpenseInput fields (taxes, insurance, hoa, other): { amount: number, period: "monthly"|"annual" }
  //   Numeric % fields (capExPct, maintPct, mgmtPct, miscPct): finite number
  // Keys outside these two sets are not validated and are silently ignored by the engine
  // (normalizeExpenses() only maps known fields).
  const EXPENSE_ITEM_KEYS = new Set(['taxes', 'insurance', 'hoa', 'other']);
  const EXPENSE_PCT_KEYS = new Set(['capExPct', 'maintPct', 'mgmtPct', 'miscPct']);

  const invalidItemKeys = Object.keys(expObj).filter(
    (k) => EXPENSE_ITEM_KEYS.has(k) && !isValidExpenseItem(expObj[k]),
  );
  if (invalidItemKeys.length > 0) {
    // Fully-qualify each key so the message is unambiguous (no "inputs.expenses.taxes, hoa" dotted-path confusion).
    const qualifiedItemKeys = invalidItemKeys.map((k) => `inputs.expenses.${k}`).join(', ');
    json(res, 400, {
      error: `${qualifiedItemKeys} must each be { amount: number, period: "monthly" | "annual" }`,
    });
    return;
  }

  const invalidPctKeys = Object.keys(expObj).filter(
    (k) =>
      EXPENSE_PCT_KEYS.has(k) &&
      (typeof expObj[k] !== 'number' || !Number.isFinite(expObj[k] as number)),
  );
  if (invalidPctKeys.length > 0) {
    // Fully-qualify each key so the message is unambiguous.
    const qualifiedPctKeys = invalidPctKeys.map((k) => `inputs.expenses.${k}`).join(', ');
    json(res, 400, {
      error: `${qualifiedPctKeys} must each be a finite number`,
    });
    return;
  }

  try {
    const results = evaluate(inputs, opts);
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

  // Address geometry does not move — geocode answers cache on the same
  // TTL knob as property lookups (RPE-46)
  const geocodeDeps: GeocodeDeps = {
    cache: new TtlCache<GeocodeSuccessBody>(
      config.property?.cacheTtlMs ?? envInt('RPE_PROPERTY_CACHE_TTL_MS', 24 * 60 * 60 * 1000),
    ),
  };

  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url?.split('?')[0] ?? '/';

    // Handle CORS preflight globally before routing
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    if (url === '/health' || url === '/health/') {
      handleHealth(req, res);
      return;
    }

    // Route to async handlers; catch unhandled rejections so every request
    // gets a response (createServer does not propagate Promise rejections).
    const asyncHandler =
      url === '/evaluate' || url === '/evaluate/'
        ? () => handleEvaluate(req, res)
        : url === '/property' || url === '/property/'
        ? () => handleProperty(req, res, json, readBody, propertyDeps)
        : url === '/region' || url === '/region/'
        ? () => handleRegion(req, res, json)
        : url === '/geocode' || url === '/geocode/'
        ? () => handleGeocode(req, res, json, geocodeDeps)
        : () => {
            json(res, 404, { error: `Unknown endpoint: ${url}` });
            return Promise.resolve();
          };

    asyncHandler().catch((err: unknown) => {
      console.error('Unhandled request error:', err instanceof Error ? err.stack : String(err));
      if (!res.headersSent) {
        json(res, 500, { error: 'Internal server error' });
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
    console.log('  GET  /region?zip=XXXXX');
    console.log('  GET  /geocode?q=<address>');
  });
  server.on('error', (err) => {
    console.error('Server error:', err);
    process.exit(1);
  });
}
