---
title: Email outbox with delivery status
status: proposed
created: 2026-06-26
tracking-issue: TBD
---

# Email outbox with delivery status

> Revised 2026-11-05. The June draft waited on the new paid checkout, which is
> now live, and it assumed Supabase sent sign-in emails itself. Neither holds.
> This revision also adds what the June draft left out: a record of whether each
> email arrived.

## Context

Every email the app sends goes straight to Resend, inline, and nothing keeps a
record of it. All sending lives in `apps/web/src/server/lib/email.ts`:

| Email              | Sent from                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Order confirmation | `after()` in the reservation webhook, and the checkout success screen, which POSTs `/api/checkout/confirmation` and forgets |
| Refund notice      | `after()` in the reservation webhook, and the checkout's refunded step, which POSTs `/api/checkout/refund-notice`           |
| Dispute notice     | `after()` in the reservation webhook, to `info@usetroptix.com`                                                              |
| Guest invitation   | Inline Resend batch in the server action (open PR #653)                                                                     |

The only guard against a double send is Resend's idempotency key, which lasts
24 hours.

What goes wrong:

1. **No record.** "Did the patron get their tickets?" can be answered only from
   the Resend dashboard or Vercel logs. Neither the organizer nor we can see it
   in the app.
2. **A failed send is lost.** The error is logged and dropped. Nothing retries.
3. **Quota and rate limits count as failures.** Resend allows 10 requests a
   second per team, and the Free plan stops at 100 emails a day
   (`daily_quota_exceeded`, a 429). Both are dropped like any other error, so a
   busy day silently loses receipts until midnight UTC.
4. **Open send endpoints.** Anyone can POST an order or reservation id to the two
   checkout routes and trigger a send. The ids are hard to guess, but the routes
   need not exist.
5. **Unescaped HTML.** The refund and dispute notices put `eventName` and
   `firstName` into HTML as they are. The organizer writes one and the patron the
   other.

The `OutboxMessage` table has been in the schema since June. Nothing writes to it
or reads from it.

Sign-in codes are not part of this. Supabase sends them over SMTP through our
Resend account, from `auth.usetroptix.com` with their own key. They do share the
team's request rate limit and daily quota, which is one more reason to retry
instead of drop.

## Decision

### The outbox, not a queue service

The checkout writes the email row in the same transaction that creates the order,
so both commit or neither does. A dispatcher sends it later and retries on
failure. A queue service (SQS, Inngest, QStash) would bring back the two-write
problem unless we kept an outbox as well, and Postgres `FOR UPDATE SKIP LOCKED`
is enough queue for our volume, which is about 13 receipts a month today.

The outbox stays; the dispatcher can be swapped. If we ever need more, the
dispatcher becomes a relay to pgmq or QStash and the enqueue never changes.

### One table, `Email`, that is also the delivery log

`OutboxMessage` has no rows and no readers, so we replace it rather than add to
it. The new table holds one row per email and carries both halves: whether we
handed it to Resend, and what Resend says happened next.

```prisma
model Email {
  id             String      @id @default(uuid())
  createdAt      DateTime    @default(now())
  type           String      // order_confirmation | refund_notice | dispute_notice | guest_invitation
  subjectId      String      // the order, reservation, dispute or grant this email is about
  to             String
  idempotencyKey String      @unique
  priority       Int         @default(0) // 0 transactional, 1 bulk; lower sends first
  status         EmailStatus @default(PENDING)
  attempts       Int         @default(0)
  nextAttemptAt  DateTime    @default(now())
  claimedAt      DateTime?
  lastError      String?
  resendId       String?     @unique
  sentAt         DateTime?
  statusAt       DateTime?   // when Resend last moved the status

  @@index([status, nextAttemptAt])
  @@index([subjectId])
}

enum EmailStatus {
  PENDING     // waiting to send, or waiting to retry
  SENDING     // claimed by a dispatcher
  SENT        // Resend accepted it
  DELAYED     // email.delivery_delayed
  DELIVERED   // email.delivered
  BOUNCED     // email.bounced
  SUPPRESSED  // email.suppressed
  FAILED      // Resend's email.failed, or we gave up after the last attempt
  COMPLAINED  // email.complained
}
```

The payload is not stored. Each type has a builder that reads the subject at send
time and renders the email, so a row stays small and an edit to the order before
sending is picked up.

`idempotencyKey` is the Resend idempotency key too, so a retry inside 24 hours
can never send twice. Each type defines it: `confirmation-<orderId>`,
`refund-<reservationId>`, `dispute-<disputeId>`, `invite-<grantId>-<sentAt>`.
The unique index also stops a second enqueue of the same email, so the webhook
and the sync finalize path can both enqueue and only one row is written.

### Sending: an `after()` kick, with cron as the safety net

Whoever enqueues also calls `after(() => dispatch(emailId))`, so a patron gets
the receipt as fast as today. Once a minute, Supabase cron POSTs
`/api/cron/dispatch-email`, which sends whatever is due: rows the kick missed,
retries, and rows enqueued where no `after()` exists.

The June draft dropped the kick to keep a single dispatch caller. Claiming rows
makes two callers safe, and the kick keeps receipts instant, so it stays.

A claim is one short transaction:

```sql
update "Email" set status = 'SENDING', "claimedAt" = now()
where id in (
  select id from "Email"
  where (status = 'PENDING' and "nextAttemptAt" <= now())
     or (status = 'SENDING' and "claimedAt" < now() - interval '5 minutes')
  order by priority, "createdAt"
  limit 20
  for update skip locked
)
returning *;
```

The send runs outside any transaction. The second clause rescues rows left in
`SENDING` by a crashed function.

### Retries follow the error

| Resend says                                      | We do                                                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Accepted                                         | `SENT`, store `resendId` and `sentAt`                                                                                         |
| `rate_limit_exceeded`                            | Back to `PENDING`, no attempt counted, retry in a minute. Stop this run.                                                      |
| `daily_quota_exceeded`, `monthly_quota_exceeded` | Back to `PENDING`, no attempt counted, `nextAttemptAt` = the next midnight UTC (or first of the month). Stop this run. Alert. |
| `concurrent_idempotent_requests`                 | Back to `PENDING`; the other request will finish it                                                                           |
| Any other error                                  | `attempts + 1`, `lastError`, `nextAttemptAt` = now + 1, 5, 30, 120, 360 minutes. After the sixth attempt, `FAILED`. Alert.    |

Six attempts span about nine hours, enough to ride out a Resend outage without
retrying every minute.

Each email is sent on its own with `resend.emails.send`, not the batch endpoint.
The receipt carries an `.ics` file, and the batch endpoint takes no attachments.
At 20 rows a run and one run a minute, 200 guest invitations clear in 10 minutes.
That's fine for invitations, and `priority` puts receipts ahead of them.

Every send carries the tag `email_id: <Email.id>`, so a Resend event can be traced
to its row even before `resendId` is stored.

### Delivery status from Resend's webhook

`POST /api/resend/webhook` takes `email.delivered`, `email.delivery_delayed`,
`email.bounced`, `email.complained`, `email.failed` and `email.suppressed`. It
verifies the Svix signature with `resend.webhooks.verify` against the raw body,
finds the row by `data.email_id` (falling back to the `email_id` tag), and moves
the status.

Events can arrive late, twice, or out of order. Resend retries for about a day. A
status only moves to a higher rank:

```
PENDING < SENDING < SENT < DELAYED < DELIVERED < BOUNCED = SUPPRESSED = FAILED < COMPLAINED
```

So a late `delayed` after `delivered` changes nothing, and `complained` after
`delivered` is kept. An event for an unknown `email_id` gets a 200 and is
ignored. Sign-in codes come through the same account and will show up here.

We don't subscribe to opens or clicks. Opens are unreliable (Apple Mail loads
every image), and we have no use for clicks.

