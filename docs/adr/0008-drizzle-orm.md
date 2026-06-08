# 8. Drizzle as the ORM and SQL generator

- **Status:** Proposed
- **Date:** 2026-06-07

## Context

We are building a shared `packages/db` consumed by `apps/web` (Next.js) and `apps/organizer` (Expo/React Native), and finalizing the database design in the same window. The roadmap already planned a Prisma → Drizzle migration (P4.1), deferred until *after* the schema redesign so we'd migrate onto a clean model. Building the shared package now forces the ORM choice now: building it on Prisma and re-building it on Drizzle later is wasted work.

Prisma's runtime is a generated client + a query engine binary — awkward to share into a Metro/React Native bundle, and it keeps a codegen step in the critical path. Per [ADR 0004](0004-supabase-migrations-as-source.md), plain SQL under `supabase/migrations/` is already the source of truth and Prisma is only a *generator* (`prisma migrate diff` in `scripts/new-migration.ts`). That makes the ORM swappable: the pipeline only needs *some* tool to diff a schema model into reviewable SQL.

## Decision

Adopt **Drizzle** as the ORM, in `packages/db`. Drizzle's TypeScript schema (`schema.ts`) becomes the authoring source, and `drizzle-kit generate` replaces `prisma migrate diff` as the SQL emitter, writing into the same `supabase/migrations/` directory. Plain SQL remains the source of truth (ADR 0004 unchanged); `apply-migration.ts` (`supabase db push`) is untouched.

Baseline by **re-baselining, not introspecting**: author `schema.ts` to model the current dual-era schema, generate the Drizzle meta snapshot only (tables already exist), and gate on an **empty diff** against a preview branch built from the existing SQL migrations. Drizzle runs **dual-ORM** alongside the live Prisma client during the foundation stage; the 40+ Prisma call sites move to Drizzle when the service layer extracts into `packages/api`.

## Consequences

- **Good:** TS-native inferred types with no codegen step; trivially shareable into both Next and Metro; `reserve`/`confirm`/`release`/`expire` and the rest of the logic become pure functions over a `db` handle (unit-testable). Fits the stated target architecture (Drizzle for CRUD, raw SQL for the concurrency-critical hold).
- **Trade-off:** a real migration of the existing `reservations.ts` and all Prisma call sites; two ORMs coexist transiently; the team learns Drizzle's query builder.
- **Risk:** baseline snapshot drift from the hand-written SQL → mitigated by the empty-diff gate. Done now (no live traffic) rather than as a later standalone project, so the shared package is built once on the final schema.
- **Supersedes** the Prisma assumption in [ADR 0007](0007-reservation-based-checkout.md); the reservation primitives are ported, not rewritten.
