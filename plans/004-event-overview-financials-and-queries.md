# Plan 004: Correct event-overview financials (fake 3% fee) and bound its queries; add the missing `organizerUserId` index

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7f9a947f..HEAD -- 'apps/web/src/app/organizer/events/[eventId]/_lib/getEventOverview.ts' 'apps/web/src/app/organizer/events/[eventId]/page.tsx' packages/db/prisma/schema.prisma`
> On drift, compare "Current state" excerpts before proceeding; mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (changes numbers organizers see; requires a DB migration for the index)
- **Depends on**: none
- **Category**: bug + perf
- **Planned at**: commit `7f9a947f`, 2026-07-01

## Why this matters

The event overview page shows organizers a "net revenue" computed as `totalRevenue * 0.97` with the comment "Assuming 3% platform fee" — but the platform's actual fee model (`apps/web/src/lib/fees.ts`) is 8% + $0.50 per ticket + 15% tax on fees, and fees can be either absorbed by the organizer or passed to the attendee per ticket type (`ticketingFees`). The displayed number is fabricated and wrong in both directions. Separately, the same fetcher loads **every** completed order for the event just to render five recent orders and compute sums JS-side, and the `Events` table has no index on `organizerUserId` even though every organizer-surface query filters on it (only `organizationId` is indexed).

## Current state

- `apps/web/src/app/organizer/events/[eventId]/_lib/getEventOverview.ts` — the event-overview fetcher.
  - Lines 152–178: `prisma.events.findUnique` with `include.orders` (where COMPLETED, `orderBy createdAt desc`) — **no `take`**; all completed orders are loaded.
  - Lines 216–227:

    ```ts
    const totalRevenue = eventData.orders.reduce(
      (sum, order) => sum + (order.subtotal ?? 0),
      0
    );
    const totalOrders = eventData.orders.length;

    const financials: EventFinancials = {
      totalRevenue,
      netRevenue: totalRevenue * 0.97, // Assuming 3% platform fee
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      totalOrders,
    };
    ```

  - Lines 230–233: `totalSold` reduced from the same full order list.
  - Recent orders are consumed as a slice later in the file (search `recentOrders`) and rendered on `apps/web/src/app/organizer/events/[eventId]/page.tsx`.

- `apps/web/src/lib/fees.ts` — `FeeConfig` (8% + $0.50, 15% tax) and `calculateFees(price)`. The order's `subtotal` is the ticket revenue; whether fees were added on top or deducted depends on each ticket type's `ticketingFees` (`PASS_TICKET_FEES` = attendee pays fees; `ABSORB_TICKET_FEES` = organizer absorbs).
- `packages/db/prisma/schema.prisma` — `Events` model: fields include `organizerUserId String` and `organizationId String?`; the only index is `@@index([organizationId])`. `Orders` has `@@index([eventId])` and `@@index([userId])`.
- Migration workflow (ADR 0004 + recent commit `9d9b36d4`): migrations are generated via `yarn --cwd apps/web db:new` (offline schema-to-schema diff) — read `apps/web/scripts/new-migration.ts` before using; migrations live in `supabase/`.
- Existing aggregate exemplar: `apps/web/src/app/organizer/_lib/getDashboardData.ts:25–40` uses `prisma.orders.aggregate({ _sum: { subtotal: true }, where: ... })` — match this pattern.

## Commands you will need

| Purpose       | Command                               | Expected on success    |
| ------------- | ------------------------------------- | ---------------------- |
| Typecheck     | `yarn --cwd apps/web typecheck`       | exit 0                 |
| Lint          | `yarn --cwd apps/web lint`            | exit 0                 |
| Tests         | `yarn --cwd apps/web test`            | all pass               |
| Prisma client | `yarn workspace @troptix/db generate` | exit 0                 |
| New migration | `yarn --cwd apps/web db:new`          | migration file created |

## Scope

**In scope**:

- `apps/web/src/app/organizer/events/[eventId]/_lib/getEventOverview.ts`
- `apps/web/src/app/organizer/events/[eventId]/page.tsx` (only if a label/tooltip change is needed for the financials card)
- `packages/db/prisma/schema.prisma` (index only)
- New migration file under `supabase/` produced by the migration script
- `apps/web/src/app/organizer/events/[eventId]/_lib/getEventOverview.test.ts` (create)

**Out of scope**:

- `apps/web/src/lib/fees.ts` — use it, don't change it.
- `getDashboardData.ts`, `getPlatformEventsData.ts` — their own inefficiencies are absorbed by plan 005's service cutover.
- The REST orders route payload — plan 002 notes it; mobile client depends on shape.
- Any pricing/schema change (`priceCents` etc. — roadmap 2.12).

## Git workflow

- Branch: `advisor/004-event-overview-financials`.
- Conventional commits, e.g. `fix(organizer): compute net revenue from real fee config` / `perf(db): index Events.organizerUserId`.
- No push/PR unless instructed. No `--no-verify`.

## Steps

### Step 1: Decide the honest financials display (bounded decision, no user input needed)

The truly correct per-order net requires joining each order's tickets to their ticket types' `ticketingFees` mode. That data is not in the current query and would re-broaden it. Implement the honest middle ground:

- Rename the displayed concept from fabricated "net revenue" to **gross ticket revenue** (`totalRevenue`, already correct — sum of subtotals) and REMOVE the `netRevenue: totalRevenue * 0.97` field.
- If `page.tsx` renders `netRevenue` (search `netRevenue` in `apps/web/src/app/organizer/events/[eventId]/page.tsx`), change that card to show `totalRevenue` labeled "Ticket revenue" with a muted sub-label "before fees & refunds".

**Verify**: `grep -rn "0.97\|netRevenue" apps/web/src/app/organizer` → no matches.

### Step 2: Bound the order fetch and move sums to aggregates

Restructure `getEventOverview`:

1. In the `findUnique` include, keep `ticketTypes` but change `orders` to `take: 5` (it is already `orderBy: { createdAt: 'desc' }`) — these become `recentOrders` directly.
2. Add to the existing `Promise.all`-able section (alongside the `dailyRevenue` groupBy at lines 185–194):
   - `prisma.orders.aggregate({ where: { eventId, status: OrderStatus.COMPLETED }, _sum: { subtotal: true }, _count: true })` → `totalRevenue`, `totalOrders`.
   - `prisma.tickets.count({ where: { eventId, order: { status: OrderStatus.COMPLETED } } })` → `totalSold` (replaces the JS reduce over `_count.tickets`; match the pattern at `getDashboardData.ts:34–40`).
3. Keep the returned object shape otherwise identical (minus `netRevenue`) so `page.tsx` changes stay minimal.

**Verify**: `yarn --cwd apps/web typecheck` → exit 0; the `orders` include contains `take: 5`.

### Step 3: Add the missing index

In `packages/db/prisma/schema.prisma`, `Events` model, add `@@index([organizerUserId])` next to the existing `@@index([organizationId])`. Optionally (same migration) add `@@index([eventId, status])` to `Orders` — the aggregate in step 2 and the dashboard queries filter on exactly that pair.

Then: `yarn workspace @troptix/db generate` → exit 0, and generate the migration with `yarn --cwd apps/web db:new` (read `apps/web/scripts/new-migration.ts` first; follow its prompts/args). Do NOT apply the migration to any remote database — generation only; note in your report that `db:apply` is the operator's step.

**Verify**: new SQL file under `supabase/` contains `CREATE INDEX` on `"organizerUserId"`.

### Step 4: Tests

Create `getEventOverview.test.ts` with a fake prisma (jest mock module pattern per plan 001; assert on call arguments):

1. `orders` include carries `take: 5`.
2. `totalRevenue`/`totalOrders` come from the aggregate result, not a reduce (mock aggregate → `{ _sum: { subtotal: 123 }, _count: 4 }` and assert output).
3. Returned financials object has no `netRevenue` key.

**Verify**: `yarn --cwd apps/web test --testPathPattern=getEventOverview` → all pass.

## Done criteria

- [ ] `yarn --cwd apps/web typecheck`, `lint`, `test` all exit 0
- [ ] `grep -rn "0.97" apps/web/src/app/organizer` → no matches
- [ ] `getEventOverview.ts` fetches at most 5 orders via the include; sums come from `aggregate`/`count`
- [ ] `schema.prisma` has `@@index([organizerUserId])` on `Events`; migration file generated (not applied)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `page.tsx` renders `netRevenue` in more places than a single card, or another file imports `EventFinancials.netRevenue` (search `netRevenue` repo-wide) — the display decision needs owner sign-off beyond one card.
- The migration script (`scripts/new-migration.ts`) requires a live database connection you don't have — generate nothing; report the schema diff instead.
- `Orders.subtotal` turns out to be nullable-with-meaning (e.g. null ≠ 0 for comp orders) in a way that changes the aggregate semantics vs the old reduce (`?? 0`) — compare and report if aggregate ignores nulls differently.

## Maintenance notes

- Real net-revenue reporting (per-order fee attribution using `ticketingFees` mode) is a worthwhile follow-up once money moves to integer cents (roadmap 2.12); this plan removes the lie, it doesn't build the full ledger.
- Plan 005 will eventually relocate this fetcher into `packages/api` services; the aggregate shape introduced here ports directly.
- Reviewer should scrutinize: the financials card copy, and that recent-orders rendering is unchanged with the `take: 5`.
