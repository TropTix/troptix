---
title: Database Migrations Adoption
status: proposed
created: 2026-06-02
tracking-issue: TBD
---

# Database Migrations Adoption

Move `apps/web` off ad-hoc `prisma db push` onto a reviewable, replayable migration pipeline with per-PR isolated databases and automated production deploys. Decision rationale captured in [ADR 0004](../adr/0004-supabase-migrations-as-source.md).

## Context

Today the schema in [`apps/web/prisma/schema.prisma`](../../apps/web/prisma/schema.prisma) is synced with `prisma db push` — there is no `prisma/migrations/` history. Infra:

- **Dev DB** (Supabase, standalone project): local dev + (currently) Vercel PR previews point here. **Being retired** — superseded by a **persistent Supabase dev branch** + per-PR preview branches, no local Docker ([ADR 0006](../adr/0006-hosted-branching-persistent-dev-branch.md), superseding [ADR 0005](../adr/0005-local-only-dev-no-persistent-dev-db.md)).
- **Prod DB** (Supabase): production app.
- No CI (`.github/workflows` is empty). No `vercel.json` (Vercel configured via dashboard).
- Prisma `^5.14.0`.

Goals:
1. Apply migrations to **prod automatically on merge to `main`**.
2. Give each **PR an isolated database**: migrations applied when the PR opens, the database **destroyed when the PR closes** (true "revert on close").
3. Keep authoring schema in Prisma for now.

Hard constraints that shaped the design:
- **Prisma migrations are forward-only** — there is no down/rollback. "Revert" can only mean *destroy an ephemeral database*, not undo a migration.
- A **single shared dev DB cannot** safely support apply-on-open/revert-on-close: concurrent PRs would corrupt each other's schema. Isolation is mandatory → database branching.
- The longer-term plan is **Prisma → Drizzle** (see [architecture roadmap](../roadmap.md)). The migration pipeline must not be welded to Prisma.

## Decision

Source of truth for schema changes becomes **`supabase/migrations/*.sql`** — plain, ORM-agnostic SQL. See [ADR 0004](../adr/0004-supabase-migrations-as-source.md).

| Concern | Mechanism | Trigger |
|---|---|---|
| Migration store | `supabase/migrations/<timestamp>_<name>.sql` (committed) | git |
| Authoring | edit `schema.prisma` → `prisma migrate diff` emits SQL, diffed against a **preview branch** at migration head | `yarn db:new <name>` |
| Default dev environment (app/frontend work) | **persistent Supabase dev branch** (tracks `main`, schema current on merge; **data loaded once** from the retiring dev DB, lives in the branch not git) | always-on |
| Per-PR ephemeral DB (apply on open / **destroy on close**) | **Supabase Branching** (native GitHub integration) | PR opened / closed |
| Preview app → branch DB | Supabase↔Vercel integration auto-injects `DATABASE_URL`/`DIRECT_URL` into the preview | per preview deploy |
| **Prod apply on merge** | **Supabase Branching** auto-applies `supabase/migrations` to the production database when the PR merges to `main` | merge to `main` |

Why not the alternatives:
- **Upgrade Prisma first?** No. Under this design Prisma is only a SQL generator on the way to Drizzle; a 5→7 major upgrade (ESM client, required generator `output`, Node baseline, config breakage) is throwaway churn. Stay on 5.x.
- **Shared dev DB, forward-only?** Rejected — can't give per-PR isolation/revert (the stated requirement).
- **Prisma migrations as the store?** Rejected — Supabase Branching reads `supabase/migrations`, and a plain-SQL store survives the Drizzle migration unchanged.
- **GitHub Actions for prod apply?** Rejected — Supabase Branching already applies migrations to production on merge to `main`. A parallel GHA `db push` duplicates that path and means a second set of CI secrets to manage. Let Branching own prod end-to-end; keep one documented authority.

## Phases

### Phase 0 — Baseline the existing databases (prerequisite)
The prod/dev DBs already have the full schema but no migration history. A fresh **preview** branch, by contrast, builds from an empty DB and runs *every* file in `supabase/migrations`. So the first migration must reconstruct the entire current schema from empty, and the existing persistent DBs must be told they're already at that baseline.

1. Generate the baseline from the current schema:
   ```bash
   cd apps/web
   yarn db:new init --init        # emits supabase/migrations/<ts>_init.sql via prisma migrate diff --from-empty
   ```
   Review the SQL — it should be the full `CREATE TABLE …` set matching prod.
