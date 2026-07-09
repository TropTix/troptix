---
title: Organizer Dashboard — Screen-by-Screen UX Spec
status: draft
created: 2026-07-03
tracking-issue: TBD
---

# Organizer Dashboard — Screen-by-Screen UX Spec

Product-first definition of what the organizer surface should **do and have**, walked screen by
screen. The API contracts and the [service-layer migration](2026-07-organizer-dashboard-migration.md)
are derived **from** this — not the other way around. Decisions here supersede the migration plan's
assumptions where they differ (the migration was a lift-and-shift; this is a redesign).

Vocabulary follows [CONTEXT.md](../../CONTEXT.md). Money is integer cents at the API edge.

## Responsive strategy — desktop vs mobile

Guiding principle: **desktop is the workshop** (build events, configure tickets, analyze, export,
admin); **mobile is the field kit** (glance at performance, check people in at the door, quick
lookups/actions on the go). Everything is responsive and nothing is broken on either — but each
screen is optimized for where it's actually used, and a few lean deliberately to one platform.

| Screen             | Class            | Desktop                           | Mobile                                                                   |
| ------------------ | ---------------- | --------------------------------- | ------------------------------------------------------------------------ |
| A Home             | Parity           | multi-column                      | single-column stack, full                                                |
| B Events list      | Parity           | table + row "…" menu              | cards + bottom-sheet actions                                             |
| C Overview         | Parity           | vitals grid + side-by-side charts | vitals stack, tabs → segmented control                                   |
| D Create/edit      | Desktop-primary  | two-column (form + flyer/preview) | stacked, functional, rail collapses                                      |
| E Ticket types     | Desktop-primary  | table + drag-reorder              | cards; **add/edit via sheet (real post-launch need)**; reorder = up/down |
| F1 Attendees       | Desktop-primary  | full table + CSV export           | search/lookup + correct check-in; no CSV                                 |
| F2 Check-in        | **Mobile-first** | tablet/laptop kiosk               | **the** door screen — big targets, running counter                       |
| G Orders           | Desktop-primary  | table + detail + CSV + resend     | list + detail (view + resend); no CSV                                    |
| H Admin            | Desktop-only     | full internal tool                | not designed for mobile                                                  |
| I Profile/settings | Parity           | sectioned                         | stacked, full                                                            |

**Rules that fall out:** CSV exports are desktop-only (you download a file to work with). Dense
tables reshape to cards/lists on mobile, never horizontal-scroll spreadsheets. Add/edit a ticket
tier stays mobile-capable (opening more inventory happens at the event). App shell: desktop left
sidebar (Dashboard · Events · Profile); mobile bottom nav; the in-event tab bar becomes a scrollable
segmented control on mobile.

## Screen A — Dashboard home (`/organizer`)

**Job:** get the organizer into the event they care about right now, and show what's happening
lately — not a wall of cross-event vanity totals. Entry-point first, informational body.

**Layout**

- **Top — Active events:** a compact row of small cards (thumbnail + name + date + a quick metric),
  each a tap-target into the event. Primary action of the page.
  - Quick metric: **sold / capacity** (e.g. "142 / 200") — tells them at a glance how a live event
    is tracking.
- **Right rail — Recent orders:** slim, clickable list (customer · amount · time-ago), each linking
  to the order.
- **Below — Revenue:** informational summary across events — headline revenue number + the 30-day
  sales trend chart (the one trend worth keeping here).
- **Body stays purely informational** — no action/to-do feed.

**Setup banner (the one exception to "informational"):** a single slim strip pinned at the very top,
shown **only** when a setup step is incomplete — "Finish your organizer profile →" or "Get approved
to sell paid tickets →". Not a nudge feed; disappears once done. This is how a new organizer
discovers the one thing they must do without cluttering the page.

**Data this screen needs (→ dashboard DTO):**

- Active events: `{ id, name, thumbnailUrl, date, sold, capacity, status }[]`
- Recent orders: `{ id, customerDisplay, amountCents, createdAt, status }[]`
- Revenue summary: `{ totalRevenueCents, dailySales: { date, tickets }[] }`
- Setup state: `{ profileComplete: boolean, paidTicketingEnabled: boolean }` (drives the banner)

_Status: locked (pending any later revision)._

## Screen B — Events list (`/organizer/events`)

