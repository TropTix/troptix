---
title: Checkout payment verification — webhook first, one sync fulfil, no Stripe polling
status: active
created: 2026-09-21
tracking-issue: #567
---

# Checkout payment verification

## Problem

Paid checkout on `/e/` (ADR 0018) fulfils orders two ways: the
`checkout.session.completed` webhook, and a client poll. After `checkout.confirm()`
Stripe redirects the buyer back to the event page, the sheet opens on the
`finalizing` step, and `CheckoutSheet` polls `checkout.getCheckoutState` every 1.5 s
until it sees an order. Each poll retrieves the Checkout Session from Stripe and, if
paid, runs `confirmPaid` itself.

That is the reverse of what Stripe prescribes. The webhook is meant to be the
fulfiller; the landing page makes **one** fulfil attempt so the buyer sees their
tickets at once. Our poll makes the browser the fulfiller and turns Stripe into a
status feed we hit up to 40 times a minute per buyer.

What breaks today:

1. **A failed poll hangs the buyer.** `CheckoutSheet` never reads
   `stateQuery.error`. Any throw inside `getCheckoutState` (a Stripe 429 or 5xx, a
   DB error, the `CONVERTED but has no orderId` guard) leaves the spinner on screen.
   After 20 s the copy says tickets will arrive by email, but the step never
   changes and the poll keeps firing. This is the error we are seeing.
2. **Every poll is a Stripe read.** `getCheckoutState` calls
   `stripe.checkout.sessions.retrieve` on every tick. Stripe caps a single endpoint
   at 25 requests/s and the whole account at 100/s in live mode, and counts reads
   against a 500-reads-per-transaction allowance. Forty buyers on the finalizing
   screen at once exceed the endpoint cap, Stripe returns 429, and item 1 follows.
   React Query also refetches on window focus and reconnect, adding reads we never
   asked for.
3. **A GET performs money moves.** The poll is a tRPC query, yet it can create the
   order and can issue a Stripe refund. Correctness holds because `settle` takes a
   row lock and the refund key is fixed, but a read path that refunds is hard to
   reason about and hard to observe.
4. **The webhook does slow work before it answers.** The handler settles the
   reservation, then builds and sends the confirmation email (PDF attachments
   included) before returning 200. Stripe asks for a fast 2xx and treats a timeout
   as a failed delivery. Our dedupe check (`ProcessedStripeEvent`) also runs before
   the work rather than as an atomic claim, so two concurrent deliveries both run
   the handler.
5. **Nobody knows when the webhook is dead.** If the signing secret is wrong or
   the endpoint is unreachable, every order is still fulfilled by the poll and no
   signal fires. Stripe retries for three days, then drops the events. The day the
   poll also fails, fulfilment stops silently.
6. **A double-charge gap on resume.** `beginPayment` mints a fresh Session when the
   stored one is not `open`. A Session that is `complete` (paid, webhook not yet
   landed) falls into that branch. The buyer can pay a second Session for the same
   reservation; its webhook hits `settle`, sees `CONVERTED`, returns
   `alreadyProcessed`, and the second payment is never refunded.
7. **A full page reload sits in the hot path.** `confirm()` redirects to
   `return_url` for every payment, so a card payment that needs no redirect still
   reloads the page, remounts the sheet, and starts the poll from cold.

## What Stripe says

