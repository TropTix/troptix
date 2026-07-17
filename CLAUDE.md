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

## Package management

- This is a **Yarn Classic (v1) workspaces** monorepo. The root `yarn.lock` is the single source of truth for dependencies; Vercel and CI both install with Yarn.
- **Use Yarn, never npm, at the repo root or in any Yarn workspace.** `yarn install` / `yarn add <pkg>` / `yarn upgrade` / `yarn <script>` — never `npm install` / `npm ci`. Running npm generates a stray root `package-lock.json` that silently desyncs from `yarn.lock`. The duplicate tree is never built or deployed, but Dependabot still scans it: it once accounted for **159 of a 299-alert backlog** (53%), all phantom duplicates of deps already locked in `yarn.lock`. If you ever find a root `package-lock.json`, delete it.
- Force transitive dependency versions via the root `resolutions` field — not npm `overrides`.
- **Exception:** the standalone Expo apps under `apps/` that can't hoist into the workspace carry their _own_ lockfile (`apps/organizer` → `yarn.lock`, `apps/organizer-v2` → `package-lock.json`). Match whichever lockfile is already committed in that app and never add a second one.

## Database changes

- Schema/migration changes go through the flow in [docs/plans/2026-06-migrations-adoption.md](docs/plans/2026-06-migrations-adoption.md) (`yarn db:new` → review SQL → `yarn db:apply`).
- **When you write a migration, update `supabase/seed.sql` to match it.** That file is the preview-branch init script — it runs on every fresh per-PR preview branch after the migrations, and INSERTs an explicit column list. Keeping it current with the migration is what lets a reviewer actually exercise the schema change on the PR's preview deploy: the seed provides the relevant rows the new/changed columns need. A new NOT NULL / no-default column, or one the reservation/checkout flow reads without a fallback (e.g. `capacity`), MUST be added there or fresh preview branches break. Keep the fixture synthetic — no real/PII data.

## Dates and times

See [ADR 0021](docs/adr/0021-event-times-are-venue-local.md). There is no lint rule for any of this — the convention is the enforcement.

- **An event's times are venue-local.** Start, end, and sale windows are wall-clock times at the venue, shown identically to everyone, labelled with the zone. They render through the shared formatter module, which takes the **event** — never `format()`, `toLocaleDateString/TimeString/String`, or `Intl.DateTimeFormat` on an event's date field.
- **Operational timestamps** (order placed, check-in, created/updated) are viewer-local and unlabelled. They render through `<LocalTime>`, because a Server Component cannot know the viewer's zone — `format()`/`toLocale*` in an `async` component resolves in the **server's** zone, which is UTC on Vercel. That is the single most common way to get this wrong.
- **Instants are stored UTC; the zone is stored alongside.** Both halves are needed — an instant alone can't say what "6pm" meant. Never add a column that duplicates either.
- **The wall clock is the truth, the instant is derived.** Changing an event's venue keeps 6:00pm and moves the instant.
- A form that reads a time out and writes it back is a **matched pair** — change both halves together or you shift the event by an hour on save.

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