2. Verify no drift between the SQL and the live DBs:
   ```bash
   npx prisma migrate diff --from-url "$DEV_DIRECT_URL" \
     --to-schema-datamodel prisma/schema.prisma --script   # expect empty
   ```
3. Mark prod and dev as already at the baseline so `db push` won't try to re-create:
   ```bash
   supabase migration repair --status applied <ts> --linked   # against each persistent project
   ```
4. Capture a representative `supabase/seed.sql` (no production PII) for preview branches.

### Phase 1 — Wire the pipeline (this plan's PRs)
- Add `supabase/` (`config.toml`, `migrations/`, `seed.sql`).
- Add `apps/web/scripts/new-migration.ts` + `db:new` / `db:apply` package scripts.
- Add `directUrl` to the datasource block in `schema.prisma`.

### Phase 2 — Enable Supabase Branching + integrations (one-time, dashboard)
See the checklist at the bottom — these are console steps that can't be committed. Branching owns per-PR preview DBs, the **persistent dev branch**, **and** the prod apply on merge, so there is no CI workflow or GitHub secrets to configure. Includes creating the persistent dev branch (seed-only) and retiring the old standalone dev DB.

### Phase 3 — Cut over
- Stop all use of `prisma db push`.
- First real schema change goes through `yarn db:new` → PR → preview branch verifies → merge → **Supabase Branching applies to prod**.

## Environments — which DB to use when

**Everything is hosted via Supabase Branching — no local Docker stack.** See [ADR 0006](../adr/0006-hosted-branching-persistent-dev-branch.md). Pick by the *kind* of change.

| Environment | What it is | Use it for |
|---|---|---|
| **Persistent dev branch** (Supabase) | Always-on branch tracking `main`; schema stays current (migrations apply on merge); **real data loaded once** from the dev DB (one-time `pg_dump` restore, lives in the branch, not git) | **App / frontend work that doesn't touch the schema** — fast iteration on real-ish data, nothing to install |
| **Preview branch** (ephemeral, per PR) | Created on PR open from `supabase/migrations` + the synthetic `seed.sql` fixture, **destroyed on close** | **Schema changes** — author + validate the migration in isolation |
| **Prod** | Production database | Not used directly — fed by Branching on merge |

Decision rule:
- **Not touching the schema?** Point the app at the **persistent dev branch**. No Docker, real-ish (seed) data, always up.
- **Touching the schema?** Open a PR (or `supabase branches create`) → a **preview branch** spins up. Point `DATABASE_URL`/`DIRECT_URL`/`DEV_DIRECT_URL` at that branch; the Vercel preview is wired to it automatically.

**Diff baseline = a preview branch at migration head.** `db:new` diffs `DEV_DIRECT_URL` → `schema.prisma`. A freshly created preview branch is exactly at `main`'s migration head, so the diff yields precisely your new migration. **Keep the branch at head:** after generating each migration, `yarn db:apply` pushes it to the branch so the *next* diff is correct. (There is no local stack to diff against anymore.)

**"Replays from empty" validation now happens on the branch, not locally.** A preview branch builds from an empty DB by running every file in `supabase/migrations` + `seed.sql` — the same proof `db:reset` used to give, now on the real target. A green branch creation = the migration replays cleanly.

**Where data comes from.** The **persistent dev branch** gets real content via a one-time `pg_dump`/`pg_restore` from the dev DB (captured before retirement) — it lives in the branch's database, never in git. **Preview branches** are seeded from `supabase/seed.sql`, a small *synthetic* fixture (one demo organizer/event/ticket types) — so a fresh preview is testable without any PII. Keep `seed.sql` synthetic; real data never goes in it. See [ADR 0006](../adr/0006-hosted-branching-persistent-dev-branch.md).

## Daily workflow after adoption

**App / frontend change (no schema touch)** — nothing to install:
```
point apps/web/.env at the persistent dev branch (pooled + direct)
edit code → run the app → open PR
  → Vercel preview deploy (no DB change → still points at the dev branch, or its own preview branch)
merge to main → dev branch + prod stay current
```

**Schema change** — via a preview branch:
```
open a PR (Branching auto-creates a preview branch)   # or: supabase branches create <name>
point DEV_DIRECT_URL / DATABASE_URL at that branch
edit apps/web/prisma/schema.prisma
cd apps/web && yarn db:new add_promoter_payout_field   # diffs branch(at head) → schema → supabase/migrations/<ts>_*.sql
# review the SQL, then apply it to the branch (keeps the branch at head + app testable):
yarn db:apply
git commit && push
  → the preview branch replays all migrations + seed from empty (the "replays cleanly" proof)
  → Vercel preview points at that branch DB automatically
merge to main
  → Supabase Branching applies the new migration to the production DB (and to the persistent dev branch)
close/merge PR
  → Supabase destroys the preview branch DB
```

