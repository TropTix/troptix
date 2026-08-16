---
title: Organizer Payout Requests
status: proposed
created: 2026-08-16
tracking-issue: TBD
---

# Organizer Payout Requests

Give an Organizer a payouts screen: how much they can withdraw now, what is
still pending, and what has already been paid. They request a payout; TropTix
sends the money by hand and marks the request paid on a Platform View screen.

This is the **manual rail**. The Stripe Global Payouts automation (decided
2026-07-22) replaces the "send money by hand" step later; everything else here
— the earnings math, the request lifecycle, both screens — carries over
unchanged. This plan deliberately builds the ledger and the workflow, not the
money movement.

## Non-goals

- No bank details in the database. The request carries a free-text note; the
  destination is settled off-platform. (Public repo; no encryption story yet.)
- No Stripe integration, no automatic transfers.
- No refund netting — refunds are still unmodeled (`OrderStatus` has no
  `REFUNDED`). When refunds land, they subtract from earned; the math below
  has one place to add that term.
- No currency choice. Everything is USD integer cents, as everywhere else.

## Vocabulary

New terms for CONTEXT.md (added when this ships; the existing **Payout** entry
gets rewritten — it currently says "not computed"):

- **Earnings** (per order): what the Organizer keeps from a `COMPLETED` order —
  `subtotalCents` minus **absorbed fees**. Passed fees (`PASS_TICKET_FEES`)
  ride on top of the subtotal and never touch it; absorbed fees
  (`ABSORB_TICKET_FEES`) come out of it.
- **Available**: earnings the Organizer can request right now. An event's
  earnings enter this bucket when the event **ends**, minus a **holdback**;
  the holdback joins 20 days after the event ends. Open and paid requests
  subtract from it.
- **Pending**: earnings not yet available — sales for events that have not
  ended, plus holdbacks inside their 20-day window.
- **Paid out**: the sum of `PAID` payout requests.
- **Payout request**: the Organizer's ask to withdraw some amount of Available.
  Lifecycle: `REQUESTED → PAID` (admin marks done) or `→ REJECTED` (admin, with
  a note) or `→ CANCELLED` (organizer, while still `REQUESTED`).

## Earnings math

The invariant, per Organization:

```
earned(event)   = Σ subtotalCents − Σ absorbedFeesCents      over COMPLETED orders
released        = Σ over ended events:
                    event ended ≥ 20 days ago → earned(event)
                    event ended < 20 days ago → earned(event) × (1 − 0.20)
pending         = Σ earned(not-yet-ended events) + the held-back remainder
available       = released − Σ amountCents of (REQUESTED + PAID) requests
paidOut         = Σ amountCents of PAID requests
```

Holdback: **20% for 20 days after the event ends** (constants in one module,
`packages/api/src/services/_shared/payouts.ts`, next to `fees.ts`). See the
market comparison below for how this sits against other platforms.

**Absorbed fees are derived at read time.** The DB only records fees the buyer
paid: checkout sets `feesCents = 0` for `ABSORB_TICKET_FEES` types
([checkout.ts](../../packages/api/src/services/checkout.ts)), so
`Orders.feesCents` never contains the absorbed cut. The service therefore:

1. Groups `Tickets` rows of `COMPLETED` orders by `(ticketTypeId, subtotal)` in
   SQL (per event),
2. applies `calculateFeesCents` (8% + $0.50) in JS to each group where the
   type's `ticketingFees = 'ABSORB_TICKET_FEES'`,
3. sums.

Tickets whose type was deleted (`ticketTypeId` null) can't be attributed; they
count as no absorbed fee (the passed-fee default). The fee is computed against
each ticket's own stored `subtotal`, so later price edits don't rewrite
history. If `FeeConfig` ever changes, past absorbed fees would drift — accepted
for v1; the request row snapshots `amountCents` at request time, so anything
already requested or paid is frozen.

All sums are SQL aggregates per the dashboard convention — nothing reduces over
full ticket tables in JS beyond the per-(type, price) groups.

## Market comparison

What other platforms do, as of August 2026 (from their help centers and
published comparisons — links in the PR description):

| Platform      | When money moves                                                                                                        | Holdback / reserve                                                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Eventbrite    | Automatic, ~3–5 business days after the event ends                                                                      | 20% of net sales held until the final payout; discretionary reserves for risky events. Instant Payouts (early access) for eligible US organizers at a 3% fee |
| Dice          | Automatic, within 5 business days after the event                                                                       | Up to 5% held for 6 months                                                                                                                                   |
| TickPick      | Automatic, the Wednesday after the event; weekly "Lightning" payouts during the sale window on request + account review | Case-by-case for early payouts                                                                                                                               |
| Ticket Tailor | Rolling — money lands in the organizer's own Stripe/Square/PayPal as tickets sell                                       | Whatever the processor's reserve rules are (organizer is merchant of record)                                                                                 |
| TicketSpice   | Automatic, weekly                                                                                                       | Standard risk holds                                                                                                                                          |
| Posh          | On-demand, same-night or daily                                                                                          | Varies                                                                                                                                                       |

Patterns worth noting:

