# 30. Fulfilment is the webhook plus one sync attempt; the client never polls Stripe

- **Status:** Accepted
- **Date:** 2026-09-21
- Supersedes the "hybrid fulfillment" paragraph of [ADR 0018](0018-paid-checkout-on-checkout-sessions.md).

## Context

ADR 0018 named the `checkout.session.completed` webhook the canonical fulfiller and
let the client-facing `getCheckoutState` fulfil too, so a slow webhook would not
strand a buyer. In practice the client polled that query every 1.5 s after
payment, and every poll retrieved the Checkout Session from Stripe and, if paid,
ran fulfilment. The browser had become the fulfiller and Stripe a status feed.

That shape failed in three ways. A thrown poll (Stripe 429, DB error) hung the
buyer on the finalizing spinner because the client never read the error. Every
poll counted against Stripe's per-endpoint limit of 25 requests/s, so a few dozen
buyers finalizing at once produced 429s. And a GET could create orders and issue
refunds, which is hard to observe and reason about.

Stripe's [fulfillment guide](https://docs.stripe.com/checkout/fulfillment) is
explicit: webhooks are required, and the landing page should make **one** call to
the same fulfil function so the buyer sees the result at once. Nothing there
polls.

## Decision

Two fulfilment triggers, both converging on the idempotent `settle`:

1. **The webhook** (`checkout.session.completed`) is the guaranteed path. It
   claims the event id, settles, answers 2xx, and does email work after the
   response.
2. **One sync attempt while the buyer is present**, the `checkout.finalizePayment`
   mutation. It retrieves the Session once, settles if `payment_status` is not
   `unpaid`, and returns the checkout state. The client calls it exactly once:
   after `confirm()` resolves with `type: 'success'`, or on the `?reservation=`
   resume path after a redirect or a refresh.

`getCheckoutState` is a pure read of the reservation row. The client may poll it
while waiting for the webhook, with backoff and a ceiling, but that poll never
reaches Stripe and never fulfils.

`confirm()` is called with `redirect: 'if_required'`, so a card payment resolves
in place and the redirect to `return_url` is reserved for redirect-based methods.

## Consequences

- **Good:** one Stripe read per checkout instead of one per poll tick. Fulfilment
  and refunds happen only from a mutation or the webhook. A dead webhook is
  visible as a rise in sync-path fulfilment rather than hidden by the poll. The
  in-place confirm removes a full page reload from the hot path.
- **Trade-off:** a buyer whose sync attempt fails and whose webhook is slow waits
  on a DB-only poll for up to a minute, then sees a "still confirming" notice and
  gets tickets by email. That is the behaviour Stripe designs for.
- **Unchanged:** `settle`'s row lock and the fixed refund idempotency key still
  make concurrent webhook and sync attempts safe. The cancel-then-release sweep
  from ADR 0018 stands.
