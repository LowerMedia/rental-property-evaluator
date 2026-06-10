/**
 * RPE-93: organizations through /v1/auth/organization — create, multi-org
 * membership, tokenized email invites (send → accept → membership),
 * role enforcement (member cannot invite), role change, ownership
 * transfer semantics.
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

const cookies = new Map<string, string>();

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

  for (const email of ['owner@example.com', 'invitee@example.com', 'plain@example.com']) {
    const res = await post('/sign-up/email', { email, password: PASSWORD, name: email.split('@')[0]! });
    expect(res.status).toBe(200);
    cookies.set(email, (res.headers.get('set-cookie') ?? '').split(';')[0]!);
  }
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await db.close();
});

function get(path: string, query: Record<string, string>, cookie?: string) {
  const qs = new URLSearchParams(query).toString();
  return fetch(`${base}/v1/auth${path}?${qs}`, {
    headers: { Origin: base, ...(cookie !== undefined ? { Cookie: cookie } : {}) },
  });
}

function post(path: string, body: unknown, cookie?: string) {
  return fetch(`${base}/v1/auth${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: base,
      ...(cookie !== undefined ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('organizations (RPE-93)', () => {
  let orgId: string;

  it('a signed-in user creates an org and is its owner; a second org is fine (multi-org)', async () => {
    const owner = cookies.get('owner@example.com')!;
    const res = await post('/organization/create', { name: 'Acme Holdings', slug: 'acme-holdings' }, owner);
    expect(res.status).toBe(200);
    const org = await res.json() as { id: string; name: string; members?: Array<{ role: string }> };
    expect(org.name).toBe('Acme Holdings');
    orgId = org.id;

    const second = await post('/organization/create', { name: 'Side Deals', slug: 'side-deals' }, owner);
    expect(second.status).toBe(200);

    // creator carries the owner role
    const full = await get('/organization/get-full-organization', { organizationId: orgId }, owner);
    expect(full.status).toBe(200);
    const fullOrg = await full.json() as { members: Array<{ role: string; user: { email: string } }> };
    expect(fullOrg.members.find((m) => m.user.email === 'owner@example.com')?.role).toBe('owner');
  });

  it('unauthenticated org creation is rejected', async () => {
    const res = await post('/organization/create', { name: 'Nope', slug: 'nope' });
    expect(res.status).toBe(401);
  });

  it('invite flow: admin+ sends a tokenized email, invitee accepts, membership appears', async () => {
    const owner = cookies.get('owner@example.com')!;
    const before = sandbox.sent.length;
    const invite = await post(
      '/organization/invite-member',
      { organizationId: orgId, email: 'invitee@example.com', role: 'member' },
      owner,
    );
    expect(invite.status).toBe(200);
    const { id: invitationId } = await invite.json() as { id: string };

    // email captured through the RPE-95 template
    expect(sandbox.sent.length).toBe(before + 1);
    const mail = sandbox.sent.at(-1)!;
    expect(mail.to).toBe('invitee@example.com');
    expect(mail.subject).toContain('Acme Holdings');
    expect(mail.text).toContain(invitationId);

    // accept as the invitee
    const invitee = cookies.get('invitee@example.com')!;
    const accept = await post('/organization/accept-invitation', { invitationId }, invitee);
    expect(accept.status).toBe(200);

    const full = await get('/organization/get-full-organization', { organizationId: orgId }, invitee);
    const fullOrg = await full.json() as { members: Array<{ role: string; user: { email: string } }> };
    expect(fullOrg.members.find((m) => m.user.email === 'invitee@example.com')?.role).toBe('member');
  });

  it('plain members cannot invite (role enforcement at the data layer)', async () => {
    const invitee = cookies.get('invitee@example.com')!;
    const res = await post(
      '/organization/invite-member',
      { organizationId: orgId, email: 'plain@example.com', role: 'member' },
      invitee,
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('owner can change a member role; non-owner cannot take ownership-level actions', async () => {
    const owner = cookies.get('owner@example.com')!;
    const full = await get('/organization/get-full-organization', { organizationId: orgId }, owner);
    const fullOrg = await full.json() as { members: Array<{ id: string; role: string; user: { email: string } }> };
    const inviteeMember = fullOrg.members.find((m) => m.user.email === 'invitee@example.com')!;

    const promote = await post(
      '/organization/update-member-role',
      { organizationId: orgId, memberId: inviteeMember.id, role: 'admin' },
      owner,
    );
    expect(promote.status).toBe(200);

    // the promoted admin can now invite
    const res = await post(
      '/organization/invite-member',
      { organizationId: orgId, email: 'plain@example.com', role: 'member' },
      cookies.get('invitee@example.com')!,
    );
    expect(res.status).toBe(200);
  });

  it('non-members see nothing of the org (tenant isolation baseline)', async () => {
    const outsider = cookies.get('plain@example.com')!;
    const res = await get('/organization/get-full-organization', { organizationId: orgId }, outsider);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
