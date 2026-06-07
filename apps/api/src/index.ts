/**
 * @rpe/api — Thin HTTP evaluation API (RPE-40)
 *
 * Exposes @rpe/engine's evaluate() over HTTP so external tooling, scripts,
 * and integrations can compute deal metrics without a browser.
 *
 * Endpoints:
 *   GET  /health       → { status: 'ok', version: '0.1.0' }
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

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from '@rpe/engine';
import type { DealInputs, EvalOptions } from '@rpe/engine';

const VERSION = '0.1.0';
const MAX_BODY_BYTES = 64 * 1024; // 64 KB
const VALID_MODES = new Set<string>(['screener', 'proforma']);

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
 * On oversize, drains remaining data via req.resume() (preserves keep-alive)
 * then rejects — does NOT destroy the socket.
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let oversized = false;

    req.on('data', (chunk: Buffer) => {
      if (oversized) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        oversized = true;
        req.resume(); // drain without destroying the socket
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!oversized) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
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

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('inputs' in parsed) ||
    typeof (parsed as Record<string, unknown>)['inputs'] !== 'object' ||
    (parsed as Record<string, unknown>)['inputs'] === null
  ) {
    json(res, 400, {
      error:
        'Request body must be { inputs: DealInputs, opts?: { mode: "screener" | "proforma" } }',
    });
    return;
  }

  const { inputs, opts } = parsed as { inputs: DealInputs; opts?: EvalOptions };

  if (opts?.mode !== undefined && !VALID_MODES.has(opts.mode)) {
    json(res, 400, {
      error: `opts.mode must be "screener" or "proforma", got "${opts.mode}"`,
    });
    return;
  }

  // Validate required top-level scalar fields — engine normalises missing values
  // to 0, which produces technically valid but misleading results for a public API.
  const REQUIRED_SCALARS = [
    'purchasePrice', 'percentDown', 'interestRate', 'loanTermYears',
    'closingCosts', 'grossRent', 'vacancyPct',
  ] as const;
  const rawInputs = inputs as unknown as Record<string, unknown>;
  const missingScalars = REQUIRED_SCALARS.filter((k) => !(k in rawInputs));
  if (missingScalars.length > 0) {
    json(res, 400, { error: `Missing required input fields: ${missingScalars.join(', ')}` });
    return;
  }

  // Validate required nested shape — engine throws TypeError for missing expenses.
  const expField = (inputs as unknown as Record<string, unknown>)['expenses'];
  if (
    typeof expField !== 'object' ||
    expField === null ||
    typeof (expField as Record<string, unknown>)['taxes'] !== 'object' ||
    (expField as Record<string, unknown>)['taxes'] === null ||
    typeof (expField as Record<string, unknown>)['insurance'] !== 'object' ||
    (expField as Record<string, unknown>)['insurance'] === null
  ) {
    json(res, 400, {
      error:
        'inputs.expenses must include taxes and insurance, each { amount: number, period: "monthly" | "annual" }',
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

export function createApp() {
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

const __filename = fileURLToPath(import.meta.url);
if (resolve(process.argv[1] ?? '') === __filename) {
  const port = validatePort(process.env['PORT']);
  const host = process.env['HOST'] ?? '0.0.0.0';
  const server = createApp();
  server.listen(port, host, () => {
    console.log(`@rpe/api ${VERSION} listening on http://${host}:${port}`);
    console.log('  GET  /health');
    console.log('  POST /evaluate');
  });
  server.on('error', (err) => {
    console.error('Server error:', err);
    process.exit(1);
  });
}
