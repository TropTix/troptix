---
title: Orders & Tickets Redesign — Wallet-First
status: proposed
created: 2026-07-02
tracking-issue: TBD
---

# Orders & Tickets Redesign — Wallet-First

A redesign of how attendees view the tickets and orders they've purchased, aligned with the
new design language and the `/e/[eventId]` checkout. The guiding frame is **wallet-first**: the
primary job of these pages is _getting into the event_ — a big, scannable QR on a phone at the
door — not _managing a purchase_. Receipts and history are real, but secondary.

This plan is the spec. It picks up at the seam where checkout ends — the `SuccessTicket`
confirmation in the `/e/` flow — and covers everything the attendee touches afterward: the
confirmation handoff, the guest access link in the email, the aggregate "My Tickets" list, the
per-order detail, the swipeable ticket/QR view, and the receipt.

**Relates to:** [Checkout Redesign (Stage 3)](2026-06-checkout-redesign.md) and the
[Event Page Redesign](2026-06-event-page-redesign.md) (the `/e/` flow that feeds this),
[ADR 0014 — UUIDv7 PKs + prefixed public codes](../adr/0014-uuidv7-pks-and-public-codes.md)
(the `id` / `publicCode` split this builds on), and
[ADR 0015 — passwordless auth](../adr/0015-passwordless-auth-and-trigger-provisioning.md)
(the Supabase session the logged-in path relies on).

## Current state

- **Routes** (all client-side, querying Prisma directly): `/orders` (aggregate list, filtered
  by session email), `/orders/[orderId]`, `/orders/[orderId]/tickets`, `/orders/[orderId]/receipt`,
  `/orders/[orderId]/confirmation`.
- **The order detail and tickets pages have no auth guard.** They render for anyone who knows the
  URL; access "works" only because the `orderId` is generated unguessable. The `orderId` is
  effectively a bearer token today — which is wrong, because it's also the number we print on
  receipts and show in support.
- **QR** encodes the raw ticket `id` (UUID), rendered client-side as SVG via `qrcode.react`.
- **Checkout seam:** the `/e/` flow's `completeFree` / `confirm` (in
  `packages/api/src/services/reservations.ts`, both routing through `materializeOrder`) return
  `{ orderId, tickets }`. `SuccessTicket` holds `orderId` in client state and links "View all
  tickets" → `/orders/{orderId}/tickets`. No access token is minted anywhere.
- **Guest checkout is supported** — a reservation/order can have `userId = null`, with the buyer's
  identity captured as `email` / `firstName` / `lastName`.

## Decisions

The redesign was grilled decision-by-decision; the resolved tree:

### Framing & structure

- **Wallet-first.** The QR view is the hero. Money/receipt detail is secondary.
- **By-order is the organizing unit, everywhere** — including the aggregate list. Two orders to
  the same event render as two cards. Driver: the confirmation email deep-links to a single order,
  and by-order keeps a clean 1:1 mental model with the receipt / Stripe charge. The
  multi-order-per-event case is accepted as a rare edge, not specially merged.

### Access model — logged-in + guest

- **Hybrid, token-first.** A dedicated **`accessToken`** — high-entropy, unguessable, stored on
  the order, **non-expiring but revocable** — gates the order/tickets/receipt pages. It is
  **distinct from both the PK (`id`) and the user-facing `publicCode`** (per ADR 0014, `publicCode`
  is a _shown_ reference — printed on receipts, in URLs, in support — so it must never double as
  the access secret). Link-forwarding-as-access is accepted (it doubles as a poor-man's transfer
  for now).
- **`accessMode` resolver.** A single server-side check resolves how a viewer got in:
  `owner` (Supabase session matches the order's `userId`/`email`) or `guest` (valid `?t=` token,
  no matching session). This resolver is the guard on `/orders/[orderId]`, `/tickets`, and
  `/receipt` — **shipping it closes the current wide-open-URL gap.**
- **Logged-in aggregate list** (`/orders`, "My Tickets"): split **Upcoming** (hero, soonest-first,
  expanded) and **Past** (secondary). Cards lead with event identity (poster, name, date, venue)
  plus ticket count. **No money on the list card.** Real empty state → event discovery.
- **Guest → account:** auto-match by `Orders.email` on sign-in (already how the list filters) +
  **opportunistic `userId` backfill** — stamp `userId` onto previously-guest orders (and their
  tickets) when a logged-in user's email matches, server-side on fetch. Cross-email
  claim-by-token is **deferred**.

