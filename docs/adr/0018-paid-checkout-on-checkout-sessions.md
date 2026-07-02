# 18. Paid checkout on the Checkout Sessions API (Elements UI), hybrid fulfillment, auto-refund on expiry race

- **Status:** Accepted
- **Date:** 2026-07-01

## Context

Free RSVP is live on the new `/e/[eventId]` page, built on the shipped reservation
core (`reserve`/`confirm`/`release`/`expire` in `packages/api`). Paid carts still
dead-end at a `comingSoon` stub. We now need paid checkout end-to-end on `/e/`, and
had to choose a Stripe integration for it.

Two integrations were on the table:

1. **PaymentIntents + Payment Element** — the pattern the _legacy_ `/events/` checkout
   already uses (`Elements` provider + `PaymentElement` + `confirmPayment`). The
   shipped reservation schema is PaymentIntent-shaped (`stripePaymentIntentId`,
   `confirm()`-by-PI). It is the lower-level primitive: we would own amount
   computation, PI lifecycle, and retries.
2. **Checkout Sessions API with the `elements` UI mode** — Stripe's current
   recommended integration for a custom-branded, self-rendered checkout. Per Stripe's
   [comparison](https://docs.stripe.com/payments/checkout-sessions-and-payment-intents-comparison):
   "We recommend the Checkout Sessions API for most integrations… Choose PaymentIntents
   only if you want to own every part of your checkout, and rebuild these capabilities
   yourself." The `custom`/`elements` UI mode (added `2025-03-31.basil`, enum renamed
   `custom → elements` in `2026-03-25.dahlia`) is what makes a fully custom UI possible
   on top of Checkout Sessions.

The honest trade-off: the features exclusive to Checkout Sessions (Adaptive Pricing,
Stripe Tax, native promo codes, subscriptions, shipping, currency conversion) are ones
we currently compute ourselves or do not use — our reservation service is the pricing
authority. PaymentIntents is _not_ deprecated and would fit today's schema with less
indirection. However, PaymentIntents is not a one-way door away from those features,
and Checkout Sessions is Stripe's forward-recommended path with less long-run
integration code. We chose to follow Stripe's recommendation.

Installed SDKs: `stripe@22` (server, API version `2026-06-24.dahlia`),
`@stripe/stripe-js@9`, `@stripe/react-stripe-js@6` (client `CheckoutElementsProvider` +
`useCheckoutElements` + `checkout.confirm()` from the `/checkout` subpath).

## Decision

- **Use the Checkout Sessions API with `ui_mode: 'elements'`** for paid checkout on
  `/e/`. A dedicated `beginPayment` service creates (or reuses, idempotency key
  `checkout-<reservationId>`) one Session per reservation, with line items derived from
  the reservation's server-computed `unitPriceCents` plus a "Service fee" line. The
  reservation service itself stays Stripe-free.
- **Payment methods limited to cards + wallets** (`payment_method_types: ['card']`) in
  v1, so every payment resolves to paid/failed while the buyer is present — no
  `processing` states.
- **Hybrid fulfillment, per Stripe's [fulfillment guide](https://docs.stripe.com/checkout/fulfillment).**
  The `checkout.session.completed` webhook is the canonical fulfiller; the client-facing
  `getCheckoutState` also retrieves the Session server-side and calls the _same_
  idempotent `confirm()` when `payment_status !== 'unpaid'`. Both converge on one
  transaction guarded by reservation status. Fulfillment (order + tickets) happens only
  once.
- **Hold window skew, refreshed at payment.** The server holds for 12 minutes
  (`HOLD_TTL_MINUTES`); the client counts down to a deadline 2 minutes earlier (10 min),
  so a payment submitted right at the buyer's zero still has runway to settle and have
  its webhook delivered before the server releases the hold. `beginPayment` also
  refreshes `expiresAt` to a fresh full window, so a buyer who browsed a while still gets
  the whole payment window without long browsing holds starving inventory.
- **Auto-refund on the expiry race.** If payment still lands after the hold released,
  `confirm()` atomically re-acquires the exact quantities; if any line cannot be
  re-acquired, it refunds the whole PaymentIntent (idempotency key
  `refund-<reservationId>`), marks the reservation `REFUNDED`, and the buyer is told
  clearly. No partial fulfillment, no oversell, no held money. The skew + refresh make
  this rare; it is the backstop, not a hot path.
- **The legacy `/events/` flow and its Pages Router webhook are untouched** by this
  change; the maintenance-window cutover remains a separate later initiative.

### Cancel-then-release (makes the refund state structurally impossible)

The expiry sweep (`sweepExpiredHolds`, run by the `/api/cron/expire-reservations` cron —
scheduled via Supabase `pg_cron` + `pg_net`, see
[the runbook](../runbooks/expire-reservations-cron.md))
**cancels the payment before releasing inventory** — Stripe's own recommended mechanism
([Manage limited inventory](https://docs.stripe.com/payments/checkout/managing-limited-inventory)).
For a hold that reached payment (has a `stripeCheckoutSessionId`), it calls
`stripe.checkout.sessions.expire` _first_:

- Stripe only expires an OPEN Session, atomically. If expire **succeeds**, that Session can
  never be paid → releasing the tickets is safe, and no later payment can land.
- If expire **throws** (already paid, or transient), the hold is **not** released — the
  webhook / sync poll converts it, or the next sweep retries. There is never "inventory
  released + a still-payable Session".

So a reservation only reaches `EXPIRED` after its Session was provably killed, which makes
the paid-after-expiry `needs_refund` branch unreachable via the normal path. The auto-refund
stays as **defense-in-depth** (e.g. a payment landing on a `RELEASED` hold), not an expected
outcome. Session-less browsing abandons still release with **no** Stripe call, so the sweep's
Stripe coupling is bounded to holds that actually armed for payment. Sessions also carry
`expires_at` (2 h) as a backstop cap for any Session the sweep never reaches.

Note the floor this works around: Stripe's `expires_at` **minimum is 30 minutes**, longer
than a ticket hold needs — which is exactly why inventory truth lives in our own counters
with a shorter TTL, and the sweep drives Session expiry manually (the manual `expire`
endpoint is not subject to the 30-minute floor).

## Consequences

- **Good:** follows Stripe's recommended, forward-looking integration; leaves the door
  open to Stripe-managed tax/discounts/subscriptions/adaptive-pricing later without a
  rewrite. Hybrid fulfillment means a slow or down webhook doesn't strand buyers.
  Auto-refund keeps the reservation model's overselling guarantee intact under the
  payment-after-expiry race. Reservation service stays Stripe-free and independently
  testable.
- **Cost / trade-off:** a Session→PaymentIntent indirection over today's PI-keyed schema
  (we persist `stripeCheckoutSessionId` and backfill `stripePaymentIntentId` at confirm
  time for refund traceability). We adopt `CheckoutElementsProvider`/`useCheckoutElements`,
  a client surface not previously used here. The shared Stripe client's API version moved
  `2023-10-16 → 2026-06-24.dahlia`, which also affects the legacy flow — verified by
  typecheck and gated on a test-mode legacy re-verification before release.
- **Fee divergence, accepted:** `/e/` charges the new flat 8% + $0.50 (no legacy 15%
  tax-on-fee) while `/events/` still charges the old fee until cutover. Buyers on the new
  page pay less; the discrepancy ends at cutover.
- **Deferred:** delayed-settlement payment methods, saved cards / Stripe Customer reuse,
  Stripe Connect payouts, and the Stripe-Sessions-exclusive commerce features — all
  reachable later behind the single `beginPayment` seam.