**Job:** the complete archive + management surface — find _any_ event (active, upcoming, past,
draft) and act on it. Screen A already handles quick entry into active events; this is the full list.

**Layout**

- **One list with a status filter** (All / Active / Upcoming / Past / Draft chips) + a search box —
  scales past a handful of events; visually card-ish, not a dense spreadsheet.
- **Each row:** thumbnail, name, date, status badge, **sold / capacity**. Per-event revenue stays
  off the list (it's on the overview) to keep it scannable.
- **Create event** is a prominent primary CTA; the empty state for a new organizer is a big
  "Create your first event".

**Row actions (a "…" menu), priority order:**

1. **Duplicate event** — clone details + ticket types into a new draft (recurring events).
2. **View public page**.
3. **Publish / Unpublish** (honors publish requirements).
4. **Delete** — guarded: hard confirm, and blocked or soft-delete when the event has orders.

**Data this screen needs:** events list `{ id, name, thumbnailUrl, date, status, sold, capacity }[]`
(all statuses). **Mutations:** `duplicateEvent`, `deleteEvent`, `toggleEventPublish` (exists).

_Status: locked._

## Screen C — Event overview (`/organizer/events/[id]`)

**Job:** the event's **service center** — funnel health at a glance, then the operational detail.
Reframes the page from "sales report" to "how is this event performing as a funnel."

**Layout**

- **Vitals row:** **Tickets sold** (against capacity) · **Revenue** · **Orders**. (**Page views &
  conversion — deferred**; the full funnel framing lands once view tracking is added.)
- **Below — revenue-over-time graph.**
- **Ticket overview** — per tier: sold / capacity / revenue.
- **Attendees section** — a check-in summary ("X of Y checked in") linking to the Attendees tab.
- **Orders** — a short peek + link into the Orders tab.

**Navigation (tabs):** **Overview · Tickets · Attendees · Orders · Check-in · Edit** — two changes
from today: **add Check-in** as a real web surface (organizers can work the door from the web, not
only the mobile app), and demote **Edit** to a secondary/last tab.

**Deferred — page views & conversion:** the original funnel framing (page views, conversion =
orders / views) needs a new tracking dependency (an `EventPageView` per-day counter incremented on
the public event page, kept in our own DB rather than PostHog). **Deferred for now** — ships as a
follow-up that adds the table, the public-page increment, and the two extra vitals. Revenue / sold /
orders carry the screen until then.

**Web check-in (decided):** organizers can run door check-in from the web — search an attendee, mark
checked-in (reuse the check-in write path; scanning later). The overview's attendees section shows
the summary; the Check-in tab is the working surface.

**Data this screen needs:** event vitals `{ sold, capacity, revenueCents, ordersCount }`; a per-day
revenue series `{ date, revenueCents, tickets }[]`; ticket-type breakdown
`{ name, sold, capacity, revenueCents }[]`; check-in summary `{ checkedIn, total }`. **Reuses:** the
check-in write path.

_Status: locked (page views & conversion deferred to a follow-up)._

## Screen D — Create / edit event (`/organizer/events/new`, `/[id]/edit`)

**Job:** create or edit an event with the least friction. Reference: Posh's create form (single form,
sensible defaults) — similar _flow_, not a copy.

**Decided structure**

- **One single form, reasonable defaults — not a wizard.** Pre-seed a default ticket and sensible
  dates so an organizer can create fast. (Default ticket depends on mode: RSVP → a free ticket;
  Sell → a $10 default, only when the org is approved.)
- **Two-column** on desktop: the form on the left, the **flyer upload + a customization rail** on
  the right, with the **Create/Save** button anchored there. Mobile stacks.
- **Sell Tickets / RSVP toggle pinned at the very top** — the paid-ticketing gate (visibility over
  the price field; RSVP always allowed; picking Sell when the org isn't `paidTicketingEnabled` shows
  the "talk to us to get approved" state). Derived-from-price, no Event flag.
