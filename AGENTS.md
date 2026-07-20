# AGENTS.md

Conventions for Codex (and other AI agents) working in this repo.

## Writing

Writing rules, from Orwell, 1946. These govern prose: docs, PR text, messages. Never touch code or technical terms; swap in everyday words only where precision survives.

1. Never use a metaphor, simile or other figure of speech which you are used to seeing in print.
2. Never use a long word where a short one will do.
3. If it is possible to cut a word out, always cut it out.
4. Never use the passive where you can use the active.
5. Never use a foreign phrase, a scientific word or a jargon word if you can think of an everyday English equivalent.
6. Break any of these rules sooner than say anything outright barbarous.

Review every prose output against these rules before delivering.

## Where artifacts live

- **`docs/roadmap.md`** — the living strategic roadmap. Edited in place over time; priorities reflect the current view.
- **`docs/adr/NNNN-<slug>.md`** — Architecture Decision Records. One decision per file, append-only, numbered sequentially. Use these to capture _why_ a non-trivial choice was made.
- **`docs/plans/YYYY-MM-<slug>.md`** — implementation plans for substantial initiatives. Front-matter status (`proposed`, `active`, `done`, `superseded`). The plan is the spec; an umbrella GitHub Issue tracks execution.
- **`docs/audits/YYYY-MM-DD-<slug>.md`** — dated point-in-time audits and research snapshots. Frozen on write — never edited.
- **`docs/private/`** — gitignored. Personal/working notes that should not be committed.
- **`.Codex/plans/`** — in-session scratch from plan mode. Not durable. Substantial plans get promoted into `docs/plans/`.

## Issues vs docs

- Docs answer **what / why / how**. Issues answer **who / when / status**.
- Tasks, bugs, individual features → **GitHub Issues**.
- A substantial initiative gets **one umbrella issue** (status + phase checklist) and **one plan doc** (spec + rationale). Implementation PRs reference the umbrella issue and the relevant plan.
- Don't paste long structured plans into issue bodies — issues aren't diff-reviewable and rot as the plan evolves. Link to the doc.

## Workflow

- **Substantial work** (multi-PR initiative, architectural change, refactor across many files):
  1. Write the plan to `docs/plans/YYYY-MM-<slug>.md` with front-matter (`status: proposed`).
  2. Open a draft `Plan: …` PR for review. Reviewer approves the plan, not the implementation.
  3. After approval, flip status to `active`, open the umbrella tracking issue with a phase checklist, begin implementation.
  4. Each implementation PR references the umbrella issue (`Part of #N`) and the relevant phase.
- **Durable decisions** made along the way → add an ADR.
- **Trivial work** (typo, one-line fix, mechanical rename) → straight to a PR. No plan doc, no ADR.
- **Unrelated cleanup spotted while doing other work** → open an issue (or use a spawn-task chip). Don't scope-creep the current PR.

## Formatting

- **Prettier is the single source of truth** for code style. Config lives in `.prettierrc`; ignores in `.prettierignore`. Don't hand-tune whitespace/quotes/semicolons — let Prettier decide.
- A **husky `pre-commit` hook** runs `lint-staged` → `prettier --write` on staged files, so every commit is auto-formatted. This applies to commits Codex makes too.
- Before committing, run `yarn format` (write) or `yarn format:check` (verify) if you've touched many files. Don't bypass the hook with `--no-verify`.

## Package management

- This is a **Yarn Classic (v1) workspaces** monorepo. The root `yarn.lock` is the single source of truth for dependencies; Vercel and CI both install with Yarn.
- **Use Yarn, never npm, at the repo root or in any Yarn workspace.** `yarn install` / `yarn add <pkg>` / `yarn upgrade` / `yarn <script>` — never `npm install` / `npm ci`. Running npm generates a stray root `package-lock.json` that silently desyncs from `yarn.lock`. The duplicate tree is never built or deployed, but Dependabot still scans it: it once accounted for **159 of a 299-alert backlog** (53%), all phantom duplicates of deps already locked in `yarn.lock`. If you ever find a root `package-lock.json`, delete it.
- Force transitive dependency versions via the root `resolutions` field — not npm `overrides`.
- **Exception:** the standalone Expo apps under `apps/` that can't hoist into the workspace carry their _own_ lockfile (`apps/organizer` → `yarn.lock`, `apps/organizer-v2` → `package-lock.json`). Match whichever lockfile is already committed in that app and never add a second one.

## Naming

- ADRs: `NNNN-kebab-slug.md` (4-digit zero-padded, sequential).
- Plans: `YYYY-MM-kebab-slug.md` (year-month, then slug).
- Audits: `YYYY-MM-DD-kebab-slug.md` (full date, then slug).

## ADR format

```
# N. Title

- **Status:** Accepted | Proposed | Superseded by N
- **Date:** YYYY-MM-DD

## Context
What's the situation that forced a decision?

## Decision
What did we decide?

## Consequences
What follows from this — good, bad, and trade-offs accepted.
```

## Plan front-matter

```
---
title: <Initiative name>
status: proposed | active | done | superseded
created: YYYY-MM-DD
tracking-issue: <#N or TBD>
---
```
