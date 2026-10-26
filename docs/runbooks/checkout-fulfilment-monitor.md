# Runbook: is the reservation webhook alive?

Every paid order on `/e/` is fulfilled by one of two paths (ADR 0030): the
`checkout.session.completed` webhook, or the one sync attempt the buyer's browser
makes through `checkout.finalizePayment`. Both are correct on their own, which is
the problem: if the webhook endpoint breaks (wrong signing secret, 4xx from a
deploy, Stripe retries exhausted after three days), buyers still get tickets from
the sync path and nothing looks wrong until the day the sync path fails too.

The server-side `order_completed` PostHog event carries `fulfilled_via`
(`webhook`, `sync`, or `free`). In a healthy system the webhook wins most of the
time because it fires before the browser's round trip completes. A webhook share
near zero over any window with paid orders means the endpoint is dead.

## What exists (project "Web", PostHog US)

Two insights on **My App Dashboard**, created 2026-09-22 through the API:

- **Checkout fulfilment path** — https://us.posthog.com/project/185307/insights/eOk2v4Zj
  `order_completed`, filter `order_type = PAID`, breakdown by `fulfilled_via`,
  stacked bar, daily. This is the one to read.
- **Webhook-fulfilled paid orders** — https://us.posthog.com/project/185307/insights/PmzBR8RC
  `order_completed`, filters `order_type = PAID` and `fulfilled_via = webhook`,
  line, daily. It exists only to carry the alert, because PostHog alerts cannot
  target one series of a breakdown.

One alert, **Reservation webhook not fulfilling**, on the second insight: fires
when the daily value is below 1, checked daily, notifying the account that
created it. PostHog cannot condition it on "and paid orders happened", so on a
day with no paid orders at all it fires too. Treat that as a nudge to look at
the first insight, not as an incident.

Orders from before 2026-09-22 show as a `null` breakdown; `fulfilled_via` only
started arriving with the deploy that added it.

## When it fires

1. Open the first insight. If the day has sync orders and no webhook orders,
   the endpoint is dead. If the day has no paid orders at all, it is quiet.
2. Stripe Dashboard → Developers → Webhooks → the `/api/stripe/reservation-webhook`
   endpoint → Event deliveries. Failed deliveries show the HTTP status.
3. `400 Invalid signature` → `STRIPE_RESERVATION_WEBHOOK_SECRET` on Vercel does
   not match the endpoint's signing secret. Fix the env var and redeploy.
4. `500` → read the function logs for `[ReservationWebhook] Handler error`.
5. Once fixed, resend the failed events from the Stripe Dashboard. Each resend
   answers `duplicate: true` for orders the sync path already fulfilled, and
   fulfils the rest.
