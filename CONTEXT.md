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
A member of the TropTix team with cross-organizer visibility, used to debug and observe what any Organizer sees. A platform capability, distinct from Organizer — a Platform Owner is not "an Organizer with extra rights." Identified by the explicit `Users.isPlatformOwner` grant (ADR 0024) — never inferred from an email; the grant is spent in exactly two places, the Platform View gate and View-as, and every service-layer check goes through `organizer-scope.ts` (`requirePlatformOwner`) so the grant has one implementation. _Avoid_: super-user, staff, **admin** (unqualified "Admin" always means the Organization role, never platform staff).

**Promoter**:
A `Role` that exists in the enum but is currently unmodeled (no granted scopes yet). Deferred to the role×permission matrix (ADR 0013 successor).

**Membership**:
A grant tying a User to an **Organization** with a role (Owner, Admin, or Scanner). Org-level only — a member's role applies to every event the Organization owns; there are no per-event grants. The Organization is the home for teams (per the spotlight plan); the deleted per-event `DelegatedUsers` model is not coming back. _Avoid_: "delegated access", per-event grants, team roles on the `Role` enum (that enum is being retired, not extended).

**Acting organization**:
The one Organization a person's dashboard session is scoped to — what "my events" means for them right now. Everyone with a single Organization has it chosen for them and never sees the concept; only someone who owns one Organization and holds Memberships in others chooses. Every organizer read and write resolves through it. _Avoid_: assuming a person maps to exactly one Organization (they may own one and be a member of several), and confusing this with View-as (platform-only, read-only, and about watching someone else's scope rather than choosing your own).

**Invite**:
An Owner's offer of a Membership, naming an **email address** and a role. Email-bound: only someone signed in as that address can accept (passwordless sign-in is the verification), so forwarding the email transfers nothing. Pending invites are visible to the Owner, revocable, and expire. An Invite is not a Membership — nothing is granted until accept. _Avoid_: bearer/shareable invite links (that's the `Orders.accessToken` pattern, for viewing tickets — never for granting roles).

**Owner** (Organization role):
The Organization's one owner — `ownerUserId`, not a Membership row. Exactly one per Organization; cannot leave or be demoted; ownership transfer does not exist yet. Holds everything an Admin holds **plus the two owner-only areas: members and money** — managing Membership (invite, remove, change roles) and anything payout/Stripe/paid-ticketing-approval. _Avoid_: conflating with Platform Owner (unrelated concepts), an `OWNER` value in the Membership role (the scalar is the single source of truth).

**Admin** (Organization role):
A member with full Organizer Dashboard parity — events, ticket types, orders, refunds, attendees, check-in, and the Organization's brand profile — **except members and money** (owner-only). "Admins run the show; the Owner controls who's in the room and where money goes." Unqualified "Admin" always means this role. _Avoid_: using "admin" for platform staff (that's Platform Owner).

**Scanner** (Organization role):
A member who can only check attendees in at the door, across all the Organization's events. Sees the **check-in slice** and nothing else: the event list, then per-event attendee **name, ticket type, check-in status** and the scan/check-in action — including manual lookup by name. Never sees emails, phone numbers, order amounts, or revenue; the slice is a distinct trimmed read, not the Owner's view with columns hidden. **Deferred**: ships with the organizer mobile-app rebuild, not with Membership v1 (which is Owner + Admin only); the role exists in the vocabulary; the enum value joins the model with the rebuild (a one-line ADD VALUE). Until then door staff scan on someone else's login. _Avoid_: "ticket scanner" as a distinct concept (same thing), door staff, per-event scanner codes or PINs (weighed against the rest of the market and turned down — door access is a Membership role here, not a shareable credential).

### Money

