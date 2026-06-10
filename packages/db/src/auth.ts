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

import { Algorithm, hash, verify } from '@node-rs/argon2';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { RpeDb } from './client.js';
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
}

const SIGN_IN_PATH = '/sign-in/email';

function requestIp(headers: Headers | undefined): string {
  // Prefer the dispatcher-resolved IP (RPE-76 trust boundary, includes
  // socket fallback); raw XFF first-hop only as a secondary
  const resolved = headers?.get('x-rpe-client-ip') ?? '';
  if (resolved !== '') return resolved;
  const fwd = headers?.get('x-forwarded-for') ?? '';
  const first = fwd.split(',')[0]?.trim();
  return first !== undefined && first !== '' ? first : 'unknown';
}

export function createAuth(options: CreateAuthOptions) {
  const throttle = options.loginThrottle ?? new LoginThrottle();
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
    },
    ...(options.sendVerificationEmail !== undefined
      ? {
          emailVerification: {
            sendOnSignUp: options.sendVerificationOnSignUp ?? false,
            sendVerificationEmail: async ({ user, url }) => {
              await options.sendVerificationEmail!({ email: user.email, url });
            },
          },
        }
      : {}),
    advanced: {
      // better-auth SKIPS the CSRF origin check by default when
      // NODE_ENV=test — pin it on so tests exercise exactly what
      // production enforces (caught by the RPE-89 harness)
      disableOriginCheck: false,
    },
    hooks: {
      // Brute-force throttle on the sign-in path (RPE-91): the hook
      // layer sees the parsed body, so lockout keys on the submitted
      // email AND the client IP, with progressive backoff
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== SIGN_IN_PATH) return;
        const email = typeof ctx.body?.email === 'string' ? ctx.body.email : '';
        const decision = throttle.check(email, requestIp(ctx.request?.headers));
        if (!decision.allowed) {
          throw new APIError('TOO_MANY_REQUESTS', {
            message: `Too many sign-in attempts. Try again in ${decision.retryAfterSec ?? 60}s.`,
          });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
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
