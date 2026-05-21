# CLAUDE.md — Rental Property Evaluator (RPE)

## Project overview

pnpm 10 monorepo — `packages/engine` (pure calc), `packages/ui` (React 18 SPA), `apps/web` (Vite SPA shell), `apps/wp-block` (future WP block).

## Git strategy

Follows the canonical LowerMedia strategy (`~/Library/Mobile Documents/com~apple~CloudDocs/Brain/conventions/git-strategy.md`).

- **Release branch:** `v1.0.0` (current)
- **Task branches** cut from `v1.0.0`, named exactly after the ticket handle (e.g. `RPE-24`)
- **Every commit** prefixed with the ticket handle
- **Jira project:** `RPE` at `lowermedia.atlassian.net` — cloudId `f1fa5126-9e62-47aa-897d-d6ca956bc26c`
- **v1.0.0 Jira version ID:** `10039`
- **Transition IDs:** To Do=11, In Progress=21, In Review=31, Done=41

### Copilot review exemption

This repo has **no `origin` remote configured**. The PR → Copilot review loop from the canonical strategy cannot be executed.

Per the strategy's exception clause: skip the PR loop for solo repos with no deployment target. Instead, cherry-pick task commits directly onto the release branch after the local gate passes (lint + typecheck + test + build).

**Reinstate the PR loop** the moment a remote is added (`git remote add origin <url>`).

## Gate (run before every cherry-pick)

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

All four must pass. Tests currently: 253 tests, 8 files.

## Tailwind CSS v4 source scanning

`apps/web/src/index.css` uses `@source "../../../packages"` to scan all workspace packages. Any new `packages/*` is picked up automatically — no manual CSS edit needed.

## Jira — do not use mmdbsolutions.atlassian.net for this project

All RPE tickets are at `lowermedia.atlassian.net` only.
