/**
 * POST /v1/reports — public report endpoint (RPE-79)
 *
 * Body: { inputs: DealInputs, opts?: { mode }, format?: 'json'|'csv'|'pdf' }
 *
 * Format negotiation, in documented precedence order:
 *   1. ?format= query parameter
 *   2. body.format
 *   3. Accept header (application/json | text/csv | application/pdf)
 *   4. default: json
 * Anything else → 406 not_acceptable (standard envelope).
 *
 * json → canonical DealReport; csv/pdf → attachment downloads with
 * rpe-YYYY-MM-DD.{csv,pdf} filenames (date from meta.generatedAt).
 *
 * /v1-native only — auth + rate limiting + the standard envelope are
 * applied by the dispatcher before this handler runs.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DealInputs, EvalOptions } from '@rpe/engine';
import { buildReport, reportToCsv, reportToPdf } from '@rpe/report';

type JsonFn = (res: ServerResponse, status: number, body: unknown) => void;
type ReadBodyFn = (req: IncomingMessage) => Promise<string>;
type SendRawFn = (
  res: ServerResponse,
  status: number,
  contentType: string,
  body: Uint8Array | string,
  disposition?: string,
) => void;

/** Result of validating an evaluate/report request body. */
export type ValidatedEvalBody =
  | { ok: true; inputs: DealInputs; opts: EvalOptions | undefined; format: string | null }
  | { ok: false; message: string };

export interface ReportsDeps {
  /** Validator shared with handleEvaluate — single source of truth. */
  validate: (parsed: unknown) => ValidatedEvalBody;
  engineVersion: string;
  sendRaw: SendRawFn;
}

export type ReportFormat = 'json' | 'csv' | 'pdf';

const ACCEPT_TO_FORMAT: ReadonlyArray<readonly [string, ReportFormat]> = [
  ['application/json', 'json'],
  ['text/csv', 'csv'],
  ['application/pdf', 'pdf'],
];

/** Resolve the requested format. Null = unsupported value was requested. */
export function resolveFormat(
  query: string | null,
  bodyFormat: string | null,
  acceptHeader: string | undefined,
): ReportFormat | null {
  const explicit = query ?? bodyFormat;
  if (explicit !== null) {
    return explicit === 'json' || explicit === 'csv' || explicit === 'pdf' ? explicit : null;
  }
  if (acceptHeader !== undefined && acceptHeader.trim() !== '' && acceptHeader !== '*/*') {
    const match = ACCEPT_TO_FORMAT.find(([mime]) => acceptHeader.includes(mime));
    return match?.[1] ?? null;
  }
  return 'json';
}

export async function handleReports(
  req: IncomingMessage,
  res: ServerResponse,
  json: JsonFn,
  readBody: ReadBodyFn,
  deps: ReportsDeps,
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

  const validated = deps.validate(parsed);
  if (!validated.ok) {
    json(res, 400, { error: validated.message, code: 'bad_request' });
    return;
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  const format = resolveFormat(
    url.searchParams.get('format'),
    validated.format,
    Array.isArray(req.headers.accept) ? req.headers.accept[0] : req.headers.accept,
  );
  if (format === null) {
    json(res, 406, {
      error: 'Unsupported format — use json, csv, or pdf (?format= takes precedence over Accept).',
      code: 'not_acceptable',
    });
    return;
  }

  const report = buildReport(validated.inputs, {
    mode: validated.opts?.mode,
    engineVersion: deps.engineVersion,
  });
  const datestamp = report.meta.generatedAt.slice(0, 10);

  if (format === 'json') {
    json(res, 200, report);
    return;
  }
  if (format === 'csv') {
    deps.sendRaw(res, 200, 'text/csv; charset=utf-8', reportToCsv(report), `attachment; filename="rpe-${datestamp}.csv"`);
    return;
  }
  const pdf = await reportToPdf(report);
  deps.sendRaw(res, 200, 'application/pdf', pdf, `attachment; filename="rpe-${datestamp}.pdf"`);
}