- **Hosted by [Your Org]** brand (from #429 / spotlight) — no free-text host field.
- **Publish requirements surfaced inline** (name, date, image, ≥1 ticket) rather than only at the
  publish toggle.

**Maps to existing decisions (not new work):** Event Features → Spotlight; Show on Explore →
`/discover` visibility; Password Protected → gated/password tickets (roadmap 2.6).

**Backlogged — each its own feature, NOT this redesign:** event-page **theming** (title font /
accent color) + **live preview** pane; **waitlist**; **recurring series** (native repeat, beyond
one-off Duplicate); **guestlist / social proof**; **media richness** (Spotify song, YouTube, image
gallery). Start with a clean flyer upload and a stubbed customization rail.

**Data this screen needs:** the event write services (`createEvent`/`updateEvent`) + the
ticket-type writes (with the paid gate), plus the org brand for the "Hosted by" display.

_Status: locked (structure + defaults + RSVP toggle + brand; richness backlogged)._

## Screen E — Ticket types (`/organizer/events/[id]/tickets`)

**Job:** manage the tiers of an existing event — sales-first, not config-first — and **add new tiers
at any time, including after the event is live** (e.g. GA sold out → open a second release). This is
the canonical "add a ticket after go-live" surface.

**Layout**

- **Header summary:** total sold, total ticket revenue for the event.
- **Per-tier list (sales-first):** each row — name, price, **sold / capacity** (progress bar),
  **sale-window state** (Scheduled / On sale / Ended), and tier **revenue**.

**Actions**

- **Add tier — available anytime, incl. post-publish** (the primary point of this screen alongside
  monitoring).
- **Edit**, **Duplicate tier** (VIP variants), **Delete / deactivate** (guarded when it has sales),
  and **reorder** (buyer-facing display order).
- All add/edit go through the **one shared ticket form** (plan 007) — same component as Screen D's
  inline drawer, so the **paid-ticketing gate** (`price > 0` ⇒ approved) lives in one place.

**Data this screen needs:** ticket-type list with per-tier sales
`{ id, name, priceCents, sold, capacity, saleState, revenueCents }[]`; **writes:** create / update /
duplicate / delete / reorder ticket type (all honoring the paid gate).

_Status: locked. Adding tiers post-launch is a first-class action here._

## Screen F — Attendees & Check-in (two separate screens)

Two distinct jobs → two surfaces, shared data.

### F1 — Attendees (`/organizer/events/[id]/attendees`) — management

**Job:** the rich ticket-holder table for use at a desk, before/after the event. Full list — name,
email, ticket type, order (link), checked-in status + time. Filter / search. **Edit / correct**
check-in here (this is the editable surface). **Export attendees to CSV** (audit gap; a simple
download endpoint — a native Google Sheets integration is a bigger, deferred add).

### F2 — Check-in (`/organizer/events/[id]/check-in`) — the door

**Job:** the door experience, built for speed and one-handed use during the event. Big search box,
large tap targets, **tap to check in**, a running "**142 / 200 checked in**" counter. Attendee
detail here is **read-only** — you can view more, but to change anything you **link back to
Attendees** and return. **No web QR scanning** — search-and-tap only; camera scanning stays the
mobile app's job.

**Check-in analytics:** since `checkinTimestamp` is now written, surface the **arrival curve**
("80% arrived in the first hour") on the event overview's attendees section.

**Data these screens need:** attendee list `{ ticketId, name, email, ticketType, orderId, checkedIn,
checkedInAt }[]`; the check-in write (reuses the existing path); a CSV export endpoint; a check-in
summary/arrival series for the overview.

_Status: locked. CSV export now; Google Sheets deferred; no web QR._

## Screen G — Orders (`/organizer/events/[id]/orders`)

**Job:** view and understand orders. Ships the _view_ + light, no-money-movement actions now; heavy
actions are deferred.

**In scope**

- **Orders list:** order # · customer · amount charged · # tickets · date · status; filter / search;
  **CSV export** (matching Attendees).
- **Order detail:** line items (which tickets), a real **payment breakdown** (ticket revenue / fees /
  total — finishing the current TODOs), payment method, customer info, and a small timeline
  (placed → paid → emailed).
- **Resend confirmation email** — the one action in scope (high value, no Stripe/inventory coupling).

**Deferred → its own "Order actions" initiative (with/after the checkout-reservation rebuild):**
**refund** (full/partial), **cancel order**, **issue comp tickets** — all share the Stripe +
inventory-release (`sold`/`reserved`) machinery the reservation rebuild owns; bolting them onto this
redesign would drag that scope in.

**Data this screen needs:** orders list `{ id, customerDisplay, amountChargedCents, ticketCount,
createdAt, status }[]`; order detail `{ lineItems, subtotalCents, feesCents, totalCents,
paymentMethod, customer, timeline }`; a CSV export endpoint; **resend-confirmation** write.

_Status: locked. View + breakdown + CSV + resend now; refunds/cancel/comp deferred._

## Screen H — Admin view (`/admin`)

Settled by [ADR 0018](../adr/0018-admin-view-is-read-only-view-as.md) — recorded here for completeness,
no change: own `/admin` route group + `requirePlatformOwner` guard; a thin global event index
(event · owner · status, no heavy stats); rows deep-link into the real organizer dashboard via
**read-only View-as**; admin **platform actions** — approve **paid ticketing**, grant **verified**,
and a "pending paid-ticketing requests" queue.

_Status: locked (per ADR 0018)._

## Screen I — Organizer profile & settings (`/organizer/profile`)

**Job:** one combined screen for the Organization brand + account setup + "what do I need to do".
Not split — few account settings today. Destination for the Screen A setup banner and the
"Hosted by [Org]" edit link.

**Sections**

- **Brand editor** (spotlight plan): logo, display name, public **slug** (`/o/your-org`), bio,
  website, socials (Instagram / Twitter / LinkedIn). Powers the public org page + "Hosted by".
- **Setup / "things to do"** (onboarding plan): the **"Talk to us to sell paid tickets"** request
  lives here — the one place an organizer sees and acts on outstanding setup. If approved, shows
  "Paid ticketing: enabled". The home banner links here. (MVP = this one item; shaped so more can
  join it later.)
- **Verified**: read-only badge (admin-granted; not self-serve).
- **Account**: light (name, email).
- **Reserved for later:** payout configuration (Stripe Connect) and richer settings live here when
  they land.

**Data this screen needs:** the Organization brand read + `updateOrganizationProfile` write (exist);
the paid-ticketing **request** write (onboarding plan); the org's `paidTicketingEnabled` / `verified`
state.

_Status: locked (combined screen; setup-tasks area; payout reserved)._

---

## New scope this spec adds beyond the migration plan

The [service-layer migration](2026-07-organizer-dashboard-migration.md) was a **lift-and-shift** of
today's screens. This spec is a **redesign + new features**, so it adds scope that must be reconciled
into the phasing:

- **Duplicate / delete event** (Screen B) — delete is a **soft-delete** (`deletedAt`).
- **Web check-in door surface** + **CSV export** for attendees & orders (Screens F, G).
- **Resend confirmation email** (Screen G).
- **Reorder ticket tiers** (Screen E).
- **Profile & settings screen** with the setup-tasks area (Screen I) — overlaps the onboarding plan.
- **Reframed dashboards** — home as entry-point-first (A); overview as a funnel service-center (C).

**Deferred (own efforts):** **page views & conversion** (the `EventPageView` tracking + the funnel
vitals on Screen C), order actions (refund / cancel / comp), event-page richness (theming + live
preview, waitlist, recurring, guestlist, media), native Google Sheets export, web QR scanning.

## API surface (derived from the screens)

All of this lives in `@troptix/api` (`contracts/organizer.ts` + `services/organizer*.ts`),
supersedes the migration plan's provisional DTOs, and is built per its phasing (reads → cutover →
writes). Conventions: server components call services directly; **money is integer cents** in every
DTO; **auth** is ownership-only via `resolveOrganizerScope(actor, viewAs?)` (View-as honored on
reads only, and only for a Platform Owner); writes never take `viewAs`; services throw
`NotFoundError` / `UnauthorizedError`.

