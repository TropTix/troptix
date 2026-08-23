# Checkout bottleneck audit

- **Date:** 2026-08-21
- **Scope:** the public event page → reservation → payment → fulfillment path, under the lens of "what breaks first when too many fans show up at once", plus caching and observability.
- **Status at audit time:** reservation checkout live (ADR 0007/0018), no rate limiting, no timing instrumentation, event page rendered dynamically per request.

## TL;DR — what breaks first, in order

1. **Every view of the event page hits Postgres.** `/e/[eventId]` is dynamic (it reads cookies), so a traffic spike on one event becomes a 1:1 query load on the database. This is the largest and cheapest-to-fix source of DB stress.
2. **Connection math.** Each serverless instance opens up to 10 pg connections (driver default, no `max` set) against the Supabase pooler. A spike scales Vercel instances, and pooler client connections run out before anything else does. Failures surface as 15-second connect timeouts, i.e. a slow-motion outage.
3. **The finalizing poll.** Every buyer on the "finalizing" screen hits the server every 1.5s, and each hit does a DB read plus a Stripe `sessions.retrieve`. A few hundred concurrent buyers exceeds Stripe's ~100 reads/s live-mode limit and multiplies function + DB load, exactly at the moment of peak sales.
4. **Per-tier row lock is the sales throughput ceiling.** All reservations for a tier serialize on one `FOR UPDATE` row. The lock is held for the whole reservation transaction, which does one round-trip per cart tier plus the reservation insert. Rough ceiling: tens of reservations/second per tier; beyond that, callers queue into Prisma's 2s `maxWait` and start erroring.
5. **The expiry sweep is unbounded and serial.** One `findMany` with no `take`, then one awaited Stripe call per hold. A burst of abandoned holds (every sell-out produces one) makes the sweep overrun its 10s pg_net window and back up. Already known: `plans/015-scale-the-expiry-sweep.md`.

None of these are design flaws — the reservation/counter design (ADR 0007) is sound and the idempotency layering is genuinely good. These are capacity limits of the current implementation, and almost all of them are invisible today because nothing measures latency anywhere (§4).

---

## 1. Concurrency audit — where simultaneous users contend

### 1.1 The inventory lock (by design, but watch it)

The entire oversell guarantee is one statement — `packages/api/src/services/reservations.ts:98-110`: `SELECT … FOR UPDATE` on the `TicketTypes` row, then a clamped `UPDATE`. Correct, deadlock-safe (items sorted by id at `reservations.ts:246`), and unavoidable serialization: a hot tier is a hot row.

What makes the critical section longer than it needs to be:

- `reserve()` (`reservations.ts:126-170`) runs the lock statement **serially, one round-trip per tier** (up to 20 per cart), then `reservation.create`, all inside one transaction with default limits (`maxWait` 2s, `timeout` 5s). Each round-trip crosses Vercel → Supabase pooler, so a 3-tier cart holds the first tier's lock for ~4+ network round-trips.
- `settle`'s re-acquire branch (`reservations.ts:574-583`) and `materializeOrder`'s per-tier `reserved--/sold++` updates (`reservations.ts:385-410`) contend on the same rows from the webhook/poll side while fans are still reserving.
- `materializeOrder` builds one `Tickets` row per unit in memory inside the transaction — a very large order can blow the 5s budget while holding locks (already tracked as finding F10 in `plans/README.md`).

**Failure mode under load:** reservations queue on the row lock → transactions exceed `maxWait` → buyers get errors while inventory is fine. This looks like an outage but is really lock convoy.

### 1.2 Connection pool vs Supabase pooler

`packages/db/src/index.ts:58-87`: `PrismaPg` with no `max` → pg default **10 connections per client**, and the client singleton is only cached in dev — in production each warm serverless instance holds its own pool. The runtime URL is the transaction-mode pooler (6543). Under a spike:

- Vercel scales to N instances → up to 10×N client connections to the pooler.
- The pooler's `max_client_conn` is the hard wall; when it's hit, new connects wait up to `connectionTimeoutMillis: 15000` and then throw. 15 seconds of hang before the error is the worst possible UX during an on-sale.

### 1.3 The finalizing poll

`CheckoutSheet.tsx:173-178` polls `getCheckoutState` every **1.5s flat** while `step === 'finalizing'`, no backoff, no cap. Each tick (`packages/api/src/services/payments.ts:286-356`):

