# TropTix

Domain glossary for the TropTix event-ticketing platform. Terms only — no implementation. When a term here conflicts with how code or a plan uses a word, the glossary wins (or the glossary is wrong and gets fixed).

## Language

### Access & roles

**Patron**:
A person who buys tickets. The default `Role`. _Avoid_: customer, buyer, attendee (an attendee is a Patron who holds a valid ticket to a specific event).

**Organizer**:
A person who creates and runs events and manages their own tickets, orders, and attendees. **Anyone can be an Organizer** — it is not a granted role or a gate; it's simply a user who owns events. Access to the Organizer Dashboard keys on **ownership** (`Events.organizerUserId`), not on `Role`. _Avoid_: host (the `Events.organizer`/`hostName` free-text field is a display label, not this concept).

**Paid ticketing enabled**:
An Organization-level capability (`Organization.paidTicketingEnabled`) that permits selling **paid** tickets. Off by default; flipped on by TropTix after the organizer talks to us (a business/payout approval, tied to per-org Stripe later). Ungated organizers can always create **RSVP** (free) events; only paid ticketing requires this. Distinct from `verified`. _Avoid_: "verified" for this — that's a different concept.

**Verified**:
An Organization-level **trust tick** (`Organization.verified`), admin-granted, attendee-facing — signals an established/trusted brand. **Orthogonal to `paidTicketingEnabled`**: a brand can be verified through a track record of free events without being approved to sell paid, and vice versa. _Avoid_: conflating with paid-ticketing approval.

**Platform Owner**:
A member of the TropTix team with cross-organizer visibility, used to debug and observe what any Organizer sees. An **Admin** capability, distinct from Organizer — a Platform Owner is not "an Organizer with extra rights." Currently identified by an `@usetroptix.com` email suffix; this is a stopgap until a real admin role/grant lands (ADR 0013 successor). _Avoid_: super-user, staff.

**Promoter**:
A `Role` that exists in the enum but is currently unmodeled (no granted scopes yet). Deferred to the role×permission matrix (ADR 0013 successor).

### Money

**Ticket revenue**:
The canonical "revenue" metric on the Organizer Dashboard: the sum of `Order.subtotal` over `COMPLETED` orders — the face value of tickets sold, **before** platform fees and **before** refunds. This is what "revenue" means unqualified. _Avoid_: revenue = total (that overstates by TropTix's fee cut when fees are passed to the buyer).

**Amount charged**:
What a buyer actually paid for one order — `Order.total` = ticket revenue + fees. Shown per-order in lists; it is **not** the organizer's revenue. _Avoid_: labeling this "revenue" or "total revenue".

**Fees**:
The platform/ticketing cut TropTix collects (`Order.fees`). Either added on top of the ticket price (`PASS_TICKET_FEES`) or absorbed out of it (`ABSORB_TICKET_FEES`), per ticket type.

**Payout**:
What an Organizer actually receives — ticket revenue net of absorbed fees and refunds. **Not currently computed** (needs per-order fee attribution); do not conflate with Ticket revenue. Refunds are not modeled at all today (`OrderStatus` has no `REFUNDED`), so no metric nets them.

### Ticketing

**RSVP ticket**:
A free ticket (`price = 0`). Any Organizer can create these — no approval needed. _Avoid_: "free ticket type" as a separate concept; RSVP _is_ the free ticket.

**Paid ticket**:
A priced ticket (`price > 0`). Creating one requires the owning Organization's `paidTicketingEnabled`. There is no `Event`-level RSVP/paid flag — an event is "paid" simply if it has any Paid ticket; the create-form toggle is a **visibility** affordance over the ticket price field, not stored state. The gate is enforced in the ticket-type write service (application layer, per ADR 0013), **not** a database constraint. Paid tickets can be added to an existing RSVP event later, once approved.

### Surfaces

**Organizer Dashboard**:
The `/organizer` surface — an Organizer's own view of their events, tickets, orders, and attendees.

**Admin View**:
A separate, Platform-Owner-only surface for observing organizers across the platform (debugging / support). Distinct from the Organizer Dashboard; not something an Organizer can reach. Consists of a cheap global event **index** (event, owner, status — no heavy stats) whose rows deep-link into the Organizer Dashboard scoped to the row's owner via View-as.

**View-as** (act-as):
A Platform Owner viewing the Organizer Dashboard scoped to a chosen Organizer — the same pages and data an Organizer sees, not a parallel admin dashboard. **Read-only**: the scope target is honored by read-services only (and only when the actor is a Platform Owner); write-services never accept it, so an admin can observe but not mutate on an Organizer's behalf. _Avoid_: impersonation (implies acting/writing as the user; View-as is see-only).\_
