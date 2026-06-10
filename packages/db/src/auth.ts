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
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { RpeDb } from './client.js';

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
}

export function createAuth(options: CreateAuthOptions) {
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
  });
}

export type RpeAuth = ReturnType<typeof createAuth>;
