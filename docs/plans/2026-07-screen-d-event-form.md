---
title: Screen D — Create / edit event on the service layer
status: proposed
created: 2026-07-18
tracking-issue: TBD
---

# Screen D — Create / edit event

The organizer dashboard rebuild's first **write** surface. Screens A, B, C, E, G
are reads on the `@troptix/api` service seam; the create/edit form is where the
same seam has to hold for mutations. Derived from
[`2026-07-organizer-dashboard-ux.md`](2026-07-organizer-dashboard-ux.md) →
Screen D (locked). This doc is the spec; an umbrella issue tracks execution.

## Why a plan (not straight to a PR)

Three things make this substantial rather than another page rebuild:

1. **It's the first write behind the seam.** `createEvent`/`updateEvent` live in
   `apps/web/.../events/_actions/eventActions.ts` on the old
   `getUserFromIdTokenCookie` auth; `updateEvent` is a labelled _placeholder_;
   there is **no event write service in `@troptix/api`**. Pulling writes behind
   the actor seam (ADR 0013) is architecture, not cosmetics.
2. **It owns a rule that needs a home.** CONTEXT.md places the paid-ticketing
   gate in the ticket-type write service — a PAID ticket type requires the owning
   `Organization.paidTicketingEnabled`. The write services this screen introduces
   are that home, so wiring the gate through them is core to the screen, not an
   afterthought.
3. **It abuts an unbuilt, unaccepted initiative** — venue-local times
   (ADR 0021, _Proposed_; `Events.timeZone` not in the schema). See the carve-out
   below.

## Goal

Create or edit an event with the least friction — one form, sensible defaults,
publish requirements surfaced inline — on the service seam, with the paid-ticketing
gate actually enforced. Keep the current design; improve the mechanism.

## Scope

**In:**

- `createEvent` / `updateEvent` **write services** in `@troptix/api`, actor-based
  (ADR 0013), ownership-scoped, transactional (event + its ticket types).
- The **paid-ticketing gate**, enforced in the write path: a PAID ticket type
  (price > 0) requires the owning `Organization.paidTicketingEnabled`. RSVP
  (price = 0) is always allowed. Application-layer, per CONTEXT.md — not a DB
  constraint.
- The **Sell Tickets / RSVP toggle** at the top of the form — visibility over the
  price field, not stored `Event` state. Picking Sell when the org isn't approved
  shows the "talk to us to get approved" state (reuses the existing paid-warning
  affordance).
- **Inline publish requirements** (name · date · image · ≥1 ticket) surfaced as
  the form fills, reusing `apps/web/src/lib/validations/publishValidation.ts`
  rather than only gating at the publish toggle.
