/**
 * RPE-92: password reset through /v1/auth — neutral responses (no
 * enumeration), emailed single-use token, session revocation on reset,
 * reset-request throttling.
 *
 * Storage note: better-auth stores the reset token plaintext in the
 * verification table (same threat model as its session tokens) — the
 * "hashed at rest" AC deviation is documented on the ticket/PR.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import { createSessionAuth } from '../src/services/session';
import { SandboxMailer } from '../src/services/mailer';
import { createDb, type RpeDb } from '@rpe/db';

const SECRET = 'rpe-test-secret-0123456789abcdef0123456789abcdef';
const PASSWORD = 'original-password-123';
const NEW_PASSWORD = 'rotated-password-456';

let db: RpeDb;
let sandbox: SandboxMailer;
let server: Server;
let base: string;

beforeAll(async () => {
  db = createDb(':memory:');
  await db.applyMigrations();
  sandbox = new SandboxMailer();

  const probe = createApp({});
  const port: number = await new Promise((resolve) => {
    probe.listen(0, '127.0.0.1', () => {
      const addr = probe.address() as { port: number };
      probe.close(() => resolve(addr.port));
    });
  });
  base = `http://127.0.0.1:${port}`;
  const auth = createSessionAuth({
    db,
    secret: SECRET,
    baseURL: base,
    trustedOrigins: [base],
    mailer: sandbox,
  });
  server = createApp({ session: { auth }, v1RateLimit: { rpm: 10000, dailyCap: 100000 } });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const res = await post('/sign-up/email', { email: 'reset@example.com', password: PASSWORD, name: 'R' }, '203.0.113.1');
  expect(res.status).toBe(200);
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await db.close();
});

function post(path: string, body: unknown, ip: string, cookie?: string) {
  return fetch(`${base}/v1/auth${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: base,
      'X-Forwarded-For': ip,
      ...(cookie !== undefined ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** Pull the token out of the last captured reset email. */
function lastResetToken(): string {
  const mail = sandbox.sent.at(-1);
  expect(mail?.subject).toContain('Reset your password');
  const match = mail?.text.match(/reset-password\/([\w-]+)\?/);
  expect(match?.[1]).toBeTruthy();
  return match![1]!;
}

describe('password reset (RPE-92)', () => {
  it('returns the same neutral 200 for existing and unknown emails — email only for the real one', async () => {
    const known = await post('/request-password-reset', { email: 'reset@example.com', redirectTo: `${base}/reset` }, '203.0.113.2');
    expect(known.status).toBe(200);
    const knownBody = await known.json() as { message?: string };
    expect(sandbox.sent).toHaveLength(1);

    const unknown = await post('/request-password-reset', { email: 'nobody@example.com', redirectTo: `${base}/reset` }, '203.0.113.3');
    expect(unknown.status).toBe(200);
    const unknownBody = await unknown.json() as { message?: string };
    expect(unknownBody.message).toBe(knownBody.message); // byte-identical neutrality
    expect(sandbox.sent).toHaveLength(1); // no email for the unknown address
  });

  it('resets with the emailed token: old password dies, sessions are revoked, token is single-use', async () => {
    // Establish a live session that must not survive the reset
    const live = await post('/sign-in/email', { email: 'reset@example.com', password: PASSWORD }, '203.0.113.4');
    expect(live.status).toBe(200);
    const cookie = (live.headers.get('set-cookie') ?? '').split(';')[0]!;

    const token = lastResetToken();
    const reset = await post('/reset-password', { newPassword: NEW_PASSWORD, token }, '203.0.113.4');
    expect(reset.status).toBe(200);

    // session revoked server-side
    const after = await fetch(`${base}/v1/auth/get-session`, {
      headers: { Cookie: cookie, Origin: base },
    });
    expect(await after.json()).toBeNull();

    // old password rejected, new accepted
    expect((await post('/sign-in/email', { email: 'reset@example.com', password: PASSWORD }, '203.0.113.5')).status).toBe(401);
    expect((await post('/sign-in/email', { email: 'reset@example.com', password: NEW_PASSWORD }, '203.0.113.6')).status).toBe(200);

    // token consumed — reuse fails
    const reuse = await post('/reset-password', { newPassword: 'another-pass-789', token }, '203.0.113.4');
    expect(reuse.status).toBeGreaterThanOrEqual(400);
  });

  it('throttles repeated reset requests per email/IP', async () => {
    // 2 more requests exhaust the 3-per-15min budget for this email
    // (request #1 was the neutral-response test)
    for (let i = 0; i < 2; i++) {
      const res = await post('/request-password-reset', { email: 'reset@example.com', redirectTo: `${base}/reset` }, '203.0.113.7');
      expect(res.status).toBe(200);
    }
    const blocked = await post('/request-password-reset', { email: 'reset@example.com', redirectTo: `${base}/reset` }, '203.0.113.7');
    expect(blocked.status).toBe(429);
    const body = await blocked.json() as { message?: string };
    expect(body.message).toMatch(/Try again in \d+s/);
  });
});
