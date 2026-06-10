# CLAUDE.md

Conventions for Claude Code (and other AI agents) working in this repo.

## Where artifacts live

- **`docs/roadmap.md`** — the living strategic roadmap. Edited in place over time; priorities reflect the current view.
- **`docs/adr/NNNN-<slug>.md`** — Architecture Decision Records. One decision per file, append-only, numbered sequentially. Use these to capture _why_ a non-trivial choice was made.
- **`docs/plans/YYYY-MM-<slug>.md`** — implementation plans for substantial initiatives. Front-matter status (`proposed`, `active`, `done`, `superseded`). The plan is the spec; an umbrella GitHub Issue tracks execution.
- **`docs/audits/YYYY-MM-DD-<slug>.md`** — dated point-in-time audits and research snapshots. Frozen on write — never edited.
- **`docs/private/`** — gitignored. Personal/working notes that should not be committed.
- **`.claude/plans/`** — in-session scratch from plan mode. Not durable. Substantial plans get promoted into `docs/plans/`.

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
- A **husky `pre-commit` hook** runs `lint-staged` → `prettier --write` on staged files, so every commit is auto-formatted. This applies to commits Claude makes too.
- Before committing, run `yarn format` (write) or `yarn format:check` (verify) if you've touched many files. Don't bypass the hook with `--no-verify`.

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

## Agent skills

### Issue tracker

Issues and PRDs live in `TropTix/troptix`'s GitHub Issues, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical triage roles use their default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) — all present in GitHub. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `CONTEXT.md` (created lazily) + root `docs/adr/`. See `docs/agents/domain.md`.
