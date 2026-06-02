---
title: Checkout / Inventory / Payment — Reservation-Based Rebuild
status: proposed
created: 2026-06-02
tracking-issue: TBD
---

# Checkout / Inventory / Payment — Reservation-Based Rebuild

Spec and phased plan for replacing the inventory accounting model with a reservation-based design. Realizes roadmap **P4.3** (reservation checkout) and the **P2** schema corrections the checkout depends on, executed now on the current Prisma + Postgres stack. Backing decision: [ADR 0004](../adr/0004-reservation-based-checkout.md). Roadmap context: [`roadmap.md`](../roadmap.md) Priority 1 (bugs 1.1–1.3), Priority 2, Priority 4.3.

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

Replace `quantitySold` with `capacity` (immutable total, rename of `quantity`), `reserved` (held by active reservations), `sold` (confirmed). **availability = `capacity − reserved − sold`**, read directly. Reserve is a single atomic statement inside a Postgres function:
```sql
UPDATE "TicketTypes"
SET reserved = reserved + :qty
WHERE id = :id AND (capacity - reserved - sold) >= :qty;  -- 0 rows => insufficient stock
```
Correct at READ COMMITTED — **structurally eliminates bug 1.1**, no lock or retry loop. The function clamps to available per type and returns granted quantities, preserving the "wasAdjusted" UX.

### 2. Explicit reservation, not a PENDING order

```
Reservation { id, eventId, status (HELD|CONVERTED|EXPIRED|RELEASED),
              expiresAt, stripePaymentIntentId? @unique, orderId?,
              email, firstName, lastName, userId?, createdAt, updatedAt }
ReservationItem { id, reservationId, ticketTypeId, quantity, unitPriceCents, feesCents }
```
`Order` + `OrderTicket` are materialized only on payment success. Availability reads never touch orders again.

### 3. Payment confirmation: single source of truth, atomic + idempotent

