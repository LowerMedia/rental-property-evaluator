/**
 * E11 — better-auth instance factory (RPE-89, per ADR 0001)
 *
 * Scoped per the ADR: email/password core only (organization plugin
 * lands in RPE-93); pinned minor; mounted by apps/api under /v1/auth
 * via toNodeHandler behind the RPE-74 dispatcher.
 *
 * Password hashing: argon2id via @node-rs/argon2 with OWASP-recommended
 * params (19 MiB memory, t=2, p=1) — replacing better-auth's scrypt
 * default to satisfy RPE-89's acceptance criterion. Verification is
 * constant-time inside the native implementation.
 *
 * Keep auth-cli.config.ts / auth-cli.pg.config.ts (schema generation)
 * in lockstep with the feature flags here.
 */

import { randomUUID } from 'node:crypto';
import { Algorithm, hash, verify } from '@node-rs/argon2';
import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins/organization';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { RpeDb } from './client.js';
import { pgSchema } from './schema.pg.js';
import { sqliteSchema } from './schema.sqlite.js';
import { LoginThrottle } from './loginThrottle.js';

/** OWASP password-storage cheat-sheet argon2id parameters. */
const ARGON2ID_PARAMS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456, // KiB ≈ 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/** Mailer-agnostic send hook — apps/api binds these to its Mailer (RPE-95). */
export type SendEmailHook = (data: { email: string; url: string }) => Promise<void>;

export interface CreateAuthOptions {
  db: RpeDb;
  /** BETTER_AUTH_SECRET — ≥32 chars, env-provided, never committed. */
  secret: string;
  /** Public origin of the API, e.g. https://api.example.com or http://127.0.0.1:3001 */
  baseURL: string;
  /** Browser origins allowed to drive cookie-auth flows (CSRF origin check). */
  trustedOrigins?: string[];
  /** Email-verification send hook (+ optional send-on-sign-up, RPE-90 flips it). */
  sendVerificationEmail?: SendEmailHook;
  sendVerificationOnSignUp?: boolean;
  /** Password-reset send hook (RPE-92 consumes). */
  sendResetPassword?: SendEmailHook;
  /** Login brute-force throttle (RPE-91). Defaults to a fresh
   * LoginThrottle; inject for deterministic tests. */
  loginThrottle?: LoginThrottle;
  /** Reset-request spam throttle (RPE-92) — same mechanism, request-count
   * policy (every request counts; responses are always neutral). */
  resetRequestThrottle?: LoginThrottle;
  /** RPE-90: block sign-in until the email is verified, return a
   * neutral no-enumeration sign-up response, and send the verification
   * email on sign-up. OFF by default (sessions issue immediately). */
  requireEmailVerification?: boolean;
  /** Org-invite email hook (RPE-93) — bound to the Mailer by apps/api. */
  sendOrgInvite?: (data: { email: string; orgName: string; url: string }) => Promise<void>;
  /** Base URL of the front-end accept page for invite links (RPE-93). */
  inviteAcceptUrlBase?: string;
}

const SIGN_IN_PATH = '/sign-in/email';
const RESET_REQUEST_PATH = '/request-password-reset';

/** RPE-92: 3 reset requests/15 min per email/IP, then 15 min lockout. */
const RESET_REQUEST_POLICY = {
  windowMs: 15 * 60 * 1000,
  threshold: 3,
  baseLockoutMs: 15 * 60 * 1000,
  maxLockoutMs: 60 * 60 * 1000,
};

function requestIp(headers: Headers | undefined): string {
  // Prefer the dispatcher-resolved IP (RPE-76 trust boundary, includes
  // socket fallback); raw XFF first-hop only as a secondary
  const resolved = headers?.get('x-rpe-client-ip') ?? '';
  if (resolved !== '') return resolved;
  const fwd = headers?.get('x-forwarded-for') ?? '';
  const first = fwd.split(',')[0]?.trim();
  return first !== undefined && first !== '' ? first : 'unknown';
}

/** Byte-identical sign-up response when requireEmailVerification is on. */
const NEUTRAL_SIGN_UP = {
  status: true,
  message: 'Check your email to verify your account.',
} as const;

/** RPE-90: every new user gets a default org + owner membership. */
async function createDefaultOrg(db: RpeDb, user: { id: string; name: string; email: string }): Promise<void> {
  const orgId = randomUUID();
  const now = new Date();
  const orgName = `${user.name !== '' ? user.name : user.email.split('@')[0]}'s Workspace`;
  const member = {
    id: randomUUID(),
    organizationId: orgId,
    userId: user.id,
    role: 'owner',
    createdAt: now,
  };
  if (db.dialect === 'postgres') {
    await db.pg.insert(pgSchema.organization).values({ id: orgId, name: orgName, slug: `ws-${user.id.toLowerCase()}`, createdAt: now });
    await db.pg.insert(pgSchema.member).values(member);
    return;
  }
  await db.sqlite.insert(sqliteSchema.organization).values({ id: orgId, name: orgName, slug: `ws-${user.id.toLowerCase()}`, createdAt: now });
  await db.sqlite.insert(sqliteSchema.member).values(member);
}

