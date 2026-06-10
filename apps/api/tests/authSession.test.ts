/**
 * RPE-89: cookie-session core through the mounted /v1/auth surface.
 *
 * Real HTTP against a hermetic SQLite-backed better-auth instance:
 * sign-up → cookie semantics → session validation → revocation (sign
 * out) → CSRF origin rejection → argon2id at rest.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import { getSessionContext } from '../src/services/session';
import { createDb, createAuth, type RpeAuth, type RpeDb } from '@rpe/db';

const SECRET = 'rpe-test-secret-0123456789abcdef0123456789abcdef';
const TRUSTED = 'http://localhost:5174';

let db: RpeDb;
let auth: RpeAuth;
let server: Server;
let base: string;

beforeAll(async () => {
  db = createDb(':memory:');
  await db.applyMigrations();

  // Two-phase boot: probe an ephemeral port first, then create the real
  // app with the auth instance's baseURL pointed at it
  const probe = createApp({});
  const port: number = await new Promise((resolve) => {
    probe.listen(0, '127.0.0.1', () => {
      const addr = probe.address() as { port: number };
      probe.close(() => resolve(addr.port));
    });
  });

  base = `http://127.0.0.1:${port}`;
  auth = createAuth({ db, secret: SECRET, baseURL: base, trustedOrigins: [TRUSTED] });
  server = createApp({
    session: { auth },
    v1RateLimit: { rpm: 1000, dailyCap: 100000 },
  });
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

const signUpBody = (email: string) =>
  JSON.stringify({ email, password: 'correct-horse-battery-staple-9', name: 'Test User' });

function postAuth(path: string, body: string, headers: Record<string, string> = {}) {
  return fetch(`${base}/v1/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: TRUSTED, ...headers },
    body,
  });
}

describe('cookie-session core (/v1/auth)', () => {
  it('signs up, sets an httpOnly session cookie, and never returns the password', async () => {
    const res = await postAuth('/sign-up/email', signUpBody('a@example.com'));
    expect(res.status).toBe(200);

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('better-auth.session_token=');
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie.toLowerCase()).toContain('samesite=lax');

    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('correct-horse-battery-staple-9');
    expect(text).not.toContain('passwordHash');
  });

  it('stores the password as argon2id at rest', async () => {
    if (db.dialect !== 'sqlite') throw new Error('expected sqlite');
    // Read the raw account row via the underlying driver — asserts what's
    // actually at rest, independent of any ORM serialization
    const rows = db.sqlite.$client
      .prepare('SELECT password FROM account WHERE password IS NOT NULL')
      .all() as Array<{ password: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.password.startsWith('$argon2id$')).toBe(true);
  });

  it('validates the session via getSessionContext and rejects garbage cookies', async () => {
    const res = await postAuth('/sign-up/email', signUpBody('b@example.com'));
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;

    const sessionRes = await fetch(`${base}/v1/auth/get-session`, {
      headers: { Cookie: cookie, Origin: TRUSTED },
    });
    expect(sessionRes.status).toBe(200);
    const session = await sessionRes.json() as { user: { email: string } } | null;
    expect(session?.user.email).toBe('b@example.com');

    const garbage = await fetch(`${base}/v1/auth/get-session`, {
      headers: { Cookie: 'better-auth.session_token=forged', Origin: TRUSTED },
    });
    const forged = await garbage.json() as unknown;
    expect(forged).toBeNull();
  });

  it('sign-out revokes the session server-side', async () => {
    const res = await postAuth('/sign-up/email', signUpBody('c@example.com'));
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;

    const out = await postAuth('/sign-out', '{}', { Cookie: cookie });
    expect(out.status).toBe(200);

    const after = await fetch(`${base}/v1/auth/get-session`, {
      headers: { Cookie: cookie, Origin: TRUSTED },
    });
    expect(await after.json()).toBeNull();
  });

  it('rejects cookie-auth mutations from untrusted origins (CSRF)', async () => {
    // The origin check guards requests carrying ambient credentials —
    // a COOKIE-BEARING mutation from a foreign origin is the CSRF threat
    const signedUp = await postAuth('/sign-up/email', signUpBody('d@example.com'));
    const cookie = (signedUp.headers.get('set-cookie') ?? '').split(';')[0]!;

    const csrf = await postAuth('/sign-out', '{}', {
      Cookie: cookie,
      Origin: 'https://evil.example',
    });
    expect(csrf.status).toBe(403);

    // …and the session survives the rejected attempt
    const still = await fetch(`${base}/v1/auth/get-session`, {
      headers: { Cookie: cookie, Origin: TRUSTED },
    });
    const session = await still.json() as { user: { email: string } } | null;
    expect(session?.user.email).toBe('d@example.com');
  });

  it('requireAuth glue resolves the same session our routes will consume', async () => {
    const res = await postAuth('/sign-up/email', signUpBody('e@example.com'));
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;

    const fakeReq = { headers: { cookie } } as unknown as Parameters<typeof getSessionContext>[1];
    const context = await getSessionContext(auth, fakeReq);
    expect(context?.user.email).toBe('e@example.com');
    expect(context?.session.expiresAt).toBeInstanceOf(Date);

    const empty = await getSessionContext(auth, { headers: {} } as unknown as Parameters<typeof getSessionContext>[1]);
    expect(empty).toBeNull();
  });

  it('returns 404 when session auth is not configured', async () => {
    const open = createApp({});
    await new Promise<void>((resolve, reject) => {
      open.listen(0, '127.0.0.1', async () => {
        try {
          const addr = open.address() as { port: number };
          const res = await fetch(`http://127.0.0.1:${addr.port}/v1/auth/get-session`);
          expect(res.status).toBe(404);
          open.close((err) => (err ? reject(err) : resolve()));
        } catch (err) {
          open.close(() => reject(err as Error));
        }
      });
    });
  });
});
