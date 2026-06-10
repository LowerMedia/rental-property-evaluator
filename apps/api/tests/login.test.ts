/**
 * RPE-91: login/logout through /v1/auth — generic 401 (no enumeration),
 * per-account + per-IP brute-force lockout via the hook-mounted
 * LoginThrottle, success reset, and logout revocation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import { createDb, createAuth, type RpeAuth, type RpeDb } from '@rpe/db';

const SECRET = 'rpe-test-secret-0123456789abcdef0123456789abcdef';
const PASSWORD = 'a-strong-password-123';

let db: RpeDb;
let auth: RpeAuth;
let server: Server;
let base: string;

beforeAll(async () => {
  db = createDb(':memory:');
  await db.applyMigrations();

  const probe = createApp({});
  const port: number = await new Promise((resolve) => {
    probe.listen(0, '127.0.0.1', () => {
      const addr = probe.address() as { port: number };
      probe.close(() => resolve(addr.port));
    });
  });
  base = `http://127.0.0.1:${port}`;
  auth = createAuth({ db, secret: SECRET, baseURL: base, trustedOrigins: [base] });
  server = createApp({ session: { auth }, v1RateLimit: { rpm: 10000, dailyCap: 100000 } });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  // Seed accounts
  for (const email of ['login@example.com', 'locked@example.com', 'bystander@example.com']) {
    const res = await post('/sign-up/email', { email, password: PASSWORD, name: 'U' }, '198.51.100.250');
    expect(res.status).toBe(200);
  }
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

const signIn = (email: string, password: string, ip: string) =>
  post('/sign-in/email', { email, password }, ip);

describe('login/logout (RPE-91)', () => {
  it('issues a session on correct credentials; logout revokes it', async () => {
    const res = await signIn('login@example.com', PASSWORD, '203.0.113.1');
    expect(res.status).toBe(200);
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    expect(cookie).toContain('better-auth.session_token=');

    const out = await post('/sign-out', {}, '203.0.113.1', cookie);
    expect(out.status).toBe(200);
    const after = await fetch(`${base}/v1/auth/get-session`, {
      headers: { Cookie: cookie, Origin: base },
    });
    expect(await after.json()).toBeNull();
  });

  it('returns an identical generic 401 for unknown user vs wrong password', async () => {
    const unknown = await signIn('ghost@example.com', PASSWORD, '203.0.113.2');
    const wrongPw = await signIn('login@example.com', 'wrong-password-000', '203.0.113.3');
    expect(unknown.status).toBe(401);
    expect(wrongPw.status).toBe(401);

    const a = await unknown.json() as { message?: string; code?: string };
    const b = await wrongPw.json() as { message?: string; code?: string };
    expect(a.message).toBe(b.message); // no enumeration signal in the body
  });

  it('locks the account after 5 failures — even with the correct password, even from a new IP', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await signIn('locked@example.com', 'wrong-password-000', '203.0.113.10');
      expect(res.status).toBe(401);
    }
    // correct password, same IP → throttled
    const sameIp = await signIn('locked@example.com', PASSWORD, '203.0.113.10');
    expect(sameIp.status).toBe(429);
    const body = await sameIp.json() as { message?: string };
    expect(body.message).toMatch(/Try again in \d+s/);

    // correct password, fresh IP → account key still locked
    const newIp = await signIn('locked@example.com', PASSWORD, '203.0.113.11');
    expect(newIp.status).toBe(429);

    // a different account from the attacker's IP is also blocked (per-IP key)
    const sameIpOtherAcct = await signIn('bystander@example.com', PASSWORD, '203.0.113.10');
    expect(sameIpOtherAcct.status).toBe(429);

    // unrelated account + unrelated IP → unaffected
    const unrelated = await signIn('bystander@example.com', PASSWORD, '203.0.113.99');
    expect(unrelated.status).toBe(200);
  });

  it('a successful sign-in clears the failure count', async () => {
    for (let i = 0; i < 3; i++) {
      await signIn('login@example.com', 'wrong-password-000', '203.0.113.50');
    }
    const ok = await signIn('login@example.com', PASSWORD, '203.0.113.50');
    expect(ok.status).toBe(200);
    // counter reset — 4 more failures stay under the threshold
    for (let i = 0; i < 4; i++) {
      const res = await signIn('login@example.com', 'wrong-password-000', '203.0.113.50');
      expect(res.status).toBe(401);
    }
    expect((await signIn('login@example.com', PASSWORD, '203.0.113.50')).status).toBe(200);
  });
});
