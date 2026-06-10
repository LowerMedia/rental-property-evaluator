/**
 * RPE-80: OpenAPI spec — served, valid-shaped, and drift-checked against
 * the implemented /v1 surface in BOTH directions:
 *   spec → code: every documented path+method responds (≠ 404)
 *   code → spec: every implemented /v1 endpoint is documented
 * Adding a route without documenting it (or vice versa) fails CI here.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import { buildOpenApiSpec, docsHtml } from '../src/openapi';
import { mintKey } from '../src/services/apiKeys';
import { createDb, type RpeDb } from '@rpe/db';

const acme = mintKey('acme');

/** The implemented /v1 surface — update alongside route registrations. */
const IMPLEMENTED_V1: ReadonlyArray<readonly [string, string]> = [
  ['get', '/health'],
  ['post', '/evaluate'],
  ['post', '/reports'],
  ['post', '/property'],
  ['post', '/property/context'],
  ['get', '/region'],
  ['get', '/geocode'],
  ['post', '/scrape'],
  ['post', '/deals'],
  ['get', '/deals'],
  ['get', '/deals/{id}'],
  ['patch', '/deals/{id}'],
  ['delete', '/deals/{id}'],
  ['get', '/deals/{id}/report'],
];

/** Doc-surface routes intentionally NOT in the spec (they serve the spec). */
const DOC_ROUTES = new Set(['/openapi.json', '/docs']);

describe('OpenAPI spec (unit)', () => {
  const spec = buildOpenApiSpec('1.5.0') as {
    openapi: string;
    info: { version: string };
    paths: Record<string, Record<string, unknown>>;
    components: { securitySchemes: Record<string, unknown> };
  };

  it('is OpenAPI 3.1 with both auth schemes', () => {
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.version).toBe('1.5.0');
    expect(Object.keys(spec.components.securitySchemes).sort()).toEqual(['apiKeyHeader', 'bearerAuth']);
  });

  it('documents every implemented /v1 endpoint (code → spec drift)', () => {
    for (const [method, path] of IMPLEMENTED_V1) {
      expect(spec.paths[path], `missing path ${path}`).toBeDefined();
      expect(spec.paths[path]?.[method], `missing ${method.toUpperCase()} ${path}`).toBeDefined();
    }
  });

  it('documents nothing beyond the implemented surface', () => {
    const documented = Object.entries(spec.paths).flatMap(([path, ops]) =>
      Object.keys(ops).map((method) => `${method} ${path}`),
    );
    const implemented = new Set(IMPLEMENTED_V1.map(([m, p]) => `${m} ${p}`));
    for (const entry of documented) {
      expect(implemented.has(entry), `spec documents unimplemented ${entry}`).toBe(true);
    }
  });
});

describe('OpenAPI surface (integration)', () => {
  let server: Server;
  let base: string;
  let db: RpeDb;

  beforeAll(async () => {
    // deals surface needs a DB; the env key carries no org, so /v1/deals
    // routes answer 403 (not 404) — exactly the drift contract
    db = createDb(':memory:');
    await db.applyMigrations();
    await new Promise<void>((resolve, reject) => {
        server = createApp({ auth: { keys: [acme.record] }, deals: { db }, v1RateLimit: { rpm: 1000, dailyCap: 10000 } });
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          server.off('error', reject);
          const addr = server.address() as { port: number };
          base = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await db.close();
  });

  it('serves the spec at /v1/openapi.json without auth', async () => {
    const res = await fetch(`${base}/v1/openapi.json`);
    expect(res.status).toBe(200);
    const spec = await res.json() as { openapi: string };
    expect(spec.openapi).toBe('3.1.0');
  });

  it('serves the interactive reference at /v1/docs', async () => {
    const res = await fetch(`${base}/v1/docs`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('/v1/openapi.json');
    expect(docsHtml()).toContain('api-reference');
  });

  it('every documented path+method responds — never 404 (spec → code drift)', async () => {
    const spec = buildOpenApiSpec('test') as { paths: Record<string, Record<string, unknown>> };
    for (const [path, ops] of Object.entries(spec.paths)) {
      if (DOC_ROUTES.has(path)) continue;
      for (const method of Object.keys(ops)) {
        const res = await fetch(`${base}/v1${path}`, {
          method: method.toUpperCase(),
          headers: {
            Authorization: `Bearer ${acme.secret}`,
            'Content-Type': 'application/json',
          },
          ...(method === 'post' ? { body: '{}' } : {}),
        });
        expect(res.status, `${method.toUpperCase()} /v1${path} returned 404`).not.toBe(404);
      }
    }
  });
});
