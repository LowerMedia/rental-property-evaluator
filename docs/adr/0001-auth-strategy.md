# ADR 0001 — Auth strategy: better-auth (scoped) over self-hosted sessions

**Status:** Accepted · **Date:** 2026-06-09 · **Ticket:** RPE-87 (E11 spike)

## Context

E11 adds users, sessions, registration/verification, password reset,
login hardening, organizations/memberships with roles + invites, and
tenant-isolation middleware to a deliberately minimal raw `node:http`
API (no framework), on Postgres + Drizzle (RPE-88). The spike asked:
adopt **better-auth** or hand-roll **self-hosted sessions**
(argon2id + httpOnly cookies + CSRF over Drizzle)?

## Research findings (June 2026)

- **Maturity/adoption:** better-auth is the dominant TS-native auth
  library (1.5M+ monthly downloads, ~300k projects weekly). The 1.5
  release split adapters into focused packages; the Drizzle adapter is
  first-class (`@better-auth/drizzle-adapter`, currently 1.6.x, joins
  support, schema generation via CLI that feeds our drizzle-kit
  migrations — exactly what RPE-88 needs).
- **Raw-Node fit (the spike's main technical question):** confirmed —
  `toNodeHandler` adapts better-auth's Web-standard handler to plain
  `IncomingMessage`/`ServerResponse`; community-documented patterns
  exist for exactly our no-framework setup. It mounts as a
  prefix-delegated route inside our existing RPE-74 router, so request
  ids, structured logs, and the error envelope stay ours.
- **Organization plugin:** orgs, memberships, roles, and tokenized
  invitations with pending/accepted states — near 1:1 with RPE-93's
  scope, actively maintained (recent role-deletion and access-control
  fixes).
- **Security history — the sober part:** CVE-2025-61928 (CVSS 9.3,
  Oct 2025): unauthenticated API-key creation in the **api-key
  plugin**, patched quickly in 1.3.26. Two readings: a fast-moving
  framework has real vulnerability surface; and the project's response
  was fast and transparent. Decisive detail: the flaw lived in a plugin
  we will not enable — RPE already has its own hashed API-key system
  (RPE-75) for machine callers.

## Decision

**Adopt better-auth, scoped hard:**

1. **Pin the minor version**; upgrades are deliberate, reviewed bumps.
2. **Enable only** core email/password (+ verification, reset) and the
   **organization** plugin. The api-key plugin stays OFF — RPE-75's
   `rpe_live_` keys remain the machine-to-machine credential. No social
   providers in Phase 1.
3. **Mount under `/v1/auth/*`** via `toNodeHandler` behind the RPE-74
   dispatcher (request ids, logging, rate limiting, security headers all
   still apply).
4. **Two parallel identities, one org context:** cookie sessions
   (better-auth) for humans/SPA; hashed API keys (ours) for services.
   RPE-94's org-context middleware resolves either into `currentOrg`.
5. **Own the isolation layer ourselves:** RPE-94's scoped-DB helpers and
   tenant-isolation tests are NOT outsourced — better-auth provides
   identity and membership; cross-org denial is proven by our tests.

## Rationale

E11 is, in essence, rebuilding what Laravel's Fortify/Jetstream gave the
REID app for free. Hand-rolling it means owning ~6 stories of
security-critical logic — token lifecycles, enumeration resistance,
lockout, session rotation, invite states — each a place to make the
class of mistake better-auth has already had found-and-fixed at scale.
The repo's minimal-dependency philosophy is about plumbing (we built our
own router, rate limiter, and key store in E10); identity is the one
domain where a vetted dependency reduces risk rather than adding it.
The CVE history argues for *scoping* (fewer plugins, pinned versions,
advisories watched), not for hand-rolling a fresh implementation with
zero outside review.

## Consequences for E11 stories

| Story | Was | Becomes |
|---|---|---|
| RPE-88 DB foundation | build | unchanged — plus generate better-auth's schema into our drizzle-kit migrations |
| RPE-89 user/session core | build all | configure better-auth sessions/cookies/CSRF; our `requireAuth` context glue + tests |
| RPE-90 registration + verification | build | configure + default-org hook + tests |
| RPE-91 login/logout + brute force | build | configure (built-in per-path rate limiting) + verify lockout behavior in tests |
| RPE-92 password reset | build | configure; **test** that reset invalidates sessions (assert, don't assume) |
| RPE-93 orgs/invites/roles | build | configure the organization plugin + tests |
| RPE-94 org middleware + RBAC | build | **still build** scoped-DB helpers + isolation tests; plugin supplies membership/active-org |
| RPE-95 email | build | unchanged — `Mailer` interface; better-auth calls it via send hooks |
| RPE-96 auth UI | build | build, using the better-auth client SDK for session state |
| RPE-97 auth test harness | build | unchanged — extends RPE-85; coverage list identical |

## Revisit triggers

Drop to self-hosted (the schema is ours via Drizzle, so data migrates) if:
better-auth has a second critical CVE in an enabled code path; the
raw-Node adapter degrades; or pinning forces us more than two minors
behind for over a quarter.
