---
title: Checkout / Inventory / Payment — Reservation-Based Rebuild
status: proposed
created: 2026-06-02
tracking-issue: TBD
---

# Checkout / Inventory / Payment — Reservation-Based Rebuild

Spec and phased plan for replacing the inventory accounting model with a reservation-based design. Realizes roadmap **P4.3** (reservation checkout) and the **P2** schema corrections the checkout depends on, executed now on the current Prisma + Postgres stack. Backing decision: [ADR 0007](../adr/0007-reservation-based-checkout.md). Schema/function changes ship through the Supabase migrations pipeline ([ADR 0004](../adr/0004-supabase-migrations-as-source.md), [migrations-adoption plan](2026-06-migrations-adoption.md)). Roadmap context: [`roadmap.md`](../roadmap.md) Priority 1 (bugs 1.1–1.3), Priority 2, Priority 4.3.

## Context

TropTix is **live and serving real events**. The three Priority-1 bugs — overselling race (1.1), non-atomic payment confirmation (1.2), Stripe version drift (1.3) — are symptoms of **one root cause: the inventory accounting model.**

Verified current state:
- A mutable `quantitySold` counter is incremented in two places (free path inline in `apps/web/src/app/api/checkout/initiate/route.ts:328`, paid path in `apps/web/src/pages/api/stripe/webhook.ts:146`) and **never decremented on expiry**.
- "Availability" is computed live as `quantity − completedTickets − pendingTickets` by counting `Tickets` rows (`validateTicketType`, `initiate/route.ts:411`), while the organizer dashboard reads the *counter* (`getEventOverview.ts`) — **two disagreeing sources of truth**.
- A **PENDING `Orders` row is the implicit reservation**, so every availability read joins orders+tickets and special-cases PENDING.
- The 5-minute expiry cron (`apps/web/src/app/api/cron/invalidate-orders/route.ts`) cancels orders but **releases no inventory**.

Rather than three patches (a `FOR UPDATE` lock thrown away once reservations land, a webhook transaction, a shared client), we replace the model once. This is the forward-compatible foundation for the planned Drizzle/Supabase migration.

**Decisions (confirmed):** scope = checkout subsystem + the schema corrections it depends on (cosmetic renames deferred); sequencing = rebuild in place on Prisma+Postgres, not strangler; inventory = general-admission counter model.

---

## Target Design

### 1. Inventory: counter columns + atomic conditional decrement

Replace `quantitySold` with `capacity` (immutable total, rename of `quantity`), `reserved` (held by active reservations), `sold` (confirmed). **availability = `capacity − reserved − sold`**, read directly. Reserve is a single atomic statement issued inline from app code (no stored procedure):
```sql
UPDATE "TicketTypes"
SET reserved = reserved + :qty
WHERE id = :id AND (capacity - reserved - sold) >= :qty;  -- 0 rows => insufficient stock
```
Correct at READ COMMITTED — **structurally eliminates bug 1.1**, no lock or retry loop. `reserve()` clamps to available per type and returns granted quantities, preserving the "wasAdjusted" UX.

### 2. Explicit reservation, not a PENDING order

```
Reservation { id, eventId, status (HELD|CONVERTED|EXPIRED|RELEASED),
              expiresAt, stripePaymentIntentId? @unique, orderId?,
              email, firstName, lastName, userId?, createdAt, updatedAt }
ReservationItem { id, reservationId, ticketTypeId, quantity, unitPriceCents, feesCents }
```
`Order` + `OrderTicket` are materialized only on payment success. Availability reads never touch orders again.

### 3. Payment confirmation: single source of truth, atomic + idempotent