`confirm_reservation()` in one transaction: find HELD reservation by payment-intent id (**already CONVERTED → no-op**, the idempotency guard for Stripe's at-least-once delivery); `reserved -= q; sold += q` per item; create `Order` + `OrderTicket`s (status VALID); mark reservation CONVERTED; insert an outbox row for the confirmation email (sent after commit / by cron drain — never inside the txn). **Eliminates bug 1.2** and the double-increment hazard.

### 4. Expiry releases inventory

`expire_reservations(now)` (called by the repurposed cron): for each HELD reservation past `expiresAt`, `reserved -= q` per item, mark EXPIRED. Idempotent; lazy release on read supported.

### 5. Stripe client

New `apps/web/src/server/lib/stripe.ts`: one shared client, `apiVersion: '2023-10-16'` (matches installed `stripe@14.25.0` `LatestApiVersion` — drops every `@ts-ignore`). Idempotency key = reservation id on `paymentIntents.create`. **Eliminates bug 1.3.** Leave the ephemeral-key `2020-08-27` (`pages/api/stripe/index.ts:99`) independent — it must match the mobile Stripe SDK.

### 6. Postgres functions (concurrency-critical core)

Authored as raw SQL in Prisma migrations, called via `$queryRaw`/`$executeRaw`: `reserve_tickets`, `confirm_reservation`, `release_reservation`, `expire_reservations`.

### 7. Schema corrections the checkout depends on

| Change | Why required here |
|---|---|
| Money → integer **cents** | Exact Stripe amounts + inventory math; removes `Math.round`/`toFixed` hacks. |
| `startsAt`/`endsAt`, `saleStartsAt`/`saleEndsAt` | Reservation checks the sale window; split date/time today **ignores the time** (`initiate/route.ts:394`) — a real bug. |
| Ticket statuses → `VALID`/`USED`/`CANCELLED`/`REFUNDED` + `checkinTimestamp` | `AVAILABLE`/`NOT_AVAILABLE` is overloaded (unpaid vs scanned); scan/check-in toggles the same flag. |
| Order-level `type` (FREE/PAID/COMPLEMENTARY) | One reservation→confirm path for all order kinds. |
| `Orders.createdAt` non-nullable | Expiry depends on it. |

**Deferred** (companion rename sweep, no behavior change): table/field renames, dropping dead tables, `discountCode`→`password`, `organizer`→`hostName`, dropping redundant `name`.

---

## Files & Consumers

**New:** `apps/web/src/server/lib/stripe.ts`; `apps/web/src/server/lib/reservations.ts` (TS wrappers over the SQL functions); Prisma migrations (additive, then cleanup) carrying the functions.

**Checkout path:**
- `app/api/checkout/initiate/route.ts` → "create reservation": call `reserve_tickets`, create PaymentIntent (idempotency key = reservation id), return `clientSecret` + `reservationId` + granted quantities. Delete PENDING-order creation, `validateTicketType` stock math, `getPrismaCreateOrderPayload`. Free orders run reservation→`confirm_reservation` immediately.
- `app/api/checkout/config/route.ts`, `app/api/checkout/apply-code/route.ts` → availability = `capacity − reserved − sold` (drop order-counting).
- `pages/api/stripe/webhook.ts` → call `confirm_reservation`; email from outbox after commit. (Stays in Pages Router; App-Router move is P3.2.) Retire the `orderHelper` increment helpers.
- `app/api/cron/invalidate-orders/route.ts` → call `expire_reservations`; optionally drain the outbox.

**Organizer reads:**
- `getEventOverview.ts` + tickets page → read `sold` (+ optionally `reserved`); revenue from completed Orders.
- `app/api/organizer/tickets/scan/route.ts`, `check-in/route.ts` → set `USED` + `checkinTimestamp`.
- Complementary tickets (`orderHelper.ts:113`) → reservation of `type=COMPLEMENTARY` incrementing `sold`.

**Client (mostly unchanged):** `CheckoutContainer.tsx` / `payment-form.tsx` keep Stripe Elements `confirmPayment`; hold `reservationId` until confirmation; confirmation page resolves the order from the converted reservation.

---

## Phases (one PR each)

- **Phase A — Foundation (no behavior change).** Additive migration: new columns (`capacity`/`reserved`/`sold`, `*Cents`, `startsAt`/`endsAt`/`saleStartsAt`/`saleEndsAt`, order `type`, `checkinTimestamp`, new status enum values), new tables (`Reservation`, `ReservationItem`, `OutboxMessage`, optional `ProcessedStripeEvent`), and the Postgres functions. Backfill: `sold = quantitySold`; `capacity = quantity`; `*Cents = round(price*100)`; `startsAt = startDate (+ startTime)`; status mapping. Old columns retained. Add shared Stripe client + stand up the jest harness.
- **Phase B — Cut over checkout.** Switch initiate/config/apply-code/webhook/cron to the reservation model. **`reserved` seeded from in-flight PENDING holds at cutover** (the one genuine risk) — deploy in a low-traffic window with a brief checkout pause during seed+switch. Full test suite here.
- **Phase C — Organizer reads.** Dashboard, scan/check-in, complementary path move to new columns/statuses.
- **Phase D — Cleanup.** Drop `quantitySold`/`quantity`/`price`/`startDate`/`startTime`/old statuses; remove dead code. Optional deferred rename sweep.

---

## Verification

- **Concurrency (headline):** integration test against a **real Postgres** — N concurrent `reserve_tickets` for `capacity = 1`; assert exactly one grant, `reserved` never exceeds `capacity`.
- **Idempotency:** `confirm_reservation` twice for one payment intent → `sold` increments once, one Order.
- **Expiry:** HELD reservation past `expiresAt` → `reserved` released, status EXPIRED.
- **Money:** cents round-trips with Stripe amounts (no float drift).
- **Sale window:** ticket with `saleStartsAt` later today is unavailable now.
- **E2E manual:** Stripe CLI `stripe listen --forward-to localhost:<port>/api/stripe/webhook` + `stripe trigger payment_intent.succeeded`; confirm reservation→order, one email, `sold` incremented; replay to confirm no double-count; two simultaneous `curl` checkouts on `capacity:1` → exactly one order.
- **Per PR:** `cd apps/web && npm run typecheck && npm test`.

## Out of scope

Drizzle (P4.1), Supabase Auth (P4.2), webhook → App Router (P3.2), full transactional email service (P4.4 — minimal outbox only), Stripe Connect, cosmetic renames. The design is forward-compatible with each.
