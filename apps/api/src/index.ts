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
 *     "inputs": DealInputs,          // required
 *     "opts":   { "mode": "screener" | "proforma" }  // optional, default screener
 *   }
 *
 * Error responses:
 *   400 { error: string }  — malformed JSON or missing inputs
 *   405 { error: string }  — wrong HTTP method
 *   404 { error: string }  — unknown path
 *   500 { error: string }  — unexpected evaluation error
 *
 * Configuration:
 *   PORT env var (default 3001)
 *   HOST env var (default '0.0.0.0')
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { evaluate } from '@rpe/engine';
import type { DealInputs, EvalOptions } from '@rpe/engine';

const PORT = Number(process.env['PORT'] ?? 3001);
const HOST = process.env['HOST'] ?? '0.0.0.0';
const VERSION = '0.1.0';

// ── Helpers ────────────────────────────────────────────────────────────────────

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ── Route handlers ─────────────────────────────────────────────────────────────

function handleHealth(res: ServerResponse): void {
  json(res, 200, { status: 'ok', version: VERSION });
}

async function handleEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    json(res, 405, { error: 'POST required' });
    return;
  }

  let body: string;
  try {
    body = await readBody(req);
  } catch {
    json(res, 400, { error: 'Failed to read request body' });
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
    json(res, 400, { error: 'Request body must be { inputs: DealInputs, opts?: EvalOptions }' });
    return;
  }

  const { inputs, opts } = parsed as { inputs: DealInputs; opts?: EvalOptions };

  try {
    const results = evaluate(inputs, opts);
    json(res, 200, { results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    json(res, 500, { error: `Evaluation failed: ${message}` });
  }
}

// ── Server ─────────────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = req.url?.split('?')[0] ?? '/';

  if (url === '/health' || url === '/health/') {
    handleHealth(res);
    return;
  }

  if (url === '/evaluate' || url === '/evaluate/') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
      res.end();
      return;
    }
    await handleEvaluate(req, res);
    return;
  }

  json(res, 404, { error: `Unknown endpoint: ${url}` });
});

server.listen(PORT, HOST, () => {
  console.log(`@rpe/api ${VERSION} listening on http://${HOST}:${PORT}`);
  console.log('  GET  /health');
  console.log('  POST /evaluate');
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});
