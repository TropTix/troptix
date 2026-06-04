# 4. Supabase migrations as the schema source of truth

- **Status:** Proposed
- **Date:** 2026-06-02

## Context

`apps/web` syncs its schema with `prisma db push` (no migration history). We want: reviewable migrations, automatic prod apply on merge, and an isolated database per PR that is created on open and destroyed on close. Two constraints dominate:

- Prisma migrations are forward-only — "revert on PR close" can only mean *destroy an ephemeral DB*, which requires database branching (one DB per PR), not a shared dev DB.
- The roadmap plans a Prisma → Drizzle migration, so the pipeline must not be Prisma-specific.

Supabase Branching (native GitHub integration) creates/migrates/destroys a preview database per PR and auto-wires the Vercel preview — but it runs SQL from `supabase/migrations`, not `prisma/migrations`.

## Decision

Make **`supabase/migrations/*.sql` the source of truth** for schema changes. Prisma is used only to *author* and *generate* that SQL (`prisma migrate diff`); **Supabase Branching** owns the full lifecycle — per-PR ephemeral databases *and* applying migrations to production on merge to `main`. No GitHub Actions / CI step for prod apply: Branching already does it, so a parallel `db push` would only duplicate the path and add CI secrets to manage. Do **not** upgrade Prisma (stays `5.x`) — it is a soon-to-be-replaced SQL generator.

## Consequences

- **Good:** True per-PR isolation with safe teardown. ORM-agnostic SQL store survives the Drizzle move untouched — only the authoring step changes later. One prod-apply authority (Supabase Branching) — no CI workflow or secrets to maintain. No wasted Prisma major-upgrade work.
- **Trade-off:** Two representations of schema during the Prisma era (`schema.prisma` for authoring, `supabase/migrations` for truth) kept in sync by a generate step. Generated diffs depend on the dev DB not drifting from history (mitigated by treating dev as derived-from-migrations).
- **Bad:** Couples the **whole** pipeline — dev/PR *and* prod apply — to Supabase Branching (a paid, Supabase-specific feature) and the Supabase↔Vercel integration. No independent CI fallback for prod migrations; if Branching is down or disabled, prod applies must be run manually (`supabase db push --linked`).
