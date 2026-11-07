# 39. Emails go through an outbox table

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

Every email went straight to Resend from the request that caused it. A failed
send was logged and lost, a rate limit or a used-up daily quota counted as a
failure, and nothing recorded whether an email went out. Two public routes let
the checkout screen trigger sends. The plan is
[2026-06-transactional-email-outbox](../plans/2026-06-transactional-email-outbox.md).

## Decision

1. **Each email is a row in `Email`**, written in the same transaction as what
   it is about. No queue service: one would bring back the two-write problem,
   and the row is also the delivery log the app reads.
2. **Send after the response, retry from cron.** The request that enqueues calls
   `after(dispatchDueEmails)`, and a Supabase cron job POSTs
   `/api/cron/dispatch-email` every minute.
3. **Claim, then send outside a transaction.** One statement moves due rows to
   `SENDING` with `FOR UPDATE SKIP LOCKED`, so two dispatchers never share a row.
   A row left `SENDING` for 5 minutes is claimed again. The row's
   `idempotencyKey` is also Resend's, so a re-claim inside 24 hours cannot send
   twice.
4. **Retry by cause.** A rate limit or quota stops the run and waits without
   counting an attempt: a minute for the rate limit, midnight UTC for the daily
   quota, the first of the month for the monthly one. Any other error backs off
   1, 5, 30, 120 and 360 minutes, then the row is `FAILED`.
5. **The payload is not stored.** Each type's builder reads its subject at send
   time.

## Consequences

- An order can't commit without its receipt row, and a failed send is retried
  for about nine hours instead of dropped.
- Retries run only where the cron is scheduled, by hand per environment.
  Preview deploys send once through `after()`.
- A receipt may arrive up to a minute late when the `after()` send fails.
- Resend's webhook can later move the same row to delivered or bounced, which
  is what lets organizers see delivery.
