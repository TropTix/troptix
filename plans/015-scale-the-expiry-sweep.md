# Plan 015: Make the reservation expiry sweep bounded, overlap-safe, and index-backed

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`, and post a short progress comment on the
> tracking issue (#460) when you start and finish.
>
> **Drift check (run first)**: `git diff --stat abab1702..HEAD -- packages/api/src/services/payments.ts packages/api/src/services/reservations.ts packages/db/prisma/schema.prisma`
> If any changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: 008 (a trustworthy test baseline helps; not a hard block)
- **Category**: performance / scalability
- **Planned at**: commit `abab1702`, 2026-07-18
- **Issue**: https://github.com/TropTix/troptix/issues/460

## Why this matters

The expiry sweep (`sweepExpiredHolds`, run by the `expire-reservations` cron) is
the flow's clearest scaling ceiling. It (a) `findMany`s **all** expired holds
with no limit, then (b) processes them in a strictly sequential `for` loop, each
iteration doing one **awaited** `stripe.checkout.sessions.expire` round-trip
followed by its own transaction. Throughput is roughly one hold per Stripe
round-trip — a few per second. A backlog (cron was down, or a spike of
armed-but-abandoned paid holds) is drained serially and a single run can exceed
the function timeout, leaving inventory starved. There is also **no overlap
guard**: if a run overruns its interval and the next fires, both load the same
expired set and make duplicate `sessions.expire` calls (releases stay idempotent,
but the work is wasted). Finally, the sweep's predicate (`status = HELD AND
expiresAt < now`) has only two single-column indexes, not the composite it needs.
This plan bounds each run, prevents overlapping runs from colliding, parallelizes
the Stripe calls within safe limits, and adds the composite index — **without
changing the ADR-0018 cancel-then-release ordering.**

## Current state

- `packages/api/src/services/payments.ts:327-355` — `sweepExpiredHolds`,
  unbounded + sequential:

```ts
export async function sweepExpiredHolds(prisma, stripe, now = new Date()) {
  const expired = await prisma.reservation.findMany({
    // ← no take: unbounded
    where: { status: ReservationStatus.HELD, expiresAt: { lt: now } },
    select: { id: true, stripeCheckoutSessionId: true },
  });
  let released = 0,
    keptLive = 0;
  for (const reservation of expired) {
    // ← strictly sequential
    if (reservation.stripeCheckoutSessionId) {
      try {
        await stripe.checkout.sessions.expire(
          reservation.stripeCheckoutSessionId
        );
      } catch {
        // ← awaited per hold
        keptLive++;
        continue;
      } // ← cancel-then-release: keep on failure
    }
    if (await expireHold(prisma, reservation.id)) released++;
  }
  return { released, keptLive };
}
```

**The cancel-then-release ordering (expire the Session BEFORE releasing
inventory, and DON'T release if expire throws) is load-bearing per ADR 0018 —
preserve it exactly.**

- `packages/api/src/services/reservations.ts:653-660` — `expireHold` (per-hold
  transaction, re-checks HELD; idempotent).

- `packages/db/prisma/schema.prisma:390-392` — the `Reservation` indexes:

```prisma
  @@index([eventId])
  @@index([status])       // ← single-column
  @@index([expiresAt])    // ← single-column; the sweep needs (status, expiresAt)
