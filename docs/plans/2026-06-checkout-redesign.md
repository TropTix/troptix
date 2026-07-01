---
title: Checkout Redesign — Reservation-Aware Client + Server Cutover (Stage 3)
status: active
created: 2026-06-17
tracking-issue: '#327'
---

# Checkout Redesign — Reservation-Aware Client + Server Cutover

> **Amendment — 2026-07-01 (paid checkout on `/e/`).** Phase 1 (event page + free RSVP)
> is live. Paid checkout is now being built on `/e/` with these decisions
> ([ADR 0018](../adr/0018-paid-checkout-on-checkout-sessions.md)):
>
> - **Stripe Checkout Sessions API, `ui_mode: 'elements'`** (Stripe's recommended custom
>   integration) instead of raw PaymentIntents. A dedicated `beginPayment` service creates
>   one Session per reservation; the reservation service stays Stripe-free.
> - **Payment surface stays in the `CheckoutSheet`**, not a separate route. A
>   `?reservation=<id>` query param on the event URL is the durable key: one
>   `getCheckoutState` call on load maps to the sheet step, and it is the Session
>   `return_url`. (Supersedes the "URL-addressable checkout route" described below.)
> - **Cards + wallets only** (`payment_method_types: ['card']`) — no `processing` states.
> - **Hybrid fulfillment** ([Stripe fulfillment guide](https://docs.stripe.com/checkout/fulfillment)):
>   `checkout.session.completed` webhook is canonical; `getCheckoutState` also retrieves the
>   Session and calls the same idempotent `confirm()` when `payment_status !== 'unpaid'`.
> - **Auto-refund on the expiry race**: `confirm()` re-acquires all-or-nothing after a paid
>   hold expired, else refunds the whole PaymentIntent and marks the reservation `REFUNDED`.
> - **Simplicity cuts**: no client-side auto-reacquire (countdown zero → start over);
>   `expire()` cron unchanged; `/e/` charges the new flat fee (divergence accepted until
>   cutover). The legacy `/events/` flow and its Pages Router webhook are untouched here.

The user-facing rebuild of checkout: a new, high-converting, testable flow built on the
**already-shipped reservation core**, plus the deferred server cutover that wires the live
app onto it. This is **Stage 3** of the platform redesign and the **client half (B2 + B3)**
of the reservation rebuild, which were deliberately deferred to be built fresh here rather
than retrofitted onto the soon-to-be-replaced pages.

Backing work already on `main`:

- Reservation model + ADR — [ADR 0007](../adr/0007-reservation-based-checkout.md),
  [reservation-rebuild plan](2026-06-checkout-reservation-rebuild.md) (schema #284, primitives #285).
- Service layer — [api-service-layer plan](2026-06-api-service-layer.md):
  `reserve`/`confirm`/`release`/`expire` in `packages/api/src/services/reservations.ts`,
  `getCheckoutConfig`/`applyCode` in `services/checkout.ts`, zod contracts, tRPC checkout router.
- Authz in services ([ADR 0013](../adr/0013-authorization-in-the-service-layer.md)); Supabase
  Auth is **live** ([ADR 0011](../adr/0011-supabase-auth-identity.md),
  [ADR 0015](../adr/0015-passwordless-auth-and-trigger-provisioning.md)) — `getServerUser()` /
  `useAuth()` work today.

## Scope & goals

- **Goal:** a high-converting, **testable** checkout flow on the existing reservation model.
- **In:** new client flow (paid + free), the B2 server cutover wiring, wallets (Apple/Google
  Pay via the Stripe Payment Element — free to enable), a **visible reservation countdown**.
- **No schema changes.** Discounts stay as "code unlocks a hidden tier" (the existing
  `discountCode`-as-password), not real % / fixed discounts.
- **Out (deferred):** accounts-required checkout, saved cards / Stripe Customer, waitlist,
  refunds/transfers, real promo codes, the one-click RSVP collapse + one-per-user dedup.
  See [Deferred backlog](#deferred-backlog).

## Decisions (resolved in design review)

The flow was walked branch-by-branch; each decision below is settled.

### Surface — URL-addressable modal route, mock visual

Ticket **selection is inline on the event page** (Luma-style steppers + sticky buy bar, as in
the mock). "Get Tickets" **commits**: create the reservation, then open the checkout as a
**bottom sheet (mobile) / centered modal (desktop)** — but implemented as a **URL-addressable
route** keyed by `reservationId` (e.g. `/events/[eventId]/checkout/[reservationId]` as a
Next.js intercepting/parallel route). This keeps the designer's sheet look **and** gives us:

- **resumability / refresh-safety** (rehydrate from `getReservation`),
- **deep-linkable E2E** (drive any state without click-through),
- **clean 3DS redirect-return** (`return_url` is the route; a stateless sheet would lose state).

### When the hold fires

`reserve()` fires **on commit** (the Get-Tickets click), together with PaymentIntent creation
— not on every stepper change, not at Pay. The 10-min TTL + visible countdown start when the
user enters the focused sheet with tickets actually held. If stock dropped between browsing
and commit, `reserve()` clamps and returns `granted < requested` → show the **"we reduced your
quantity" (`wasAdjusted`)** confirm _before_ the sheet.

### Sheet layout — single view, Payment Element

Collapse the mock's two steps (details → card) into **one sheet view**: order summary + live
**countdown** + single **email** field + name + **Stripe Payment Element** (card **and**
wallets in one component) + Pay. The mock's hand-rolled card inputs and simulated Apple Pay
sheet are prototype shortcuts — replaced wholesale by the Payment Element. Drop the old
`confirmEmail` retype (mock already does).

### Stripe confirmation UX

`confirmPayment({ redirect: 'if_required' })` — card/wallet stay in-page; only issuer-forced
3DS redirects (returns to the route URL). Most payments resolve in-place.

### Fulfillment — webhook-only, display-only confirmation, poll our own DB

Per Stripe guidance ("don't fulfill on the client — the return page may never load; use
webhooks"):

- **`payment_intent.succeeded` → `confirm()`** is the single guaranteed fulfillment trigger.
- The **confirmation view is display-only**: read PaymentIntent status once for instant
  "Payment successful ✓", then **poll our own DB** (`getOrderByReservation`) until the webhook
  materializes the Order, showing "finalizing your tickets…". (Polling our Postgres is fine;
  Stripe's rate-limit warning is about polling _Stripe_.) Then show the QR ticket.
- `processing` (async methods) → "we'll email your tickets once payment clears."

### Payment failure & expiry

- **Decline:** do **not** release the hold. Keep `HELD` to TTL; retry inline on the **same
  PaymentIntent** (Stripe: reuse it — "no double charges, tracks attempts"). Inline error,
  countdown keeps running. → **Drop the reservation-rebuild plan's `payment_failed → release()`.**
- **Expiry at 0:** disable Pay, attempt a seamless re-`reserve()`; if stock gone, "sold out."
- **Race (paid after expiry):** `confirm()` for a paid PI whose reservation is no longer
  `HELD` must **re-acquire inventory atomically; if truly gone, auto-refund + notify**
  (Stripe Pattern 1 — immediate capture + refund-on-fail; manual-capture/Pattern 2 deferred).
  Defensive tweak: `expire()` skips reservations whose PI is already `succeeded`/`processing`.

### Free / RSVP

Free reuses the same sheet (button = "Complete RSVP", no Payment Element). `confirm()` is
called by **reservationId** (free reservations have no PaymentIntent — see code changes). The
one-click-instant-RSVP-for-logged-in collapse + one-per-user dedup are **deferred**.

### Customers & identity

- **No Stripe Customer in v1** (guests or logged-in): PaymentIntent with `receipt_email` +
  `metadata` (`reservationId`/`eventId`/`userId?`); Stripe auto-groups "guest customer views".
  Introduce Customers for logged-in users only when saved-cards ships.
- **No anonymous DB users:** guest = `userId: null` + contact denormalized on
  Reservation/Order; `email` is the linkage key for future account-claim.
- Logged-in pre-fills contact and links `Order.userId` (as today).

## Flow (state machine)

```
Event page (selection inline, sticky buy bar)
  │  Get Tickets  → createReservation = reserve() + create PaymentIntent
  │                  (wasAdjusted? → confirm reduced qty first)
  ▼
/events/[eventId]/checkout/[reservationId]   (sheet/modal; rehydrates via getReservation)
  · summary + countdown + email + name + Payment Element (card+wallets)   [paid]
  · summary + countdown + email + name + "Complete RSVP"                  [free]
  │  Pay → setContact → confirmPayment({redirect:'if_required'})
  │        decline → inline error, hold survives, retry same PI
  │        expiry  → re-reserve or sold-out
  ▼
Confirmation (display-only)
  · read PI status → "Payment successful ✓"
  · poll getOrderByReservation until webhook confirm() materializes Order → QR ticket
  · processing → "we'll email your tickets"
        ▲
   webhook payment_intent.succeeded → confirm()   (guaranteed fulfillment)
   cron → expire()                                  (release held inventory)
```

## API surface (tRPC → shipped services)

Thin procedures over the existing services; authz in services ([ADR 0013](../adr/0013-authorization-in-the-service-layer.md)).

| Procedure                        | Kind     | Status   | Notes                                                                                               |
| -------------------------------- | -------- | -------- | --------------------------------------------------------------------------------------------------- |
| `checkout.getConfig`             | query    | exists   | ticket list                                                                                         |
| `checkout.getReservation`        | query    | **new**  | rehydrate the sheet on refresh/redirect-return                                                      |
| `checkout.getOrderByReservation` | query    | **new**  | confirmation poll target                                                                            |
| `checkout.applyCode`             | mutation | exists   | unlock gated tier                                                                                   |
| `checkout.createReservation`     | mutation | **new**  | `reserve()` + PaymentIntent → `{reservationId, clientSecret, grantedItems, expiresAt, wasAdjusted}` |
| `checkout.setContact`            | mutation | **new**  | attach name/email before pay                                                                        |
| `checkout.completeFree`          | mutation | **new**  | free-path `confirm()` by reservationId                                                              |
| `checkout.release`               | mutation | **new**  | explicit cancel                                                                                     |
| `confirm()`                      | service  | exists\* | webhook + `completeFree` only — _needs changes below_                                               |
| `expire()`                       | service  | exists\* | cron only — _needs skip-if-paying tweak_                                                            |

- **Pricing authority is server-side:** `createReservation` accepts only `{ticketTypeId, quantity}`
  and recomputes price + fees from `TicketTypes` (the shipped `reserve()` trusts caller-passed
  cents — the procedure must derive them). Closes a price-tampering hole.
- **Guest authz = possession** of the unguessable `reservationId`; logged-in users additionally
  get an ownership check.

## Client state

The old `CheckoutContainer` held `orderId`/`clientSecret`/cart as local React state that
could drift from the DB — the redesign avoids this by treating **most "state" here as server
(or Stripe) state the client _reflects_, not owns.**

| State                                                                     | Source of truth                 | Client's job                                                                               |
| ------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| Cart (tickets, qty) — pre-hold                                            | ephemeral client (event page)   | local component state; encoded into the reservation on commit                              |
| Reservation (status, items, totals, `expiresAt`, `clientSecret`, contact) | **server (DB)**                 | cache via tRPC + React Query, keyed by `reservationId` from the URL; refetch, never mirror |
| Countdown                                                                 | derived from server `expiresAt` | render a ticking display; on 0 → refetch/re-reserve, never client-decide the hold is dead  |
| PaymentIntent status                                                      | **Stripe**                      | read via Stripe.js + the `confirmPayment` result; don't copy as truth                      |
| Order / fulfillment                                                       | **server (DB)**                 | poll `getOrderByReservation` until materialized                                            |
| Contact inputs                                                            | ephemeral client                | local until submit → `setContact`                                                          |
| Sheet open / view                                                         | URL + ephemeral client          | route param + local UI flag                                                                |

**Decision — no global store.** Use **tRPC + the (new) TanStack React Query integration** for
all server state; keep the small leftover UI state (cart, form, sheet view) in local component
state, lifted into a tiny checkout context only if needed. This is the documented, recommended
shape (TanStack: the client-only state left after moving async data to a server-cache lib is
"usually very tiny"; a store is only warranted for massive synchronous client state — not a
single-event checkout). Rules:

1. **URL (`reservationId`) is the durable key** — refresh, back, and 3DS redirect-return all
   resolve by refetching `getReservation`; refetch on window focus + reconnect too.
2. **Never mirror the reservation into local state** — read from the query cache; mutations
   (`setContact`/`release`/retry) invalidate-and-refetch. One source of truth, always the server.
3. **The prototyped state machine is the _server/domain_ model** (`reserve`/`confirm`/`expire`)
   — do **not** port it into the client. The only client "machine" is a thin view state
   (`idle → submitting → processing → confirmed/error`) driven by query results + Stripe's response.

## Changes to the shipped reservation services (flagged deviations)

These touch tested code (#285) — reviewed deliberately, not smuggled in:

1. **`confirm()` callable by `reservationId`** (not only `paymentIntentId`) for the free path.
2. **`confirm()` re-acquire-or-refund branch** when a paid PI's reservation is no longer `HELD`
   (the paid-after-expiry race).
3. **Drop `payment_failed → release()`** — declines keep the hold to TTL.
4. **`expire()` skip-if-paying** — don't release reservations whose PI is `succeeded`/`processing`.
5. **Remove per-checkout Stripe Customer creation** → `receipt_email` + metadata.

## Mock reconciliation (Clean direction)

Source: `event-checkout-flow/project/event/{checkout,sections,stage}.jsx`. The Clean
direction is the chosen look. Keep / change:

**Keep:** inline ticket selection (steppers, "Only N left", "Popular"), sticky buy bar,
bottom-sheet/modal shell, single email field, wallet-forward placement, free RSVP sheet,
logged-in pre-fill, success QR-ticket visual, "Add to calendar."

**Change / add for production:**

- Sheet → **URL-addressable reservation route** (above).
- Two steps → **one view**; hand-rolled card + simulated Apple Pay → **Stripe Payment Element**.
- Flat 6% fee → **server-computed** per-ticket fees.
- Instant success → **processing/poll** state (webhook gap); QR shows once Order materializes.
- **Add:** countdown timer; decline/retry, expiry, sold-out-after-pay, `wasAdjusted` states.
- **"Waitlist" button:** waitlist is deferred — downgrade sold-out to a passive "Sold out" for
  v1 (or scope waitlist explicitly).

## Testability

- **Unit** (Vitest + fake `prisma`, `packages/api`): `getCheckoutConfig` mapping/sort, `applyCode`
  gating, `createReservation` **server-side price computation (rejects tampered client price)**,
  `setContact`, fee math.
- **Integration** (Vitest + Supabase preview branch): `reserve()` N-concurrent "last ticket
  once", `confirm()` idempotency + **re-acquire/refund** race, `expire()` release — `confirm()`
  exercised **directly** with a real test-mode PI (deterministic, no CLI in the hot path).
- **Webhook handler** (signature verify + dispatch): **Stripe CLI fixtures / `stripe trigger`
  in CI** (Stripe's prescribed approach — real signed events, not hand-rolled payloads).
- **E2E** (Playwright + test cards): success (`4242…`), decline→retry (`4000…0002`), 3DS,
  free RSVP, expiry (inject `now` — `expire()` already takes it), resume-on-refresh (deep-link
  to the reservation route).

## Instrumentation (PostHog)

Funnel: `checkout_opened → reservation_created → contact_completed → payment_submitted →
payment_succeeded/failed → order_confirmed`, plus `reservation_expired`/`released`,
`apply_code`. Tag `eventId`, anon/`userId`, free-vs-paid, `wasAdjusted`. **`order_confirmed`
emitted server-side from `confirm()`** (fires even if the tab closed); top-of-funnel client-side.
Guests via anonymous distinct-id, `identify()` on login.

## Deferred backlog

One-click RSVP collapse (logged-in, single free type) + one-per-user dedup + multi-type
branching · saved cards / Stripe Customer for logged-in · waitlist · refunds/transfers · real
promo codes (% / fixed) · explicit organizer "RSVP event" flag · account-claim-by-email ·
manual-capture (Pattern 2) if charge-then-refund proves unacceptable.

## Verification

- Per PR: workspace `typecheck`; relevant unit/integration tests green.
- Concurrency, idempotency, expiry, and the re-acquire/refund race pass on a Supabase preview branch.
- Manual E2E with Stripe CLI (`stripe listen` + `stripe trigger`) + test cards: reservation →
  order, one email, `sold` incremented; replay = no double-count; two simultaneous checkouts on
  `capacity:1` → exactly one order.
  </content>
  </invoke>
