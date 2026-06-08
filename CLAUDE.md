# CLAUDE.md — Rental Property Evaluator (RPE)

## Project overview

pnpm 10 monorepo — `packages/engine` (pure calc), `packages/ui` (React 18 SPA), `apps/web` (Vite SPA shell), `apps/wp-block` (Gutenberg block), `apps/api` (thin HTTP eval API).

## Git strategy

Follows the canonical LowerMedia strategy (`~/Library/Mobile Documents/com~apple~CloudDocs/Brain/conventions/git-strategy.md`).

- **Release branch:** `v1.3.0` (current)
- **Task branches** cut from `v1.3.0`, named exactly after the ticket handle (e.g. `RPE-42`)
- **Every commit** prefixed with the ticket handle
- **Jira project:** `RPE` at `lowermedia.atlassian.net` — cloudId `f1fa5126-9e62-47aa-897d-d6ca956bc26c`
- **v1.3.0 Jira version ID:** (assign when version is created in Jira)
- **Transition IDs:** To Do=11, In Progress=21, In Review=31, Done=41

### Shipped releases

| Release | Tag | squash commit on `main` |
|---------|-----|------------------------|
| v1.0.0  | `v1.0.0` | E1–E3: monorepo scaffold, engine, SPA, screener |
| v1.1.0  | `v1.1.0` | E4: pro-forma mode (projection, IRR/NPV, charts) |
| v1.2.0  | `v1.2.0` | E5: WP block, SEO/OG, gated ads, HTTP API, a11y/perf |

### Copilot review loop

Origin is configured at `github.com:LowerMedia/rental-property-evaluator`. Full PR → Copilot review loop is active. Max 2 open PRs at a time.

## Gate (run before every cherry-pick)

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All four must pass. Tests currently: 461 tests, 14 files.

## Tailwind CSS v4 source scanning

`apps/web/src/index.css` uses `@source "../../../packages"` to scan all workspace packages. Any new `packages/*` is picked up automatically — no manual CSS edit needed.

## Jira — do not use mmdbsolutions.atlassian.net for this project

All RPE tickets are at `lowermedia.atlassian.net` only.
