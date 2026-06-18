---
title: Event Page Redesign — Clean Direction (Stage 3 front half)
status: proposed
created: 2026-06-18
tracking-issue: TBD
---

# Event Page Redesign — Clean Direction

A fresh public event page built from the Claude Design **"Clean (01)"** handoff. This is the
**presentational front half of [Stage 3](2026-06-checkout-redesign.md)**: the scrollable page
plus the sticky buy bar, ending at the **"Get Tickets" / "RSVP" tap**. Everything _behind_
that tap — ticket selection and the whole checkout/RSVP sheet — is owned by the
[checkout-redesign plan](2026-06-checkout-redesign.md). The seam between the two plans is
the CTA that opens the sheet.

**Parent PRD:** [#348 — Checkout Redesign (Stage 3)](https://github.com/TropTix/troptix/issues/348)
is the product framing for all of Stage 3; the [checkout-redesign plan](2026-06-checkout-redesign.md)
holds the technical detail. This doc is the event-page slice of that initiative. Three of
this plan's decisions **deviate from PRD #348** — see [Relationship to PRD #348](#relationship-to-prd-348).

**Design source of truth:** `event-checkout-flow/project/design_handoff_event_checkout/`
(README spec + `event/*.jsx`). The handoff JSX is byte-identical to the top-level
`project/event/*.jsx`; the handoff `README.md` is the authoritative spec. Only the handoff
folder is consulted for design — ignore the other top-level prototype files (`stage.jsx`,
`tweaks-panel.jsx`, `confirmations.jsx`, `shareable.jsx`, etc.).

## Relationship to PRD #348

[PRD #348](https://github.com/TropTix/troptix/issues/348) is canonical product framing
(`ready-for-agent`). Where this plan diverges, the divergence was an explicit decision and the
PRD + checkout-redesign plan are to be **amended to match** (tracked in
[Open follow-ups](#open-follow-ups-separate-issues-not-blockers)):

| Topic | PRD #348 says | This plan | Resolution |
| --- | --- | --- | --- |
| Ticket selection | inline on the event page (US #1, "Surface") | **in the sheet** (handoff design) | amend PRD + checkout-redesign |
| Availability counters | live "Only N left" / "Sold out" (US #2, urgency) | **removed** | amend PRD (drop/soften US #2) |
| Rollout | flagless coordinated deploy | **flagless coordinated deploy** | ✅ aligned — follows the PRD |

Everything else here is consistent with the PRD: reservation-backed checkout, server-side
pricing, webhook-only fulfillment, the URL-addressable reservation route, and PostHog funnel
instrumentation all stay as the PRD/plan specify — they live behind the seam, in Stage 3.

## Key design fact: no ticket list on the page

Per the handoff spec: **"All ticket selection happens inside the sheet — the page itself has
no ticket list."** The buy bar shows **"From $X"** and a single **"Get Tickets"** button that
opens the (multi-step) checkout sheet, where tier selection lives (Step 0). For free events
the buy bar shows **"Free" + "RSVP"**, opening the RSVP sheet.

⚠️ **This reverses a decision in the [checkout-redesign plan](2026-06-checkout-redesign.md)**,
which currently says "ticket selection is inline on the event page" and "collapse the mock's
two steps into one sheet view." The handoff design (selection in the sheet) is now the source
of truth. **The checkout-redesign plan must be amended** to (a) own the in-sheet ticket
selection step and (b) drop its inline-selection assumption. That reconciliation is tracked
against the checkout-redesign plan, not built here.

## Scope & goals

- **Goal:** replace the current dark-overlay event page
  ([EventDetails.tsx](../../apps/web/src/app/events/[eventId]/_components/EventDetails.tsx))
  with the Clean handoff — inset rounded poster hero on white, airy hierarchy, and a sticky
  buy bar — built on the existing design system.
- **In:** hero (inset poster + date chip), top buttons (back/share), summary + two meta rows,
  about/description, organizer block (logo + name only), trust line, sticky buy bar
  ("From $X" → Get Tickets; free → "Free" → RSVP), sticky-on-scroll header, draft banner,
  venue map, UTM/email tracking (carried over).
- **Boundary:** the buy-bar CTA opens the **Stage 3 checkout/RSVP sheet** (which owns
  selection → `createReservation` → reservation route). Per PRD #348 the new client ships as
  **one coordinated deploy** — so the event page and the checkout sheet go live together; the
  CTA points at the new sheet, not the legacy modal. (A temporary wire to the legacy
  `TicketModal` / `TicketDrawer` may be used for isolated dev/preview only, never as the
  shipping path.)
- **No ticket-selection UI on the page** (it's in the sheet → checkout-redesign). The page
  holds **no cart/qty state**.
- **No availability counters.** Per prior decision, neither the per-ticket "Only N left" /
  "Sold out" badge nor the free "spots left" + capacity bar is shown — a deliberate deviation
  from the handoff, which includes them.
- **Out:** the entire checkout/RSVP sheet, ticket selection, Payment Element, countdown,
  success/QR ticket — all in [checkout-redesign](2026-06-checkout-redesign.md). Also out: any
  design element with no schema backing (see [Data reconciliation](#data-reconciliation)).
- **No schema changes.** v1 renders only what the data model already supports.

## Decisions (resolved)

1. **Scope = event page chrome + buy bar**, ending at the CTA that opens the sheet.
2. **Ticket selection is in the sheet, not on the page** (handoff design wins over the
   checkout-redesign plan's earlier inline decision).
3. **No availability counters** (deliberate deviation from the handoff).
4. **Rollout = parallel route `/e/[eventId]`, then flagless coordinated cutover.** Build the
   new page (visuals + data) at a fresh `app/e/[eventId]` route, leaving legacy
   `app/events/[eventId]` untouched and live. No feature flag. When Stage 3's sheet is ready,
   a coordinated cutover makes the new route canonical and retires legacy (per PRD #348 — the
   new client ships as one deploy).
5. **Recreate visually with the design system — do not port the prototype.** The mock is
   inline styles + a hand-rolled `Icon` + `SLATE` constants. Rebuild with shadcn primitives +
   `lucide-react` + semantic tokens. The handoff's palette/type was "lifted from
   `globals.css`," so tokens already match (indigo brand, slate neutrals, light-only — per
   [ADR 0001](../adr/0001-tailwind-v4-first.md)/[0002](../adr/0002-light-only-no-dark-toggle.md)/[0003](../adr/0003-indigo-canonical-brand.md)).

## Data reconciliation

The handoff data (`foundation.jsx` `EVENT`) exceeds what `Events`/`TicketTypes` hold. Some
items the **designer already removed**; others we remove for **lack of schema**; the rest
render. The page needs very little data now that selection is gone.

| Design element | Status | v1 |
| --- | --- | --- |
| name, description, venue, address, lat/lng, organizer, start/end dates | schema ✅ | render |
| tagline | `Events.summary` ✅ | render (omit if null) |
| "From $X" (cheapest tier price) | schema ✅ (page.tsx already selects min-price tier) | render |
| ticket tiers (name/desc/price/stepper) | — | **not on page** — in the sheet (checkout-redesign) |
| "Only N left" / "Sold out" badge | removed by decision | **remove** |
| free "spots left" + capacity bar | removed by decision | **remove** |
| tag chips | removed by design | **remove** |
| going-count + attendee avatars | removed by design | **remove** |
| accordion: what's-included / schedule / dress code / FAQs | removed by design | **remove** (About is the only info section) |
| organizer verified check / followers / events count / Follow pill | no schema | **remove** — logo + name only |
| save (heart) button | no saved-events system | **defer** (omit or non-functional — see follow-ups) |
| neighborhood / city split | only `venue` + `address` | use `venue` + `address` |

**Net v1 page:** hero (inset poster + date chip) · back/share overlay · title + tagline ·
date & location meta rows · about/description · venue + map · organizer (logo + name) · trust
line · sticky buy bar. Sticky-on-scroll header mirrors title + CTA.

**Data fetching (new route):** the `app/e/[eventId]/page.tsx` server component fetches the
event **and its ticket types** (mirroring the legacy select). The page renders only event meta
+ "From $X", but fetching the full tier list here establishes the data layer the Stage 3 sheet
will consume. Carry over the draft-mode guard, `generateMetadata`/OG, and `not-found`.

**"From $X" pricing:** show the cheapest tier price (the legacy select already orders tiers by
price asc). Whether it's displayed all-in/fee-inclusive (the handoff's 18% placeholder)
depends on the real fee model, which checkout-redesign owns — v1 may show base "From $X USD"
as today and adopt all-in once the fee model is wired.

## Component plan

New components under `apps/web/src/app/e/[eventId]/_components/` (fresh route; legacy
`events/[eventId]` untouched). Rebuild each handoff piece with the design system:

| New component | From handoff | Built with |
| --- | --- | --- |
| `EventPageClean.tsx` | `EventPage` (clean variant) | layout shell, scroll state, sticky logic, sheet wiring |
| `HeroClean.tsx` | `HeroClean` | `next/image` poster, `aspect-ratio` (~4:5), rounded inset, date chip |
| `TopButtons.tsx` | `TopButtons` | back + share overlay (slate-tinted translucent on white) |
| `EventSummary.tsx` | `SummaryBlock` + `MetaRow` | typography tokens, `lucide-react` (Calendar/MapPin), 44px icon tiles |
| `AboutBlock.tsx` | `AboutBlock` | section label + `whitespace-pre-wrap` description |
| `OrganizerBlock.tsx` | `OrganizerBlock` | logo + name only (no verified / followers / follow) |
| `BuyBar.tsx` | `BuyBar` + `BarBtn` | sticky `button`; "From $X" → Get Tickets (paid) / "Free" → RSVP (free) |
| `StickyHeader.tsx` | `StickyHeader` | appears on scroll; title + CTA |

Reuse existing: draft `Banner`, the Google `Map` block, `separator`, `eventFlyerUrl` /
`DEFAULT_EVENT_IMAGE`, `getFormattedCurrency`, the date formatters, `useScreenSize`, and the
UTM/`emailTracking` effects — all already in
[EventDetails.tsx](../../apps/web/src/app/events/[eventId]/_components/EventDetails.tsx).

**No `TicketSelector` / `RsvpBlock` on the page** — selection and the RSVP form live in the
sheet (checkout-redesign). The page holds no cart state; the only interactive state is scroll
position (sticky bar/header), `saved` (if a non-functional heart is kept), and which sheet is
open.

## The commit seam

The buy-bar CTA (and the sticky-header CTA) call one handler:

```
onOpenCheckout()  // paid: "Get Tickets"   free: "RSVP"
  → open the Stage 3 checkout/RSVP sheet → selection → createReservation → reservation route
```

`onOpenCheckout` is the single integration point with Stage 3. Preserve
`trackEmailTicketPurchaseStart` on open. (For isolated dev/preview before the sheet exists, it
may temporarily open the legacy `TicketModal` / `TicketDrawer` — never the shipping path.)

## Rollout (parallel route → coordinated cutover)

Build fresh at **`app/e/[eventId]`**, separate from the live legacy `app/events/[eventId]`.
No feature flag (per PRD #348). This lets the visuals + data layer ship and be previewed at a
real URL without risking the current page, and decouples the build from Stage 3 readiness.

- **Build phase:** `/e/[eventId]` is a real, deployable route — not linked from anywhere yet,
  so it's safe to iterate in production. Legacy `/events/[eventId]` is untouched. The buy-bar
  CTA is stubbed (or dev-wired to the legacy sheet) until Stage 3's sheet exists.
- **Coordinated cutover** (with Stage 3, one deploy): point the CTA at the new sheet and make
  the new page canonical. **Open cutover detail:** either promote `/e/[eventId]` to canonical
  and `301` `/events/[eventId]` → `/e/[eventId]`, **or** move the new implementation back into
  `/events/[eventId]` and drop `/e`. The second keeps existing links / email UTM targets /
  OG/SEO on the current canonical URL with no redirect — **lean toward it** unless we want the
  shorter `/e` URL as a product feature. Decide before cutover.
- **Cleanup** (same cutover): delete `EventDetails.tsx`, `ticket-modal.tsx`,
  `ticket-drawer.tsx`, and whichever route scaffold isn't kept.

## Phasing (PRs)

1. **Route + data layer:** new `app/e/[eventId]` route — server component fetches the event
   **and its ticket types** (event meta + tiers; tiers feed the "From $X" price now and the
   Stage 3 sheet later). Draft-mode guard, `generateMetadata`/OG, `not-found`, loading — at
   parity with the legacy route.
2. **Presentational page:** hero + top buttons + summary + about + organizer + trust line +
   map + draft banner. Static buy bar ("From $X"). Visual parity with the handoff.
3. **Buy bar + sticky-on-scroll header**, `onOpenCheckout` handler ready (stubbed / dev-wired
   to the legacy sheet for preview).
4. **Polish**: animations (respect `prefers-reduced-motion`), loading/skeleton, a11y pass,
   responsive QA (390px mobile primary; 620px desktop column).
5. **Coordinated cutover** (with Stage 3): point the CTA at the new sheet, resolve the
   canonical-URL question above, retire legacy — one deploy, no flag.

## Verification

- Per PR: `typecheck`; visual parity against the handoff (mobile + desktop) read from source,
  not screenshots.
- Draft banner, Google map, UTM/email tracking, and paid + free CTA paths behave as today.
- At cutover: the coordinated deploy renders the new page and the CTA opens the Stage 3 sheet
  end to end; no console errors; legacy components fully removed.
- Lighthouse/CLS not regressed (sticky bar + hero image are the watch items).

## Open follow-ups (separate issues, not blockers)

- **Amend [PRD #348](https://github.com/TropTix/troptix/issues/348) + the checkout-redesign
  plan** for the two confirmed deviations: (a) ticket selection lives **in the sheet**, not
  inline on the event page (supersedes US #1 / "Surface" and the plan's one-view-sheet
  decision — the sheet regains a selection step); (b) **no availability counters** (drop or
  soften US #2; the in-sheet selection step shows no "Only N left" / "Sold out"). _Highest
  priority — it defines the sheet this page's CTA opens._
- **Organizer social** (verified badge, follower/event counts, Follow): needs schema + a
  follow system + organizer-profile design.
- **Saved events** (the heart button): needs a saved-events model; omitted/non-functional in
  v1.
- The design-removed sections (tags, schedule, what's-included, dress code, FAQs, going-count)
  are **out of the design entirely** — only revisit if the design adds them back.