`confirm()` — a Prisma `$transaction` in `reservations.ts` (not a stored procedure): find HELD reservation by payment-intent id (**already CONVERTED → no-op**, the idempotency guard for Stripe's at-least-once delivery); `reserved -= q; sold += q` per item; create `Order` + `OrderTicket`s (status VALID); mark reservation CONVERTED; insert an outbox row for the confirmation email (sent after commit / by cron drain — never inside the txn). **Eliminates bug 1.2** and the double-increment hazard.

### 4. Expiry releases inventory

`expire(now)` (a Prisma transaction called by the repurposed cron): for each HELD reservation past `expiresAt`, `reserved -= q` per item, mark EXPIRED. Idempotent; lazy release on read supported.

### 5. Stripe client

New `apps/web/src/server/lib/stripe.ts`: one shared client, `apiVersion: '2023-10-16'` (matches installed `stripe@14.25.0` `LatestApiVersion` — drops every `@ts-ignore`). Idempotency key = reservation id on `paymentIntents.create`. **Eliminates bug 1.3.** Leave the ephemeral-key `2020-08-27` (`pages/api/stripe/index.ts:99`) independent — it must match the mobile Stripe SDK.

### 6. The atomic hold — no stored procedures

The only operation needing a database-level atomicity guarantee is the inventory hold, and it is a single conditional `UPDATE` issued inline from app code (no plpgsql):

```sql
UPDATE "TicketTypes" SET "reserved" = "reserved" + $n
WHERE id = $id AND "capacity" - "reserved" - "sold" >= $n;   -- 0 rows ⇒ sold out
```

Atomic at READ COMMITTED — the `UPDATE` row-locks and re-checks the predicate against the committed row, so two concurrent buyers of the last ticket can't both win. A multi-item reservation runs one such `UPDATE` per ticket type inside a single Prisma `$transaction`; if any affects 0 rows the whole transaction rolls back. `reserve` / `confirm` / `release` / `expire` all live in `server/lib/reservations.ts` as Prisma transactions — typed and unit-testable, not plpgsql. See [ADR 0007](../adr/0007-reservation-based-checkout.md).

### 7. Schema corrections the checkout depends on

| Change | Why required here |
|---|---|
| Money → integer **cents** | Exact Stripe amounts + inventory math; removes `Math.round`/`toFixed` hacks. |
| `startsAt`/`endsAt`, `saleStartsAt`/`saleEndsAt` | Reservation checks the sale window; split date/time today **ignores the time** (`initiate/route.ts:394`) — a real bug. |
| Ticket statuses → `VALID`/`USED`/`CANCELLED`/`REFUNDED` + `checkinTimestamp` | `AVAILABLE`/`NOT_AVAILABLE` is overloaded (unpaid vs scanned); scan/check-in toggles the same flag. |
| Order-level `type` (FREE/PAID/COMPLEMENTARY) | One reservation→confirm path for all order kinds. |

**Deferred** (companion rename sweep, no behavior change): table/field renames, dropping dead tables, `discountCode`→`password`, `organizer`→`hostName`, dropping redundant `name`.

---

## Files & Consumers

**New:** `apps/web/src/server/lib/stripe.ts` (shipped, PR #279); `apps/web/src/server/lib/reservations.ts` — `reserve`/`confirm`/`release`/`expire` as Prisma transactions (the hold is an inline conditional `UPDATE`); Supabase migrations under `supabase/migrations/` — DDL + RLS only (additive in Phase A; the data backfill happens at cutover; drops in cleanup), no functions.

**Checkout path:**
- `app/api/checkout/initiate/route.ts` → "create reservation": call `reserve()`, create PaymentIntent (idempotency key = reservation id), return `reservationId` + `clientSecret` + granted quantities. Delete PENDING-order creation, `validateTicketType` stock math, `getPrismaCreateOrderPayload`. Free orders run `reserve()` → `confirm()` synchronously.
- `app/api/checkout/config/route.ts`, `app/api/checkout/apply-code/route.ts` → availability = `capacity − reserved − sold` (drop order-counting). Response shape unchanged.
- **New** `app/api/stripe/webhook/route.ts` (App Router; raw body via `req.text()`, drops `micro`) → `confirm()`; idempotency via `ProcessedStripeEvent`; email from outbox after commit; `payment_failed` → `release()`. **Delete** the Pages-Router `pages/api/stripe/webhook.ts` + the `orderHelper` increment helpers.
- `app/api/cron/invalidate-orders/route.ts` → call `expire()` (releases held inventory) + drain the outbox.

**Organizer reads:**
- `getEventOverview.ts` + tickets page → read `sold` (+ optionally `reserved`); revenue from completed Orders.
- `app/api/organizer/tickets/scan/route.ts`, `check-in/route.ts` → set `USED` + `checkinTimestamp`.
- Complementary tickets (`orderHelper.ts:113`) → reservation of `type=COMPLEMENTARY` incrementing `sold`.

**Client:** `CheckoutContainer.tsx` / `payment-form.tsx` keep Stripe Elements `confirmPayment` but hold a **`reservationId`** (not an order id), since the Order is materialized only on webhook `confirm`. Post-payment URLs key off the reservation. The **confirmation page** is already async-safe (reads Stripe PaymentIntent state, no DB lookup). The **receipt + order-details pages** look the order up synchronously today and 404 if missing — they must instead resolve the order via the reservation and **poll / show a "processing" state until the webhook converts it** (the order page already has a "Hold tight, processing" state to reuse).

---

## Phases (one PR each)

- **PR 1 — Shared Stripe client (shipped, PR #279).** One `server/lib/stripe.ts` pinned to `2023-10-16`, replacing three ad-hoc clients; root fix for bug 1.3.
- **Phase A — Schema foundation (shipped, PR #284).** Additive `schema.prisma` (new columns `capacity`/`reserved`/`sold`, `*Cents`, `startsAt`/`endsAt`/`saleStartsAt`/`saleEndsAt`, order `type`, `checkinTimestamp`, new `TicketStatus` values; new tables `Reservation`/`ReservationItem`/`OutboxMessage`/`ProcessedStripeEvent`) generated via `yarn db:new`, with RLS on the new tables hand-appended (per the #281 convention). **No stored functions, no backfill** (deferred to the cutover). Old columns retained; all new columns nullable or defaulted ⇒ behavior-neutral.
- **Phase B — Cut over checkout (fixes 1.1 + 1.2).** The live-flow change. **Headline contract change:** the Order is materialized only on webhook `confirm`, so `/initiate` returns a `reservationId` and post-payment pages key off it (see *Client*, above). Split into reviewable sub-PRs:
  - **B1** — `server/lib/reservations.ts` (`reserve`/`confirm`/`release`/`expire`) + jest harness (jest is referenced in `package.json` but not installed) + concurrency / idempotency / expire tests against the preview branch. *(isolated, no wiring — safest first)*
  - **B2** — server cutover: `/initiate` → `reserve()`; `/config` + `/apply-code` → `capacity − reserved − sold`; webhook → App Router + `confirm()`; cron → `expire()`.
  - **B3** — client: reservation-aware URLs + receipt/order polling.
  - **B4** — cutover migration (backfill `sold ← quantitySold` + the static columns; seed `reserved` from in-flight PENDING holds) + the operational runbook.

  **Decisions:**
  1. **Async order id** — post-payment URLs use `reservationId`; receipt/order resolve the order via the reservation and poll while it's unconverted. Confirmation page unchanged (already async-safe).
  2. **Reservation TTL** — 10 minutes (the client may show a countdown).
  3. **Dashboard during transition** — `confirm()` dual-writes `quantitySold` alongside `sold`, so the organizer dashboard stays correct until Phase C swaps its read to `sold`. Keeps B and C decoupled.
  4. **Idempotency** — `ProcessedStripeEvent` (Stripe event id) **and** the reservation-status guard (both; cheap).
  5. **Cutover runbook** — run B4's sweep in a brief checkout-pause window so there are ~no in-flight PENDING orders to migrate; then deploy + resume. `reserved` is seeded then — the one genuine risk.
- **Phase C — Organizer reads.** Dashboard, scan/check-in, complementary path move to new columns/statuses.
- **Phase D — Cleanup.** Drop `quantitySold`/`quantity`/`price`/`startDate`/`startTime`/old statuses; remove dead code. Optional deferred rename sweep.

---

## Verification

- **Concurrency (headline):** integration test against the PR's **Supabase preview branch** (a real Postgres) — N concurrent `reserve()` for `capacity = 1`; assert exactly one grant, `reserved` never exceeds `capacity`.
- **Idempotency:** `confirm()` twice for one payment intent → `sold` increments once, one Order.
- **Expiry:** HELD reservation past `expiresAt` → `reserved` released, status EXPIRED.
- **Money:** cents round-trips with Stripe amounts (no float drift).
- **Sale window:** ticket with `saleStartsAt` later today is unavailable now.
- **E2E manual:** Stripe CLI `stripe listen --forward-to localhost:<port>/api/stripe/webhook` + `stripe trigger payment_intent.succeeded`; confirm reservation→order, one email, `sold` incremented; replay to confirm no double-count; two simultaneous `curl` checkouts on `capacity:1` → exactly one order.
- **Per PR:** `cd apps/web && npm run typecheck && npm test`.

## Out of scope

Drizzle (P4.1), Supabase Auth (P4.2), full transactional email service (P4.4 — minimal outbox only), Stripe Connect, cosmetic renames. (The webhook's Pages→App Router move, formerly deferred as P3.2, is folded into Phase B.) The design is forward-compatible with each.
