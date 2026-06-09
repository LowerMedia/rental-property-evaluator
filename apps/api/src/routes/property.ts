/**
 * POST /property — RentCast proxy route (RPE-43b)
 *
 * Receives { address: string, apiKey: string }, calls fetchPropertyData,
 * and returns { data: PropertyData }.
 *
 * The apiKey is forwarded to RentCast and never written to any log output.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { fetchPropertyData, RentCastError, type RentCastErrorCode } from '@rpe/rentcast';

// Imported from the parent module — passed in to avoid circular imports.
type JsonFn = (res: ServerResponse, status: number, body: unknown) => void;
type ReadBodyFn = (req: IncomingMessage) => Promise<string>;

export async function handleProperty(
  req: IncomingMessage,
  res: ServerResponse,
  json: JsonFn,
  readBody: ReadBodyFn,
): Promise<void> {
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

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    json(res, 400, { error: 'Request body must be { address: string, apiKey: string }' });
    return;
  }
  const obj = parsed as Record<string, unknown>;
  if (!Object.hasOwn(obj, 'address') || typeof obj['address'] !== 'string' || obj['address'].trim() === '') {
    json(res, 400, { error: 'address is required and must be a non-empty string' });
    return;
  }
  if (!Object.hasOwn(obj, 'apiKey') || typeof obj['apiKey'] !== 'string' || obj['apiKey'].trim() === '') {
    json(res, 400, { error: 'apiKey is required and must be a non-empty string' });
    return;
  }

  const address = obj['address'].trim();
  const apiKey  = obj['apiKey'].trim();

  try {
    const data = await fetchPropertyData(address, apiKey);
    json(res, 200, { data });
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
      // Use sanitised messages — never forward err.message which may contain
      // the encoded address query string from the upstream RentCast request.
      const clientMessages: Record<RentCastErrorCode, string> = {
        bad_key:    'Invalid or expired API key.',
        not_found:  'Property not found for this address.',
        rate_limit: 'Rate limit reached. Check your RentCast plan.',
        unknown:    'RentCast lookup failed.',
      };
      json(res, statusMap[err.code], { error: clientMessages[err.code] });
      return;
    }
    // Log address only — never apiKey
    console.error('Property lookup error for address:', address, err instanceof Error ? err.stack : String(err));
    json(res, 500, { error: 'Internal server error' });
  }
}
