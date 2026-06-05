# 6. Hosted Supabase Branching for all dev environments; persistent dev branch, no local Docker

- **Status:** Accepted
- **Date:** 2026-06-04
- **Supersedes:** [5](0005-local-only-dev-no-persistent-dev-db.md)

## Context

[ADR 0005](0005-local-only-dev-no-persistent-dev-db.md) made development local-only (the `supabase start` Docker stack) plus per-PR preview branches. In practice that puts a hard dependency on every contributor running and managing Docker — a boot step, disk, and a class of "is the daemon up?" friction — just to run the frontend. For a project where most work is app/frontend changes that never touch the schema, that cost is paid constantly for a benefit (isolated migration replay) that only matters occasionally.

We want the common path — frontend iteration — to require **nothing installed**, while still getting true per-PR isolation when a change touches the schema.

## Decision

All database environments are **hosted via Supabase Branching**; there is **no local Docker stack**.

- **Persistent dev branch** (always-on): the default target for app/frontend work. It can't link to `main` (the production database owns that git branch), so it syncs with a mirrored `dev` git branch that a secret-less GitHub Action (`.github/workflows/sync-dev-branch.yml`) fast-forwards to `main` on every merge — Supabase then applies any newly-merged migrations to it. Schema stays current that way. Its **data is loaded once** via a `pg_dump`/`pg_restore` from the (retiring) dev DB — real data that lives in the branch's database, never in git. Production data is never cloned in (`--with-data` is not used).
- **Ephemeral preview branch** (per PR): spun up for schema changes, used to author and validate the migration in isolation, destroyed on PR close. Seeded from `supabase/seed.sql` — a **small synthetic fixture** (one demo organizer/event/ticket types), not real data. The Supabase↔Vercel integration auto-wires the PR's preview deploy to it.
- **Prod**: fed by Branching on merge to `main`.

Real data is therefore confined to the one long-lived, access-controlled dev branch; nothing real is committed to git (`seed.sql` stays synthetic) or copied into per-PR preview branches.

Consequences of removing the local stack: the **migration-authoring diff baseline** moves from local `54322` to a preview branch held at migration head (kept current with `yarn db:apply`), and the **"replays from empty" validation** moves from `db:reset` to preview-branch creation (which builds from `supabase/migrations` + `seed.sql`). The local-stack scripts (`db:start/stop/status/reset`, `scripts/db-start.sh`) are removed.

## Consequences

- **Good:** Zero local setup for the common case — contributors run the app against the always-on dev branch with nothing to install. One obvious path. Migration replay and per-PR isolation now validate on the real target (a Supabase branch) rather than a local approximation. Nothing real is committed to git, and no data is cloned into per-PR preview branches.
- **Trade-off:** The dev branch is realistic (one-time dev-data load), but **preview-branch** realism is bounded by the synthetic `seed.sql`. The dev branch holds real data, so it must be access-controlled like any environment with real records. Authoring a migration now requires a live preview branch and keeping it at head (`db:apply` after each migration) instead of a local `db:reset`.
- **Bad:** Cost and hosted-dependency increase — the persistent dev branch is an always-on billed instance, every preview branch is billed while open, and all dev/PR work now hard-depends on Supabase Branching availability (no offline option, since the local stack is gone).
