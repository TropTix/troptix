# 7. Reservation-based checkout on the current stack

- **Status:** Proposed
- **Date:** 2026-06-02

## Context

The roadmap's three Priority-1 bugs are not independent defects — they share one root cause, the inventory accounting model:

- **1.1 Overselling:** availability is read, checked, then written in separate steps with no atomic guard, so concurrent checkouts both pass the stock check.
- **1.2 Partial payment confirmation:** the Stripe webhook applies the order-status update and the per-ticket-type `quantitySold` increments as separate, non-transactional writes.
- **1.3 Stripe drift:** three clients on three API versions — a symptom of organic growth around the same flow.

Underneath all three: a mutable `quantitySold` counter incremented in two places and never decremented on expiry; a PENDING `Orders` row used as an implicit reservation; availability computed by counting order rows in one place and read from the counter in another (two disagreeing sources of truth); and a 5-minute expiry cron that releases no inventory.

Three options were considered:

1. **Surgical patches** — add a `SELECT … FOR UPDATE` lock (1.1), wrap the webhook in a transaction (1.2), share one Stripe client (1.3). Stops the bleeding fastest, but the lock patch is throwaway the moment a reservation model lands, and the two-sources-of-truth problem remains.
2. **Wait for the Drizzle/Supabase migration** ([[0001]]–[[0003]] cover the design-system track; the architecture migration is tracked separately) and rebuild checkout there. Correct destination, but leaves a live revenue bug unfixed for months behind a large migration.
3. **Rebuild the checkout/inventory/payment subsystem now**, as the reservation model, in place on the current Prisma + Postgres stack.

## Decision

Take option 3. Replace the inventory model with a reservation-based design **now, on Prisma + Postgres**. General-admission **counter inventory** (`capacity` / `reserved` / `sold`); an explicit `Reservation` with a TTL holds inventory while the buyer pays; the `Order` + tickets are materialized only on payment success; an idempotent webhook is the single source of truth. Fold in only the schema corrections the checkout functionally depends on (integer cents, `startsAt`/`endsAt`, meaningful ticket statuses, order-level type).

**No stored procedures.** The only operation that needs a database-level atomicity guarantee is the inventory hold, and that is a single conditional `UPDATE` issued inline from application code:

```sql
UPDATE "TicketTypes" SET "reserved" = "reserved" + $n
WHERE id = $id AND "capacity" - "reserved" - "sold" >= $n;
-- 0 rows affected ⇒ sold out
```

This is atomic at the default READ COMMITTED isolation: the `UPDATE` takes the row lock, a concurrent one blocks, then re-evaluates the `WHERE` predicate against the committed row and correctly fails — no `FOR UPDATE`, no retry loop, no plpgsql. A reservation spanning several ticket types runs one such `UPDATE` per type inside a single Prisma `$transaction`; if any affects 0 rows the whole transaction rolls back. The other operations — **confirm** (reserved → sold, materialize order + tickets, enqueue email), **release**, and **expire** — have no hard concurrency requirement and live in Prisma transactions in TypeScript, where they are typed and unit-testable, rather than in plpgsql.

Schema changes ship through the Supabase migrations pipeline now in place ([ADR 0004](0004-supabase-migrations-as-source.md)): table/column DDL is generated from `schema.prisma` via `yarn db:new`; RLS on the new tables is hand-added to that migration (Prisma cannot express it). Keeping the logic in app code rather than the database is consistent with the target principle — *Drizzle for 90% CRUD* — and means the later Drizzle migration touches only the ORM, not a body of stored procedures.

Assigned seating (per-unit inventory rows + `FOR UPDATE SKIP LOCKED`) is explicitly **not** built — events are general-admission only for the foreseeable future.

Assigned seating (per-unit inventory rows + `FOR UPDATE SKIP LOCKED`) is explicitly **not** built — events are general-admission only for the foreseeable future.

## Consequences

- **Good:** all three P1 bugs are eliminated structurally, not patched. One source of truth for availability. Forward-compatible with the Drizzle/Supabase migration. No throwaway lock code, and no stored procedures to carry forward.
- **Trade-off:** larger change than three patches, touching the schema. Mitigated by phasing into reviewable PRs (shared Stripe client → additive schema → checkout cutover → organizer reads → cleanup) and by deploying the cutover in a low-traffic window. The additive-schema PR is behavior-neutral — it only adds columns and writes no data.
- **Risk accepted:** the in-place cutover runs a single backfill sweep over existing rows — `capacity`, `priceCents`, the `startsAt`/`endsAt` combines, Orders cents + `type`, `sold` from `quantitySold` — and seeds `reserved` from in-flight PENDING holds, all in the low-traffic window after old code stops writing and before new code serves reads. Because that sweep leaves no NULL rows and post-cutover rows are written by the new code, reads use the new columns directly — no `COALESCE` fallback. `sold`/`reserved` are the only values that *must* be in that atomic window (they are counters); the rest of the sweep is static. Done in place (not strangler/parallel-run) per owner decision, with a brief checkout pause during the seed+switch.
- **Deferred:** Drizzle (P4.1), Supabase Auth (P4.2), webhook → App Router (P3.2), full transactional email service (P4.4 — a minimal outbox only), Stripe Connect, and cosmetic table/field renames.