export function createAuth(options: CreateAuthOptions) {
  const throttle = options.loginThrottle ?? new LoginThrottle();
  const resetThrottle = options.resetRequestThrottle ?? new LoginThrottle(Date.now, RESET_REQUEST_POLICY);
  const database =
    options.db.dialect === 'postgres'
      ? drizzleAdapter(options.db.pg, { provider: 'pg' })
      : drizzleAdapter(options.db.sqlite, { provider: 'sqlite' });

  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    basePath: '/v1/auth',
    trustedOrigins: options.trustedOrigins ?? [],
    database,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10, // RPE-90 password policy
      requireEmailVerification: options.requireEmailVerification ?? false,
      password: {
        hash: (password) => hash(password, ARGON2ID_PARAMS),
        verify: ({ hash: stored, password }) => verify(stored, password),
      },
      ...(options.sendResetPassword !== undefined
        ? {
            sendResetPassword: async ({ user, url }) => {
              await options.sendResetPassword!({ email: user.email, url });
            },
          }
        : {}),
      // RPE-92: a successful reset kills every active session for the user
      revokeSessionsOnPasswordReset: true,
    },
    ...(options.sendVerificationEmail !== undefined
      ? {
          emailVerification: {
            sendOnSignUp: (options.sendVerificationOnSignUp ?? false) || (options.requireEmailVerification ?? false),
            sendVerificationEmail: async ({ user, url }) => {
              await options.sendVerificationEmail!({ email: user.email, url });
            },
          },
        }
      : {}),
    databaseHooks: {
      user: {
        create: {
          // RPE-90: first registration provisions the default org
          after: async (user) => {
            await createDefaultOrg(options.db, user);
          },
        },
      },
    },
    advanced: {
      // better-auth SKIPS the CSRF origin check by default when
      // NODE_ENV=test — pin it on so tests exercise exactly what
      // production enforces (caught by the RPE-89 harness)
      disableOriginCheck: false,
    },
    plugins: [
      // ADR 0001 scope: organization ON (owner/admin/member roles,
      // tokenized invites); api-key plugin stays OFF — RPE-75 keys
      // remain the machine credential
      organization({
        sendInvitationEmail: async (data) => {
          if (options.sendOrgInvite === undefined) return;
          const base = options.inviteAcceptUrlBase ?? `${options.baseURL}/accept-invitation`;
          await options.sendOrgInvite({
            email: data.email,
            orgName: data.organization.name,
            url: `${base}/${data.id}`,
          });
        },
      }),
    ],
    hooks: {
      // Brute-force throttle on the sign-in path (RPE-91): the hook
      // layer sees the parsed body, so lockout keys on the submitted
      // email AND the client IP, with progressive backoff
      before: createAuthMiddleware(async (ctx) => {
        const email = typeof ctx.body?.email === 'string' ? ctx.body.email : '';
        const ip = requestIp(ctx.request?.headers);
        if (ctx.path === '/sign-up/email' && (options.requireEmailVerification ?? false)) {
          // No enumeration: duplicates short-circuit to the same neutral
          // body the after-hook returns for fresh sign-ups
          const existing = await ctx.context.internalAdapter.findUserByEmail(email);
          if (existing !== null) return ctx.json(NEUTRAL_SIGN_UP);
        }
        if (ctx.path === SIGN_IN_PATH) {
          const decision = throttle.check(email, ip);
          if (!decision.allowed) {
            throw new APIError('TOO_MANY_REQUESTS', {
              message: `Too many sign-in attempts. Try again in ${decision.retryAfterSec ?? 60}s.`,
            });
          }
        } else if (ctx.path === RESET_REQUEST_PATH) {
          const decision = resetThrottle.check(email, ip);
          if (!decision.allowed) {
            throw new APIError('TOO_MANY_REQUESTS', {
              message: `Too many reset requests. Try again in ${decision.retryAfterSec ?? 60}s.`,
            });
          }
          // Every request counts — the response is always neutral, so
          // there is no failure signal to key on
          resetThrottle.onFailure(email, ip);
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/sign-up/email' && (options.requireEmailVerification ?? false)) {
          // Fresh sign-ups get the same neutral body as duplicates
          if (!(ctx.context.returned instanceof APIError)) return ctx.json(NEUTRAL_SIGN_UP);
          return;
        }
        if (ctx.path !== SIGN_IN_PATH) return;
        const email = typeof ctx.body?.email === 'string' ? ctx.body.email : '';
        const ip = requestIp(ctx.request?.headers);
        const status = ctx.context.returned instanceof APIError ? ctx.context.returned.statusCode : 200;
        if (status === 200) throttle.onSuccess(email, ip);
        else if (status === 401) throttle.onFailure(email, ip);
      }),
    },
  });
}

export type RpeAuth = ReturnType<typeof createAuth>;
