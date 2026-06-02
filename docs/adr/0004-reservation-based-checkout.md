# 4. Reservation-based checkout on the current stack

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

Take option 3. Replace the inventory model with a reservation-based design **now, on Prisma + Postgres**, using raw SQL and Postgres functions for the concurrency-critical operations (`reserve`, `confirm`, `release`, `expire`). General-admission **counter inventory** (`capacity` / `reserved` / `sold`) with an atomic conditional decrement (`UPDATE … WHERE capacity - reserved - sold >= n`); an explicit `Reservation` with a TTL; orders materialized only on payment success; an idempotent, atomic webhook as the single source of truth. Fold in only the schema corrections the checkout functionally depends on (integer cents, `startsAt`/`endsAt`, meaningful ticket statuses, order-level type, non-null `createdAt`).

This is consistent with the stated target architecture principle — *Drizzle for 90% CRUD, Postgres functions for concurrency-critical operations.* Authoring those functions on Prisma now makes the later Drizzle migration mechanical (the functions are stack-agnostic SQL).

Assigned seating (per-unit inventory rows + `FOR UPDATE SKIP LOCKED`) is explicitly **not** built — events are general-admission only for the foreseeable future.

## Consequences

- **Good:** all three P1 bugs are eliminated structurally, not patched. One source of truth for availability. Forward-compatible with the Drizzle/Supabase migration. No throwaway lock code.
- **Trade-off:** larger change than three patches, touching the schema. Mitigated by phasing into four reviewable PRs (additive migration → checkout cutover → organizer reads → cleanup) and by deploying the cutover in a low-traffic window.
- **Risk accepted:** the in-place cutover must seed the `reserved` counter from in-flight PENDING holds at switch time. Done in place (not strangler/parallel-run) per owner decision, with a brief checkout pause during the seed+switch.
- **Deferred:** Drizzle (P4.1), Supabase Auth (P4.2), webhook → App Router (P3.2), full transactional email service (P4.4 — a minimal outbox only), Stripe Connect, and cosmetic table/field renames.