- **Pay-after-event is the norm** for merchant-of-record platforms (Eventbrite,
  Dice, TickPick). The ones that pay during the sale either make the organizer
  the merchant of record (Ticket Tailor) or price the risk in (Posh, Shotgun,
  Eventbrite's 3% Instant Payouts).
- **A reserve on top of pay-after-event is also the norm.** Eventbrite's is
  exactly 20%; Dice holds up to 5% but for 6 months.
- **Payouts are usually automatic**, not requested. Request-based is our v1
  simplification because the transfer itself is manual; when the Stripe rail
  lands, a scheduled auto-payout can replace the request button without
  touching the ledger.

TropTix's **20% for 20 days** matches Eventbrite's percentage with a much
shorter tail than Dice's, and is defensible to organizers by pointing at
Eventbrite. The chargeback window (typically ~120 days) is far longer than any
of these holds — every platform accepts that tail risk; ours is bounded by
graduated trust per organizer rather than the holdback alone.

## Schema

One migration (`yarn db:new payout_requests`):

```prisma
enum PayoutRequestStatus {
  REQUESTED
  CANCELLED
  REJECTED
  PAID
}

model PayoutRequest {
  id          String              @id @default(uuid())
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
  status      PayoutRequestStatus @default(REQUESTED)
  amountCents Int
  // Organizer's free-text note ("wire to the usual account"). Never bank details.
  note        String?             @db.VarChar(500)

  // Set when an admin resolves (PAID or REJECTED).
  resolvedAt       DateTime?
  resolvedByUserId String?
  // Admin-side note / manual-transfer reference (bank ref, reason for rejection).
  adminNote        String?  @db.VarChar(500)

  organization      Organization @relation(fields: [organizationId], references: [id])
  organizationId    String
  requestedByUserId String

  @@index([organizationId])
  @@index([status])
}
```

Requests hang off the **Organization** (money is org-level, ADR 0019/0024);
`requestedByUserId` records who clicked. RLS enabled in the migration per the
convention; the app connects as bypassrls.

`supabase/seed.sql` additions, so a preview branch can exercise both screens:
an **ended** event (endsAt in the past, > 20 days) with `COMPLETED` orders
under the demo Organization, plus one `REQUESTED` and one `PAID`
`PayoutRequest` row (explicit column lists).

## Service layer

Two services, same shape as the rest of the organizer surface (pure over
injected `prisma`, authorization via the scope seam):

**`packages/api/src/services/organizer-payouts.ts`**

- `getPayouts(prisma, actor, input)` → `OrganizerPayouts`:
  `{ availableCents, pendingCents, paidOutCents, requests[] }`. Scoped through
  `resolveOrganizerScope` (View-as works, read-only), then
  `organization.findFirst({ ownerUserId })`.
- `requestPayout(prisma, actor, { amountCents, note })`: recomputes
  `availableCents` **inside a transaction** and rejects
  `amountCents > available` or `≤ 0` (`InvalidPayoutAmountError`). At most one
  open (`REQUESTED`) request per Organization — a second ask fails with
  `PayoutRequestPendingError`; this keeps the concurrent-request race harmless
  (two opens can't both pass the one-open check on serialized writes).
- `cancelPayoutRequest(prisma, actor, { id })`: organizer cancels own
  `REQUESTED` row.
- Writes never accept a View-as target, per the seam's rule.

Money is **owner-only** (glossary: Owner = "members and money"): the write
checks the actor owns the Organization. Today the scope already resolves to
the owner (Membership v1 is schema-only), so this is one explicit check, not a
new seam.

**`packages/api/src/services/platform-payouts.ts`**

- `listPayoutRequests(prisma, actor)` — every request, newest first, with
  organization display name + owner email. Gated on `Users.isPlatformOwner`
  (the Platform View gate; this is a third door only in the sense that
  Platform View grows a page — same grant, same gate shape as
  `getAllPlatformEvents`).
- `resolvePayoutRequest(prisma, actor, { id, outcome: 'PAID' | 'REJECTED', adminNote })`
  — flips `REQUESTED → PAID/REJECTED`, stamps `resolvedAt`/`resolvedByUserId`.
  Guarded `updateMany({ where: { id, status: 'REQUESTED' } })` so a double
  click or an organizer cancel racing the admin resolves exactly once.

Contracts in `packages/api/src/contracts/payouts.ts` (zod schemas + types),
re-exported from `index.ts`. Unit tests beside each service, per convention.

## Web UI

**Organizer: `/organizer/payouts`** (server component + server actions, like
the rest of `/organizer`):

- Three stat cards — Available, Pending, Paid out — same `Card` grid as the
  dashboard.
- "Request payout" button (disabled at $0 or while a request is open) opening a
  dialog: amount (default = full available, editable down), optional note, and
  a line stating the holdback rule so Pending is explicable.
- Requests table: date, amount, status badge, note, resolution
  (date + admin note). `REQUESTED` rows get a Cancel action.
- Server actions in `_actions/payoutActions.ts` follow `eventActions.ts`:
  validate, `userToActor`, call service, map typed errors to messages,
  `revalidatePath`.
- Nav: add a Payouts link to the organizer nav in `unified-header.tsx`.

**Platform View: `/organizer/platform/payouts`**:

- Table of all requests (organization, owner email, amount, note, age,
  status), `REQUESTED` first.
- Per open row: **Mark paid** (with optional reference note) and **Reject**
  (note required). Both confirm before writing.
- Page-level gate identical to Platform Events (`notFound()` unless
  `isPlatformOwner`).

Amounts render with the existing `formatCents`; request timestamps are
operational timestamps (viewer-local, `<LocalTime>` where client rendering is
needed).

## Decisions to record

When implementation starts, one ADR: _payouts are request-based over an
event-end + holdback release rule; money movement is manual and off-platform
for v1_ — capturing the availability formula and the one-open-request
constraint, and superseding nothing.

## Phases

Single PR is likely fine (one migration + two services + two screens), but if
split:

1. Migration + services + contracts + tests + seed.
2. Organizer screen + actions + nav.
3. Platform View screen + actions.

## Open questions

- Should a `REJECTED` request notify the organizer by email (outbox pattern)?
  v1 shows it in the table only.
- Holdback constants — **20% / 20 days** (decided 2026-08-17, informed by the
  market comparison). They live in one module, so tuning later is a one-line
  change; per-organizer overrides (graduated trust) are a later phase.
