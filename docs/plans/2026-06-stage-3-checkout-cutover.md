---
title: Stage 3 — Checkout Cutover (reservation flow goes live)
status: active
created: 2026-06-12
tracking-issue: '#327'
---

# Stage 3 — Checkout Cutover

The execution plan for switching the live checkout from the legacy PENDING-order
flow onto the reservation system. The _design_ is settled and largely built —
[ADR 0007](../adr/0007-reservation-based-checkout.md) (reservation model),
[checkout-reservation rebuild plan](2026-06-checkout-reservation-rebuild.md)
(target design + Phase B decisions), [API service-layer plan](2026-06-api-service-layer.md)
(Stage 2, done). This plan realizes the rebuild plan's deferred **Phases B2–B4, C, D**
and the umbrella plan's **Stage 3 + gated Stage 1b migrations (M4–M13)**.

**Robustness is the point.** The legacy flow has the three structural bugs
(oversell race, non-atomic confirmation, no inventory release on expiry); the
reservation core that fixes them is merged and tested but **nothing live calls
it**. This plan wires it in without widening the atomic surface beyond what must
ship together.

> **Status update (rebased onto main, 2026-06-17).** Since this plan was
> written, main advanced ~11 commits with three intersections: (a) **tRPC actor
> threading already landed** (`resolveActor` in the `/api/trpc` handler →
> `createContext`), so gap #3 and most of 3b are **done** — 3b shrinks to the
> `@trpc/tanstack-react-query` client + checkout components (the `PaymentGateway`
> context field + Stripe impl landed in **3a, #328**, now rebased on main).
> (b) **`@troptix/transactional`** (#337) provides typed `buildOrderConfirmation`
> rendering — the 3c outbox drain renders through it (see open decision 3).
> (c) **Firebase is fully gone** (storage → Supabase Storage, #330). **3a is
> built, tested, rebased** (#328).

## Where the seam is today (verified 2026-06-12)

**Built, tested, inert in `@troptix/api`:**

- `reserve / confirm / release / expire` — Prisma-transaction services. `confirm`
  is idempotent (CONVERTED no-op), **dual-writes legacy `quantitySold`** (so the
  organizer dashboard stays correct through the transition), and enqueues the
  confirmation email as an `OutboxMessage` (never sends inside the txn).
- `getCheckoutConfig` / `applyCode` reads on `capacity − reserved − sold`.
- zod contracts for the whole checkout surface; tRPC `checkout.config` +
  `checkout.applyCode` procedures; the `/api/trpc` handler (live, uncalled).
- Cents-only fee calculator **without the legacy 15% tax-on-fee** (#304).
- Phase-A schema (counters, `Reservation`/`ReservationItem`, `OutboxMessage`,
  `ProcessedStripeEvent`) — columns exist, **all zero/null in prod**.

**Live legacy flow (what gets replaced):**

- `POST /api/checkout/initiate` (609 lines): PENDING order as implicit
  reservation; free path increments `quantitySold` inline.
- `pages/api/stripe/webhook.ts`: order→COMPLETED + `quantitySold` increment as
  separate writes; emails sent inline; no replay guard beyond Stripe's.
- `cron/invalidate-orders`: cancels stale PENDING orders, **releases no inventory**.
- Client: `CheckoutContainer` + `useCheckout` hooks holding `orderId`+`clientSecret`;
  post-payment pages key off `orderId` synchronously.

**Auth (new since the original Stage-3 sketch):** Supabase auth is live (Stage 1c).
`getServerUser()` gives the stable `Users.id` server-side; the tRPC `Actor` seam
exists. Checkout must support **guest and signed-in** flows — `Reservation.userId`
stays nullable; when a session exists we attach the stable id.

## What must be built (the genuine gaps)

1. **`initiateCheckout` orchestration service** (`packages/api`). `reserve()`
   deliberately leaves business rules to its caller — so this service owns:
   sale-window + draft check, `maxPurchasePerUser` clamping, password-gated
   ticket validation, fee/total computation (cents calculator), then
   `reserve()`, then **free → synchronous `confirm()`** / **paid → create the
   Stripe PaymentIntent** (idempotency key = reservation id, metadata =
   `reservationId`), attach the PI id to the reservation, return
   `{ reservationId, clientSecret?, granted items, totals }`.
   - **Stripe stays out of the package** via a small injected `PaymentGateway`
     port (`createPaymentIntent(...)`, `findOrCreateCustomer(...)`) defined in
     `packages/api`, implemented in `apps/web` over the shared Stripe client.
     Services stay pure/unit-testable; the fake gateway is trivial in Vitest.
2. **`getReservation` read service + procedure** — `{ status, orderId? }` by
   reservation id, for post-payment pages to poll until the webhook converts.
3. **tRPC mutations/queries**: `checkout.initiate` (mutation),
   `checkout.reservation` (query). Context resolves `actor` from the Supabase
   session (threads `req` → `getServerUser`) so signed-in reservations carry
   `userId` — closes the parked `createContext` seam.
4. **Client rewire**: tRPC client via **`@trpc/tanstack-react-query`** (we
   already run TanStack Query v5; this is tRPC's current recommended
   integration — resolves the parked classic-vs-new decision). The checkout
   components are rebuilt to the **decided flow structure below** — structure
   ships with 3c; **visual/brand polish is deferred** to the design-system
   track and stays out of the cutover. Build as **headless logic (reservation
   state machine hooks) + thin presentational components** so the later polish
   replaces only the thin layer.
5. **Webhook rewrite** — new App Router `app/api/stripe/webhook/route.ts`
   (raw body via `req.text()`): `payment_intent.succeeded` → `confirm(prisma, …)`;
   `payment_intent.payment_failed` → `release()`. Idempotency: `ProcessedStripeEvent`
   insert **and** confirm's status guard. Delete the Pages-Router webhook +
   `orderHelper` increments.
6. **Cron rewrite** — `expire(prisma, now)` (releases inventory) + **outbox
   drain** (send queued confirmation emails, mark sent; retry-safe). The drain
   also runs opportunistically right after `confirm` returns (post-commit) so
   the common-path email is near-instant, with the cron as the guarantee.
7. **Post-payment pages** — URLs carry `reservationId`; confirmation page reads
   Stripe PI state (already async-safe); order/receipt/tickets resolve the order
   _via_ the reservation and show the existing "processing" state while
   unconverted (poll `checkout.reservation`).
8. **M4 backfill + `reserved` seed + runbook** (see Cutover).

## Client flow structure (decided 2026-06-12)

The reservation model forces UX that doesn't exist today (a timed hold,
granted-quantity adjustment, async order materialization) — so 3c builds the
**new flow structure**, with existing design-system primitives; the visual pass
later is a pure reskin of the thin presentational layer.

```
Select  →  [RESERVE]  →  Details + Pay (countdown)  →  Processing  →  Confirmed
  no hold                  the hold window              webhook lag
```

1. **Selection (no hold)** — on the event page: per-type steppers, live totals
   pinned, "Have a code?" expands inline and reveals unlocked tickets in place.
   Availability here is advisory ("only 4 left"). CTA: "Checkout — $XX".
   **Reserve fires on commit, never on stepper taps** — browsing can't starve
   buyers.
2. **Reserve outcomes** — granted → proceed; **clamped** → proceed _with_ a calm
   re-consent banner ("Only 2 were still available — your order was updated",
   totals visibly updated, one-tap back-out); nothing → stay, mark sold out,
   suggest other types.
3. **Details + Pay (one screen)** — full-screen on mobile / sheet on desktop,
   at a **routable URL carrying the reservation id** (`…/checkout/[reservationId]`)
   so refresh/back/duplicate-tab resume the same hold (idempotent by
   construction). Contact fields (prefilled when signed in; plain for guests)
   above the Stripe Payment Element; one "Pay $XX" button. **Countdown as a
   quiet pill** ("Tickets held · 9:42"), neutral until 2:00, then a gentle
   tone shift — the hold is framed as a promise, not pressure. Free orders skip
   payment (synchronous confirm → Confirmed). Payment failure: inline error,
   hold stays live, retry freely. **Expiry mid-screen**: blocking overlay with
   one-tap re-reserve of the same selections — a soft bounce, not a failure.
4. **Processing** (`…/processing`) — exists because the order materializes on
   the webhook: "Payment received — finalizing your tickets", **poll
   `checkout.reservation`**, auto-advance on CONVERTED. Two reassurances on
   screen: "usually a few seconds" + "your receipt will also be emailed to
   you@x". Past ~30s, soften copy and keep polling — never an error state
   unless the payment itself failed.
5. **Confirmed** — tickets front and center, summary, "emailed to you@x".
   Guests get the single auth moment of the whole flow: optional one-tap
   magic-link claim ("access these tickets anytime") — never gates the
   purchase, and the email already matches what the provisioning trigger links.

**Flow rules:** never block browsing; the URL is the state; adjustment is
re-consented before money is taken; every dead end has one obvious exit
(expired → re-reserve, sold out → other types, failed → retry); email is the
stated safety net; guest-first, account-optional.

## PR breakdown

Pre-land everything inert; keep the atomic PR as small as the contract allows.

- **PR 3a — `packages/api`: initiate + reservation-read** _(additive, inert)_.
  `PaymentGateway` port, `initiateCheckout`, `getReservation`, tRPC procedures,
  Vitest (fake prisma + fake gateway): clamping, free-vs-paid branch, password
  gating, fee math, granted-adjustment shapes.
- **PR 3b — web tRPC client plumbing** _(inert)_. `@trpc/tanstack-react-query`
  client + provider, `PaymentGateway` Stripe implementation, `createContext`
  actor threading. Nothing user-facing calls it yet.
- **PR 3c — THE cutover** _(atomic, maintenance window)_. New checkout
  components on `trpc.checkout.*`; post-payment pages on `reservationId` +
  polling; App-Router webhook → `confirm`; cron → `expire` + outbox drain;
  **delete** legacy `initiate`/`config`/`apply-code` REST routes, old webhook,
  `orderHelper`, `useCheckout` fetchers, `types/checkout.ts` (moved to
  contracts). Ships with the **M4 data backfill** migration (dates, cents,
  `capacity ← quantity`, `sold ← quantitySold`, status mapping) — verification
  queries must return 0 nulls before resume.
- **PR 3d — organizer reads** (Phase C): dashboard/scan/check-in/complementary
  onto `sold`/`reserved` + new statuses; stop reading `quantitySold`.
- **PR 3e — stop dual-writing `quantitySold`**, then **schema cleanup** in
  order: M5 NOT NULL → M6 CHECK (`reserved≥0`, `sold≥0`, `reserved+sold≤capacity`)
  → M8 drop legacy columns → M9 enum surgery (isolated, pre-flight count gate)
  → M10/M11 renames (typecheck gate across all import sites) → M12 timestamps.
- **PR 3f — M13 UUIDv7 + `publicCode`** (ADR 0014; heavy, isolated): PKs +
  ~80 FKs re-keyed, `generateId()` → UUIDv7, `generatePublicCode(prefix)` for
  user-facing ids. Also updates the auth provisioning trigger's id generation
  (currently `gen_random_uuid()::text` matching the old format).

## Cutover runbook (PR 3c)

1. Announce/no live events window (we are between events — the whole reason for
   doing this now). Pause checkout (maintenance flag or brief downtime page).
2. Apply M4 backfill; run verification queries (0 nulls; counters consistent:
   `sold = quantitySold`, `capacity = quantity`).
3. **Seed `reserved`**: with checkout paused there should be ~no in-flight
   PENDING orders; cancel any stragglers (their PIs expire harmlessly) and seed
   `reserved = 0`. This is the one step that cannot be rehearsed in prod — it is
   rehearsed on the preview branch instead.
4. Deploy 3c. Stripe CLI smoke: `payment_intent.succeeded` → reservation
   CONVERTED, order materialized, one email, `sold` incremented; replay the same
   event → no double-count. Two concurrent reserves on `capacity:1` → one grant.
5. Resume checkout. Watch PostHog + Stripe dashboard for the first real orders.
6. **Rollback**: revert the deploy (legacy routes restored by git revert); the
   backfill is non-destructive (legacy columns untouched until 3e), so the old
   flow still works post-revert. Rollback ceases to be available after 3e drops
   legacy columns — that PR waits until 3c has soaked.

## Robustness invariants (the checklist the PRs are reviewed against)

- **No oversell**: conditional-UPDATE reserve; concurrency test on a real
  Postgres (preview branch) stays in CI.
- **Idempotent money path**: webhook replay-safe two ways; PI idempotency key =
  reservation id so client retries of `initiate` can't double-create PIs.
- **No lost emails / no email-in-txn**: outbox written in `confirm`'s
  transaction; drain is at-least-once + marks sent.
- **Inventory always returns**: `expire` releases; `payment_failed` releases;
  TTL = 10 min (client shows countdown).
- **Guest + signed-in** both first-class; signed-in attaches stable `Users.id`.
- **Fail-loud**: checkout funnel + failure events to PostHog (initiate failed,
  reservation expired pre-payment, webhook confirm failed, outbox drain errors).
- **Acknowledged at go-live**: the new fee calculator drops the legacy 15%
  tax-on-fee (#304) — a deliberate, owner-approved revenue change that takes
  effect with 3c.

## Open decisions for review

1. **`applyCode` UX**: service returns `isValid: true` with `maxAllowedToAdd: 0`
   for a sold-out code-gated ticket. Proposal: keep (the code _is_ valid; the UI
   shows sold-out) — confirm.
2. ~~TTL/countdown UI~~ — **decided** (see Client flow structure): quiet pill,
   tone shift at 2:00, expiry = one-tap re-reserve overlay.
3. ~~Outbox drain transport~~ — **updated for main's drift**: the drain renders
   the confirmation via `@troptix/transactional` `buildOrderConfirmation` (#337,
   typed React Email) and sends through the existing transport (`server/lib/
email.ts`). Email-provider consolidation (SendGrid → Resend) stays separate.
4. **Organizer Expo app**: untouched (being rebuilt separately); its REST reads
   keep working through 3d. Confirm nothing in 3c's deletions is mobile-called
   (the legacy checkout routes are web-only — verified; the mobile app hits
   `/api/organizer/*` only).

## Verification

- Per PR: `yarn typecheck` (all workspaces), package Vitest (fake prisma +
  fake gateway), `next build`.
- Reservation integration tests (the 8-way concurrent grant test) run against
  the PR's Supabase preview branch.
- 3c E2E on preview: full checkout (free + paid + promo + password-gated +
  adjusted-quantity), webhook via Stripe CLI, replay, expiry, outbox drain,
  post-payment polling, guest + signed-in.
- Post-cutover gates for 3e+: `yarn db:new` emits no diff; M9 pre-flight dead-
  value count = 0; M11 rename → `prisma generate` + full typecheck green.

## Out of scope

Visual checkout redesign (UX skeleton kept); organizer app rewire (3b of the
umbrella — deferred to the mobile rebuild); Stripe Connect; email-provider
consolidation; going live on RLS.
