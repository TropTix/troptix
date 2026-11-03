---
title: Guest access — grants, codes and invitations
status: proposed
created: 2026-10-28
tracking-issue: TBD
---

# Guest access — grants, codes and invitations

Let an organizer control who may buy a ticket type, for how long, and how
many times. Today a code is one string on a ticket type that hides it and
unlocks it for anyone, forever. This plan replaces that string with a small
set of primitives that cover presales, sponsor blocks and invite-only events,
and that an approval flow can sit on later. Buyer questions at checkout,
which an invite-only event also wants, are their own plan:
[2026-10-checkout-questions.md](2026-10-checkout-questions.md).

## Why now

Organizers hit three walls with today's code. It cannot cap its uses, so a
presale or a sponsor's block of ten has no limit. It cannot expire, so a
window has to be closed by hand. It cannot name a recipient, so an
invitation is a password anyone can pass on. Each wall has come up on its
own; an invitation-only event that needs all three at once is only the
latest example. The fix is the same small model every ticketing platform
ends up with, and building it once removes the three walls together.

## Primitives

Four concepts, each with one job. Glossary terms where one exists.

**Ticket type, with explicit visibility.** The offer: price, inventory, sale
window. Gains one flag, `hidden`. A hidden type never appears on the public
event page, in the "from" price or in the ticket list. Visibility is the
organizer's decision and nothing else moves it. Deriving it from "has a code"
fails twice: a type the organizer is preparing but not ready to announce is
public until its first code exists, and revoking or expiring the last code
flips a type public as a side effect. A sale window does not cover the first
case, since a type that is not yet on sale still shows its name and price.
The flag also gives a withdrawn type, one pulled from sale that sold tickets
still reference, a real state instead of a code nobody is given.

**Grant.** A right to buy, scoped to an event. It names the ticket types it
unlocks, a maximum number of uses, a quantity cap per use, an expiry, and
optionally a holder by email, recorded but not yet enforced. Its state is
derived, never stored: active, in use, exhausted, expired or revoked follow
from the counters and timestamps. A use is one checkout. A grant never
changes a price (ADR 0035).

**Code.** The credential that carries a grant to a person: a string, unique
within the event, typed into the checkout box or carried in the event link's
`?code=`. Conceptually separate from the grant, because delivery will change
(a grant bound to a signed-in account needs no string). Stored as a column on
the grant until a second credential kind exists.

**Request.** Later, not in this plan. An ask for a grant with a pending state
and the organizer's decision. Approval creates a grant and delivers a code.
Nothing in the four above has to know it exists.

### Compositions

| Need              | Ticket type | Grant                                        |
| ----------------- | ----------- | -------------------------------------------- |
| Access code today | hidden      | unlimited uses, no expiry, one code          |
| Presale           | hidden      | 200 uses, end date, one code                 |
| Sponsor block     | hidden      | 10 uses on that type, one code               |
| Sponsor's cap     | public      | 1 use, quantity 10 where the public cap is 4 |
| Invite by email   | hidden      | one grant per address: 1 use, holder, expiry |
| Invite-only event | hidden      | invite by email or hand-delivered codes      |
| Approval (later)  | hidden      | request → grant, as invite by email          |

## Decisions

### Model

1. **Grants replace the ticket-type column.** `TicketTypes.accessCode` goes.
   The migration turns each distinct code on an event into one grant with
   unlimited uses, no expiry, no holder, unlocking every type that carried it,
   and sets `hidden` on those types. A migrated grant behaves exactly as the
   code did. No compatibility layer.
2. **A grant lists any ticket type, hidden or not.** On a hidden type it
   unlocks. On a public type it changes nothing visible, and only its
   quantity rule applies (decision 9). One list, no special case.
3. **Derived state, no status column.** `usedCount`, `maxUses`, `expiresAt`,
   `revokedAt` and the grant's open reservations are the truth. Lists compute
   active, in use, exhausted, expired and revoked at read time.
4. **Revoke, never delete.** Reservations and the attendee list reference a
   grant. Revoked grants sit under a filter on the organizer's list.
5. **Codes are typed or generated.** The organizer types a code for a presale
   or leaves it blank for a generated one: eight uppercase characters, no
   `0`, `O`, `1` or `I`. Both are normalized as today and unique per event.
6. **Edit only what extends a grant.** `expiresAt`, `maxUses` and `quantity`
   may change after creation. The code and the ticket types cannot; a code
   already sent must keep meaning what it meant.
