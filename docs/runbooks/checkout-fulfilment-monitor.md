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

## Insight

PostHog → Insights → New → Trends:

- Event: `order_completed`, filter `order_type = PAID`.
- Breakdown by `fulfilled_via`.
- Display as a stacked bar, daily.

Save it as **Checkout fulfilment path** on the checkout dashboard.

## Alert

On that insight, add an alert:

- Series: `order_completed` where `fulfilled_via = webhook`.
- Condition: value is below 1 over the last 24 hours, only when the total series
  is above 0. If PostHog's alert form cannot express the second clause, alert on
  the `sync` share exceeding 90% instead.
- Notify the engineering channel.

## When it fires

1. Stripe Dashboard → Developers → Webhooks → the `/api/stripe/reservation-webhook`
   endpoint → Event deliveries. Failed deliveries show the HTTP status.
2. `400 Invalid signature` → `STRIPE_RESERVATION_WEBHOOK_SECRET` on Vercel does
   not match the endpoint's signing secret. Fix the env var and redeploy.
3. `500` → read the function logs for `[ReservationWebhook] Handler error`.
4. Once fixed, resend the failed events from the Stripe Dashboard. Each resend
   answers `duplicate: true` for orders the sync path already fulfilled, and
   fulfils the rest.