- tRPC context: `supabase.auth.getClaims()` + `prisma.users.findUnique` (`apps/web/src/server/authUser.ts:32-53`) — even for anonymous buyers,
- `reservation.findUnique`,
- for HELD/EXPIRED with a session: an awaited `stripe.checkout.sessions.retrieve`.

At ~150 concurrent finalizing buyers this alone saturates Stripe's live-mode read limit (~100/s) and generates ~100 function invocations + DB reads per second. The webhook makes most of this polling redundant — the poll is the fallback, but it's priced like the primary.

### 1.4 The expiry sweep

`payments.ts:381-409`: unbounded `findMany`, then a strictly serial loop with an awaited `stripe.checkout.sessions.expire` per armed hold. pg_cron fires it every minute with a 10s HTTP timeout. A sell-out that strands 1,000 holds means ~1,000 serial Stripe calls (~100-300ms each) — several minutes of work crammed into a 10s window, every minute, while the `keptLive` retry set regrows. Plan `015` covers the fixes; it should be scheduled before the next large on-sale.

### 1.5 Per-request overhead that multiplies everything

- Every tRPC request resolves the actor (Supabase JWKS check + `users.findUnique`) even when no auth cookie is present — pure waste for the anonymous majority of buyers.
- `AuthProvider` fires `fetch('/api/user/me', { cache: 'no-store' })` on **every page mount for every visitor, including anonymous** (`apps/web/src/components/AuthProvider.tsx:38-79`) — one extra dynamic function invocation + `getClaims` per page view.
- `serverAnalytics()` builds a new PostHog client per capture; fine today (one capture per order, post-commit, error-swallowed), but don't add per-request captures on this pattern.
- Webhook fulfillment awaits the confirmation email (Resend) inline (`reservation-webhook/route.ts:110`). A slow Resend response delays webhook ack; the designed-but-unbuilt outbox (`docs/plans/2026-06-transactional-email-outbox.md`, `OutboxMessage` model already migrated) is the right fix.

## 2. Caching audit — what hits the database that shouldn't

### 2.1 The event page (the big one)

`/e/[eventId]` has no `revalidate` and calls `cookies()` via `getUserFromIdTokenCookie` (`page.tsx:46`), so **every view runs `getEventDetail` against Postgres** — a `findUnique` with `organization` + `ticketTypes` relations plus availability math (`packages/api/src/services/events.ts:72-171`). Event content changes rarely; availability is display-only (the reservation transaction is the source of truth for oversell). Nothing on this page needs per-request freshness.

Telling detail: `revalidateEventPages.ts` already calls `revalidatePath('/e/${eventId}')` on organizer edits and its docstring says "bust every ISR-cached public page" — the on-demand invalidation half of ISR is already built. Only the page's ISR half is missing, defeated by the cookies() read.

`/discover` (ISR 24h) and `/o/[slug]` (ISR 1h) are already right. Note `/discover`'s `endsAt > now()` filter is evaluated at generation time — with a 24h window, ended events can linger up to a day unless an edit revalidates; acceptable, just know it.

### 2.2 Recommendations, in order of leverage

1. **Make `/e/[eventId]` ISR.** Move the `getUserFromIdTokenCookie` read out of the server render (its only product role is prefill/greeting — serve that from the client, where `AuthProvider` already fetches `/api/user/me`). Add `export const revalidate = 60` (or longer — on-demand revalidation already covers edits). Availability going up to 60s stale is fine: `maxAllowedToAdd` is re-checked at `createReservation`, and a sold-out surprise surfaces as the existing `granted: 0` path. This converts the highest-volume DB query in the product into CDN hits.
2. **Anonymous fast path in tRPC context.** In `resolveActor`, return null immediately when no Supabase auth cookie is on the request — skip `getClaims` and the `users.findUnique`. Same for `/api/user/me`: have `AuthProvider` skip the fetch when `onAuthStateChange` reports no session.
3. **Cap the pool and right-size it.** Set an explicit `max` (e.g. 3–5) on `PrismaPg` so instance-count × pool-size stays under the pooler's `max_client_conn` with headroom, and drop `connectionTimeoutMillis` to something that fails fast (~5s) — a quick error beats a 15s hang when saturated.
4. **Back off the finalizing poll.** 1.5s → exponential to ~5-8s cap, stop after ~2 minutes (webhook + resume path cover the tail). Cheaper still: only call Stripe `sessions.retrieve` on the first poll after redirect-return and every Nth poll thereafter; the DB status read is enough for the common "webhook already fulfilled it" case.
5. **Batch the inventory hold.** Replace the per-tier loop with one statement that locks and updates all requested tiers (join against `unnest($ids, $qtys)`, ordered by id). One round-trip regardless of cart size shrinks lock-hold time several-fold.
6. **Execute plan 015** (bound the sweep with `take`, parallelize Stripe expires with bounded concurrency, add the composite `(status, expiresAt)` index, overlap guard).
7. **Build the email outbox** so webhook ack never waits on Resend.

