/**
 * RPE-95: Mailer interface — sandbox capture, env construction, Resend
 * HTTP provider (fetch-mocked), templates, and the better-auth hook
 * wiring proven end-to-end (sign-up triggers a captured verification
 * email through the sandbox).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import { createSessionAuth } from '../src/services/session';
import {
  createMailerFromEnv,
  orgInviteEmail,
  passwordResetEmail,
  ResendMailer,
  SandboxMailer,
  verificationEmail,
} from '../src/services/mailer';
import { createDb, type RpeDb } from '@rpe/db';

describe('mailer construction (env)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('defaults to the sandbox — CI/local never send real email', () => {
    vi.stubEnv('RPE_MAIL_PROVIDER', '');
    expect(createMailerFromEnv()).toBeInstanceOf(SandboxMailer);
  });

  it('builds Resend only with complete credentials', () => {
    vi.stubEnv('RPE_MAIL_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('RPE_MAIL_FROM', 'Deals <noreply@example.com>');
    expect(createMailerFromEnv()).toBeInstanceOf(ResendMailer);

    vi.stubEnv('RESEND_API_KEY', '');
    expect(() => createMailerFromEnv()).toThrow(/requires RESEND_API_KEY/);
  });
});

describe('ResendMailer (HTTP, fetch-mocked)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('POSTs the message to the Resend API with auth', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      { ok: true, status: 200, json: () => Promise.resolve({}) } as unknown as Response,
    );
    const mailer = new ResendMailer('re_key', 'Deals <noreply@example.com>');
    await mailer.send(verificationEmail('to@example.com', 'https://app/verify?token=t'));

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' }),
    );
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer re_key');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body['to']).toEqual(['to@example.com']);
    expect(body['from']).toBe('Deals <noreply@example.com>');
  });

  it('throws with status only on failure (no recipient in the error)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      { ok: false, status: 422 } as unknown as Response,
    );
    const mailer = new ResendMailer('re_key', 'noreply@example.com');
    await expect(
      mailer.send(verificationEmail('secret-user@example.com', 'https://x')),
    ).rejects.toSatisfy((err: Error) => {
      expect(err.message).toContain('422');
      expect(err.message).not.toContain('secret-user');
      return true;
    });
  });
});

describe('templates', () => {
  it('carry the link and explicit expiry messaging in text and html', () => {
    const v = verificationEmail('a@b.c', 'https://app/verify?token=t1');
    expect(v.text).toContain('https://app/verify?token=t1');
    expect(v.html).toContain('https://app/verify?token=t1');
    expect(v.text).toContain('1 hour');

    const r = passwordResetEmail('a@b.c', 'https://app/reset?token=t2');
    expect(r.text).toContain('single use');
    expect(r.html).toContain('1 hour');

    const i = orgInviteEmail('a@b.c', 'Acme Holdings', 'https://app/invite?token=t3');
    expect(i.subject).toContain('Acme Holdings');
    expect(i.text).toContain('48 hours');
  });
});

describe('better-auth hook wiring (integration)', () => {
  let db: RpeDb;
  let server: Server;

  beforeEach(() => vi.restoreAllMocks()); // the Resend suite mocks global fetch

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await db.close();
  });

  it('sign-up triggers a captured verification email through the sandbox', async () => {
    db = createDb(':memory:');
    await db.applyMigrations();
    const sandbox = new SandboxMailer();

    const probe = createApp({});
    const port: number = await new Promise((resolve) => {
      probe.listen(0, '127.0.0.1', () => {
        const addr = probe.address() as { port: number };
        probe.close(() => resolve(addr.port));
      });
    });
    const base = `http://127.0.0.1:${port}`;

    const auth = createSessionAuth({
      db,
      secret: 'rpe-test-secret-0123456789abcdef0123456789abcdef',
      baseURL: base,
      trustedOrigins: [base],
      mailer: sandbox,
      sendVerificationOnSignUp: true,
    });
    server = createApp({ session: { auth }, v1RateLimit: { rpm: 1000, dailyCap: 100000 } });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });

    const res = await fetch(`${base}/v1/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({ email: 'verifyme@example.com', password: 'a-strong-password-123', name: 'V' }),
    });
    expect(res.status).toBe(200);

    expect(sandbox.sent).toHaveLength(1);
    expect(sandbox.sent[0]?.to).toBe('verifyme@example.com');
    expect(sandbox.sent[0]?.subject).toContain('Verify your email');
    expect(sandbox.sent[0]?.text).toMatch(/https?:\/\/[^\s]+/); // a live verification link
  });
});
