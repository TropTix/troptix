# 37. Grants replace the ticket-type access code

- **Status:** Accepted
- **Date:** 2026-11-03

## Context

ADR 0035 made an access code a canonical string on the ticket type that
hides the type and unlocks it for whoever types it. That string cannot cap
its uses, cannot expire and cannot name who it was for, so a presale, a
sponsor's block of ten or an invitation each need something it cannot say.
The guest access plan ([2026-10-guest-access.md](../plans/2026-10-guest-access.md))
settles the model; this record keeps the decisions the code depends on.

## Decision

- **A grant is a row, not a column.** `Grant` belongs to one event and lists
  the ticket types it unlocks through `GrantTicketType`. It carries the code,
  `maxUses`, `usedCount`, a per-checkout `quantity`, `expiresAt`,
  `revokedAt` and an optional holder. `TicketTypes.accessCode` is gone.
- **Visibility is its own flag.** `TicketTypes.hidden` keeps a type off the
  public event page. Nothing derives it from whether a grant exists.
- **State is derived.** Revoked, then expired, then exhausted (in use while a
  `HELD` reservation on the grant is inside its window), else active. No
  status column.
- **A use is held like inventory.** The hold takes a use under the grant's
  row lock, in the same transaction as the inventory hold; release and expiry
  return it; conversion keeps it. `Reservation.grantId` records which grant a
  hold used. Settle after an expired hold takes the use back if one is free,
  ignoring expiry and revocation, and otherwise refunds like an inventory
  shortfall.
- **The grant applies only to the types it lists.** A hold attaches the grant
  only when the order includes one of them. Its `quantity` then replaces each
  listed type's `maxPurchasePerUser` and bounds their total.
- **Apply-code and the hold share one vocabulary.** `unlocked`, `invalid`,
  `inUse`, `unavailable` (exhausted or revoked) and `expired`. A refused hold
  returns its state and holds nothing.
- **Lock order is grant, then ticket types,** on hold, release and settle, so
  the paths cannot deadlock each other.
- **Release is a conditional transition, and conversion locks the hold.**
  `HELD → RELEASED/EXPIRED` is one `UPDATE … WHERE status = 'HELD'`, and
  `completeFree` and `confirm` take the reservation row lock first, as
  `settle` already did. Before this, a release racing the sweep could return
  inventory twice, and a release racing a free conversion could issue the
  tickets and return the use. Ticket types are always touched in id order.
- **A hold that gets no tickets keeps no use.**
- **The database guards the counter.** CHECKs keep `usedCount` within
  `0..maxUses` and the caps positive. `Grant` and `GrantTicketType` have RLS
  enabled with no policies, like every other application table.
- **Migration.** Each distinct `(eventId, accessCode)` became one unlimited
  grant over every type that carried it, and those types became hidden, so a
  migrated code behaves as it did.

## Consequences

- One code still unlocks several types (ADR 0035 holds), and codes stay
  canonical and exactly matched.
- Until the Access codes page lands, the ticket type form keeps its code
  field and writes through `writeLegacyAccessCode`, which moves a type
  between unlimited grants as the column did. It is the one writer allowed to
  change a grant's ticket types, and it goes with the field.
- `inUse` counts only holds still inside their window. An exhausted grant
  whose only hold has lapsed reads `unavailable` until the sweep returns the
  use; the sweep, not the read, is what frees it.
- Apply-code returns the holder's email for the contact step to prefill. Who
  holds a code can read the address it was sent to, so a guessed code now
  reveals an address as well as a ticket type. Generated codes have 40 bits;
  typed codes are as strong as the organizer makes them.
- A per-checkout cap clamps silently, like `maxPurchasePerUser`; the client
  caps the stepper so a buyer never sees it.
- Refunding or cancelling an order later does not return its grant's use.
- The migration drops `accessCode` in the same release that stops reading it.
  Supabase applies it on merge while Vercel builds separately, so event pages
  and checkout can fail for the minutes between the two, as they could for
  the rename in 20261013160000. Merge at a quiet hour.
