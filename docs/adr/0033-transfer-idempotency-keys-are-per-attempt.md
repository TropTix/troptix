# 33. Transfer idempotency keys are per attempt; the group and a row lock stop double pay

- **Status:** Accepted (supersedes the idempotency-key clause of decision 5 in ADR 0030)
- **Date:** 2026-09-27

## Context

ADR 0030 made the payout request id the Stripe idempotency key for the
transfer, so a retry after a crash would return the same transfer. Stripe's
idempotency layer saves the status and body of any request whose endpoint
began executing, failures included. A send that fails with
`balance_insufficient` therefore pins that failure to the key for 24 hours:
the admin tops up the balance, retries, and gets the cached error back. The
plan's own copy, "top up, then retry", could not work for a day.

The double-pay guard the key was meant to provide already exists twice over:
every transfer carries `transfer_group` = the request id and the send lists
the group before creating, and the request row is resolved with a guarded
update.

## Decision

1. **The idempotency key is fresh on every attempt**:
   `payout-request-<id>-<uuid>`. It still protects one attempt against its
   own network retries, which is what Stripe designed it for.
2. **The transfer group is the cross-attempt guard.** The send lists the
   group first and reuses a live transfer it finds. A reversed transfer paid
   nobody and is skipped, so a row can never be marked paid against money
   that came back.
3. **A row lock serializes attempts.** The send runs in a transaction that
   holds `SELECT … FOR UPDATE` on the request row across the Stripe calls,
   the same way checkout's settle serializes the webhook and the sync poll.
   Two admins clicking the same row make one transfer.

## Consequences

- "Top up, then retry" works as written.
- A transfer whose response was lost is still found by the group lookup on
  the next attempt, with no 24-hour cliff.
- The lock holds a database transaction open for the length of two Stripe
  calls, a second or two. Acceptable for a click that moves money; the
  transaction timeout is set to 30 seconds so Stripe's retries do not trip it.
- Reconciliation ignores reversed transfers for the same reason the send does.