## Testing a schema change against a preview branch

There is **no local database** — schema changes are authored and tested against a remote preview branch, with your local app pointed at it. Database changes are rare, so the few minutes to provision a branch are an acceptable cost (see [ADR 0006](../adr/0006-hosted-branching-persistent-dev-branch.md)).

```bash
# 1. Spin up an isolated branch DB (built from supabase/migrations + seed.sql, at main's head)
supabase link --project-ref <prod-ref>     # once per machine
supabase branches create my-feature        # …or just open a PR — Branching creates one automatically

# 2. Get the branch's connection details
supabase branches get my-feature           # host/credentials (or read them from the dashboard)

# 3. Point apps/web/.env at the branch
#    DATABASE_URL   = <branch pooled 6543>
#    DIRECT_URL     = <branch direct 5432>
#    DEV_DIRECT_URL = <branch direct 5432>   # diff baseline

# 4. Author + apply the migration
#    edit apps/web/prisma/schema.prisma
cd apps/web && yarn db:new my_change        # diffs branch(head) → schema → supabase/migrations/<ts>_my_change.sql
yarn db:apply                               # push it to the branch (keeps branch at head + app testable)

# 5. Run the app locally against the branch and verify
yarn dev

# 6. Commit + push. Tear down a manually-created branch when done:
supabase branches delete my-feature         # PR-created branches auto-destroy on close
```

**Via a PR, steps 1/2/6 are automatic** — Branching creates and destroys the branch, and the Vercel preview is wired to it. You only do 3–5 (and can skip 3 entirely if testing through the preview deploy rather than a local server).

## One-time setup checklist (manual — dashboard / secrets)

- [ ] Supabase → **Integrations → GitHub**: connect the repo, set Supabase directory to `./supabase`, enable **Branching** (automatic branch on PR). This also enables auto-apply to **production** on merge to `main` — the documented prod-apply authority for this plan.
- [ ] Create the **persistent dev branch** (tracks `main`): `supabase branches create dev --persistent` (no `--with-data` → no prod clone).
- [ ] Load real data into the dev branch **once**, before retiring the old dev DB: `pg_dump "$DEV_DIRECT_URL" --data-only --no-owner --no-privileges --disable-triggers -Fc -f /tmp/dev-data.dump` → `pg_restore --data-only --no-owner --no-privileges --disable-triggers -d "<dev-branch-direct-url>" /tmp/dev-data.dump`.
- [ ] Supabase → **Integrations → Vercel**: connect so PR preview deploys get their **preview branch** URLs automatically, and point the **dev/staging** deploy at the **persistent dev branch**. Confirm preview env vars are *branch-scoped*, prod stays on prod.
- [ ] `apps/web/.env`: default profile points at the **persistent dev branch** (pooled + direct). When doing schema work, repoint `DATABASE_URL`/`DIRECT_URL`/`DEV_DIRECT_URL` at the PR's preview branch.
- [ ] Retire the old standalone dev DB project once the persistent dev branch is serving traffic.

## Risks / notes

- **Authoring diff baseline:** `db:new` diffs `DEV_DIRECT_URL` → new schema. Point it at a **preview branch at migration head**, and `yarn db:apply` after each migration so the branch stays at head — otherwise the next diff regenerates already-authored migrations. (No local stack to diff against anymore.)
- **Pooler vs direct:** migrations need the direct (5432) connection; the app uses the pooled (6543) one. Hence `directUrl`.
- **Data sources** ([ADR 0006](../adr/0006-hosted-branching-persistent-dev-branch.md)): the persistent dev branch holds real data (one-time dev-DB restore, in the branch not git); preview branches get only the synthetic `seed.sql` fixture. Nothing real is committed or cloned into per-PR branches. The dev branch holds real records, so access-control it accordingly.
- **Branching is billed** — the persistent dev branch (always-on) and every preview branch are real Postgres instances with cost. Preview branches are torn down on PR close; the dev branch runs continuously.
- **Drizzle later:** when Prisma is replaced, only the *authoring* step changes (`drizzle-kit` emits SQL into `supabase/migrations`); branching is untouched.
