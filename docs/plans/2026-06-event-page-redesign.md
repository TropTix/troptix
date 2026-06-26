---
title: Event Page Redesign — Clean Direction (Stage 3 front half)
status: active
created: 2026-06-18
tracking-issue: 'impl: TropTix/troptix#351 · parent PRD: #348'
---

# Event Page Redesign — Clean Direction

A fresh public event page built from the Claude Design **"Clean (01)"** handoff, on a parallel
**`/e/[eventId]`** route. It's the front of [Stage 3](2026-06-checkout-redesign.md): the
scrollable page, the sticky buy bar, and the **ticket-selection sheet** it opens. The seam
into the rest of Stage 3 is the sheet's **"Continue" / "Complete RSVP"** action, which will
call `createReservation` and hand off to the reservation/payment flow.

**Parent PRD:** [#348 — Checkout Redesign (Stage 3)](https://github.com/TropTix/troptix/issues/348).
Implementation lands in [PR #351](https://github.com/TropTix/troptix/pull/351); the plan itself
was reviewed in [PR #350](https://github.com/TropTix/troptix/pull/350).

**Design source of truth:** `event-checkout-flow/project/design_handoff_event_checkout/`
(README spec + `event/*.jsx`) for the Clean direction, **plus** later mobile/desktop direction
calls captured below (clean light direction, mobile-immersive hero + desktop two-column).

## Status / progress (PR #351)

Landed on `claude/event-page-phase1` (deployable but unlinked — legacy `/events/[eventId]`
untouched, so it's safe to merge as WIP):

- **Data layer** — `getEventDetail` service (`packages/api`): one query fetches the event +
  its public tiers, returning a client-safe DTO (`EventDetail` = meta + `EventTicket[]` +
  server-computed `fromPriceCents`; no discount codes / raw inventory). Zod contracts + unit
  tests.
- **Route** — `app/e/[eventId]/{page,loading,not-found}.tsx`: draft guard, `generateMetadata`/OG,
  `cache()`-deduped read.
- **Page UI** (`EventPageClean.tsx`) — clean light; **mobile immersive hero** (full-bleed poster,
  floating back/share, date chip, scrim) + **desktop two-column** (sticky poster aside with a
  flyer-sampled colour halo); title / tagline / date+location meta / About / Location / Hosted-by;
  sticky **Get Tickets / RSVP** bar.
- **Immersive shell** — the global header/footer are hidden on `/e/` routes (the page owns the
  screen; in-page back/share replace the app nav).
- **Checkout flow (Free RSVP, end to end)** — `CheckoutSheet` (full-screen, shadcn `Sheet`)
  orchestrates **select → contact → confirmation**: `SelectStep` (steppers collapse to a `+`,
  running total), `ContactStep` (react-hook-form + `zodResolver`, prefilled from `useAuth`),
  `SuccessTicket` (the **shareable confirmation** — poster card + Share, with the private QR pass
  behind "View ticket & QR" → links to `/orders/[orderId]/tickets`). Free events reserve +
  confirm here; paid stops at a "coming soon" note (Stripe is the next slice).
- **Reservation backend** — `createReservation` (server-side pricing authority: derives
  price/fees, clamps, reserves), `completeFree` (free-path materialize by reservationId; `confirm`
  refactored to share `materializeOrder`), and `release`; all as public `checkout.*` tRPC
  procedures. Stood up the **tRPC React client** (`lib/trpc.ts` + provider). Fake-prisma unit
  tests + integration tests.
- **Organizer dual-write** — ticket create/update now populate the reservation-era columns
  (`capacity`/`priceCents`/`saleStartsAt`/`saleEndsAt`) via a shared `reservationColumns` helper,
  so new/edited events work with `reserve()`. Existing events need a one-time backfill (run
  manually via SQL; not in the repo).

**Not yet built:** paid checkout (Stripe Payment Element), the URL-addressable reservation route +
countdown, webhook fulfillment, and the carried-over UTM/email tracking — see
[Open follow-ups](#open-follow-ups).

## Relationship to PRD #348

[PRD #348](https://github.com/TropTix/troptix/issues/348) is canonical product framing. Where
this plan diverges, the divergence was an explicit decision and the PRD + checkout-redesign plan
are to be **amended to match**:

| Topic                 | PRD #348 says                           | This plan                                              | Resolution                    |
| --------------------- | --------------------------------------- | ------------------------------------------------------ | ----------------------------- |
| Ticket selection      | inline on the event page (US #1)        | **in a sheet** opened from the bar                     | amend PRD + checkout-redesign |
| Availability counters | live "Only N left" / "Sold out" (US #2) | **removed** (sold-out tiers just disable in the sheet) | amend PRD (drop/soften US #2) |
| Rollout               | flagless coordinated deploy             | **flagless** (parallel route → coordinated cutover)    | ✅ aligned                    |

## Decisions (resolved)

1. **Parallel route `/e/[eventId]`**, legacy `/events/[eventId]` untouched; flagless, with a
   coordinated cutover later (per PRD #348).
2. **Ticket selection lives in a sheet**, not as an inline list on the page (handoff design).
3. **No availability counters** — no "Only N left" / "Sold out" / spots-left numbers. Sold-out
   tiers (`maxAllowedToAdd === 0`) just disable in the sheet ("Unavailable").
4. **Layout: mobile immersive hero + desktop two-column** (explicit direction call). Mobile is
   the priority; desktop two-column stays.
5. **Visual direction: clean light** (chosen after exploring light / hybrid / dark). Clean white
   surface; colour comes from the poster — a subtle flyer-**sampled** halo behind the desktop
   poster (not a page-wide wash). Light-only per [ADR 0002](../adr/0002-light-only-no-dark-toggle.md),
   indigo per [ADR 0003](../adr/0003-indigo-canonical-brand.md).
6. **One canonical public read: `getEventDetail`** owns the event + public-tier shaping in a
   single query — decoupled from `getCheckoutConfig` (slated for rework). Client never sees
   discount codes or raw counts.
7. **Recreate with the design system** (shadcn primitives + `lucide-react` + tokens), not a port
   of the prototype's inline styles.

## Data reconciliation

`getEventDetail` returns only what the schema backs; the handoff's extra content is dropped.

| Design element                                                               | Status                                             | Result                         |
| ---------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------ |
| name, description, venue, address, lat/lng, organizer, start/end dates       | schema ✅                                          | render                         |
| tagline                                                                      | `Events.summary` ✅                                | render (omit if null)          |
| public tiers (name/desc/price/fees, `maxAllowedToAdd`)                       | schema ✅                                          | `EventTicket[]` → the sheet    |
| "From $X"                                                                    | derived from tiers (`min(priceCents)`) server-side | render                         |
| "Only N left" / "Sold out" / spots-left / capacity bar                       | removed by decision                                | **removed**                    |
| tag chips · going-count + avatars · accordion (included/schedule/dress/FAQs) | removed by design                                  | **removed**                    |
| organizer verified / followers / Follow                                      | no schema                                          | **removed** — name + logo only |
| save (heart) button                                                          | no saved-events system                             | **deferred**                   |

Pricing/fees use the reservation-era columns (`priceCents`, `ticketingFees`) with legacy
fallbacks (`price`, `quantity`, split sale dates) until the Stage-3 backfill.

## Component plan (as built)

Under `apps/web/src/app/e/[eventId]/` and `packages/api`:

| File                                                  | Role                                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `page.tsx`                                            | server component: `cache()`-deduped `getEventDetail`, draft guard, metadata                                     |
| `_components/EventPageClean.tsx`                      | the page UI — mobile hero + desktop two-column, share, accent halo, sticky bar                                  |
| `_components/CheckoutSheet.tsx`                       | checkout orchestrator: step machine (select/contact/comingSoon/success), the tRPC mutations, release-on-failure |
| `_components/SelectStep.tsx`                          | tier list + collapsible steppers + running total                                                                |
| `_components/ContactStep.tsx`                         | react-hook-form + `zodResolver` over the shared contact schema; `useAuth` prefill                               |
| `_components/SuccessTicket.tsx`                       | shareable confirmation (poster card + Share) + private QR pass overlay                                          |
| `loading.tsx` / `not-found.tsx`                       | skeleton mirroring the layout / 404                                                                             |
| `apps/web/src/lib/trpc.ts` + `providers.tsx`          | tRPC React client + provider (reuses the app QueryClient); `/e/` immersive header/footer hiding                 |
| `apps/web/src/lib/reservationColumns.ts`              | maps legacy ticket fields → reservation-era columns (organizer create/update)                                   |
| `packages/api/src/services/events.ts`                 | `getEventDetail` (+ unit tests)                                                                                 |
| `packages/api/src/services/reservations.ts`           | `createReservation` / `completeFree` / `release` (+ `materializeOrder` shared with `confirm`)                   |
| `packages/api/src/contracts/{events,reservations}.ts` | `EventDetail`/`EventTicket` + reservation/commit zod contracts                                                  |
| `packages/api/src/trpc/routers/checkout.ts`           | `createReservation` / `completeFree` / `release` public procedures                                              |

Reuses: shadcn `Sheet`/`Banner`/`Skeleton`/`Form`/`Input`, `useCopyToClipboard`, `qrcode.react`,
`eventFlyerUrl`, `getFormattedCurrency`, the date formatters, `calculateFeesCents`, the reservation
primitives (`reserve`/`confirm`/`release`).

## The flow / seam

```
/e/[eventId]  (immersive page)
  buy bar "Get Tickets" / "RSVP"  → open CheckoutSheet
     select tiers → contact (prefilled if logged in) → commit:
        free  → createReservation → completeFree → shareable confirmation (QR behind "View ticket")
        paid  → "coming soon"  ← SEAM (createReservation + PaymentIntent + Payment Element next)
```

Free is wired end to end; the paid branch is the remaining seam into Stage 3. Free-vs-paid is
decided by the **selected total**, not the event's cheapest tier (mixed free+paid events). If a
commit fails after the hold, the client `release()`s it so inventory isn't leaked.

## Rollout (parallel route → coordinated cutover)

Build at `app/e/[eventId]`, unlinked and deployable; legacy stays live. No feature flag. At the
coordinated cutover (with Stage 3) the CTA points at the real reservation flow and the new page
becomes canonical. **Open cutover detail:** promote `/e/[eventId]` (301 from `/events/[eventId]`)
**or** move the implementation back into `/events/[eventId]` and drop `/e` — lean toward the
latter to keep existing links / email UTM / SEO. Cleanup deletes `EventDetails.tsx`,
`ticket-modal.tsx`, `ticket-drawer.tsx`.

## Remaining slices

1. ✅ Route + `getEventDetail` data layer.
2. ✅ Page UI (mobile hero + desktop two-column, clean light) + selection sheet.
3. ✅ **Free RSVP end-to-end** — tRPC client + `createReservation`/`completeFree`/`release`,
   checkout flow (select → contact → shareable confirmation), organizer capacity dual-write.
4. **Paid checkout** — `createReservation` + PaymentIntent + reservation route + Payment Element.
5. **Fulfillment** — webhook → `confirm()`, confirmation/poll.
6. **Coordinated cutover + cleanup.**

## Open follow-ups

From the `/code-review` pass and prior decisions (deferred, not blocking the WIP merge):

- **Carry over UTM/email tracking** (`trackEmailEventPageView` / `trackEmailTicketPurchaseStart`)
  — present on the legacy route, not yet on `/e/`. Needed before cutover.
- **No in-app nav on `/e/`** (header/footer hidden) — add a home/escape affordance for direct
  landings (the hero back button no-ops without history).
- **"Get Tickets" with no tiers** — CTA is clickable and opens an empty sheet when an event has
  no public tickets.
- **`createReservation` doesn't re-check sale window / draft** — `reserve()` only clamps
  inventory; a crafted request could hold an off-sale or draft tier. Validate in the service.
- **`wasAdjusted` is silent** — a partial grant proceeds without telling the buyer their quantity
  was reduced (the "we reduced your order" confirm).
- **Backfill existing events** — the reservation-era columns are only written for new/edited
  ticket types; existing rows need the one-time backfill (`capacity = quantity`, etc.). Run via
  SQL editor (kept out of the repo) or fold into the Stage-3 M4 migration.
- **Apple Wallet pass** + the **story-image share** (1080×1920 card) — the confirmation's
  share uses the native Web Share API with the event link for now; both are bigger features.
- **Guest access to `/orders/[orderId]/tickets`** — confirm the order/tickets page allows
  possession-based (guest) access, else guests can't open "View all tickets".
- **Venue map** (Phase 2) and **persisted sheet selection** on reopen.
- **`/e/` chrome-hide is a prefix match** — revisit (route groups) if a `/e/[id]/sub` route ever
  needs the header.
- **Amend PRD #348 + checkout-redesign** for in-sheet selection and no-counters.
- **Organizer social** (verified / followers / Follow) and **saved events** (heart) — need schema.