From [Fulfill orders](https://docs.stripe.com/checkout/fulfillment?payment-ui=checkout-form):

> You can't rely on triggering fulfillment only from your checkout landing page,
> because it's not guaranteed customers visit that page.

> Listening to webhooks is required to make sure you always trigger fulfillment for
> every payment, but webhooks can sometimes be delayed. To optimize your payment
> flow and guarantee immediate fulfillment when your customer is present, trigger
> fulfillment from your landing page as well.

The landing-page recipe is one call: extract the Session id, run
`fulfill_checkout` once, render the page after it returns. `fulfill_checkout` must
retrieve the Session, check `payment_status`, fulfil once, and record that it did.

From [Receive Stripe events](https://docs.stripe.com/webhooks):

> Quickly return a 2xx response … before any complex logic that could cause a
> timeout.

> Configure your handler to process incoming events with an asynchronous queue.

> Track event IDs to identify duplicate deliveries.

Stripe retries failed deliveries with exponential backoff for up to three days in
live mode and does not guarantee event order.

From [Rate limits](https://docs.stripe.com/rate-limits):

> Stripe uses rate limiting to maximize API stability and prevent abuse, so treat
> limits as maximums and avoid unnecessary load.

Global 100 req/s live (25 in sandbox), 25 req/s per endpoint, and a rolling
allowance of 500 read requests per transaction.

From the [`confirm()` reference](https://docs.stripe.com/js/custom_checkout/confirm):

> By default, `confirm` will always redirect to your `returnUrl` after a successful
> confirmation. If you set `redirect: "if_required"`, then `confirm` will only
> redirect if your user chooses a redirect-based payment method.

## Target design

Two fulfilment triggers, both calling the same idempotent `settle`, and nothing
else:

- **Webhook** (`checkout.session.completed`): the guaranteed path. Claims the event
  id atomically, settles inline (a millisecond DB transaction), returns 200, and
  runs email and analytics after the response.
- **One sync fulfil when the buyer is present.** After `confirm()` resolves with
  `type: 'success'`, the client calls a new mutation `checkout.finalizePayment`
  once. It retrieves the Session once, settles, and returns the order. The same
  mutation runs once on the `?reservation=` resume path (refresh, or a redirect-based
  payment method later).

The poll survives only as a **DB-only wait** for the webhook when the sync fulfil
could not conclude: it reads the reservation row, never Stripe, backs off, and
stops after a bounded window with a clear "your tickets are on the way by email"
exit. `getCheckoutState` becomes a pure read.

```
confirm() ──success──▶ finalizePayment ──order──▶ success screen
                            │
                            └─not settled──▶ DB wait (≤60 s, backoff) ──▶ order | email exit
                                                    ▲
webhook ── settle ── 200 ── after(): email ─────────┘
```

## Phases

Each phase is one PR. Phase 1 ships alone first; it stops the bleeding and
touches only the client.

### Phase 1 — The spinner can no longer hang

`apps/web/src/app/e/[eventId]/_components/CheckoutSheet.tsx`

- Handle `stateQuery.error`. On error keep waiting (the webhook may still land)
  but count it; do not surface Stripe messages to the buyer.
- Bound the wait. Replace the flat 1.5 s interval with backoff (1 s, 2 s, 4 s, then
  every 5 s) and stop at 60 s. On stop, move to a new `pending` step: "Your payment
  went through. We're finishing your tickets and will email them to you." with a
  Close button. The webhook guarantees delivery.
- Set `refetchOnWindowFocus: false` and `refetchOnReconnect: false` on the query.
- Tests: a component test for error → keeps waiting → bounded exit, and for
  order → success.

### Phase 2 — Fulfil once on confirm; the poll stops talking to Stripe

`packages/api/src/services/payments.ts`, `packages/api/src/trpc/routers/checkout.ts`,
`packages/api/src/contracts/payments.ts`, `PaymentStep.tsx`, `CheckoutSheet.tsx`

- Add `finalizePayment({ reservationId })` mutation. Body is today's paid branch
  of `getCheckoutState`: retrieve the Session once, and if `payment_status !==
'unpaid'` call `confirmPaid`. Return the `CheckoutState`.
- `getCheckoutState` drops its Stripe call and becomes a pure DB read of the
  reservation row. The `held` branch keeps its reopen behaviour for resume.
- `PaymentStep.pay()` calls `checkout.confirm({ redirect: 'if_required' })`. On
  `type: 'success'` it hands off to the sheet, which calls `finalizePayment` and
  shows the order, or enters the DB-only wait from Phase 1.
- Resume path (`?reservation=` on load): call `finalizePayment` once, then the
  same branch. This is the Stripe landing-page recipe verbatim. Keep `return_url`;
  a future redirect-based method lands here.
- `confirmPaid` keeps owning the expiry-race refund, so a refund now happens only
  from a mutation or the webhook, never from a GET.
- Tests in `payments.test.ts`: `finalizePayment` settles once; `getCheckoutState`
  makes no Stripe call; the concurrent webhook + finalize test moves over from the
  poll.

### Phase 3 — The webhook answers fast and claims events atomically

`apps/web/src/app/api/stripe/reservation-webhook/route.ts`

- Claim before work: `prisma.processedStripeEvent.create` first; on the unique
  violation return `{ duplicate: true }`. If the handler then throws, delete the
  claim (or mark it failed) and return 500 so Stripe retries.
- Settle inline, then return 200. Move the confirmation email, the refund notice,
  and the analytics capture into `after()` from `next/server` (Next 16). The
  `OutboxMessage` table already exists; if the outbox dispatcher is live, enqueue
  there instead and let it send.
- Set `stripe` client `maxNetworkRetries: 2` in `apps/web/src/server/lib/stripe.ts`
  so lock-timeout 429s retry per Stripe's advice.
- Add a route test with a signed fixture event: fulfils once, dedupes on redelivery,
  returns 500 and leaves no claim when `settle` throws.

### Phase 4 — Close the double-charge gap in `beginPayment`

`packages/api/src/services/payments.ts`

- Only mint a fresh Session when the stored one is `expired`. When it is
  `complete`, run the same fulfil as `finalizePayment` and throw a typed
  `AlreadyPaidError` the client maps to the success screen.
- Test: a `complete` Session on `beginPayment` settles and never calls
  `sessions.create`.

### Phase 5 — Know when the webhook is dead

Builds on plan 014 (issue #459). Minimum useful set:

- `settle` records `fulfilledVia: 'webhook' | 'sync'` on the reservation (or a
  counter in analytics). A daily or hourly check that alerts when the webhook
  share drops to zero while sync fulfils continue means the endpoint is broken.
- Log a structured event for every refund and every `needs_refund`, and for every
  webhook 4xx/5xx we return.
- Add `STRIPE_RESERVATION_WEBHOOK_SECRET` to the deploy checklist; a missing
  secret today returns 400 for every delivery with no alert.

### Phase 6 — End-to-end coverage

Extend the Playwright suite (branch `claude/e2e-playwright`) with the paid path
using Stripe test cards and `stripe listen` forwarding, plus a case with the
webhook secret deliberately wrong to prove the sync fulfil and the bounded wait
still land the buyer on tickets or the email exit.

## Out of scope

- Delayed-settlement payment methods (`async_payment_*`). Cards only stays.
- Replacing Checkout Sessions with PaymentIntents. ADR 0018 stands.
- The legacy `/events/` flow and its Pages Router webhook.

## Decisions to record

- ADR: "Fulfilment is webhook plus one sync attempt; the client never polls Stripe."
  Supersedes the hybrid-fulfilment paragraph of ADR 0018.

## Risks

- `redirect: 'if_required'` changes the post-payment UX from reload to in-place.
  3-D Secure challenges in the Payment Element run in a modal, not a redirect, so
  cards still resolve in place. Test with Stripe's 3DS test cards.
- `after()` runs on Vercel Fluid Compute after the response is sent. Confirm the
  project is on Fluid Compute (default for new projects) or emails may be cut off.
