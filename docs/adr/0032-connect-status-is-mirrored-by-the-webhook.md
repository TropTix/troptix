# 32. Connect status is mirrored by the webhook; the page reads the database

- **Status:** Accepted (supersedes the live-status clause of decision 4 in ADR 0030)
- **Date:** 2026-09-24

## Context

ADR 0030 said whether an organizer's Stripe account can take a transfer "is
read live from Stripe at the two moments it matters and never cached". In
practice the organizer's payouts page became one of those moments, so every
render, and with the tabbed redesign every tab click, called
`stripe.v2.core.accounts.retrieve` in the request path. Stripe being slow or
down showed the organizer a "couldn't reach Stripe" step.

Stripe's own guidance for Accounts v2 offers two ways to know where an
account stands after the return URL: retrieve the account once at that
moment, or "cache the account's status in your application and keep it
updated by listening to the `v2.core.account[requirements].updated` event".
It does not suggest retrieving on every page view. The Connect event
destination already subscribes to that event and to
`capability_status_updated`, but the handler only recorded one fact: that
transfers went active.

## Decision

1. **One mirrored column.** `Organization.stripeTransfersStatus` holds the
   raw `stripe_transfers` capability status Stripe last reported (`active`,
   `pending`, `restricted`, ...; null until the first sync). It is Stripe's
   value, not our interpretation; `connectStateOf` derives the organizer-
   facing state from it and the gate stamp at read time.
2. **Two writers.** The webhook records the status on every subscribed event,
   in both directions. The onboarding return route does one live sync, which
   is Stripe's return-URL guidance and also covers preview deploys, which
   receive no events. Both stamp `payoutBankLinkedAt` once when the status
   reads active.
3. **Every read is a row read.** The organizer's payouts page and the
   platform panel derive state from the row. The `unavailable` state is gone:
   an unreachable Stripe at the return route leaves the row alone and reads
   as pending.
4. The admin's send (a later PR) may still retrieve live before moving money;
   that is a pre-transfer check, not a status read.

## Consequences

- The payouts page makes no Stripe call. Tab switches are database reads.
- Status can lag by one event delivery. Stripe retries failed deliveries, and
  the return route resyncs whenever the organizer comes back from onboarding.
- A per-PR preview deploy sees the status the return route wrote and nothing
  after it, since it receives no events. The runbook notes this.
- `ProcessedStripeEvent` dedupe and the idempotent stamp make redelivery and
  the return-route race safe: both writers may record the same status.
