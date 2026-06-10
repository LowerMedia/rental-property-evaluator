/**
 * RPE-97: auth security gate — the E11 sibling of regression.test.ts.
 *
 * Cross-cutting assertions that must stay green every release. Flow
 * details live in their story suites (authSession/login/passwordReset/
 * registration/organizations/orgContext); this gate locks the
 * security-critical invariants in one place so a regression in any of
 * them blocks the ship.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { requireOrg } from '../src/services/orgContext';
import { startAuthApi, TEST_PASSWORD, type AuthTestApi } from './helpers/authHarness';
import type { IncomingMessage, ServerResponse } from 'node:http';

let api: AuthTestApi;
let alice: { cookie: string; userId: string | null };
let bob: { cookie: string; userId: string | null };
let aliceOrgId: string;

beforeAll(async () => {
  api = await startAuthApi();
  alice = await api.signUp('alice@gate.test');
  bob = await api.signUp('bob@gate.test');
  aliceOrgId = await api.createOrg(alice.cookie, 'Alice Holdings', 'alice-holdings');
});

afterAll(() => api.stop());

describe('auth security gate (RPE-97)', () => {
  it('session cookies are httpOnly + SameSite and sessions revoke server-side', async () => {
    const user = await api.signUp('cookiecheck@gate.test');
    expect(user.cookie).toContain('better-auth.session_token=');

    const fresh = await api.post('/sign-up/email', { email: 'cookieraw@gate.test', password: TEST_PASSWORD, name: 'C' });
    const setCookie = (fresh.headers.get('set-cookie') ?? '').toLowerCase();
    expect(setCookie).toContain('httponly');
    expect(setCookie).toContain('samesite=lax');

    const out = await api.post('/sign-out', {}, user.cookie);
    expect(out.status).toBe(200);
    const after = await api.get('/get-session', {}, user.cookie);
    expect(await after.json()).toBeNull();
  });

  it('CSRF: cookie-bearing mutations from untrusted origins are rejected', async () => {
    const res = await api.post('/sign-out', {}, alice.cookie, { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    // session survives the rejected attempt
    const still = await api.get('/get-session', {}, alice.cookie);
    expect(((await still.json()) as { user: { email: string } } | null)?.user.email).toBe('alice@gate.test');
  });

  it('login failures stay generic and lock out after repeated attempts', async () => {
    const ghost = await api.post('/sign-in/email', { email: 'ghost@gate.test', password: TEST_PASSWORD });
    const wrong = await api.post('/sign-in/email', { email: 'alice@gate.test', password: 'wrong-password-00' });
    expect(ghost.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(((await ghost.json()) as { message?: string }).message).toBe(
      ((await wrong.json()) as { message?: string }).message,
    );

    const victim = await api.signUp('lockme@gate.test');
    expect(victim.cookie).not.toBe('');
    for (let i = 0; i < 5; i++) {
      await api.post('/sign-in/email', { email: 'lockme@gate.test', password: 'wrong-password-00' });
    }
    const locked = await api.post('/sign-in/email', { email: 'lockme@gate.test', password: TEST_PASSWORD });
    expect(locked.status).toBe(429);
  });

  it('passwords are argon2id at rest and never appear in responses', async () => {
    const res = await api.post('/sign-up/email', { email: 'hashcheck@gate.test', password: TEST_PASSWORD, name: 'H' });
    expect(JSON.stringify(await res.json())).not.toContain(TEST_PASSWORD);

    if (api.db.dialect !== 'sqlite') throw new Error('expected sqlite');
    const rows = api.db.sqlite.$client
      .prepare('SELECT password FROM account WHERE password IS NOT NULL')
      .all() as Array<{ password: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.password.startsWith('$argon2id$'))).toBe(true);
  });

  it('TENANT ISOLATION: bob cannot resolve, read, or act on alice\'s org', async () => {
    // middleware level — identical 403 for real and ghost orgs
    const capture = () => {
      const out: { status?: number; body?: unknown } = {};
      return {
        out,
        json: (_r: ServerResponse, status: number, body: unknown) => {
          out.status = status;
          out.body = body;
        },
        res: {} as ServerResponse,
      };
    };
    const reqWith = (cookie: string, orgId: string) =>
      ({ headers: { cookie, 'x-org-id': orgId } }) as unknown as IncomingMessage;

    const real = capture();
    expect(await requireOrg(api.auth, api.db, reqWith(bob.cookie, aliceOrgId), real.res, real.json, 'rid')).toBeNull();
    const ghost = capture();
    expect(await requireOrg(api.auth, api.db, reqWith(bob.cookie, 'org-ghost'), ghost.res, ghost.json, 'rid')).toBeNull();
    expect(real.out.status).toBe(403);
    expect(JSON.stringify(real.out.body)).toBe(JSON.stringify(ghost.out.body));

    // endpoint level — org data and member actions are walled off
    const read = await api.get('/organization/get-full-organization', { organizationId: aliceOrgId }, bob.cookie);
    expect(read.status).toBeGreaterThanOrEqual(400);
    const act = await api.post(
      '/organization/invite-member',
      { organizationId: aliceOrgId, email: 'mole@gate.test', role: 'member' },
      bob.cookie,
    );
    expect(act.status).toBeGreaterThanOrEqual(400);

    // ...while alice herself passes
    const mine = await api.get('/organization/get-full-organization', { organizationId: aliceOrgId }, alice.cookie);
    expect(mine.status).toBe(200);
  });

  it('verification mode: neutral sign-up + sign-in gate (spot check via dedicated instance)', async () => {
    const gated = await startAuthApi({ requireEmailVerification: true });
    try {
      const fresh = await gated.post('/sign-up/email', { email: 'v@gate.test', password: TEST_PASSWORD, name: 'V' });
      const dupe = await gated.post('/sign-up/email', { email: 'v@gate.test', password: TEST_PASSWORD, name: 'V' });
      expect(fresh.status).toBe(200);
      expect(await fresh.text()).toBe(await dupe.text());
      expect(fresh.headers.get('set-cookie')).toBeNull();

      const blocked = await gated.post('/sign-in/email', { email: 'v@gate.test', password: TEST_PASSWORD });
      expect(blocked.status).toBe(403);
      expect(gated.sandbox.sent).toHaveLength(1); // exactly one verification email
    } finally {
      await gated.stop();
    }
  });
});
