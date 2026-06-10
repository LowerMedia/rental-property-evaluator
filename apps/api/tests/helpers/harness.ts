/**
 * E10 — reusable API test harness (RPE-85)
 *
 * Boots apps/api in-process and exercises it over real HTTP. Every new
 * /v1 endpoint adds its cases through this harness (see
 * docs/api-testing.md) instead of hand-rolling server boots.
 *
 * Usage:
 *   const api = await startTestApi();          // ephemeral key minted
 *   try {
 *     const res = await api.post('/v1/evaluate', { inputs });
 *   } finally {
 *     await api.stop();
 *   }
 */

import type { Server } from 'node:http';
import { createApp, type AppConfig } from '../../src/index';
import { mintKey, type ApiKeyRecord } from '../../src/services/apiKeys';

export interface TestApi {
  base: string;
  /** Ephemeral key secret minted for this instance. */
  key: string;
  keyRecord: ApiKeyRecord;
  /** Authed GET. */
  get: (path: string, headers?: Record<string, string>) => Promise<Response>;
  /** Authed POST with a JSON body. */
  post: (path: string, body: unknown, headers?: Record<string, string>) => Promise<Response>;
  /** Unauthenticated request (any method). */
  raw: (path: string, init?: RequestInit) => Promise<Response>;
  stop: () => Promise<void>;
}

export interface TestApiOptions {
  /** Merged over the harness defaults (high limits, caching off). */
  config?: AppConfig;
  /** Skip minting/configuring a key (zero-config surface testing). */
  withoutAuth?: boolean;
}

/** Boot the API on an ephemeral port with an ephemeral key. */
export function startTestApi(options: TestApiOptions = {}): Promise<TestApi> {
  const minted = mintKey('test-harness');
  const config: AppConfig = {
    property: { cacheTtlMs: 0, rpm: 1000, dailyCap: 100000 },
    v1RateLimit: { rpm: 1000, dailyCap: 100000 },
    ...(options.withoutAuth === true ? {} : { auth: { keys: [minted.record] } }),
    ...options.config,
  };

  return new Promise((resolve, reject) => {
    const server: Server = createApp(config);
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const addr = server.address() as { port: number };
      const base = `http://127.0.0.1:${addr.port}`;
      const authHeaders = options.withoutAuth === true ? {} : { Authorization: `Bearer ${minted.secret}` };

      resolve({
        base,
        key: minted.secret,
        keyRecord: minted.record,
        get: (path, headers = {}) => fetch(`${base}${path}`, { headers: { ...authHeaders, ...headers } }),
        post: (path, body, headers = {}) =>
          fetch(`${base}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders, ...headers },
            body: JSON.stringify(body),
          }),
        raw: (path, init) => fetch(`${base}${path}`, init),
        stop: () =>
          new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });
}

// ─── Format assertions ────────────────────────────────────────────────────────

export async function expectCsvAttachment(res: Response): Promise<string> {
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('text/csv')) throw new Error(`expected text/csv, got ${type}`);
  const disposition = res.headers.get('content-disposition') ?? '';
  if (!/^attachment; filename="rpe-\d{4}-\d{2}-\d{2}\.csv"$/.test(disposition)) {
    throw new Error(`unexpected disposition: ${disposition}`);
  }
  return res.text();
}

export async function expectPdfAttachment(res: Response): Promise<Uint8Array> {
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (type !== 'application/pdf') throw new Error(`expected application/pdf, got ${type}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const magic = new TextDecoder().decode(bytes.slice(0, 5));
  if (magic !== '%PDF-') throw new Error(`not a PDF (magic: ${magic})`);
  return bytes;
}
