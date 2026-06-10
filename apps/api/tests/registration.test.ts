/**
 * RPE-90: registration + email verification (requireEmailVerification
 * mode) — neutral no-enumeration sign-up, password policy, verification
 * token flips emailVerified and gates sign-in, default org + owner
 * membership provisioned on first registration.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import { createSessionAuth } from '../src/services/session';
import { SandboxMailer } from '../src/services/mailer';
import { createDb, type RpeDb } from '@rpe/db';

const SECRET = 'rpe-test-secret-0123456789abcdef0123456789abcdef';
const PASSWORD = 'a-strong-password-123';

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
    requireEmailVerification: true,
  });
  server = createApp({ session: { auth }, v1RateLimit: { rpm: 10000, dailyCap: 100000 } });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
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

function post(path: string, body: unknown) {
  return fetch(`${base}/v1/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify(body),
  });
}

function sqliteRows<T>(sql: string, ...params: unknown[]): T[] {
  if (db.dialect !== 'sqlite') throw new Error('expected sqlite');
  return db.sqlite.$client.prepare(sql).all(...params) as T[];
}

describe('registration (RPE-90)', () => {
  it('rejects passwords under the policy minimum', async () => {
    const res = await post('/sign-up/email', { email: 'short@example.com', password: 'tooshort1', name: 'S' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(sqliteRows('SELECT id FROM user WHERE email = ?', 'short@example.com')).toHaveLength(0);
  });

  it('fresh sign-up: neutral body, no session cookie, verification email, default org + owner membership', async () => {
    const res = await post('/sign-up/email', { email: 'new@example.com', password: PASSWORD, name: 'Newbie' });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull(); // no session until verified
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ status: true, message: 'Check your email to verify your account.' });

    // verification email captured
    expect(sandbox.sent).toHaveLength(1);
    expect(sandbox.sent[0]?.to).toBe('new@example.com');
    expect(sandbox.sent[0]?.subject).toContain('Verify your email');

    // user exists unverified; default org + owner membership provisioned
    const users = sqliteRows<{ id: string; email_verified: number }>('SELECT id, email_verified FROM user WHERE email = ?', 'new@example.com');
    expect(users).toHaveLength(1);
    expect(users[0]?.email_verified).toBe(0);
    const orgs = sqliteRows<{ name: string }>(
      "SELECT o.name FROM organization o JOIN member m ON m.organization_id = o.id WHERE m.user_id = ? AND m.role = 'owner'",
      users[0]!.id,
    );
    expect(orgs).toHaveLength(1);
    expect(orgs[0]?.name).toBe("Newbie's Workspace");
  });

  it('duplicate sign-up returns a byte-identical neutral 200, creates nothing, sends nothing', async () => {
    const fresh = await post('/sign-up/email', { email: 'dupe@example.com', password: PASSWORD, name: 'D' });
    const freshBody = await fresh.text();
    const sentBefore = sandbox.sent.length;

    const dupe = await post('/sign-up/email', { email: 'dupe@example.com', password: 'different-password-99', name: 'D2' });
    expect(dupe.status).toBe(200);
    expect(await dupe.text()).toBe(freshBody); // byte-identical

    expect(sqliteRows('SELECT id FROM user WHERE email = ?', 'dupe@example.com')).toHaveLength(1);
    expect(sandbox.sent.length).toBe(sentBefore); // no second email
  });

  it('sign-in is gated until the emailed token verifies the address', async () => {
    const before = await post('/sign-in/email', { email: 'new@example.com', password: PASSWORD });
    expect(before.status).toBe(403); // unverified

    // follow the emailed verification link
    const url = sandbox.sent[0]!.text.match(/https?:\/\/\S+/)![0]!;
    const verify = await fetch(url, { redirect: 'manual', headers: { Origin: base } });
    expect([200, 302]).toContain(verify.status);

    const users = sqliteRows<{ email_verified: number }>('SELECT email_verified FROM user WHERE email = ?', 'new@example.com');
    expect(users[0]?.email_verified).toBe(1); // flipped

    const after = await post('/sign-in/email', { email: 'new@example.com', password: PASSWORD });
    expect(after.status).toBe(200);
    expect(after.headers.get('set-cookie')).toContain('better-auth.session_token=');
  });

  it('argon2id at rest for registered users', async () => {
    const rows = sqliteRows<{ password: string }>('SELECT password FROM account WHERE password IS NOT NULL');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.password.startsWith('$argon2id$'))).toBe(true);
  });
});
