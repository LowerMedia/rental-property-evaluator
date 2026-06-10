/**
 * /v1/deals — stored deals CRUD + report retrieval (RPE-84)
 *
 *   POST   /v1/deals                  create { name, inputs } → 201 { id, … }
 *   GET    /v1/deals?limit&offset     list (org-scoped, newest first)
 *   GET    /v1/deals/{id}             fetch one
 *   PATCH  /v1/deals/{id}             update name/inputs
 *   DELETE /v1/deals/{id}             delete → 204
 *   GET    /v1/deals/{id}/report?format=json|csv|pdf
 *
 * Tenancy: the org comes from the verified API key (DB-backed keys carry
 * organizationId — RPE-83); every storage call is org-filtered, so a
 * foreign id is a uniform 404 (never 403 — existence must not leak).
 *
 * Report caching: keyed by deal id + format + engine version + the
 * deal's updatedAt — an update changes the key, so invalidation is
 * structural rather than imperative. pdf-lib generation is fast enough
 * (<100 ms) that the async 202 pattern is deliberately NOT implemented;
 * revisit if report generation ever grows a slow path.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DealInputs } from '@rpe/engine';
import { buildReport, reportToCsv, reportToPdf, type DealReport } from '@rpe/report';
import {
  createDeal,
  deleteDeal,
  getDeal,
  listDeals,
  updateDeal,
  type DealRecord,
  type RpeDb,
} from '@rpe/db';
import { v1Error } from '../router.js';
import { resolveFormat, type ValidatedEvalBody } from './reports.js';
import { TtlCache } from '../services/guardrails.js';

type JsonFn = (res: ServerResponse, status: number, body: unknown) => void;
type ReadBodyFn = (req: IncomingMessage) => Promise<string>;
type SendRawFn = (
  res: ServerResponse,
  status: number,
  contentType: string,
  body: Uint8Array | string,
  disposition?: string,
) => void;

export interface DealsDeps {
  db: RpeDb;
  organizationId: string;
  json: JsonFn;
  readBody: ReadBodyFn;
  sendRaw: SendRawFn;
  requestId: string;
  engineVersion: string;
  /** Shared with /v1/evaluate — single source of inputs-shape truth. */
  validate: (parsed: unknown) => ValidatedEvalBody;
  reportCache: TtlCache<{ contentType: string; body: Uint8Array | string; disposition?: string }>;
}

const MAX_NAME_LENGTH = 200;

function dealJson(deal: DealRecord) {
  return {
    id: deal.id,
    name: deal.name,
    inputs: deal.inputs,
    createdAt: deal.createdAt.toISOString(),
    updatedAt: deal.updatedAt.toISOString(),
  };
}

function validName(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.length <= MAX_NAME_LENGTH;
}

/** Validate {name?, inputs?} via the shared evaluate validator. */
function parseDealBody(
  deps: DealsDeps,
  raw: string,
  options: { requireAll: boolean },
): { ok: true; name?: string; inputs?: DealInputs } | { ok: false; message: string } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, message: 'Request body must be valid JSON.' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, message: 'Request body must be a JSON object.' };
  }

  const hasName = parsed['name'] !== undefined;
  const hasInputs = parsed['inputs'] !== undefined;
  if (options.requireAll && (!hasName || !hasInputs)) {
    return { ok: false, message: 'Both "name" and "inputs" are required.' };
  }
  if (!options.requireAll && !hasName && !hasInputs) {
    return { ok: false, message: 'Provide "name" and/or "inputs" to update.' };
  }

  let name: string | undefined;
  if (hasName) {
    if (!validName(parsed['name'])) {
      return { ok: false, message: `"name" must be a non-empty string of at most ${MAX_NAME_LENGTH} characters.` };
    }
    name = (parsed['name'] as string).trim();
  }

  let inputs: DealInputs | undefined;
  if (hasInputs) {
    const validated = deps.validate({ inputs: parsed['inputs'] });
    if (!validated.ok) return { ok: false, message: validated.message };
    inputs = validated.inputs;
  }

  return { ok: true, ...(name !== undefined ? { name } : {}), ...(inputs !== undefined ? { inputs } : {}) };
}