7. **A grant leaves the sale window alone.** The ticket type's window still
   applies. An organizer whose invitations run past the sale end extends the
   sale end. Two clocks that can disagree is worse than one the organizer
   already understands.

### Counting

8. **A grant is counted per checkout, held like inventory.** Taking a hold
   consumes a use; releasing or expiring the hold returns it; converting
   keeps it. This is the `reserved`/`sold` pattern, so two guests cannot both
   hold on a one-use grant, and an abandoned checkout frees the invitation.
   The settle path that re-acquires inventory after an expired hold
   re-acquires the use the same way, and accepts a grant whose expiry passed
   during the hold, since the guest paid in time.
9. **Quantity is a cap, not an exact count.** A grant's `quantity` is the
   most tickets one checkout may take across the grant's ticket types. The
   stepper stays and is capped at that total. It beats the ticket type's
   `maxPurchasePerUser` and is clamped only by availability. With no
   quantity, the type's cap applies as today. The use is spent on the first
   checkout: a guest invited for two who buys one cannot come back for the
   second, and the organizer creates a new grant for that.
10. **Revoke stops new checkouts only.** A hold already open on the grant
    completes if the guest pays in time, as inventory does. The organizer's
    list shows "checkout in progress" on such a grant. Failing the payment at
    settle would mean a refund, a lost Stripe fee and a confused guest.

### Checkout

11. **The code is enforced; the holder is recorded, not enforced.** A grant
    with a holder stores the email the invitation went to, and the contact
    step prefills it, editable. Nothing at hold compares it. The single-use
    guarantee comes from the use count and the expiry, not from who types
    which address: a typed email stops a casual forward and nothing more, and
    every line that enforced it would be replaced the day sign-in at checkout
    lands (see "Sign-in at checkout"). Until then, ID at the door is what
    ties a ticket to a person, as on every platform without accounts. The
    guest enters their own name. A grant may also carry a display name for
    the organizer's list.
12. **One grant per checkout.** As today with one code per checkout. A new
    code replaces the old one.
13. **Five states, one vocabulary.** Apply-code and hold both return
    `invalid`, `inUse`, `unavailable`, `expired` or `unlocked`. Exhausted and
    revoked merge into `unavailable` for the guest, whose next step is the
    same either way; the organizer's list still shows which it is. Expired
    stays separate because the date tells the guest what to ask for.

| State         | Meaning                                      | Guest sees                                                          |
| ------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| `invalid`     | no grant with that code                      | That code isn't recognised.                                         |
| `inUse`       | uses exhausted and a hold is open            | Someone is checking out with this code. Try again in a few minutes. |
| `unavailable` | uses exhausted with no open hold, or revoked | This code has already been used or is no longer valid.              |
| `expired`     | `expiresAt` passed                           | This code expired on <date, venue-local>.                           |
| `unlocked`    | active                                       | the ticket types, the quantity cap, the holder email to prefill     |

### Organizer

14. **One page, "Access codes".** Under the event, listing every grant with
    its derived state, uses, quantity, expiry and holder. An invitation is a
    grant with a holder; "Invite by email" is an action on the same page.
15. **Admin and Owner manage codes.** Same as ticket types and events.
    Scanners never.
16. **Expiry is venue-local.** The organizer picks a date and time in the
    event's zone through the formatter the ticket form uses for sale windows
    (ADR 0021). Blank means no expiry. The invitation email and the expired
    message show it labelled with the zone.
17. **A hidden type with no active grant gets a note.** "Hidden, no active
    code" on the ticket type list, nothing more, since a withdrawn type is a
    legitimate use of the state.
18. **The order shows its grant.** Order detail and the attendee list read the
    grant through the reservation: the code, or the holder's email for an
    invitation. No new column.
19. **Phase 1 keeps the ticket type form working.** Until the Access codes
    page lands, the form's access code field writes an unlimited grant for
    that type. Phase 2 replaces the field with the hidden toggle and the
    write path goes with it.

### Invitations

20. **One grant per address, uses and quantity per batch.** The form takes
    emails, ticket types, uses (default 1), quantity (default 1), expiry and
    a send toggle. A holder who may order more than once gets `maxUses` above
    one; more tickets per order is `quantity`. Either is an edit to the
    existing grant, never a second one.
21. **Duplicates are skipped.** The batch dedupes itself, and an address that
    already holds an active grant on the event is skipped with "already
    invited, resend instead".
