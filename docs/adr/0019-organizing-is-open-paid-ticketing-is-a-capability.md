# 19. Organizing is open; paid ticketing is an Organization capability, not a role

- **Status:** Proposed
- **Date:** 2026-07-03

## Context

The `Role` enum (`PATRON` / `ORGANIZER` / `PROMOTER`) barely functions as designed.
Its one load-bearing use is a gate: `toggle-publish/route.ts` computes
`paidEventsEnabled = userRole?.role === 'ORGANIZER'`, and `api/user/me` exposes
`isOrganizer = role === 'ORGANIZER'`. So in practice **"being an ORGANIZER" means "is
allowed to run paid events"** — access to the organizer surface and permission to charge
money are fused into one coarse role.

That fusion blocks the product direction: we want **anyone to be able to organize** (create
events, run RSVP/free events) with no gatekeeping, while **paid ticketing** stays gated —
organizers must talk to us first (a business/payout conversation) before they can charge
cards. A role can't express "open to all, except taking money."

Two adjacent facts:

- `Organization` is the canonical organizer entity ([Organization + Spotlight](../plans/2026-06-event-spotlight-and-organizer-brand.md))
  and is where per-org Stripe/payouts are headed. Paid-selling is fundamentally a payout
  concern.
- `Organization.verified` already exists, but it means an **attendee-facing trust tick**
  ("established brand"), which is a _different_ concept from "approved to take money" and
  must not be conflated.

## Decision

**Decouple organizing from paid-ticketing. Organizing is open to everyone; paid ticketing is
a capability flag on the Organization, granted by TropTix.**

- **No role gate on the organizer surface.** Access to the Organizer Dashboard is
  ownership-only (`event.organizerUserId === actor.userId`); "Organizer" is anyone who owns
  events, not a granted role.
- **`Organization.paidTicketingEnabled`** (boolean, default `false`) permits selling **Paid**
  tickets (`price > 0`). RSVP (`price = 0`) tickets are always allowed. The gate is enforced
  in the **ticket-type write service** when `price > 0` — application-level per
  [ADR 0013](0013-authorization-in-the-service-layer.md), **not** a database constraint, and
  **not** an `Event`-level flag (RSVP-vs-paid is derived from the ticket types; the
  create-form toggle is UI visibility only).
- **`paidTicketingEnabled` is orthogonal to `verified`.** `verified` stays the attendee trust
  tick (earnable through a track record of free events); `paidTicketingEnabled` is the
  payout/business approval. A brand can have either, both, or neither.
- **Granting is an admin action** performed in `/admin`
  ([ADR 0018](0018-admin-view-is-read-only-view-as.md)); the organizer requests it through a
  single "talk to us" onboarding card (the general task/checklist engine is deferred).
- **The `Role` enum's fate** (retire entirely vs keep vestigial/non-gating) is settled in the
  [organizer onboarding & paid-ticketing approval plan](../plans/2026-07-organizer-onboarding-paid-approval.md);
  this ADR commits only to _removing role as the gate_ and _making the capability the gate_.

## Consequences

- **Good:** the signup funnel opens (anyone organizes immediately); paid ticketing is gated
  where it belongs (per-Organization, next to future Stripe); the trust-tick vs
  approved-to-sell concepts are disentangled before one gets used for the other; the gate is
  one check in one service instead of a role smeared across routes.
- **Trade-off:** a capability flag with no self-serve path means paid approval is manual (an
  admin flips it) until a richer onboarding/Stripe-Connect flow exists — acceptable while the
  "talk to us first" policy is intentional.
- **Trade-off:** `paidTicketingEnabled` defaults off, so existing organizers must be
  backfilled to `true` at rollout or they lose the ability to create paid tickets they have
  today. This backfill is a required step of the onboarding plan, not optional.
- **Depends on / relates to:** [ADR 0013](0013-authorization-in-the-service-layer.md),
  [ADR 0018](0018-admin-view-is-read-only-view-as.md), the
  [Organization + Spotlight plan](../plans/2026-06-event-spotlight-and-organizer-brand.md),
  and the [onboarding & paid-approval plan](../plans/2026-07-organizer-onboarding-paid-approval.md).
