/**
 * RPE-97: auth test harness — the cookie-session sibling of RPE-85's
 * startTestApi(). Boots a hermetic SQLite-backed better-auth app
 * (sandbox mailer, migrations applied, probe-port boot) and exposes the
 * flow helpers the auth suites repeat: sign-up, sign-in, org creation.
 *
 * Convention (docs/api-testing.md): SQLite for speed, sandbox mail
 * only — a suite using this harness can never touch a network.
 */

import type { Server } from 'node:http';
import { createApp } from '../../src/index';
import { createSessionAuth } from '../../src/services/session';
import { SandboxMailer } from '../../src/services/mailer';
import { createDb, type RpeAuth, type RpeDb } from '@rpe/db';

export const TEST_SECRET = 'rpe-test-secret-0123456789abcdef0123456789abcdef';
export const TEST_PASSWORD = 'a-strong-password-123';

export interface AuthTestApi {
  base: string;
  db: RpeDb;
  auth: RpeAuth;
  sandbox: SandboxMailer;
  /** POST /v1/auth{path} with JSON body (+ optional cookie / extra headers). */
  post: (path: string, body: unknown, cookie?: string, headers?: Record<string, string>) => Promise<Response>;
  /** GET /v1/auth{path}?query (+ optional cookie). */
  get: (path: string, query?: Record<string, string>, cookie?: string) => Promise<Response>;
  /** Sign up a user; returns the session cookie ('' when verification mode withholds it). */
  signUp: (email: string, name?: string) => Promise<{ cookie: string; userId: string | null }>;
  /** Sign in with the harness password; returns the session cookie. */
  signIn: (email: string) => Promise<string>;
  /** Create an org as the cookie's user; returns the org id. */
  createOrg: (cookie: string, name: string, slug: string) => Promise<string>;
  stop: () => Promise<void>;
}

export async function startAuthApi(
  options: { requireEmailVerification?: boolean } = {},
): Promise<AuthTestApi> {
  const db = createDb(':memory:');
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
    secret: TEST_SECRET,
    baseURL: base,
    trustedOrigins: [base],
    mailer: sandbox,
    ...(options.requireEmailVerification !== undefined
      ? { requireEmailVerification: options.requireEmailVerification }
      : {}),
  });
  const server: Server = createApp({
    session: { auth },
    v1RateLimit: { rpm: 10000, dailyCap: 100000 },
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const post: AuthTestApi['post'] = (path, body, cookie, headers = {}) =>
    fetch(`${base}/v1/auth${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: base,
        ...(cookie !== undefined && cookie !== '' ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: JSON.stringify(body),
    });

  const get: AuthTestApi['get'] = (path, query = {}, cookie) => {
    const qs = new URLSearchParams(query).toString();
    return fetch(`${base}/v1/auth${path}${qs === '' ? '' : `?${qs}`}`, {
      headers: { Origin: base, ...(cookie !== undefined && cookie !== '' ? { Cookie: cookie } : {}) },
    });
  };

  return {
    base,
    db,
    auth,
    sandbox,
    post,
    get,
    signUp: async (email, name = email.split('@')[0]!) => {
      const res = await post('/sign-up/email', { email, password: TEST_PASSWORD, name });
      if (res.status !== 200) throw new Error(`signUp(${email}) → ${res.status}`);
      const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
      const body = await res.json() as { user?: { id: string } };
      return { cookie, userId: body.user?.id ?? null };
    },
    signIn: async (email) => {
      const res = await post('/sign-in/email', { email, password: TEST_PASSWORD });
      if (res.status !== 200) throw new Error(`signIn(${email}) → ${res.status}`);
      return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    },
    createOrg: async (cookie, name, slug) => {
      const res = await post('/organization/create', { name, slug }, cookie);
      if (res.status !== 200) throw new Error(`createOrg(${name}) → ${res.status}`);
      const { id } = await res.json() as { id: string };
      return id;
    },
    stop: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      await db.close();
    },
  };
}