async function handleReport(
  req: IncomingMessage,
  res: ServerResponse,
  deps: DealsDeps,
  deal: DealRecord,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://local');
  const format = resolveFormat(url.searchParams.get('format'), null, req.headers['accept']);
  if (format === null) {
    deps.json(res, 406, v1Error(
      'not_acceptable',
      'Unsupported report format — use json, csv, or pdf.',
      deps.requestId,
    ));
    return;
  }

  // updatedAt in the key makes deal edits a structural cache miss
  const cacheKey = `${deal.id}:${format}:${deps.engineVersion}:${deal.updatedAt.getTime()}`;
  const cached = deps.reportCache.get(cacheKey);
  if (cached !== undefined) {
    res.setHeader('X-Report-Cache', 'hit');
    deps.sendRaw(res, 200, cached.contentType, cached.body, cached.disposition);
    return;
  }

  // Stored inputs re-validate through the shared validator — defense
  // against rows written by older/looser code paths
  const validated = deps.validate({ inputs: deal.inputs });
  if (!validated.ok) {
    deps.json(res, 422, v1Error(
      'unprocessable',
      `Stored inputs no longer validate: ${validated.message}`,
      deps.requestId,
    ));
    return;
  }

  const report: DealReport = buildReport(validated.inputs, {
    ...(validated.opts?.mode !== undefined ? { mode: validated.opts.mode } : {}),
    engineVersion: deps.engineVersion,
  });
  const datePart = report.meta.generatedAt.slice(0, 10);
  let payload: { contentType: string; body: Uint8Array | string; disposition?: string };
  if (format === 'csv') {
    payload = {
      contentType: 'text/csv; charset=utf-8',
      body: reportToCsv(report),
      disposition: `attachment; filename="rpe-${datePart}.csv"`,
    };
  } else if (format === 'pdf') {
    payload = {
      contentType: 'application/pdf',
      body: await reportToPdf(report),
      disposition: `attachment; filename="rpe-${datePart}.pdf"`,
    };
  } else {
    payload = { contentType: 'application/json; charset=utf-8', body: JSON.stringify(report) };
  }

  deps.reportCache.set(cacheKey, payload);
  res.setHeader('X-Report-Cache', 'miss');
  deps.sendRaw(res, 200, payload.contentType, payload.body, payload.disposition);
}

/** Dispatcher entry — subpath is the path AFTER '/deals' ('' | '/{id}' | '/{id}/report'). */
export async function handleDeals(
  req: IncomingMessage,
  res: ServerResponse,
  subpath: string,
  deps: DealsDeps,
): Promise<void> {
  const segments = subpath.split('/').filter((s) => s !== '');

  // /v1/deals
  if (segments.length === 0) {
    if (req.method === 'POST') {
      const body = parseDealBody(deps, await deps.readBody(req), { requireAll: true });
      if (!body.ok) {
        deps.json(res, 400, v1Error('bad_request', body.message, deps.requestId));
        return;
      }
      const deal = await createDeal(deps.db, deps.organizationId, {
        name: body.name!,
        inputs: body.inputs!,
      });
      deps.json(res, 201, dealJson(deal));
      return;
    }
    if (req.method === 'GET') {
      const url = new URL(req.url ?? '/', 'http://local');
      const limit = Number(url.searchParams.get('limit') ?? '50');
      const offset = Number(url.searchParams.get('offset') ?? '0');
      if (!Number.isFinite(limit) || !Number.isFinite(offset)) {
        deps.json(res, 400, v1Error('bad_request', 'limit and offset must be numbers.', deps.requestId));
        return;
      }
      const page = await listDeals(deps.db, deps.organizationId, { limit, offset });
      deps.json(res, 200, { deals: page.deals.map(dealJson), total: page.total });
      return;
    }
    deps.json(res, 405, v1Error('method_not_allowed', 'Use POST or GET on /v1/deals.', deps.requestId));
    return;
  }

  const dealId = segments[0]!;
  if (!/^[\w-]{1,64}$/.test(dealId)) {
    deps.json(res, 404, v1Error('not_found', 'Deal not found.', deps.requestId));
    return;
  }

  // /v1/deals/{id}/report
  if (segments.length === 2 && segments[1] === 'report') {
    if (req.method !== 'GET') {
      deps.json(res, 405, v1Error('method_not_allowed', 'Use GET on /v1/deals/{id}/report.', deps.requestId));
      return;
    }
    const deal = await getDeal(deps.db, deps.organizationId, dealId);
    if (deal === null) {
      deps.json(res, 404, v1Error('not_found', 'Deal not found.', deps.requestId));
      return;
    }
    await handleReport(req, res, deps, deal);
    return;
  }

  if (segments.length > 1) {
    deps.json(res, 404, v1Error('not_found', `Unknown endpoint: /v1/deals/${segments.join('/')}`, deps.requestId));
    return;
  }

  // /v1/deals/{id}
  if (req.method === 'GET') {
    const deal = await getDeal(deps.db, deps.organizationId, dealId);
    if (deal === null) {
      deps.json(res, 404, v1Error('not_found', 'Deal not found.', deps.requestId));
      return;
    }
    deps.json(res, 200, dealJson(deal));
    return;
  }
  if (req.method === 'PATCH') {
    const body = parseDealBody(deps, await deps.readBody(req), { requireAll: false });
    if (!body.ok) {
      deps.json(res, 400, v1Error('bad_request', body.message, deps.requestId));
      return;
    }
    const updated = await updateDeal(deps.db, deps.organizationId, dealId, body);
    if (updated === null) {
      deps.json(res, 404, v1Error('not_found', 'Deal not found.', deps.requestId));
      return;
    }
    deps.json(res, 200, dealJson(updated));
    return;
  }
  if (req.method === 'DELETE') {
    const deleted = await deleteDeal(deps.db, deps.organizationId, dealId);
    if (!deleted) {
      deps.json(res, 404, v1Error('not_found', 'Deal not found.', deps.requestId));
      return;
    }
    res.statusCode = 204;
    res.end();
    return;
  }
  deps.json(res, 405, v1Error('method_not_allowed', 'Use GET, PATCH, or DELETE on /v1/deals/{id}.', deps.requestId));
}