## 3. What's already good (don't churn it)

- Counter inventory + single-statement clamp: correct under concurrency, no CHECK constraint needed while every writer goes through the two lock sites.
- Layered idempotency: Stripe idempotency keys, unique indexes on `stripePaymentIntentId`/`stripeCheckoutSessionId`/`orderId`, `settle`'s `FOR UPDATE` + status guard, `ProcessedStripeEvent`, Resend keys. The webhook/poll race is safe.
- Cancel-then-release expiry ordering (ADR 0018) structurally prevents "released inventory + payable session".
- Tickets insert as one nested `createMany`; the confirmation-email query has no N+1.
- On-demand `revalidatePath` plumbing already exists and is called from every organizer mutation that changes public pages.

## 4. Observability — catching P95 before buyers do

Today there is **no latency measurement anywhere**: no timing logs, no Prisma query logging, no Sentry, no Speed Insights. PostHog captures the funnel (client) and `order_completed` (server). `plans/014-observability-on-money-paths.md` (structured logging seam) is the right foundation — this section says what to measure through it.

### 4.1 Instrument (one structured-log helper, JSON to stdout, greppable in Vercel logs)

| Where                         | What to record                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| tRPC middleware (one, global) | `procedure`, `durationMs`, `ok/error` — this alone gives per-procedure P95 from Vercel logs |
| `reserve()`                   | tx `durationMs`, tiers in cart, `granted` vs `requested` per tier                           |
| `beginPayment`                | Stripe call `durationMs`, reuse-vs-create branch                                            |
| Webhook route                 | end-to-end `durationMs` and **webhook lag** = `now − event.created` (Stripe stamps it)      |
| `sweepExpiredHolds`           | `found`, `released`, `keptLive`, `durationMs` per run                                       |
| `getCheckoutState`            | whether the Stripe retrieve ran; count of polls is derivable from volume                    |
| Prisma (client extension)     | log any query over ~200ms with model + operation                                            |

### 4.2 Alert on (leading indicators, in the order they'd fire during an overload)

1. **DB connect exhaustion:** any Prisma `P2024`/connect-timeout error. This is the first hard failure of an on-sale spike. (Also watch pooler client-connection count in the Supabase dashboard.)
2. **Lock convoy:** transaction `maxWait` errors (`P2028`) or `reserve()` P95 > ~500ms.
3. **Webhook lag > 60s:** fans are staring at "finalizing" and the poll fallback is carrying full load.
4. **Sweep backlog:** `found` not returning to ~0, or `keptLive` growing run-over-run — inventory is stuck in limbo.
5. **Stripe 429s** anywhere — the poll is over its budget.
6. **`needs_refund` occurrences:** each one is the oversell race actually firing; a cluster means holds are expiring under buyers at scale.
7. **Funnel stall (PostHog):** alert on `checkout_opened → order_completed` conversion dropping sharply in a window — the catch-all for anything the above misses.

### 4.3 Platform pieces

- **Vercel observability** already shows per-route duration percentiles; the tRPC middleware log adds the per-procedure split it can't see. Add `@vercel/speed-insights` for real-user page P95 (the event page especially, before/after the ISR change).
- **Supabase:** enable `pg_stat_statements` review before/after big events; the pooler and DB connection graphs are the capacity dashboards for §1.2.
- **PostHog:** keep it as the funnel/behavior layer, not the metrics store — durations belong in logs, conversion and abandonment in PostHog. The existing `posthogDistinctId` on reservations makes "which buyers hit the stall" answerable in replay.

### 4.4 Suggested thresholds to start (tune with real data)

| Signal                   | Warn  | Page                    |
| ------------------------ | ----- | ----------------------- |
| `reserve()` duration P95 | 300ms | 1s                      |
| Webhook lag              | 30s   | 120s                    |
| Sweep `found`            | > 200 | growing 3 runs straight |
| tRPC error rate          | 1%    | 5%                      |
| Any `P2024` / `P2028`    | —     | immediately             |
