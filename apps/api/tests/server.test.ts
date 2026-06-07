/**
 * Integration tests for @rpe/api HTTP server (RPE-40).
 *
 * Starts the server on a random OS-assigned port before each suite,
 * closes it after. Uses Node 20 built-in fetch for requests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index';

// ── Shared valid DealInputs ────────────────────────────────────────────────────

const VALID_INPUTS = {
  purchasePrice: 300000,
  percentDown: 20,
  interestRate: 7,
  loanTermYears: 30,
  closingCosts: 0,
  rollClosingCostsIntoLoan: false,
  grossRent: 2200,
  vacancyPct: 5,
  expenses: {
    taxes: { amount: 3600, period: 'annual' },
    insurance: { amount: 1200, period: 'annual' },
  },
};

// ── Test harness ──────────────────────────────────────────────────────────────

describe('@rpe/api', () => {
  let server: Server;
  let base: string;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        server = createApp();
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          base = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      }),
  );

  afterAll(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  );

  // ── /health ────────────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('returns 200 with status and version', async () => {
      const res = await fetch(`${base}/health`);
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(200);
      expect(body['status']).toBe('ok');
      expect(typeof body['version']).toBe('string');
    });

    it('returns 405 for non-GET methods', async () => {
      const res = await fetch(`${base}/health`, { method: 'POST' });
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(405);
      expect(typeof body['error']).toBe('string');
    });
  });

  // ── CORS ───────────────────────────────────────────────────────────────────

  describe('CORS preflight', () => {
    it('OPTIONS /evaluate returns 204 with full CORS headers', async () => {
      const res = await fetch(`${base}/evaluate`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://example.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(res.headers.get('access-control-allow-methods')).toContain('POST');
      expect(res.headers.get('access-control-allow-headers')).toContain('Content-Type');
    });
  });

  // ── POST /evaluate ─────────────────────────────────────────────────────────

  describe('POST /evaluate', () => {
    it('returns 200 with screener results for valid inputs', async () => {
      const res = await fetch(`${base}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: VALID_INPUTS }),
      });
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(200);
      expect(body).toHaveProperty('results');
      expect(typeof body['results']).toBe('object');
    });

    it('returns 200 with proforma results when opts.mode is proforma', async () => {
      const res = await fetch(`${base}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: VALID_INPUTS, opts: { mode: 'proforma' } }),
      });
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(200);
      expect(body).toHaveProperty('results');
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await fetch(`${base}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not valid json',
      });
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(typeof body['error']).toBe('string');
    });

    it('returns 400 when inputs field is missing', async () => {
      const res = await fetch(`${base}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notInputs: {} }),
      });
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(typeof body['error']).toBe('string');
    });

    it('returns 400 for invalid opts.mode', async () => {
      const res = await fetch(`${base}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: VALID_INPUTS, opts: { mode: 'invalid' } }),
      });
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect((body['error'] as string)).toContain('opts.mode');
    });

    it('returns 400 when opts is not an object (string)', async () => {
      const res = await fetch(`${base}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: VALID_INPUTS, opts: 'screener' }),
      });
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect((body['error'] as string)).toContain('opts');
    });

    it('returns 400 when inputs.expenses is missing', async () => {
      const res = await fetch(`${base}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: {
            purchasePrice: 300000,
            percentDown: 20,
            // expenses intentionally omitted
          },
        }),
      });
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(typeof body['error']).toBe('string');
    });

    it('returns 413 for oversized payloads (>64 KB)', async () => {
      // Build a body that exceeds MAX_BODY_BYTES (64 KB)
      const bigBody = JSON.stringify({ inputs: { _pad: 'x'.repeat(65 * 1024) } });
      const res = await fetch(`${base}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bigBody,
      });
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(413);
      expect(typeof body['error']).toBe('string');
    });

    it('returns 405 for non-POST methods', async () => {
      const res = await fetch(`${base}/evaluate`, { method: 'GET' });
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(405);
      expect(typeof body['error']).toBe('string');
    });
  });

  // ── 404 ────────────────────────────────────────────────────────────────────

  describe('404', () => {
    it('returns 404 for unknown paths', async () => {
      const res = await fetch(`${base}/unknown`);
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(404);
      expect(typeof body['error']).toBe('string');
    });
  });
});
