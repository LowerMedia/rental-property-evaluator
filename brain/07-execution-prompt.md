# RPE Execution Prompt (work the backlog)

Copy-paste into Codex/Claude Code/Copilot. Self-contained loop for working RPE tickets in dependency order. Hand over with `02-calculations-spec.md`, `03-architecture-1.0.0.md`, `04-roadmap-phases.md` attached.

---

You are implementing **Rental Property Evaluator 1.0.0** for LowerMedia. The old `main` (CRA 4 / React 17) is broken and its calc engine has fabricated formulas — this is a **clean rebuild**, not a patch. Work the Jira backlog in project **RPE** (lowermedia.atlassian.net) ticket-by-ticket, in the order below.

## Context (read first)
- Repo: https://github.com/LowerMedia/rental-property-evaluator
- Specs (authoritative): `02-calculations-spec.md` (formulas + edge cases), `03-architecture-1.0.0.md` (monorepo, engine contract, dual shells), `04-roadmap-phases.md` (phase gates).
- Stack: pnpm workspaces, Vite + React 18 + TypeScript strict, Vitest. Engine package has **zero** React/DOM deps.

## Order (hard gates — do not skip)
1. **Epic RPE-1 / E0 (scaffold)** blocks everything: RPE-8 monorepo → RPE-9 lint/format/test → RPE-11 CI → RPE-10 legacy-data doc.
2. **Epic RPE-2 / E1 (engine)** before any UI: RPE-12 types/validation → RPE-13 loan+amortization → RPE-14 corrected screener metrics → RPE-15 GRM+direction model → RPE-16 new screener metrics → RPE-17 golden-number tests → RPE-18 decimals. **The engine must be proven by tests before E2 starts.**
3. Then RPE-5/E2 (SPA), RPE-4/E3 (scenarios), RPE-3/E4 (pro-forma), RPE-6/E5 (WP block), RPE-7/E6 (launch). E4 and E5 may run in parallel after E2.

## Per-ticket loop
For each ticket, lowest RPE number first within the active epic:
1. Read the Jira ticket (`RPE-XX`) and the relevant section of the spec docs. If the ticket is ambiguous or under-specified, **stop and ask** — do not guess on financial formulas.
2. Move ticket to **In Progress** in Jira.
3. Branch from latest `main`: `git checkout -b feature/RPE-XX-short-slug`.
4. Implement strictly to spec. TS strict, no `any`. For engine work, every numeric result is `number | null` (return `null`, never NaN/Infinity, for undefined cases). For WP work (E5), follow WPCS / Plugin Check expectations.
5. Write/extend tests. Engine tickets are not done without passing golden-number fixtures (incl. 0% interest, 100% down, $0 price, decimals; IRR validated to 4 dp vs spreadsheet).
6. Gate locally: `pnpm -w lint && pnpm -w typecheck && pnpm -w test && pnpm -w build`. All green or the ticket isn't done.
7. **Atomic conventional commit**, ticket-prefixed: `git commit -m "RPE-XX: <type>: <summary>"` (e.g. `RPE-13: feat: amortization schedule with 0% guard`). One logical change per commit. **No AI/co-author attribution.**
8. Open a PR titled `RPE-XX: <summary>`; link the Jira ticket. Move ticket to **In Review** (or Done on merge).
9. Report: ticket, branch, PR link, what changed, test results. Then take the next ticket.

## Definition of done (every ticket)
Spec implemented · tests pass · lint/typecheck/build green · atomic conventional commit with `RPE-XX:` prefix · PR opened · Jira status updated. No UI built on unproven engine code.

## Guardrails
- Don't carry forward the old fudge-factor math — use the formulas in `02-calculations-spec.md` only.
- Don't reintroduce uncontrolled inputs / `document.getElementById().value` writes (root cause of the old reset bug).
- Stop and ask before changing scope, adding dependencies beyond the architecture doc, or touching financial formulas you're unsure about.

Start with **RPE-8**.

---