22. **The email is a template plus a send.** Through the existing Resend
    helper with a new template in the transactional package: event name,
    organization name, date and time (venue-local, labelled), the quantity
    cap, the expiry, a button to the event link with `?code=`, and the code
    as plain text under it. No venue line, since the page carries it. No text
    written by the organizer. Subject "You're invited to <event> by
    <organization>", reply-to the organization owner's address.
23. **Resend while active, after an edit otherwise.** Resend sends the same
    code and is offered only while the grant is active. For an exhausted,
    expired or revoked grant the organizer extends the expiry or raises
    `maxUses` first, and resend returns.
24. **Abuse defence in three layers.** No organizer-written text in the
    email. Sending is gated on an organization that is `verified` or has
    `paidTicketingEnabled`; creating grants without sending stays open to
    all. 200 addresses per batch and 500 sends per organization per day,
    counted as grants with `sentAt` in the last 24 hours across the
    organization's events. Further layers are under "Later".

### Release

25. **No rate limit on apply-code.** Unchanged from ADR 0035. A one-use grant
    with an expiry shrinks the guessing window on its own.
26. **Behind a flag, where a flag can reach.** The migration cannot be
    flagged, so phase 1's backend is behaviour-identical for migrated grants
    with the flag off, and the existing access-code e2e proves it. The
    PostHog release flag (ADR 0023) gates the Access codes page, the invite
    form and the three new checkout states until the e2e passes on preview.
27. **Analytics extend the existing event.** `checkout_access_code_applied`
    gains the grant's kind (unlimited, limited, invitation) and the result
    state. No new events.

## Data model

```prisma
model Grant {
  id          String    @id @default(uuid())
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  eventId     String
  code        String
  maxUses     Int?      // null = unlimited
  usedCount   Int       @default(0)
  quantity    Int?      // cap per checkout; null = the ticket type's cap
  expiresAt   DateTime?
  revokedAt   DateTime?
  holderEmail String?
  holderName  String?
  sentAt      DateTime? // last invitation email

  event        Events            @relation(fields: [eventId], references: [id])
  ticketTypes  GrantTicketType[]
  reservations Reservation[]

  @@unique([eventId, code])
  @@index([eventId])
}

model GrantTicketType {
  grant        Grant       @relation(fields: [grantId], references: [id])
  grantId      String
  ticketType   TicketTypes @relation(fields: [ticketTypeId], references: [id])
  ticketTypeId String

  @@id([grantId, ticketTypeId])
}

// TicketTypes: + hidden Boolean @default(false); − accessCode
// Reservation: + grantId String?
```

Derived state, in order: revoked if `revokedAt` is set; expired if
`expiresAt` has passed; in use if `usedCount >= maxUses` and a `HELD`
reservation on the grant has not expired; exhausted if `usedCount >=
maxUses`; else active.

The migration creates the tables, adds `hidden`, backfills one grant per
distinct `(eventId, accessCode)` with a join row per type and `hidden = true`
on those types, and drops `accessCode`. `supabase/seed.sql` gains the
`hidden` column on its ticket types and one grant with a join row, so a
preview branch can exercise the checkout path.

## Flows

**Unlock.** Apply-code normalizes the string as today, finds the grant by
`(eventId, code)`, and returns one of the five states. `unlocked` carries the
ticket types, the quantity cap and the holder email. The event page's
`?code=` path calls the same mutation. Unlocking never counts a use.

**Hold.** The reservation input carries `code`, as it already does. The
service loads the grant under `FOR UPDATE`, computes its state, returns that
state if not active, increments `usedCount`, checks the requested total
against `quantity`, then takes inventory as today. Any failure rolls the
whole hold back, and the checkout shows the state's message and clears the
code.

**Release and expiry.** The existing release and sweep paths decrement
`usedCount` for the reservation's grant alongside inventory.

**Settle.** When a hold expired before payment landed, settle re-acquires the
use as it re-acquires inventory, ignoring the grant's expiry. A grant revoked
during the hold is not re-checked.

**Convert.** Nothing changes at materialize. The use stays counted.

**Create.** Code (typed or blank), ticket types (one or more, same event),
uses, quantity, expiry, optional holder email and name.

**Edit, revoke, resend.** Edit changes `expiresAt`, `maxUses` or `quantity`.
Revoke sets `revokedAt`. Resend sends the invitation template again with the
same code and updates `sentAt`.