- **Hosted by [Org]** — already present in the form; confirm it reads the brand
  (from #429) and drops any free-text host path.
- Wire the existing form UI to the new services; **two-column desktop layout**
  (form left, flyer + customization rail right, Create/Save anchored right) if it
  fits without a redesign, else deferred to a follow-up (see Phasing).

**Explicitly out (each its own initiative):**

- **Venue-local times (ADR 0021 / #441).** The form is the natural home for a
  timezone control, but building it means: accept ADR 0021, add + backfill
  `Events.timeZone`, and rework _both_ input construction and the form's
  read-back (a matched pair — CLAUDE.md "Dates and times"). That is multi-PR and
  needs the ADR accepted first. Screen D keeps the **current** time handling
  (`combineDateTime` in the browser zone; display via the Eastern-hardcoded
  `getDateFormatter`) unchanged, so this PR neither fixes nor worsens #441. When
  the timezone initiative lands, it edits the form's time input/read-back as one
  change — Screen D deliberately does not fork that surface.
- Event-page **theming** + live preview, **waitlist**, **recurring series**,
  **guestlist/social proof**, **media richness** — all backlogged in the UX plan.
  Ship a clean flyer upload and a stubbed customization rail.
- **Duplicate / delete event** (Screen B mutations) and **ticket-type
  duplicate/delete** (#452) — separate write PRs.

## The write seam

Mirror the read services' shape: pure over an injected `prisma`, an explicit
`Actor`, ownership as the authorization boundary.

```
createEvent(prisma, actor, input): Promise<{ eventId }>
updateEvent(prisma, actor, eventId, input): Promise<void>   // NotFound if not owned
```

- **Authorization:** `resolveOrganizerScope(actor)` → the owner; `updateEvent`
  fetches `where { id, organizerUserId, deletedAt: null }` and throws `NotFound`
  otherwise (same pattern as the event-overview/orders reads). Writes never take
  a View-as target (ADR 0018).
- **Transaction:** event + ticket types in one `$transaction`, as today.
- **Org linkage:** `ensureOrganizationForUser` (exists) supplies `organizationId`
  and the denormalized `organizer` brand mirror.
- **The paid gate** is the load-bearing new rule. A helper —
  `assertPaidTicketingAllowed(org, ticketTypes)` — throws a typed
  `PaidTicketingNotEnabledError` when any input ticket has price > 0 and the org
  isn't approved. Called by `createEvent`, `updateEvent`, **and** the ticket-type
  writes (#452's seam), so the four write paths share one enforcement point
  rather than four copies (the mistake the read layer already made once with the
  ticket-type rollup).

## Contracts

New input DTOs in `contracts/organizer.ts` (or a new `contracts/events.ts` if the
organizer file is getting long): `createEventInputSchema`,
`updateEventInputSchema`, and a `ticketTypeInputSchema` reused by both. Money as
integer cents in, per the money convention; the service writes both `priceCents`
and the legacy float during the 2.12 cutover, as `createEvent` does today.

## Phasing

Two PRs, so the risky write-seam lands and is reviewable on its own before the
form is reshaped:

- **Phase 1 — the write service.** `createEvent`/`updateEvent` in `@troptix/api`
  with the paid gate and tests (fake-prisma for shape + a real-DB query-shape
  check, per the habit the reads established). Replace the placeholder
  `updateEvent`. Wire the **existing** form UI to the new services with minimal
  change. This alone closes the paid-gate hole and un-stubs edit.
- **Phase 2 — the form.** Two-column layout, Sell/RSVP toggle, inline publish
  requirements, stubbed customization rail. Pure presentation on top of Phase 1's
  services.

Splitting also means the paid-gate fix (a real correctness gap) isn't held behind
a UI redesign.

## Risks / open questions

- **`updateEvent` semantics for ticket types.** Editing an event with existing
  ticket types: does `updateEvent` diff (create/update/delete tiers), or is
  ticket-type editing strictly Screen E's job and `updateEvent` touches event
  fields only? _Lean:_ event fields only — Screen E owns tier writes — but this
  needs deciding, because the current form embeds tickets.
- **The matched-pair date read-back.** Even without venue-local, `updateEvent`'s
  form must read `startsAt`/`endsAt` out and write them back through the _same_
  zone assumption, or it shifts the event by the browser offset on save
  (CLAUDE.md). This is the one date-correctness item Phase 1 must get right.
- **Paid gate on downgrade/upgrade.** If an org loses approval, existing paid
  events still exist — the gate is on _new_ paid tickets, not a retroactive sweep.
  Confirm.
- **`generateId()` vs `@default(uuid())`.** The current write mints ids in app
  code; the read services rely on DB defaults. Harmonize or keep as-is.

## Definition of done (Phase 1)

- Event create + edit run through `@troptix/api` on the actor seam; the web
  actions are thin adapters.
- A paid ticket type cannot be created or updated for an unapproved org, proven
  by a test.
- `updateEvent` is real (no placeholder), and a round-trip edit doesn't shift the
  event's times.
- Typecheck clean; service tests green; query shapes verified against the real DB.