Resend's Free plan allows one webhook endpoint. That one goes to production.
Preview deploys get no delivery events; their rows stop at `SENT`.

### What people see

- **Organizer**, on the order detail and the attendee list: "Receipt delivered",
  "Receipt bounced" or "Receipt sending", from the latest `order_confirmation`
  row for that order. On the Access codes page: the same for each guest
  invitation.
- **Us**: a PostHog event `email_failed`, sent server-side whenever a row reaches
  `FAILED`, `BOUNCED` or `COMPLAINED`, and on quota errors. It gets an hourly
  alert, like the sign-in alerts.

Patrons see nothing new. Their receipt either arrives or the organizer can tell
them it didn't.

### Scope

- All four email types move onto the outbox. The two checkout POST routes and the
  client calls to them are deleted.
- Refund and dispute notices move to React Email templates in
  `packages/transactional`, which escape their input.
- The sender stays `TropTix <info@usetroptix.com>`. Moving app email to a
  subdomain is a separate choice and not needed at today's volume.
- Not in scope: manual resend of a receipt, a retention prune of old rows, a
  daily budget for bulk mail. Each is small to add later.

## Phases

Each phase is one PR, works on its own, and changes nothing a person sees until
phase 5.

1. **Upgrade the Resend SDK.** `resend` 4.8 has no webhook helper. Upgrade to
   the current 6.x and read its migration notes. No behavior change.