### Routing

- Keep the existing `/orders/[orderId]/…` tree. Guest access rides a **`?t=<accessToken>`** query
  param, checked by the `accessMode` resolver (session OR valid token). The `orderId` in the URL
  is harmless once the guard exists (it grants nothing without a session match or a valid token).
- Human-facing order references (receipt header, email body text) use the order **`publicCode`**
  (ADR 0014, `O`-prefixed), not the raw PK.

### Ticket display (the door experience)

- **Swipeable, one QR per screen**, "Ticket 1 of N", attendee name under each, **forced max screen
  brightness** on this view. One person holds all tickets in a group. A secondary "view all" grid
  exists but is not the default.
- **QR encodes the ticket `publicCode`** (ADR 0014, `T`-prefixed) — static, so it's
  screenshot-safe and drop-in compatible with a future Wallet pass. _(Refinement of the original
  "raw `Tickets.id`" call: same static-value property, but keeps the internal PK out of the QR per
  ADR 0014. See [Open questions](#open-questions) re: `publicCode` liveness.)_
- **Lifecycle states:** always render the QR. **Refunded / Cancelled → overlay a badge** (the
  scanner rejects those server-side anyway, so a rendered QR is harmless and the badge explains
  why it won't scan). **No special "checked-in" state** for scanned tickets in v1.
- **Ticket transfer / assignment: out of scope** this pass.

### Payment — "what I paid & when"

- Order detail: a **one-line money summary** — total + date + card last-4 — sourced from the
  **`*Cents`** fields (not the legacy `Float` columns). Full itemized **receipt one tap away**.
- **Billing address is owner-only**, withheld **server-side** via `accessMode` (never sent to a
  guest's client). Card last-4 is visible to guests (aids recognition, not sensitive).
- **Free / RSVP orders** (`OrderType.FREE` / `totalCents === 0`): same flow, **money layer
  suppressed** (a "Free" / "RSVP confirmed" pill replaces the money line), **receipt link hidden**.

### Offline resilience

- **Screenshot-friendly now**, architected toward true offline later. The QR renders from
  already-fetched data and degrades gracefully (show cached QR even if a background refresh fails);
  never require live connectivity to display the QR. **Apple Wallet + Google Wallet passes are a
  committed roadmap item, not this pass** — the static `publicCode` QR is what makes them a
  drop-in later.

### Checkout → tickets handoff

- **Mint the `accessToken` in `materializeOrder`** — the single chokepoint every order (free and
  paid) passes through. Extend the conversion return to **`{ orderId, accessToken, tickets }`**.
- The `SuccessTicket` card becomes lean: **"Order confirmed · N tickets"** + a single **"View
  tickets"** button that navigates straight to **`/orders/{orderId}/tickets?t=<accessToken>`**.
  **No inline QR / no peek** — the existing QR modal in `SuccessTicket` is removed; the QR lives
  only in the real swipeable view.
- The confirmation **email CTA uses the same URL** — one capability, minted once, shared by the
  success screen and the email.

## Design direction

Wallet-first, executed as **QR-first**: the ticket view leads with the QR, everything else
supports it. We explored a skeuomorphic "physical pass" concept (dark, flyer-fed, foil serial)
and **deliberately set it aside** — it fought the documented light-only system and added chrome
that competes with the scan. The chosen direction stays inside the existing clean-card,
light-only, indigo system.

- **Ticket view (`/orders/[orderId]/tickets`)** — one ticket per screen, swipeable. Top-to-bottom:
  the **QR is the hero** (centered, large), with the **TropTix "T" logo tile in its center** on a
  white halo; a `SCAN AT THE DOOR` cue; then event name, an attendee / admission split, the mono
  ticket code, and swipe dots for the rest of the order. White screen, max brightness forced.
- **The logo-in-QR requires error-correction level `H`.** In `qrcode.react`: `level="H"` plus
  `imageSettings={{ src, height, width, excavate: true }}` (`excavate` clears the modules behind
  the logo). Without level H a center logo can fail to scan on some phones. The logo is decoration
  layered on top — it never changes the encoded value (the ticket `publicCode` / id).
- **Type roles:** Inter for human content and headings (extrabold, `tracking-tight`, per the
  existing scale); **JetBrains Mono** (already loaded, previously unused) for all machine data —
  ticket code, `TICKET 01/05`, attendee/admission labels, section labels, receipt figures.
- **List, order detail, receipt** stay in the **plain light-card style** (shadcn `Card`, existing
  radii/borders) to match the rest of the app — no dark surfaces, no pass metaphor.
- **Lifecycle states:** same screen; Refunded / Cancelled dims the QR and overlays a badge.

## Implementation phases

Sequenced so the security-load-bearing foundation lands first.

### Phase 1 — Access foundation (`accessToken` + `accessMode`)

The rest of the redesign depends on this, and it doubles as the fix for the current
unauthenticated-order-pages gap. Land it first.

- Add an **`accessToken`** column to `Orders` (high-entropy, unique, indexed; separate from `id`
  and `publicCode`). Add a revoke path (nullable / rotate).
- Mint `accessToken` in **`materializeOrder`**; extend `completeFree` / `confirm` contracts to
  return it alongside `orderId` (`packages/api/src/services/reservations.ts`,
  `packages/api/src/contracts/reservations.ts`).
- Build the **`accessMode` resolver** (server-side): session-owner vs. valid-token-guest vs.
  denied. Apply it as the guard on `/orders/[orderId]`, `/tickets`, `/receipt`.
- Backfill `accessToken` for existing orders (migration).

### Phase 2 — Checkout handoff

- Rewrite `SuccessTicket` to the lean confirmation + single "View tickets" CTA →
  `/orders/{orderId}/tickets?t=…`. Remove the inline QR modal.
- Point the confirmation **email CTA** at the same tokenized URL
  (`apps/web/src/server/lib/email.ts`).

### Phase 3 — Swipeable ticket / QR view

- Rebuild `/orders/[orderId]/tickets` as the **swipeable one-per-screen** QR view ("Ticket N of
  M", attendee name, max brightness). QR encodes the ticket **`publicCode`**.
- Refunded/Cancelled badge overlay. Render from already-fetched data; graceful offline degrade.
- Keep a secondary "view all" grid.

### Phase 4 — Order detail + receipt

- Order detail: event-led header, one-line money summary (`*Cents`), "View receipt" link, free-order
  suppression.
- Receipt: `accessMode`-gated billing (owner-only, withheld server-side); guests see totals + card
  last-4. Human-facing reference uses order `publicCode`.

### Phase 5 — Aggregate "My Tickets" list

- `/orders` split Upcoming / Past, event-led cards + ticket count, empty state.
- Opportunistic `userId` backfill on matched sign-in.

## Out of scope / dependencies

- **Scan-race bug** (`apps/web/src/app/api/organizer/tickets/scan/route.ts`): the door-scan
  single-use check is a non-atomic read-then-write — two concurrent scans of one QR can both
  succeed. Needs an atomic conditional update, and should populate `checkinTimestamp`. **Separate
  fix.** _Soft dependency:_ a future "checked-in ✓" attendee state needs `checkinTimestamp`
  written, which this bug fix would deliver. Not required for this pass (no checked-in state in v1).
- **Apple Wallet / Google Wallet passes:** committed roadmap, greenfield (`.pkpass` + Google Wallet
  object generation). Not this pass; the static `publicCode` QR keeps it a drop-in later.
- **Ticket transfer / assignment:** the natural next feature (each attendee their own ticket on
  their own phone). Deferred.
- **Cross-email guest claim** (claim a ticket bought under a different email via its token):
  deferred; the token link in the buyer's inbox already covers that person.

## Open questions

- **`publicCode` liveness (blocks Phase 3/4 wording, not the architecture).** ADR 0014 is Accepted
  but its migration is heavy and sequenced into the schema redesign. Confirm whether `Orders` and
  `Tickets` carry a live `publicCode` today. If yes, the QR encodes the ticket `publicCode` and
  receipts/emails show the order `publicCode`. If not yet, Phase 3/4 either wait on it or fall back
  to the raw `id` in the QR as an interim (still static, still screenshot/Wallet-safe) and swap to
  `publicCode` when it lands — a small, localized change.
- **`accessToken` vs. `publicCode` reuse:** confirmed _separate_. Flag here only so a reviewer
  doesn't "simplify" by collapsing them — `publicCode` is deliberately a shown, lower-entropy
  reference and must not gate access.
