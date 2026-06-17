# CLAUDE.md — Rental Property Evaluator (RPE)

## Project overview

pnpm 10 monorepo — `packages/engine` (pure calc), `packages/ui` (React 18 SPA), `apps/web` (Vite SPA shell), `apps/wp-block` (Gutenberg block), `apps/api` (thin HTTP eval API).

## Git strategy

Follows the canonical LowerMedia strategy (`~/Library/Mobile Documents/com~apple~CloudDocs/Brain/conventions/git-strategy.md`).

- **Release branch:** `v1.10.0` (current)
- **Task branches** cut from the current release branch, named exactly after the ticket handle (e.g. `RPE-42`)
- **Every commit** prefixed with the ticket handle
- **Jira project:** `RPE` at `lowermedia.atlassian.net` — cloudId `f1fa5126-9e62-47aa-897d-d6ca956bc26c`
- **Branch/tag ambiguity gotcha:** once a release tag exists, the bare name (e.g. `v1.3.0`) resolves to the *tag*, not the branch — use `refs/heads/vX.X.X` in merge/push/delete commands during the release ship sequence.
- **Transition IDs:** To Do=11, In Progress=21, In Review=31, Done=41

### Shipped releases

| Release | Tag | squash commit on `main` |
|---------|-----|------------------------|
| v1.0.0  | `v1.0.0` | E1–E3: monorepo scaffold, engine, SPA, screener |
| v1.1.0  | `v1.1.0` | E4: pro-forma mode (projection, IRR/NPV, charts) |
| v1.2.0  | `v1.2.0` | E5: WP block, SEO/OG, gated ads, HTTP API, a11y/perf |
| v1.3.0  | `v1.3.0` | E7 core + E8 + E9: RentCast autofill, simple/complex mode, location defaults (see `docs/releases/v1.3.0.md`) |
| v1.4.0  | `v1.4.0` | E7 complete (tiered import) + Example deal, light/dark theme, score explanation (see `docs/releases/v1.4.0.md`) |
| v1.5.0  | `v1.5.0` | E10 Phase 1: public /v1 REST API — auth, rate limits, reports (json/csv/pdf), OpenAPI, hardening, regression gate (see `docs/releases/v1.5.0.md`) |
| v1.6.0  | `v1.6.0` | E11 complete: auth & multi-tenant accounts — better-auth + Drizzle, sessions, registration/verification, lockout, reset, orgs/RBAC, auth UI, security gate (see `docs/releases/v1.6.0.md`) |
| v1.7.0  | `v1.7.0` | E10 Phase 2: stored deals — org-scoped /v1/deals CRUD + cached report retrieval, DB-backed API keys with env migration (see `docs/releases/v1.7.0.md`) |
| v1.8.0  | `v1.8.0` | RPE-98 go-live infra (DO App Platform specs, Dockerfile, pg TLS/migration hardening, runbook; dev+stage live) + RPE-99 favicon (see `docs/releases/v1.8.0.md`) |
| v1.9.0  | `v1.9.0` | First release on prod: RPE-113 ZIP→state resolution (location "pending" fix), RPE-114 header wrap, RPE-115 dev env (see `docs/releases/v1.9.0.md`) |

### Copilot review loop

Origin is configured at `github.com:LowerMedia/rental-property-evaluator`. Full PR → Copilot review loop is active. Max 2 open PRs at a time.

## Gate (run before every cherry-pick)

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All four must pass. Tests currently: 965 tests, 68 files. Two release
gates ride in `pnpm test` and a red gate blocks the release: the API
regression suite (apps/api/tests/regression.test.ts) and the E11 auth
security gate (apps/api/tests/authGate.test.ts) — see
docs/api-testing.md.

## Deploy

Production is **DigitalOcean App Platform** at `https://rentalpropertyevaluator.com`
(NOT rpe.lowermedia.net), behind Cloudflare DNS, with alias domains
`rpe.lowprop.com` and `rpe.goldfinchproperties.com` (RPE-98). Specs live in
`.do/`: prod tracks `main`, `stage.rentalpropertyevaluator.com` tracks the
current release branch (bump `app.staging.yaml` on each release cut),
`dev.rentalpropertyevaluator.com` tracks `develop`. The api ships via
`apps/api/Dockerfile`. Runbook: `docs/deploy.md` — read it before touching
domains, secrets, or the specs. Same-origin constraint: ingress must route
`/v1` + legacy SPA paths to the api; never split SPA and API across hostnames.

## Tailwind CSS v4 source scanning

`apps/web/src/index.css` uses `@source "../../../packages"` to scan all workspace packages. Any new `packages/*` is picked up automatically — no manual CSS edit needed.

## Jira — do not use mmdbsolutions.atlassian.net for this project

All RPE tickets are at `lowermedia.atlassian.net` only.