**Ticket revenue**:
The canonical "revenue" metric on the Organizer Dashboard: the sum of `Order.subtotal` over `COMPLETED` orders — the face value of tickets sold, **before** platform fees and **before** refunds. This is what "revenue" means unqualified. _Avoid_: revenue = total (that overstates by TropTix's fee cut when fees are passed to the buyer).

**Amount charged**:
What a buyer actually paid for one order — `Order.total` = ticket revenue + fees. Shown per-order in lists; it is **not** the organizer's revenue. _Avoid_: labeling this "revenue" or "total revenue".

**Fees**:
The platform/ticketing cut TropTix collects (`Order.fees`). Either added on top of the ticket price (`PASS_TICKET_FEES`) or absorbed out of it (`ABSORB_TICKET_FEES`), per ticket type.

**Earnings**:
What the Organizer keeps from a `COMPLETED` order — `subtotalCents` minus **absorbed fees** (derived at read time; the DB stores `feesCents = 0` for `ABSORB_TICKET_FEES`). Passed fees ride on top of the subtotal and never touch it. Refunds are still unmodeled and will subtract from earnings when they land. _Avoid_: conflating with Ticket revenue (pre-fee).

**Available / Pending / Paid out** (payout buckets):
The three balances on the payouts screen (ADR 0028). An event's earnings become **Available** when the event ends, minus a **holdback** (platform default 20% for 20 days after event end) that joins when its window elapses; open and paid requests subtract. **Pending** is everything not yet available. **Paid out** is the sum of `PAID` payout requests. Per-Organization **custom payout timelines** override the release rule: `payoutReleaseAtSale` releases earnings as orders complete (before event end), and `payoutHoldbackPercent`/`payoutHoldbackDays` tune the holdback — early payment raises the organizer's real available balance, never bypasses the math.

**Payout request**:
The Organizer's ask to withdraw some amount of Available. Lifecycle: `REQUESTED → PAID` (Platform Owner marks done, recording the rail + bank transfer reference) or `→ REJECTED` (with a note) or `→ CANCELLED` (organizer, while still `REQUESTED`). At most one open request per Organization. Money moves by hand from the ops bank (Mercury) for v1; no bank details ever enter the database.

**Payout setup**:
The per-Organization checklist gating the first request — a payout meeting plus bank details entered at the ops bank — checked off manually by a Platform Owner (two timestamps on `Organization`). Distinct from **paid ticketing enabled**: that gates _selling_, setup gates _withdrawing_. Balances are always visible regardless.

### Ticketing

**Ticket type**:
The **offer** an Event sells — a named, priced bucket of inventory ("General Admission, $20, 100 available, on sale Jul 1–31"). An Event has many. Distinct from the **tickets** it issues: buying 3 GA admissions references one Ticket type and creates three `Tickets` rows, each with its own QR, holder and check-in. Inventory is three counters — `capacity` (immutable total), `reserved` (held by live checkout holds), `sold` (confirmed) — where **availability = capacity − reserved − sold**; the `reserved` term is what makes concurrent checkout safe. Its **sale window** (`saleStartsAt`/`saleEndsAt`) is independent of the Event's own start/end, so a type can stop selling before doors or open after the Event is announced. _Avoid_: "tier" (a synonym that drifted in through the dashboard plan — the model, the UI and this glossary all say ticket type).

**Tickets issued vs sold**:
Two honest counts of the same thing, and they must not be conflated. A Ticket type's `sold` **counter** is inventory sold — the number availability is computed against. Counting `Tickets` **rows** is tickets _issued_ — what you check people in against, and the only one that includes tickets whose Ticket type was since deleted (`ticketTypeId` is nullable). They agree in normal operation; where a surface must pick, per-type figures use the counter and event-level figures paired with check-in use rows.

**RSVP ticket**:
A free ticket (`price = 0`). Any Organizer can create these — no approval needed. _Avoid_: "free ticket type" as a separate concept; RSVP _is_ the free ticket.

**Paid ticket**:
A priced ticket (`price > 0`). Creating one requires the owning Organization's `paidTicketingEnabled`. There is no `Event`-level RSVP/paid flag — an event is "paid" simply if it has any Paid ticket; the create-form toggle is a **visibility** affordance over the ticket price field, not stored state. The gate is enforced in the ticket-type write service (application layer, per ADR 0013), **not** a database constraint. Paid tickets can be added to an existing RSVP event later, once approved.

### Time

**Event time zone**:
The IANA zone (e.g. `America/Jamaica`) an Event's wall-clock times are expressed in. Auto-filled from the venue's coordinates but always an explicit, organizer-overridable field — an online event or a mis-geocoded venue still needs one. _Avoid_: "the event's offset" (`GMT-5` is DST-dependent output derived from the zone and a date, never the stored thing).

**Venue-local**:
The rule that an Event's own times — start, end, sale windows — are wall-clock times **at the venue**, shown identically to every viewer regardless of where they are. What "6:00pm" means is fixed by the Event time zone. _Avoid_: "local time" unqualified (ambiguous — whose local?).

**Operational timestamp**:
A moment something happened — order placed, check-in, created/updated. Rendered in the **viewer's** own zone, because it answers "when did this happen to me", not "when should I show up". The counterpart to Venue-local, and never labelled with a zone. _Avoid_: treating these and Event times as one concept.

### Surfaces

**Organizer Dashboard**:
The `/organizer` surface — an Organizer's own view of their events, tickets, orders, and attendees.

**Platform View**:
A separate, Platform-Owner-only surface for observing organizers across the platform (debugging / support). Distinct from the Organizer Dashboard; not something an Organizer can reach. Consists of a cheap global event **index** (event, owner, status — no heavy stats) whose rows deep-link into the Organizer Dashboard scoped to the row's owner via View-as. _Avoid_: "Admin View" (renamed — "Admin" now names the Organization role; the `/admin` route group is an implementation detail, not vocabulary).

**View-as** (act-as):
A Platform Owner viewing the Organizer Dashboard scoped to a chosen Organizer — the same pages and data an Organizer sees, not a parallel admin dashboard. **Read-only**: the scope target is honored by read-services only (and only when the actor is a Platform Owner); write-services never accept it, so an admin can observe but not mutate on an Organizer's behalf. _Avoid_: impersonation (implies acting/writing as the user; View-as is see-only).\_

**User Ticket page**:
The attendee's ticket surface (`/orders/[orderId]/tickets`) — one scannable QR per screen, swipeable across the order, built for getting through the door. Its job is _entry_, not purchase management. _Avoid_: "wallet" (that is the design philosophy behind it, not the surface's name), "ticket page" (ambiguous with Ticket type).

**Order page**:
The attendee's money surface (`/orders/[orderId]`) — order summary plus the itemized receipt in one page. The receipt is a **section** of this page, not a separate surface. _Avoid_: "receipt page" (no longer its own route), "confirmation page" (deleted — the live post-checkout confirmation is the in-checkout success screen plus the email, not a page).
