/**
 * RPE-85: per-release regression gate — harness-driven baseline + golden
 * report snapshots. Runs in `pnpm test`, which the release ship sequence
 * requires green; a red suite blocks the release.
 *
 * Golden values use the EXAMPLE deal (hand-verified in RPE-68) so any
 * engine/report change that shifts public output fails loudly here.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EXAMPLE_DEAL_INPUTS } from '@rpe/engine';
import { startTestApi, expectCsvAttachment, expectPdfAttachment, type TestApi } from './helpers/harness';

describe('release regression gate (harness)', () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi();
  });

  afterAll(() => api.stop());

  it('baseline: health, auth, validation through the harness client', async () => {
    expect((await api.get('/v1/health')).status).toBe(200);

    const noKey = await api.raw('/v1/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: EXAMPLE_DEAL_INPUTS }),
    });
    expect(noKey.status).toBe(401);

    const bad = await api.post('/v1/evaluate', { inputs: {} });
    expect(bad.status).toBe(400);
  });

  it('golden: /v1/evaluate reproduces the hand-verified Example numbers', async () => {
    const res = await api.post('/v1/evaluate', { inputs: EXAMPLE_DEAL_INPUTS });
    expect(res.status).toBe(200);
    const { results } = await res.json() as { results: Record<string, number | null> };

    // Locked to EXAMPLE_DEAL_EXPECTED (RPE-68) — the engine lock test
    // guards the math; this guards the PUBLIC API serialization of it
    expect(results['noiMonthly']).toBe(1_100);
    expect(results['capRate']).toBeCloseTo(4.4, 10);
    expect(results['cashFlowMonthly']).toBeCloseTo(-496.73, 2);
    expect(results['dscr']).toBeCloseTo(0.6889, 4);
    expect(results['totalCashInvested']).toBe(66_000);
  });

  it('golden: JSON report snapshot (stable fields)', async () => {
    const res = await api.post('/v1/reports', { inputs: EXAMPLE_DEAL_INPUTS });
    const report = await res.json() as {
      meta: Record<string, unknown>;
      score: Record<string, number>;
      metrics: Array<{ key: string; formatted: string; signal: string }>;
    };

    expect(report.meta['reportVersion']).toBe(1);
    expect(report.score['total']).toBe(14);
    // Snapshot the formatted/signal pairs — the public face of the report
    const byKey = Object.fromEntries(report.metrics.map((m) => [m.key, `${m.formatted}|${m.signal}`]));
    expect(byKey['capRate']).toBe('4.40%|fail');
    expect(byKey['cashFlowMonthly']).toBe('-$496.73|fail');
    expect(byKey['dscr']).toBe('0.69×|fail');
    expect(byKey['ltv']).toBe('80.0%|pass');
    expect(byKey['grossYield']).toBe('8.80%|pass');
    expect(byKey['loanAmount']).toBe('$240,000|info');
  });

  it('golden: CSV report snapshot lines', async () => {
    const csv = await expectCsvAttachment(await api.post('/v1/reports?format=csv', { inputs: EXAMPLE_DEAL_INPUTS }));
    expect(csv).toContain('Returns,Cap Rate,4.40%');
    expect(csv).toContain('Loan,Loan Amount,"$240,000"');
    expect(csv).toContain('Capital,Total Cash Invested,"$66,000"');
  });

  it('golden: PDF generates within the locked size band', async () => {
    const bytes = await expectPdfAttachment(
      await api.post('/v1/reports?format=pdf', { inputs: EXAMPLE_DEAL_INPUTS }),
    );
    // Loose band — catches blank/exploding output without pinning bytes
    // (generatedAt varies per request)
    expect(bytes.length).toBeGreaterThan(2_000);
    expect(bytes.length).toBeLessThan(50_000);
  });

  it('rate limit + revocation through the harness', async () => {
    const tight = await startTestApi({ config: { v1RateLimit: { rpm: 1, dailyCap: 100 } } });
    try {
      expect((await tight.get('/v1/health')).status).toBe(200);
      const limited = await tight.get('/v1/health');
      expect(limited.status).toBe(429);
      expect(limited.headers.get('retry-after')).not.toBeNull();
    } finally {
      await tight.stop();
    }

    // Revocation: flip the record and the next request fails
    api.keyRecord.revokedAt = new Date().toISOString();
    const revoked = await api.post('/v1/evaluate', { inputs: EXAMPLE_DEAL_INPUTS });
    expect(revoked.status).toBe(401);
    api.keyRecord.revokedAt = null; // restore for any later cases
  });
});
