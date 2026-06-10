/**
 * RPE-94: org-context middleware + RBAC + tenant isolation.
 *
 * Two real users with their RPE-90 default orgs; requireOrg resolves
 * membership/role from the X-Org-Id header, blocks non-members with an
 * existence-blind 403, enforces minRole, and hands back an OrgScope
 * whose helpers make cross-org access throw.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../src/index';
import { createSessionAuth } from '../src/services/session';
import { requireOrg } from '../src/services/orgContext';
import { SandboxMailer } from '../src/services/mailer';
import { createDb, listMemberships, OrgScope, TenantIsolationError, type RpeAuth, type RpeDb } from '@rpe/db';

const SECRET = 'rpe-test-secret-0123456789abcdef0123456789abcdef';
const PASSWORD = 'a-strong-password-123';

let db: RpeDb;
let auth: RpeAuth;
let server: Server;
let base: string;

const users = new Map<string, { cookie: string; id: string; orgId: string }>();

/** Minimal res/json doubles so requireOrg can be exercised directly. */
function capture() {
  const out: { status?: number; body?: unknown } = {};
  const json = (_res: ServerResponse, status: number, body: unknown) => {
    out.status = status;
    out.body = body;
  };
  return { out, json, res: {} as ServerResponse };
}

const reqWith = (cookie: string, orgId?: string) =>
  ({ headers: { cookie, ...(orgId !== undefined ? { 'x-org-id': orgId } : {}) } }) as unknown as IncomingMessage;

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
  auth = createSessionAuth({ db, secret: SECRET, baseURL: base, trustedOrigins: [base], mailer: new SandboxMailer() });
  server = createApp({ session: { auth }, v1RateLimit: { rpm: 10000, dailyCap: 100000 } });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  for (const email of ['alice@example.com', 'bob@example.com']) {
    const res = await fetch(`${base}/v1/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({ email, password: PASSWORD, name: email.split('@')[0]! }),
    });
    expect(res.status).toBe(200);
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    const { user } = await res.json() as { user: { id: string } };
    const memberships = await listMemberships(db, user.id);
    expect(memberships).toHaveLength(1); // RPE-90 default org
    users.set(email, { cookie, id: user.id, orgId: memberships[0]!.organizationId });
  }
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await db.close();
});

describe('requireOrg (RPE-94)', () => {
  it('resolves the org context for a member (owner of the default org)', async () => {
    const alice = users.get('alice@example.com')!;
    const { out, json, res } = capture();
    const ctx = await requireOrg(auth, db, reqWith(alice.cookie, alice.orgId), res, json, 'rid-1');
    expect(out.status).toBeUndefined();
    expect(ctx?.organizationId).toBe(alice.orgId);
    expect(ctx?.role).toBe('owner');
    expect(ctx?.session.user.email).toBe('alice@example.com');
  });

  it('401 without a session; 403 without an org header', async () => {
    const { out, json, res } = capture();
    expect(await requireOrg(auth, db, reqWith('', 'whatever'), res, json, 'rid-2')).toBeNull();
    expect(out.status).toBe(401);

    const alice = users.get('alice@example.com')!;
    const second = capture();
    expect(await requireOrg(auth, db, reqWith(alice.cookie), second.res, second.json, 'rid-3')).toBeNull();
    expect(second.out.status).toBe(403);
  });

  it("non-member and nonexistent org return byte-identical 403s — bob can't see alice's org, existence never leaks", async () => {
    const alice = users.get('alice@example.com')!;
    const bob = users.get('bob@example.com')!;

    const real = capture();
    expect(await requireOrg(auth, db, reqWith(bob.cookie, alice.orgId), real.res, real.json, 'rid')).toBeNull();
    const ghost = capture();
    expect(await requireOrg(auth, db, reqWith(bob.cookie, 'org-does-not-exist'), ghost.res, ghost.json, 'rid')).toBeNull();

    expect(real.out.status).toBe(403);
    expect(ghost.out.status).toBe(403);
    expect(JSON.stringify(real.out.body)).toBe(JSON.stringify(ghost.out.body));
  });

  it('minRole guards: owner passes admin/owner; rank ordering enforced', async () => {
    const alice = users.get('alice@example.com')!;
    for (const minRole of ['member', 'admin', 'owner'] as const) {
      const { out, json, res } = capture();
      const ctx = await requireOrg(auth, db, reqWith(alice.cookie, alice.orgId), res, json, 'rid', { minRole });
      expect(ctx, minRole).not.toBeNull();
      expect(out.status).toBeUndefined();
    }
  });

  it('OrgScope helpers: assertOwned/filter/stamp keep rows inside the org by construction', () => {
    const scope = new OrgScope('org-a');
    const mine = { organizationId: 'org-a', value: 1 };
    const theirs = { organizationId: 'org-b', value: 2 };

    expect(scope.assertOwned(mine)).toBe(mine);
    expect(() => scope.assertOwned(theirs)).toThrow(TenantIsolationError);
    expect(scope.filter([mine, theirs])).toEqual([mine]);
    expect(scope.stamp({ value: 3 })).toEqual({ value: 3, organizationId: 'org-a' });
  });
});