### Reads (one service per screen)

| Service                                             | Screen | Returns (shape)                                                                                                                                                                                                               |
| --------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getDashboard(actor, {viewAs?})`                    | A      | `{ activeEvents[], recentOrders[], revenue:{ totalCents, dailySeries[] }, setup:{ profileComplete, paidTicketingEnabled } }`                                                                                                  |
| `listEvents(actor, {viewAs?, status?, search?})`    | B      | `EventSummary[] { id, name, thumbnailUrl, date, status, sold, capacity }`                                                                                                                                                     |
| `getEventOverview(actor, eventId)`                  | C      | `{ vitals:{ sold, capacity, revenueCents, ordersCount }, series[]:{ date, revenueCents, tickets }, ticketBreakdown[]:{ name, sold, capacity, revenueCents }, checkIn:{ checkedIn, total } }` (page views/conversion deferred) |
| `listTicketTypes(actor, eventId)`                   | E      | `{ summary:{ sold, revenueCents }, tiers[]:{ id, name, priceCents, sold, capacity, saleState, revenueCents, sortOrder } }`                                                                                                    |
| `listAttendees(actor, eventId, {search?, filter?})` | F1/F2  | `Attendee[] { ticketId, name, email, ticketType, orderId, checkedIn, checkedInAt }` (+ `checkInSummary`)                                                                                                                      |
| `listOrders(actor, eventId, {search?, filter?})`    | G      | `OrderSummary[] { id, customerDisplay, amountChargedCents, ticketCount, createdAt, status }`                                                                                                                                  |
| `getOrderDetail(actor, orderId)`                    | G      | `{ lineItems[], subtotalCents, feesCents, totalCents, paymentMethod, customer, timeline[] }`                                                                                                                                  |
| `getOrganizationProfile(actor)`                     | I      | brand fields + `{ paidTicketingEnabled, paidTicketingRequestedAt, verified }`                                                                                                                                                 |
| `getAdminEventIndex(actor)`                         | H      | `{ id, name, owner:{id,name,email}, status }[]` — Platform-Owner gated, no stats                                                                                                                                              |

### Writes (mutations — ownership-only, paid-gate where noted)

| Service                                                                           | Screen | Notes                                                        |
| --------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------ |
| `createEvent` / `updateEvent`                                                     | D      | event + inline tiers; RSVP/paid derived from tier prices     |
| `duplicateEvent(actor, eventId)`                                                  | B      | clone event + tiers → new draft                              |
| `deleteEvent(actor, eventId)`                                                     | B      | guarded: block/soft-delete when it has orders (see schema Q) |
| `toggleEventPublish(actor, eventId)`                                              | B/C    | exists; honors publish requirements                          |
| `createTicketType` / `updateTicketType`                                           | D/E    | **paid gate**: `priceCents > 0` ⇒ org `paidTicketingEnabled` |
| `duplicateTicketType` / `deleteTicketType`                                        | E      | delete guarded when the tier has sales                       |
| `reorderTicketTypes(actor, eventId, orderedIds[])`                                | E      | writes `sortOrder`                                           |
| `setCheckInStatus(actor, ticketId, checkedIn)`                                    | F      | reuses the existing check-in path (+ `checkinTimestamp`)     |
| `resendOrderConfirmation(actor, orderId)`                                         | G      | re-sends the transactional email; no money movement          |
| `updateOrganizationProfile(actor, input)`                                         | I      | exists (brand)                                               |
| `requestPaidTicketing(actor)`                                                     | I      | sets `paidTicketingRequestedAt`; notifies TropTix            |
| `approvePaidTicketing(admin, orgId)` / `setOrganizationVerified(admin, orgId, v)` | H      | Platform-Owner platform actions (ADR 0018)                   |

### Exports (route handlers streaming CSV, backed by a read service)

- `GET /organizer/events/[id]/export/attendees.csv` and `…/export/orders.csv` — auth'd, owner-only,
  stream CSV from `listAttendees` / `listOrders` row data.

### New infrastructure & schema changes

- **`Events.deletedAt` (nullable) — soft-delete.** Every organizer read filters `deletedAt: null`;
  `deleteEvent` sets the timestamp (order/attendee records preserved, event hidden). "Delete" =
  archive.
- **`Organization.paidTicketingEnabled` (bool, default false) + `paidTicketingRequestedAt` (nullable)**
  — from the [onboarding plan](2026-07-organizer-onboarding-paid-approval.md); **backfill existing
  paid-selling orgs to true** at rollout.
- **`TicketTypes.sortOrder` (int)** — for buyer-facing tier order (Screen E reorder). Backfill by
  `createdAt`.
- **Indexes:** `Events(organizerUserId)`, `Orders(eventId, status)` (already in the migration plan).
- **Deferred:** `EventPageView` table + `recordEventPageView` (page views / conversion) — ships with
  the funnel follow-up, not this build.

### Reconciliation with the migration plan

This replaces the migration plan's provisional read/write list. The migration's **phasing still
holds** (contracts + reads → page cutover → writes → retire), but the _set_ of services is the table
above, and Phases now also carry the new schema (page views, paid flag, sortOrder) and the new write
services (duplicate/delete/reorder/resend/request/export). The migration plan should be updated to
point here for the service inventory.

_Status: API surface drafted from locked screens; ready to build per the migration plan's phasing._
