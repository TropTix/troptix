# 12. Prisma 7 (Rust-free client) instead of Drizzle

- **Status:** Accepted
- **Date:** 2026-06-08
- **Supersedes:** [ADR 0008](0008-drizzle-orm.md)

## Context

[ADR 0008](0008-drizzle-orm.md) chose Drizzle for `packages/db`, to be consumed by `apps/web` (Next.js) and `apps/organizer` (Expo/React Native). Its headline argument was technical: _"Prisma's runtime is a generated client + query engine binary — awkward to share into a Metro/React Native bundle."_ Secondary points were the codegen step and that pure-function services over a `db` handle are easier to unit-test.

Two things have changed since 0008 was written:

1. **The architecture neutralizes the bundling argument.** Under [ADR 0009](0009-shared-package-topology.md), the RN app never imports the DB client. It talks to the server over **tRPC/HTTP**; the DB client lives behind the `server-only` quarantine and the Expo bundle only ever pulls **type-only** entries (`@troptix/db/types`, the `AppRouter` type). Prisma's query engine never enters Metro either way — so "Prisma can't bundle into RN" does not bite.

2. **Prisma 7 removes the engine binary.** The new `prisma-client` generator is **Rust-free** (TypeScript/WASM query compiler), ESM-first, and connects through a **driver adapter** (`@prisma/adapter-pg` over a `pg` Pool). The result is a lightweight TS module over `pg` — structurally close to Drizzle in the ways that mattered for a shared package.

The repo is on **Prisma 5.22**. A two-major upgrade (5 → 6 → 7) reconciles cleanly: a grep confirms **none** of the v6 breaking changes apply (no implicit m-n relations, no `Bytes`, no `NotFoundError`, no `fullTextSearch`), and the v7 changes are contained (ESM, new provider + `output`, driver adapter, `prisma.config.ts`, `migrate diff` flag renames). Adopting Drizzle instead would mean porting 40+ Prisma call sites and re-verifying the already-tested reservation primitives (`reserve`/`confirm`/`release`/`expire`, #285).

## Decision

**Upgrade to Prisma 7 (Rust-free `prisma-client` generator + `@prisma/adapter-pg`) and keep Prisma as the ORM for `packages/db`.** Do not adopt Drizzle.

Prisma stays a _generator_ on the [ADR 0004](0004-supabase-migrations-as-source.md) pipeline: plain SQL under `supabase/migrations/` remains the source of truth, generated via `prisma migrate diff` (its v7 flags read the datasource from `prisma.config.ts`). `apply-migration.ts` (`supabase db push`) is untouched. The generated client is emitted to a gitignored `output` dir and re-exported from `packages/db`: the server entry exports the `prisma` singleton (`server-only`), and `@troptix/db/types` re-exports model/enum **types** (erasable, RN-safe).

Sequencing: **PR1** upgrades 5→7 in place in `apps/web` (validated in isolation); **PR2** relocates Prisma into `packages/db`. The schema redesign and Supabase Auth stages then proceed on Prisma 7.

## Consequences

- **Good:** keeps the entire working app and the tested reservation code — no ORM port. Gets the lightweight, engine-free, shareable client that motivated the move off Prisma. The migrations pipeline survives with a flag change, not a rewrite. The `reserve` race-safe conditional `UPDATE` stays as raw SQL (Prisma `$queryRaw`), exactly as it would have under Drizzle.
- **Trade-off:** a real two-major upgrade with v7-specific surface — ESM (`"type": "module"`), the new generator `output`, the driver adapter (incl. **Supabase SSL** and **pg connection-pool** settings, which differ from v6 defaults), `prisma.config.ts`, and the `prisma migrate diff` flag renames that touch `new-migration.ts`. Prisma still has a codegen step (`prisma generate`) — the one Drizzle advantage we forgo.
- **Risk:** Prisma 7 is relatively new (less battle-tested than Prisma 5); the pg driver adapter against Supabase's pooled connection needs verification (pgbouncer transaction mode vs prepared statements). Mitigated by upgrading in isolation (PR1) before the package move and schema redesign.
- **Supersedes** [ADR 0008](0008-drizzle-orm.md). [ADR 0007](0007-reservation-based-checkout.md)'s Prisma assumption is reinstated — the reservation primitives are kept, not ported. [ADR 0004](0004-supabase-migrations-as-source.md), [0009](0009-shared-package-topology.md), [0010](0010-vitest-for-packages.md), [0011](0011-supabase-auth-identity.md) are unaffected.
