# 28. Request-based payouts over an event-end + holdback release rule

- **Status:** Accepted
- **Date:** 2026-09-01

## Context

Organizers earn money from ticket sales but had no way to see or withdraw it.
The Stripe Global Payouts automation is decided but not built; money moves by
hand from the ops bank (Mercury). The plan
([2026-08-organizer-payout-requests](../plans/2026-08-organizer-payout-requests.md))
needed three durable choices: when earnings become withdrawable, how a
withdrawal is asked for, and how much of that is fixed platform-wide.

## Decision

**Earnings release at event end, minus a holdback.** Per Organization:

```
earned(event) = Σ subtotalCents − Σ derived absorbed fees   over COMPLETED orders
released      = full earnings for events past the holdback window;
                earnings × (1 − holdback%) for ended events inside it
available     = released − Σ (REQUESTED + PAID) request amounts
```

Platform defaults are **20% held for 20 days** after the event ends
(`PayoutConfig` in `packages/api/src/services/_shared/payouts.ts`). Eventbrite
holds exactly 20%, so the number is defensible to organizers.

**Withdrawal is request-based, at most one open request per Organization.**
The organizer asks for an amount up to `available`; a Platform Owner marks it
paid (recording rail + bank reference) or rejects it with a note.
`requestPayout` recomputes `available` inside a Serializable transaction, so
the one-open-request check also serializes concurrent asks.

**Custom payout timelines are per-Organization overrides, not admin bypasses**
(decided 2026-09-01). Three columns on `Organization` — `payoutReleaseAtSale`
(release earnings as orders complete, before the event ends; the holdback
still anchors to event end), `payoutHoldbackPercent`, `payoutHoldbackDays`
(null = platform default). Paying an organizer early works by raising their
actual available balance, so the ledger, the request flow, and the audit trail
stay identical for every organizer.

**Money movement stays manual and off-platform for v1.** The request row
records the rail and the bank's transfer reference; nothing in the codebase
talks to a bank, and no bank details enter the database.

## Consequences

- The ledger is a read-time computation over orders — no balance table to
  drift, and refunds later subtract in exactly one place.
- Absorbed fees are derived against each ticket's stored subtotal; if
  `FeeConfig` ever changes, unrequested past earnings drift with it. Accepted:
  requested and paid amounts are snapshotted on the request row.
- Early payment for a trusted organizer is a policy edit, not a special-cased
  transfer, at the cost of three columns most rows leave null.
- When Stripe Global Payouts lands, only the "send money by hand" step
  changes; a scheduled auto-payout can replace the request button without
  touching the release rule.
