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
 *   405 { error: string }  — wrong HTTP method
 *   404 { error: string }  — unknown path
 *   413 { error: string }  — payload exceeds 64 KB
 *   500 { error: string }  — unexpected evaluation error
 *
 * Configuration:
 *   PORT env var — integer 1–65535, default 3001
 *   HOST env var — default '0.0.0.0'
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
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

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy(new Error('Payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
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
  if (req.method !== 'GET' && req.method !== 'HEAD') {
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

  try {
    const results = evaluate(inputs, opts);
    json(res, 200, { results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    json(res, 500, { error: `Evaluation failed: ${message}` });
  }
}

// ── App factory ────────────────────────────────────────────────────────────────

export function createApp() {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
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

    if (url === '/evaluate' || url === '/evaluate/') {
      await handleEvaluate(req, res);
      return;
    }

    json(res, 404, { error: `Unknown endpoint: ${url}` });
  });
}

// ── Entry point (skipped when imported by tests/other modules) ────────────────

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
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
