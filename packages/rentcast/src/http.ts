/**
 * Shared RentCast HTTP plumbing (internal — not exported from the package).
 */

import { RentCastError, type RentCastErrorCode } from './types';

export const BASE = 'https://api.rentcast.io/v1';

export function statusToCode(status: number): RentCastErrorCode {
  if (status === 401 || status === 403) return 'bad_key';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limit';
  return 'unknown';
}

export async function rcGet(path: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new RentCastError(statusToCode(res.status), `RentCast ${res.status}: ${path.split('?')[0]}`);
  }
  return res.json() as Promise<unknown>;
}