2. **The outbox, for order confirmations.**
   - Migration: drop `OutboxMessage`, create `Email` and `EmailStatus`. Update
     `seed.sql` if it touches either.
   - `enqueueEmail(tx, …)` in `packages/api`. `materializeOrder` calls it inside
     its transaction, so paid and free checkouts both enqueue.
   - `dispatchEmail(id?)` and the type → builder table in
     `apps/web/src/server/lib/email.ts`. `sendEmailConfirmationEmailToUser`
     becomes the `order_confirmation` builder and throws instead of logging.
   - The reservation webhook's `after()` calls `dispatchEmail(id)` in place of
     the send.
   - `/api/cron/dispatch-email`, guarded by `CRON_SECRET`, and a runbook that
     schedules it, applied by hand per environment like `expire-reservations`.
   - Delete `/api/checkout/confirmation` and the call in `CheckoutSheet.tsx`.
   - ADR 0039: the outbox, the kick plus cron, the retry rules.
3. **Refund and dispute notices.** Enqueue the refund notice with the refund in
   `payments.ts`, and the dispute notice in the webhook. Move both to React Email.
   Delete `/api/checkout/refund-notice` and its client call.
4. **Delivery status.** `/api/resend/webhook`, the rank rule, the `email_failed`
   PostHog event and alert. Setup: create the webhook in Resend and put its
   signing secret in Vercel as `RESEND_WEBHOOK_SECRET`.
5. **Organizers see it.** Receipt status on the order detail and the attendee
   list.
6. **Guest invitations.** After #653 merges, the invite action enqueues one
   `guest_invitation` row per address with `priority` 1, in the transaction that
   creates the grants. `sendGuestInvitations` goes away. The Access codes page
   shows each invitation's status. Upgrade Resend to Pro before the
   `guest-access` flag goes on in production, since a 100-address batch would use
   up a Free day.

## Verification

- **Enqueue** (`packages/api`, real Postgres): `confirm()` and `completeFree()`
  each write one `PENDING` `order_confirmation` row; a rolled-back transaction
  writes none; a second enqueue for the same order writes none.
- **Dispatcher**, with Resend faked at the network edge:
  - accepted → `SENT` with `resendId`
  - a 500 → `PENDING`, `attempts` 1, `nextAttemptAt` a minute out; the sixth
    failure → `FAILED`
  - `rate_limit_exceeded` → `PENDING`, `attempts` unchanged, the run stops
  - `daily_quota_exceeded` → `nextAttemptAt` at the next midnight UTC
  - two dispatchers at once → one send
  - a row stuck in `SENDING` for 6 minutes → claimed again
- **Cron route**: a wrong or missing secret → 401, no rows touched.
- **Webhook**: a bad signature → 400. `delivered` then `delayed` → stays
  `DELIVERED`. `complained` after `delivered` → `COMPLAINED`. An unknown id → 200,
  nothing written. The same event twice → one change.
- **End to end** on a preview: a free and a paid checkout each send one receipt,
  and the row reads `SENT`. In production, the row reaches `DELIVERED` within a
  minute.

## Sources

- Resend idempotency keys (24 hours, 409 on conflict):
  https://resend.com/docs/dashboard/emails/idempotency-keys
- Resend errors (`daily_quota_exceeded` and `rate_limit_exceeded` are 429s):
  https://resend.com/docs/api-reference/errors
- Resend rate limit (10 a second per team):
  https://resend.com/docs/api-reference/introduction
- Resend webhook events and payload:
  https://resend.com/docs/webhooks/event-types
- Verifying webhooks (`resend.webhooks.verify`, raw body):
  https://resend.com/docs/webhooks/verify-webhooks-requests
- Webhook retries (about a day of backoff):
  https://resend.com/docs/webhooks/retries-and-replays
- Resend batch endpoint (no attachments):
  https://resend.com/docs/api-reference/emails/send-batch-emails
- Resend pricing (Free: 100 a day, one webhook endpoint):
  https://resend.com/pricing
- Supabase Cron: https://supabase.com/docs/guides/cron
