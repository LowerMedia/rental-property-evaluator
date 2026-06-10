/**
 * E10 — per-consumer API keys (RPE-75)
 *
 * Stateless-phase key store: a hashed allowlist loaded from config, the
 * RPE_API_KEYS env var (JSON array), or a JSON file (RPE_API_KEYS_FILE).
 * Secrets are sha256-hashed at issuance and never stored or logged in
 * plaintext — the full secret is shown exactly once by the mint CLI
 * (scripts/manage-keys.mjs).
 *
 * Format: `rpe_live_<48 hex chars>` — the prefix is identification only,
 * the entropy lives in the random tail. Verification is constant-time
 * over the hash. Revocation: revokedAt set in the store source (runtime
 * revoke() for tests/CLI; deployed env/file stores re-read at restart —
 * Phase 2's DB store makes revocation instant fleet-wide).
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface ApiKeyRecord {
  /** Short public identifier — safe for logs ("key_3f2a"). */
  id: string;
  /** Human label for the consumer ("acme-staging"). */
  label: string;
  /** sha256 hex of the full secret. */
  hash: string;
  createdAt: string;
  revokedAt: string | null;
  /** Updated in-memory on successful verify; env/file stores are not
   * written back (Phase 2's DB store persists this). */
  lastUsedAt?: string | null;
}

export const KEY_PREFIX = 'rpe_live_';

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** Mint a new key: returns the record to store and the one-time secret. */
export function mintKey(label: string, now: () => number = Date.now): {
  record: ApiKeyRecord;
  secret: string;
} {
  const secret = `${KEY_PREFIX}${randomBytes(24).toString('hex')}`;
  const record: ApiKeyRecord = {
    id: `key_${randomBytes(4).toString('hex')}`,
    label,
    hash: hashSecret(secret),
    createdAt: new Date(now()).toISOString(),
    revokedAt: null,
    lastUsedAt: null,
  };
  return { record, secret };
}

function isApiKeyRecord(value: unknown): value is ApiKeyRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    typeof v['label'] === 'string' &&
    typeof v['hash'] === 'string' &&
    /^[0-9a-f]{64}$/.test(v['hash'] as string) &&
    typeof v['createdAt'] === 'string' &&
    (v['revokedAt'] === null || typeof v['revokedAt'] === 'string')
  );
}

/** Parse a JSON array of records, dropping malformed entries loudly. */
export function parseKeyRecords(json: string, sourceLabel: string): ApiKeyRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    console.error(`API key store ${sourceLabel}: invalid JSON — ignoring`);
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.error(`API key store ${sourceLabel}: expected a JSON array — ignoring`);
    return [];
  }
  const records = parsed.filter(isApiKeyRecord);
  if (records.length !== parsed.length) {
    console.error(
      `API key store ${sourceLabel}: dropped ${parsed.length - records.length} malformed record(s)`,
    );
  }
  return records;
}

export class ApiKeyStore {
  private readonly byHash = new Map<string, ApiKeyRecord>();

  constructor(records: readonly ApiKeyRecord[] = []) {
    for (const record of records) this.byHash.set(record.hash, record);
  }

  /** Load from explicit records → env JSON → file path, first hit wins. */
  static fromEnv(records?: readonly ApiKeyRecord[]): ApiKeyStore {
    if (records !== undefined) return new ApiKeyStore(records);
    const envJson = process.env['RPE_API_KEYS'];
    if (envJson !== undefined && envJson.trim() !== '') {
      return new ApiKeyStore(parseKeyRecords(envJson, 'RPE_API_KEYS'));
    }
    const file = process.env['RPE_API_KEYS_FILE'];
    if (file !== undefined && file.trim() !== '') {
      try {
        return new ApiKeyStore(parseKeyRecords(readFileSync(file, 'utf8'), file));
      } catch (err) {
        console.error(`API key store ${file}: unreadable —`, err instanceof Error ? err.message : String(err));
      }
    }
    return new ApiKeyStore();
  }

  get size(): number {
    return this.byHash.size;
  }

  /**
   * Verify a presented secret. Constant-time hash comparison; returns
   * the active record or null (missing, malformed, unknown, revoked).
   */
  verify(secret: string, now: () => number = Date.now): ApiKeyRecord | null {
    if (!secret.startsWith(KEY_PREFIX)) return null;
    const presented = Buffer.from(hashSecret(secret), 'hex');
    for (const [hash, record] of this.byHash) {
      const stored = Buffer.from(hash, 'hex');
      if (stored.length === presented.length && timingSafeEqual(stored, presented)) {
        if (record.revokedAt !== null) return null;
        record.lastUsedAt = new Date(now()).toISOString();
        return record;
      }
    }
    return null;
  }

  /** Revoke by key id — effective on the next request. */
  revoke(id: string, now: () => number = Date.now): boolean {
    for (const record of this.byHash.values()) {
      if (record.id === id && record.revokedAt === null) {
        record.revokedAt = new Date(now()).toISOString();
        return true;
      }
    }
    return false;
  }
}

/** Extract the presented key from Authorization: Bearer or X-API-Key. */
export function extractApiKey(headers: Record<string, string | string[] | undefined>): string | null {
  const auth = headers['authorization'];
  const authValue = Array.isArray(auth) ? auth[0] : auth;
  if (typeof authValue === 'string') {
    const m = authValue.match(/^Bearer\s+(\S+)$/i);
    if (m?.[1] !== undefined) return m[1];
  }
  const xKey = headers['x-api-key'];
  const xValue = Array.isArray(xKey) ? xKey[0] : xKey;
  if (typeof xValue === 'string' && xValue.trim() !== '') return xValue.trim();
  return null;
}
