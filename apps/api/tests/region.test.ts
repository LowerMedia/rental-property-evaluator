/**
 * RPE-65: GET /region integration tests
 *
 * HUD SAFMR calls are mocked via vi.mock on the services/hud module so that
 * test HTTP calls to the local server use the real fetch while only the
 * outbound HUD API call is intercepted.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index';

// ── Module mock — must be hoisted (vi.mock is hoisted above imports at transform time)
vi.mock('../src/services/hud', () => ({
  fetchHudSafmr: vi.fn(),
}));

// Import mock AFTER vi.mock declaration so we can control it per-test
import { fetchHudSafmr } from '../src/services/hud';
const mockFetchHudSafmr = vi.mocked(fetchHudSafmr);

// ─── Server lifecycle ─────────────────────────────────────────────────────────

describe('GET /region', () => {
  let server: Server;
  let base: string;
  let originalHudToken: string | undefined;

  beforeAll(
    () =>
      new Promise<void>((resolve, reject) => {
        server = createApp().listen(0, '127.0.0.1', () => {
          const addr = server.address();
          if (!addr || typeof addr === 'string') { reject(new Error('no addr')); return; }
          base = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
        server.on('error', reject);
      }),
    5000,
  );

  afterAll(
    () => new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
    5000,
  );

  beforeEach(() => {
    originalHudToken = process.env['HUD_TOKEN'];
    mockFetchHudSafmr.mockReset();
  });

  afterEach(() => {
    if (originalHudToken !== undefined) {
      process.env['HUD_TOKEN'] = originalHudToken;
    } else {
      delete process.env['HUD_TOKEN'];
    }
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it('returns 405 for non-GET methods', async () => {
    const r = await fetch(`${base}/region?zip=78701`, { method: 'POST' });
    expect(r.status).toBe(405);
  });

  it('returns 400 when zip is missing', async () => {
    const r = await fetch(`${base}/region`);
    expect(r.status).toBe(400);
    const body = await r.json() as { error: string };
    expect(body.error).toMatch(/zip/i);
  });

  it('returns 400 for a non-5-digit zip', async () => {
    const r = await fetch(`${base}/region?zip=1234`);
    expect(r.status).toBe(400);
  });

  it('returns 400 for a zip with letters', async () => {
    const r = await fetch(`${base}/region?zip=7870a`);
    expect(r.status).toBe(400);
  });

  // ── Static-only (no HUD_TOKEN) ──────────────────────────────────────────────

  it('returns national defaults when HUD_TOKEN is absent', async () => {
    delete process.env['HUD_TOKEN'];
    // fetchHudSafmr should NOT be called when no token is set

    const r = await fetch(`${base}/region?zip=78701`);
    expect(r.status).toBe(200);
    const body = await r.json() as Record<string, unknown>;
    expect(body['zip']).toBe('78701');
    expect(body['rent']).toBeNull();
    // Should fall back to national (no stateCode resolved without HUD)
    expect(body['resolvedLevel']).toBe('national');
    expect(typeof body['propertyTaxRate']).toBe('number');
    expect(typeof body['insuranceRate']).toBe('number');
    expect(mockFetchHudSafmr).not.toHaveBeenCalled();
  });

  // ── HUD SAFMR integration ───────────────────────────────────────────────────

  it('returns state rates and rent when HUD resolves successfully', async () => {
    process.env['HUD_TOKEN'] = 'test-token';

    mockFetchHudSafmr.mockResolvedValueOnce({
      stateCode: 'TX',
      town: 'Austin',
      county: 'Travis County',
      rent: {
        studio: 1050,
        oneBed: 1230,
        twoBed: 1500,
        threeBed: 1900,
        fourBed: 2200,
      },
    });

    const r = await fetch(`${base}/region?zip=78701`);
    expect(r.status).toBe(200);
    const body = await r.json() as Record<string, unknown>;

    expect(body['zip']).toBe('78701');
    expect(body['stateCode']).toBe('TX');
    expect(body['resolvedLevel']).toBe('state');
    expect(body['sourceLabel']).toMatch(/TX/);
    // TX property tax rate = 0.0180
    expect(body['propertyTaxRate']).toBeCloseTo(0.018, 3);
    // TX insurance rate = 0.0123
    expect(body['insuranceRate']).toBeCloseTo(0.0123, 3);

    const rent = body['rent'] as Record<string, number | null>;
    expect(rent['studio']).toBe(1050);
    expect(rent['oneBed']).toBe(1230);
    expect(rent['twoBed']).toBe(1500);
    expect(rent['threeBed']).toBe(1900);
    expect(rent['fourBed']).toBe(2200);

    expect(mockFetchHudSafmr).toHaveBeenCalledWith('78701', 'test-token');
  });

  it('falls back to national rates when HUD returns null (non-OK)', async () => {
    process.env['HUD_TOKEN'] = 'test-token';
    mockFetchHudSafmr.mockResolvedValueOnce(null);

    const r = await fetch(`${base}/region?zip=00000`);
    expect(r.status).toBe(200);
    const body = await r.json() as Record<string, unknown>;
    expect(body['stateCode']).toBe('');
    expect(body['resolvedLevel']).toBe('national');
    expect(body['rent']).toBeNull();
  });

  it('falls back gracefully when HUD fetch rejects', async () => {
    process.env['HUD_TOKEN'] = 'test-token';
    mockFetchHudSafmr.mockRejectedValueOnce(new Error('network error'));

    const r = await fetch(`${base}/region?zip=12345`);
    expect(r.status).toBe(200);
    const body = await r.json() as Record<string, unknown>;
    expect(body['resolvedLevel']).toBe('national');
    expect(body['rent']).toBeNull();
  });

  it('includes correct label when HUD resolves town and state', async () => {
    process.env['HUD_TOKEN'] = 'test-token';

    mockFetchHudSafmr.mockResolvedValueOnce({
      stateCode: 'CA',
      town: 'Los Angeles',
      county: 'Los Angeles County',
      rent: {
        studio: null,
        oneBed: 1800,
        twoBed: 2200,
        threeBed: null,
        fourBed: null,
      },
    });

    const r = await fetch(`${base}/region?zip=90001`);
    const body = await r.json() as { label: string; stateCode: string };
    expect(body.stateCode).toBe('CA');
    expect(body.label).toContain('Los Angeles');
    expect(body.label).toContain('CA');
    expect(body.label).toContain('90001');
  });
});