```

- Migration flow (CLAUDE.md → "Database changes"): schema changes ship via
  `yarn db:new` → review SQL → `yarn db:apply`, and **you must update
  `supabase/seed.sql` to match** if you touch columns the seed inserts (an index
  add does not change inserted columns, so the seed likely needs no change — but
  confirm).
- Test harness: `packages/api/src/services/payments.test.ts` already tests the
  sweep's cancel-then-release ordering and the expire-throws branch
  (`fakeStripe` with `expireThrows`). Reuse it. It sets
  `vitest.config.ts` `fileParallelism: false` because the sweep scans the whole
  `Reservation` table — keep that.

## Design decisions (do these, don't improvise)

1. **Bound each run**: `findMany({ ..., take: BATCH, orderBy: { expiresAt: 'asc' } })`
   with `BATCH` a named constant (e.g. 200). Loop the sweep until a run returns
   fewer than `BATCH` rows (drain), OR just process one batch per invocation and
   let the cron cadence drain over time — **choose one and document it**. Prefer:
   process up to a bounded number of batches per invocation (e.g. cap total work
   so a single run can't exceed the function timeout), logging if more remain.
2. **Overlap guard**: take a Postgres **advisory lock** at the start of the sweep
   (`pg_try_advisory_lock(<constant key>)`); if not acquired, return early
   (another run holds it). Release it at the end (`pg_advisory_unlock`). This
   prevents two overlapping cron runs from doing duplicate Stripe work. (Do NOT
   use `FOR UPDATE SKIP LOCKED` row-claiming as the primary mechanism unless you
   also keep cancel-then-release intact — the advisory lock is simpler and
   safer here.)
3. **Bounded parallelism on the Stripe calls**: within a batch, run the
   per-hold cancel-then-release with a small concurrency cap (e.g. 5–10 at a
   time) instead of strictly sequential — but each hold still expires its Session
   _before_ releasing its own inventory. Do not release any hold whose
   `sessions.expire` rejected. A simple bounded-concurrency helper (chunks of N
   processed with `Promise.all`, or a tiny pool) is fine; do not add a heavy
   dependency.
4. **Composite index**: add `@@index([status, expiresAt])` to `Reservation`.
   Consider dropping the now-redundant single-column `@@index([status])` /
   `@@index([expiresAt])` **only if** nothing else relies on them
   (`grep -rn "expiresAt\|status" packages/api/src/services` and check other
   queries) — if unsure, keep them; an extra index is cheap.

## Commands you will need

| Purpose                 | Command                                     | Expected on success               |
| ----------------------- | ------------------------------------------- | --------------------------------- |
| New migration           | `yarn db:new` (then review generated SQL)   | creates a migration for the index |
| Apply migration (local) | `yarn db:apply`                             | applies to local/preview DB       |
| Sweep tests             | `yarn workspace @troptix/api test payments` | all pass (needs Postgres)         |
| Full API tests          | `yarn workspace @troptix/api test`          | all pass                          |
| Typecheck               | `yarn typecheck`                            | exit 0                            |

## Scope

**In scope**:

- `packages/api/src/services/payments.ts` (`sweepExpiredHolds`: batch, advisory
  lock, bounded parallelism — preserving cancel-then-release)
- `packages/db/prisma/schema.prisma` (composite index) + the generated migration
  under `supabase/migrations/`
- `supabase/seed.sql` — only if the index change requires it (an index add
  usually does not; verify)
- `packages/api/src/services/payments.test.ts` (batch cap + overlap-guard tests)

**Out of scope** (do NOT touch):

- The ADR-0018 cancel-then-release semantics — behavior must be identical, just
  bounded/parallelized.
- `materializeOrder`'s per-unit ticket rows (that large-order scaling concern is
  a separate finding/plan, F10 — not this one).
- The `expire()` / `expireHold()` primitives' contracts — reuse them.
- The cron route handler's auth (already correct).

## Git workflow

- Branch: `advisor/015-scale-expiry-sweep`
- Commit per logical unit (index migration; then sweep changes); Conventional
  Commits, e.g. `perf(checkout): bound + overlap-guard the expiry sweep`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add the composite index via a migration

Add `@@index([status, expiresAt])` to the `Reservation` model in `schema.prisma`.
Generate the migration with `yarn db:new`, review the SQL (it should be a single
`CREATE INDEX`), and confirm `supabase/seed.sql` needs no change (no new
columns).

**Verify**: `yarn db:apply` succeeds locally; `yarn workspace @troptix/db typecheck`
exits 0.

### Step 2: Bound the sweep query

Add `take: BATCH` and `orderBy: { expiresAt: 'asc' }` to the `findMany`. Decide
and document (in a comment) the drain strategy per design decision 1.

**Verify**: `yarn typecheck` → exit 0.

### Step 3: Add the advisory-lock overlap guard

Wrap the sweep body in `pg_try_advisory_lock`/`pg_advisory_unlock` (via
`prisma.$queryRaw`). If the lock isn't acquired, return `{ released: 0, keptLive: 0 }`
(or a distinct `skipped: true`) immediately. Ensure the unlock runs in a `finally`.

**Verify**: `yarn typecheck` → exit 0.

### Step 4: Bounded parallelism, ordering preserved

Replace the strict sequential loop with chunked/bounded-concurrency processing,
where each hold: (1) if it has a Session, `sessions.expire` first; (2) only on
success, `expireHold`; (3) on expire failure, count `keptLive` and skip release.
Keep `released`/`keptLive` accounting correct under concurrency (use atomic
counters / reduce results).

**Verify**: `yarn workspace @troptix/api test payments` → the existing
cancel-then-release and expire-throws tests still pass unchanged.

### Step 5: Test the new bounds

In `payments.test.ts`, add: (a) with more than `BATCH` expired holds, one run
processes at most the cap (assert count / that a second run picks up the rest);
(b) the overlap guard returns early when the advisory lock is held (simulate by
taking the lock in the test's own connection, or assert the guard code path).
Reuse the existing fixture + `fakeStripe`.

**Verify**: `yarn workspace @troptix/api test payments` → all pass including new
cases.

## Test plan

- New tests: batch cap bounds a single run; overlap guard short-circuits;
  cancel-then-release ordering and expire-throws behavior **unchanged** (the
  existing tests must still pass verbatim — that's the regression guard for the
  ADR invariant).
- Model after the existing sweep tests in
  `packages/api/src/services/payments.test.ts`.
- Verification: `yarn workspace @troptix/api test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `Reservation` has `@@index([status, expiresAt])`; a migration exists under
      `supabase/migrations/`
- [ ] `sweepExpiredHolds` uses `take` + an advisory-lock overlap guard + bounded
      concurrency
- [ ] The existing cancel-then-release / expire-throws tests pass **unchanged**
- [ ] New batch-cap and overlap-guard tests pass
- [ ] `yarn workspace @troptix/api test` exits 0
- [ ] `yarn typecheck` exits 0
- [ ] `supabase/seed.sql` reviewed (changed only if required)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Preserving cancel-then-release under bounded parallelism proves subtle enough
  that you can't guarantee "never release a hold whose Session expire failed" —
  fall back to sequential-but-batched (still a win) and report.
- `yarn db:new`/`yarn db:apply` isn't available or the migrations pipeline
  differs from `docs/plans/2026-06-migrations-adoption.md` — report before
  hand-writing SQL.
- The advisory-lock approach conflicts with how the cron is scheduled (e.g.
  Supabase `pg_cron` already serializes runs) — verify against
  `docs/runbooks/expire-reservations-cron.md`; if runs are already serialized,
  the overlap guard may be redundant (still cheap to keep).

## Maintenance notes

- If ticket volume grows further, the next bottleneck is `materializeOrder`
  building one `Tickets` row per unit inside the confirm/settle transaction
  (finding F10) — plan that separately.
- The advisory-lock key must be a stable constant shared only by this sweep;
  document it so a future second sweep doesn't collide.
- A reviewer should focus on the ordering invariant under concurrency (the ADR
  0018 guarantee) and on the counters being correct when calls run in parallel.