**Invite.** The organizer pastes emails, picks ticket types, uses, quantity,
expiry and whether to send. After dedupe and the active-grant check, one
grant per address with a generated code. With send on, each address gets the
template and the grant's `sentAt` is set.

## Phases

Each phase is one PR, references the umbrella issue, and leaves the product
working.

1. **Grants backend.** Migration and seed: `Grant`, `GrantTicketType`,
   `TicketTypes.hidden`, backfill, drop `accessCode`. Apply-code and hold
   resolve a grant and return the five states. Release, sweep and settle
   count uses. The ticket type form's code field writes an unlimited grant.
   Contracts, unit tests, and the existing access-code e2e green. ADR 0036:
   grants replace ticket-type codes.
2. **Access codes page.** List with derived state and filter, create, edit,
   revoke. The ticket type form swaps the code field for the hidden toggle
   and the ticket type list gets the "hidden, no active code" note. Behind
   the flag.
3. **Checkout grant path.** The code box and link show the five states, cap
   the stepper, prefill the email. Order detail and the attendee list show
   the grant. Analytics. E2E: a one-use grant unlocks, holds, pays, and reads
   `unavailable` afterwards; an expired one is refused; a second unlock
   during a hold reads `inUse`.
4. **Invite by email.** Bulk form, dedupe and active-grant skip, gate and
   caps, template with reply-to, send and resend. E2E asserts on the grant
   rows (`sentAt`, generated code) and the checkout with that code, since
   the suite mails Resend's sink and has no stub. The template gets a render
   test in the transactional package.
5. **Flag removal** once the first organizers have run an event on it.

## Sign-in at checkout

Requiring sign-in changes no table here. It changes where the holder is
checked and what a grant can carry.

- **The holder becomes enforced, in one place.** The hold service reads the
  actor's email and refuses a grant whose `holderEmail` differs. The client
  sends nothing. This is the rule membership invites already follow: email
  bound, with passwordless sign-in as the verification. Grants created
  before sign-in carry their email already, so they become enforced with no
  backfill.
- **A grant can bind to an account.** A guest signed in with the invited
  address sees their invitation on the event page with no code typed. Later,
  a grant may carry a user id instead of a code, which is why Code is its own
  primitive and only stored as a column for now.
- **Per-person limits become possible.** A presale code limited to one use
  per account is a column on the grant, not a redesign. Without accounts,
  only per-checkout limits are honest.
- **The code must survive sign-in.** If sign-in happens inside the sheet, the
  code stays in client state. If it ever redirects, the code rides along.
- **Mismatched addresses need a state.** An organizer invites an alias and
  the guest signs in with another address. The checkout says which address
  the invitation is for.

## Later

Reviewed for simplicity before the plan was settled. Kept as written, with
these as the next changes once the first event has run on it.

**Simplifications.**

- **Derive uses from reservations instead of `usedCount`.** The reservation
  rows already record every use: live `HELD` rows in flight, `CONVERTED`
  rows spent. Counting them under the grant's `FOR UPDATE` at hold removes
  the grant from release, sweep and settle, and removes a counter that can
  drift. A grant over by one after an expired-hold payment is a person on a
  list, not a seat. The counter follows the inventory pattern because that
  pattern is already in the codebase; a grant never sees inventory's
  contention.
- **Narrow the flag to invite by email.** Phase 1 ships live either way, and
  the Access codes page replaces a field the migration removes rather than
  merging unfinished work. Folding phase 2 into phase 1 deletes decision 19's
  write path and the "where a flag can reach" caveat.
- **Drop `holderName`.** The attendee list has names from the order and the
  email needs none.
- **Drop the daily cap.** The gate is the defence; the batch cap bounds a
  click. One number fewer to explain.

**Abuse defence, next layers.** Triggered when any organization nears the
caps or a complaint reaches Resend.

- A separate sending domain for invitations, so a complaint rate hurts
  invitations and not order confirmations. One DNS change and a second
  `from`.
- Resend bounce and complaint webhooks that refuse further sends to an
  address and pause an organization past a threshold. A route and a table.

## Out of scope

- Discounts, comps, price overrides. A grant only unlocks.
- Requests and approval on the platform. Sits on top of this later.
- Buyer questions and terms acknowledgment. Their own plan, independent of
  this one.
- A venue-hiding flag. A placeholder address does it.
- Enforcing the holder, and account-bound grants. Both arrive with sign-in
  at checkout, which has its own plan.
- CSV export of the attendee list. Its own small change.
