/**
 * RPE-79: POST /v1/reports — format negotiation, downloads, validation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import { mintKey } from '../src/services/apiKeys';
import { resolveFormat } from '../src/routes/reports';

const acme = mintKey('acme');

const INPUTS = {
  purchasePrice: 300000, percentDown: 20, interestRate: 7,
  loanTermYears: 30, closingCosts: 6000, rollClosingCostsIntoLoan: false,
  grossRent: 2200, vacancyPct: 5,
  expenses: {
    taxes: { amount: 4800, period: 'annual' },
    insurance: { amount: 1800, period: 'annual' },
  },
};

function post(base: string, path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${acme.secret}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('resolveFormat precedence (unit)', () => {
  it('query > body > Accept > json default', () => {
    expect(resolveFormat('csv', 'pdf', 'application/json')).toBe('csv');
    expect(resolveFormat(null, 'pdf', 'application/json')).toBe('pdf');
    expect(resolveFormat(null, null, 'text/csv')).toBe('csv');
    expect(resolveFormat(null, null, undefined)).toBe('json');
    expect(resolveFormat(null, null, '*/*')).toBe('json');
  });

  it('rejects unsupported values instead of defaulting', () => {
    expect(resolveFormat('xml', null, undefined)).toBeNull();
    expect(resolveFormat(null, 'docx', undefined)).toBeNull();
    expect(resolveFormat(null, null, 'application/xml')).toBeNull();
  });
});

describe('POST /v1/reports (integration)', () => {
  let server: Server;
  let base: string;

  beforeAll(
    () =>
      new Promise<void>((resolve, reject) => {
        server = createApp({ auth: { keys: [acme.record] }, v1RateLimit: { rpm: 1000, dailyCap: 10000 } });
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          server.off('error', reject);
          const addr = server.address() as { port: number };
          base = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      }),
  );

  afterAll(
    () => new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  );

  it('returns the canonical JSON report by default', async () => {
    const res = await post(base, '/v1/reports', { inputs: INPUTS });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const report = await res.json() as { meta: Record<string, unknown>; score: Record<string, number>; metrics: unknown[] };
    expect(report.meta['reportVersion']).toBe(1);
    expect(report.meta['mode']).toBe('screener');
    expect(typeof report.meta['engineVersion']).toBe('string');
    expect(report.metrics.length).toBeGreaterThan(20);
    expect(report.score['total']).toBeGreaterThan(0);
  });

  it('returns a CSV attachment for ?format=csv', async () => {
    const res = await post(base, '/v1/reports?format=csv', { inputs: INPUTS });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="rpe-\d{4}-\d{2}-\d{2}\.csv"$/);
    const csv = await res.text();
    expect(csv.startsWith('Group,Metric,Value')).toBe(true);
    expect(csv).toContain('Returns,Cap Rate');
  });

  it('returns a PDF attachment via the Accept header', async () => {
    const res = await post(base, '/v1/reports', { inputs: INPUTS }, { Accept: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toMatch(/\.pdf"$/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(2_000);
  });

  it('query format beats both body format and Accept', async () => {
    const res = await post(
      base,
      '/v1/reports?format=json',
      { inputs: INPUTS, format: 'csv' },
      { Accept: 'application/pdf' },
    );
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('embeds pro-forma in the report when mode is proforma', async () => {
    const res = await post(base, '/v1/reports', {
      inputs: { ...INPUTS, holdYears: 5, appreciationPct: 4 },
      opts: { mode: 'proforma' },
    });
    const report = await res.json() as { proForma: { projection: unknown[] } | null };
    expect(report.proForma?.projection).toHaveLength(5);
  });

  it('406 with the standard envelope for unsupported formats', async () => {
    const res = await post(base, '/v1/reports?format=xml', { inputs: INPUTS });
    expect(res.status).toBe(406);
    const body = await res.json() as Record<string, unknown>;
    expect(body['code']).toBe('not_acceptable');
    expect(typeof body['requestId']).toBe('string');
  });

  it('400 envelope on invalid inputs (shared validator)', async () => {
    const res = await post(base, '/v1/reports', { inputs: { purchasePrice: 'NaN' } });
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body['code']).toBe('bad_request');
    expect(String(body['error'])).toContain('Invalid or missing required input fields');
  });

  it('401 without a key; the legacy surface has no /reports route', async () => {
    const unauth = await fetch(`${base}/v1/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: INPUTS }),
    });
    expect(unauth.status).toBe(401);

    const legacy = await post(base, '/reports', { inputs: INPUTS });
    expect(legacy.status).toBe(404);
  });
});
