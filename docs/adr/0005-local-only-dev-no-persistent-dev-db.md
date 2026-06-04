# 5. Local-only development, no persistent dev database

- **Status:** Superseded by [6](0006-hosted-branching-persistent-dev-branch.md)
- **Date:** 2026-06-03

## Context

The migrations pipeline ([ADR 0004](0004-supabase-migrations-as-source.md)) introduced two ways to get a database without a shared dev DB: the **local stack** (`supabase start`, Docker — rebuilt from `supabase/migrations` + `seed.sql`) and **per-PR preview branches** (Supabase Branching). That left the long-lived hosted **dev DB** doing only one job: giving app-only work real, prod-like data with zero boot time.

The original plan recommended keeping the dev DB for that reason. But it is an always-on database billing continuously, and as a solo project the things a shared hosted dev DB buys (a URL other people/tools can hit, collision-free concurrent access) don't apply. Two facts make local-only viable:

- The local stack's data **persists across `db:stop`/`db:start`** (Docker volume) — it is not wiped each session; only `db:reset` rebuilds it. So a local DB can hold a durable working dataset.
- Real data can be loaded **once** via `pg_dump`/`pg_restore` into the local stack and then persists.

## Decision

Retire the persistent hosted dev DB. Development is **local-only** (the `supabase start` stack) plus **per-PR preview branches** from Supabase Branching. No always-on dev database. Real-volume data for local dev comes from a maintained `seed.sql` and an optional one-time `pg_dump` restore into the local stack.

## Consequences

- **Good:** Removes the recurring cost of an always-on dev DB. The local stack is also the correct migration-authoring environment (always at migration head via `db:reset`), so there's one fewer environment to keep in sync. Per-PR isolation is unchanged (preview branches).
- **Trade-off:** No real prod-volume data by default — mitigated by `seed.sql` and the optional dump-and-restore (data persists in the Docker volume). Local dev now requires Docker running and a ~20–30s `db:start`.
- **Bad:** No always-on hosted dev URL for sharing or remote/automated access. If that need arises later, a persistent Supabase branch can be stood up without reversing this decision.
