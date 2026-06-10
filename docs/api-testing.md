# API testing convention (RPE-85)

The public API is verified at HTTP level on **every release** — the
regression suite is part of `pnpm test`, which the ship sequence requires
green before any cherry-pick or squash. A red API suite blocks the release.

## The harness

`apps/api/tests/helpers/harness.ts` boots `apps/api` in-process on an
ephemeral port with an ephemeral hashed key and returns a small client:

```ts
import { startTestApi, expectCsvAttachment, expectPdfAttachment } from './helpers/harness';

const api = await startTestApi();             // or { withoutAuth: true } / { config: {...} }
try {
  const res = await api.post('/v1/evaluate', { inputs });   // authed JSON POST
  const csv = await expectCsvAttachment(await api.post('/v1/reports?format=csv', { inputs }));
} finally {
  await api.stop();
}
```

Helpers: `api.get/post` (authed), `api.raw` (unauthenticated, any method),
`expectCsvAttachment` / `expectPdfAttachment` (status + content-type +
disposition + magic-byte checks).

## Definition of done for any new /v1 endpoint or version

1. **Harness cases** in `apps/api/tests/` using `startTestApi` — no
   hand-rolled server boots. Cover at minimum: happy path, 400 envelope,
   401 without key, and the endpoint's specific failure modes.
2. **OpenAPI entry** in `apps/api/src/openapi.ts` — the drift test
   (`openapi.test.ts`) fails in both directions if spec and routes diverge;
   update `IMPLEMENTED_V1` there too.
3. **Golden lock** when the endpoint's output derives from the engine or
   report model — add stable-field snapshots to `regression.test.ts` so
   output shifts fail loudly.
4. **Contract additions** in `contract.test.ts` if the endpoint introduces
   new header, CORS, or abuse-handling behavior.

## Auth & multi-tenancy (E11, RPE-97)

Cookie-session suites use `startAuthApi()` from
`apps/api/tests/helpers/authHarness.ts` — the auth sibling of
`startTestApi`. It boots a hermetic SQLite-backed better-auth app
(migrations applied, sandbox mailer — **a suite on this harness can
never touch a network or send real email**) and exposes `signUp`,
`signIn`, `createOrg`, `post`/`get` against `/v1/auth`.

Definition of done for an auth/org change:

1. Story-level behavior in its own suite (see table).
2. If the change touches a security invariant — cookies, CSRF, lockout,
   hashing, neutrality, tenant isolation — extend **`authGate.test.ts`**:
   it is the E11 release gate; a red gate blocks the ship exactly like
   `regression.test.ts`.

## Where things live

| Suite | Locks |
|---|---|
| `regression.test.ts` | Release gate: golden Example-deal numbers across `/v1/evaluate` + all report formats, auth/limit/revocation baseline |
| `authGate.test.ts` | **Release gate (E11):** httpOnly/SameSite + revocation, CSRF origin rejection, generic-401 + lockout, argon2id at rest, tenant isolation (middleware + endpoint), verification-mode neutrality |
| `contract.test.ts` | CORS policy, security headers, fuzz/abuse battery, 401→200→429 walk |
| `openapi.test.ts` | Spec ↔ routes drift, both directions |
| `router.test.ts` / `apiKeys.test.ts` / `v1RateLimit.test.ts` / `reports.test.ts` | Per-story behavior detail |
| `authSession.test.ts` / `login.test.ts` / `passwordReset.test.ts` / `registration.test.ts` / `organizations.test.ts` / `orgContext.test.ts` | Per-story auth/org behavior detail (RPE-89–94) |
