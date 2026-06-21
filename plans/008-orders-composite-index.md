# Plan 008: Add the Orders(eventId, status) composite index

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4a435eae..HEAD -- packages/db/prisma/schema.prisma supabase/migrations`
> On drift, re-read the Orders model before proceeding.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (purely additive index; migration pipeline is established)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `4a435eae`, 2026-06-12
- **Issue**: https://github.com/TropTix/troptix/issues/313

## Why this matters

The hottest order queries all filter on `eventId` **and** `status` together — the organizer orders API, the orders page, the dashboard aggregations, and the checkout-config availability math (which counts tickets through `order: { status: ... }`). The `Orders` table has only single-column indexes on `[eventId]` and `[userId]`; Postgres must scan all of an event's orders and post-filter by status. Cheap now, linearly worse with every event. A composite `(eventId, status)` index serves both predicates with one seek and also covers plain `eventId` lookups (leftmost prefix).

## Current state

- `packages/db/prisma/schema.prisma:145-189` — the `Orders` model ends with:

```prisma
  @@index([eventId])
  @@index([userId])
}
```

- Query evidence: `apps/web/src/app/api/organizer/orders/[eventId]/route.ts:38-42` (`where: { eventId, status: 'COMPLETED' }`); the organizer orders page and `getDashboardData.ts` use the same pair; `apps/web/src/app/api/checkout/config/route.ts` and `apply-code/route.ts` count tickets via nested `order: { status: ... }` filters.
- **Migration convention (ADR 0004 — must follow)**: plain SQL in `supabase/migrations/` is the source of truth; the Prisma schema mirrors it. The generator script exists: `yarn workspace web db:new <name>` runs `prisma migrate diff` and writes `supabase/migrations/<timestamp>_<name>.sql` from the schema delta (see `apps/web/scripts/new-migration.ts` header). It needs `POSTGRES_URL_NON_POOLING` in `apps/web/.env` (the direct connection to the branch DB).
- Existing migration to use as a format exemplar: `supabase/migrations/20260610172754_add_user_authuserid.sql`.

## Commands you will need

| Purpose                  | Command                                                   | Expected on success                              |
| ------------------------ | --------------------------------------------------------- | ------------------------------------------------ |
| Typecheck                | `yarn typecheck`                                          | exit 0                                           |
| Generate migration       | `yarn workspace web db:new add_orders_event_status_index` | writes one SQL file under `supabase/migrations/` |
| Apply (local/dev branch) | `yarn workspace web db:apply`                             | exit 0                                           |

## Scope

**In scope**:

- `packages/db/prisma/schema.prisma` — `Orders` model: replace `@@index([eventId])` with `@@index([eventId, status])` (keep `@@index([userId])`)
- One new file under `supabase/migrations/`

**Out of scope**:

- Indexes on `Tickets` — plausible but unverified against real query plans; deliberately deferred (see Maintenance notes).
- Any other schema change, rename, or the cents-columns work (owned by the cutover plans).

## Git workflow

- Branch: `advisor/008-orders-index`
- One commit containing schema + migration together. Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Update the Prisma schema

In `packages/db/prisma/schema.prisma`, `Orders` model: change `@@index([eventId])` → `@@index([eventId, status])`. (The composite's leftmost prefix covers the old single-column lookups, so dropping the standalone eventId index is correct, not just tidy.)

**Verify**: `yarn typecheck` → exit 0 (regenerates/validates the client).

### Step 2: Generate the SQL migration

Run `yarn workspace web db:new add_orders_event_status_index`. Inspect the emitted file — expected content shape:

```sql
DROP INDEX "Orders_eventId_idx";
CREATE INDEX "Orders_eventId_status_idx" ON "Orders"("eventId", "status");
```

(Exact index names come from Prisma's convention; trust the generator's output, but confirm it contains exactly one DROP INDEX and one CREATE INDEX on "Orders" and nothing else. If it emits unrelated DDL, the schema and the database have drifted — STOP.)

**Verify**: the new file exists in `supabase/migrations/` and contains only the two statements above.

### Step 3: Apply to the dev branch

If `apps/web/.env` is configured (developer machine): `yarn workspace web db:apply` → exit 0. If no DB env is available (CI-like environment), skip and state so in your summary — the migration applies via Supabase git-sync on merge (ADR 0006).

**Verify**: command exit 0, or an explicit note that apply was environment-blocked.

## Test plan

No new code tests (schema-only). Optional evidence if a DB is available: `EXPLAIN` the organizer orders query before/after and confirm the new index is chosen (`Index Scan using "Orders_eventId_status_idx"`). Include the plan output in your summary if you ran it.

## Done criteria

- [ ] `schema.prisma` Orders has `@@index([eventId, status])` and no standalone `@@index([eventId])`
- [ ] Exactly one new migration file with the DROP + CREATE pair
- [ ] `yarn typecheck` exits 0
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `db:new` emits DDL beyond the two index statements (schema↔DB drift — needs human reconciliation).
- The `Orders` model already has a composite index including `status` (someone got here first — mark plan DONE/REJECTED accordingly).
- `db:new` fails for env reasons and you cannot hand-write the migration with full confidence in the index names Prisma expects — report rather than guessing names (a name mismatch makes future `migrate diff` output noisy forever).

## Maintenance notes

- Deferred follow-up: a composite on `Tickets(eventId, status)` (the attendees page filters this pair through a join) — verify with `EXPLAIN ANALYZE` on production-scale data before adding; index selectivity on `status` there is less certain.
- The reservation cutover's new tables already carry status/expiry indexes — no action needed there.
- Reviewer: confirm the migration was generated by the script (timestamp format matches siblings), not hand-written.
