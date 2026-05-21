# Rental Property Evaluator — 1.0.0 Overview

**Repo:** https://github.com/LowerMedia/rental-property-evaluator
**Current version:** 0.1.0 (never left beta; last commit Sept/Oct 2021)
**Goal:** Ship a real, correct, maintainable 1.0.0 — fix the math, fix the architecture, modernize the stack, and add the calculations/UX expected of a serious deal screener.

## 1.0.0 Decisions (locked 2026-05-20)

- **Stack:** Vite + React 18 + TypeScript (off dead CRA 4 / node-sass / React 17).
- **Deployment:** Both — extract a framework-agnostic calc engine, wrap once as a standalone SPA and once as a WordPress block/plugin.
- **Calc depth:** Default fast **screener**, optional **pro-forma** mode (multi-year projection, amortization, tax/depreciation, IRR/NPV, exit modeling).
- **Scenarios:** Full workflow — localStorage persistence, multiple named saved deals, side-by-side compare, URL share, and PDF/CSV export.

## Why this is a from-scratch-quality rebuild, not a patch

Current `main` **does not compile** — `RentalPropertyEvaluator.js:43` contains `RPECalc.[key](...)` (invalid JS: dot before bracket). The last two commits are `stable`/`latest` merge PRs, so main was left broken.

The calc engine has multiple wrong formulas (arbitrary `0.00001`/`0.0001` interest fudge factors, unit mismatches), and the React layer is built on an anti-pattern (uncontrolled inputs + direct `document.getElementById().value` writes) that is the root cause of the "reset only works once" bug (#50). These can't be cleanly patched; the engine and the component layer both need a rewrite. The good news: the *intent* and field taxonomy are sound and worth carrying forward.

## Brain doc index

- `00-overview.md` — this file
- `01-current-state-audit.md` — every bug, with file:line and severity
- `02-calculations-spec.md` — corrected formulas + new calculations
- `03-architecture-1.0.0.md` — engine + dual-shell architecture
- `04-roadmap-phases.md` — phased delivery plan
- `05-jira-project-plan.md` — proposed LowerMedia Jira project (epics/stories)
- `06-code-prompt.md` — self-contained handoff prompt for an implementer
