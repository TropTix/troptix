# Plan 009: Replace the boilerplate README and add .env.example files

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4a435eae..HEAD -- apps/web/README.md README.md`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (docs + example files only; the one real risk is putting a secret VALUE in an example file — never do that)
- **Depends on**: 001 (so the documented commands are actually true)
- **Category**: docs / dx
- **Planned at**: commit `4a435eae`, 2026-06-12
- **Issue**: https://github.com/TropTix/troptix/issues/314

## Why this matters

`apps/web/README.md` is the untouched create-next-app boilerplate — it references `pages/index.tsx` and `pages/api/hello.ts`, which don't exist, and says nothing about Supabase, Stripe, the migrations pipeline, or required env vars. There is no `.env.example` anywhere, so a fresh clone (human or agent executor) must reverse-engineer the env surface from source. For a repo that dispatches work to zero-context agents, accurate cold-start docs are leverage on every future task.

## Current state

- `apps/web/README.md` — stock Next.js bootstrap text.
- Root `README.md` — check whether it exists; the repo root listing at planning time showed **no root README** (AGENTS.md/CLAUDE.md serve agents, not humans). If absent, create a minimal one.
- No `.env.example` in repo root, `apps/web/`, or `apps/organizer/`. Real env files are gitignored and may not exist in your worktree.
- Env vars referenced in source (verified by grep at planning time — re-verify in Step 1):
  - Supabase: `NEXT_PUBLIC_SUPABASE_URL` (authUser.ts) plus the anon key used by `apps/web/src/lib/supabase/*`
  - DB: `POSTGRES_PRISMA_URL` (packages/db / vitest.config), `POSTGRES_URL_NON_POOLING` (migration scripts)
  - Stripe: secret key in `apps/web/src/server/lib/stripe.ts`, `STRIPE_CHARGE_SUCCEEDED_WEBHOOK` (webhook.ts:20), publishable key on the client
  - Firebase Storage: the seven `NEXT_PUBLIC_FIREBASE_*` vars in `apps/web/src/config.js` (note: plan 011 removes these — mark them "storage only, scheduled for removal")
  - Email: Resend key in `apps/web/src/server/lib/email.ts`
  - Cron: `CRON_SECRET` (added by plan 004, if landed)
  - Others surfaced by Step 1's grep (PostHog, Google Maps API key, etc.)
- Key repo facts the README must state (all verified): yarn-1 workspaces (`apps/*`, `packages/*`); Node 24 (`.nvmrc`); commands `yarn dev`, `yarn typecheck`, `yarn test`, `yarn format`; migrations via `yarn workspace web db:new` / `db:apply` with plain SQL in `supabase/migrations/` as source of truth (ADR 0004); hosted Supabase branching, no local Docker (ADR 0005/0006); docs map in `CLAUDE.md` (roadmap / ADRs / plans).

## Commands you will need

| Purpose        | Command                                                                                                                      | Expected on success         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Find env usage | `grep -rhoE "process\.env\.[A-Z_0-9]+" apps/web/src packages --include="*.ts" --include="*.tsx" --include="*.js" \| sort -u` | the definitive env-var list |
| Format         | `yarn format:check`                                                                                                          | exit 0 on touched files     |

## Scope

**In scope**:

- `apps/web/README.md` (rewrite)
- `README.md` (create, root — short)
- `apps/web/.env.example` (create)
- `apps/organizer/.env.example` (create — only the vars its source actually reads; grep `apps/organizer` the same way)

**Out of scope**:

- `.gitignore` changes (verify `.env.example` isn't ignored; if a broad `*.env*` pattern catches it, STOP and report rather than editing ignore rules).
- CLAUDE.md / AGENTS.md / docs/\*\* — already accurate and owned by the maintainer.
- Any actual `.env` file. Never create, read aloud, or copy one.

## Git workflow

- Branch: `advisor/009-onboarding-docs`
- One commit. Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Build the true env-var inventory

Run the env grep (table above) for `apps/web`+`packages`, and separately for `apps/organizer`. This output — not this plan's list — is the source of truth for the example files.

**Verify**: you have a deduplicated list per app.

### Step 2: Write the .env.example files

For each var: placeholder value (`your-supabase-url`, `sk_test_...` style hints are fine — **never a real value**) and a one-line comment: what it's for, where to obtain it (Supabase dashboard / Stripe dashboard / Vercel), and whether it's required to boot the dev server vs. only for a feature (e.g. Resend only needed to send email). Group by provider. Mark the `NEXT_PUBLIC_FIREBASE_*` block "storage uploads only — removal planned (plans/011)".

**Verify**: `grep -cE "(sk_live|whsec_[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9])" apps/web/.env.example apps/organizer/.env.example` → 0 (no live-looking secrets).

### Step 3: Rewrite apps/web/README.md

Sections, in order: What this app is (TropTix attendee + organizer web, Next.js 16 App Router); Prerequisites (Node 24 via `.nvmrc`, yarn 1); Setup (`yarn install` at repo root, copy `.env.example` → `.env`, fill values); Run (`yarn dev` from root or `yarn workspace web dev`); Verify (`yarn typecheck`, `yarn test`, `yarn workspace web lint`); Database & migrations (3 lines + pointer to ADR 0004 and `apps/web/scripts/new-migration.ts`); Where things live (src/app routes, src/server, packages/api services, packages/db); Docs map (one line pointing at `docs/roadmap.md`, `docs/adr/`, `docs/plans/`). Keep it under ~80 lines — link to docs rather than duplicating them.

**Verify**: every command named in the README actually exits 0 when run (except ones needing env you don't have — mark those "requires env" in the README).

### Step 4: Create the root README.md

~20 lines: what TropTix is, the workspace layout table (web / organizer / api / db), the three commands (`yarn install`, `yarn dev`, `yarn test`), and pointers to `apps/web/README.md` and `CLAUDE.md`. If a root README already exists (drift), merge instead of overwriting.

**Verify**: `yarn format:check` → exit 0 on the new files.

## Test plan

Docs-only. The verification is executable accuracy: each documented command was run in Step 3's check.

## Done criteria

- [ ] `grep -c "create-next-app" apps/web/README.md` → 0
- [ ] Both `.env.example` files exist; every var in them appears in the Step-1 grep output (no invented vars)
- [ ] No secret values in any new file (Step 2's grep → 0)
- [ ] Root `README.md` exists
- [ ] `yarn format:check` exits 0 on touched files
- [ ] `plans/README.md` status row updated

## STOP conditions

- `.gitignore` would ignore `.env.example` (pattern like `*.env*`) — report; don't edit ignore rules unilaterally.
- The env grep surfaces a variable whose purpose you cannot determine from its usage site — list it as `# TODO(owner): document` rather than guessing, and flag it in your summary.

## Maintenance notes

- Plans 004 (CRON_SECRET) and 011 (Firebase removal) change the env surface — whichever lands later must update the example files; note this in their PRs.
- A stale README is worse than none: the maintainer should treat README updates as part of any PR that changes setup commands.
