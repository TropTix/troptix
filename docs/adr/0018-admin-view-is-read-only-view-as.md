# 18. The Admin View is read-only View-as, not an Organizer bypass

- **Status:** Proposed
- **Date:** 2026-07-03

## Context

TropTix has always had a cross-organizer "platform" view so the team can see what
organizers see (debugging/support). It was built as `/organizer/platform/**`: a
global god-list of every event with per-event stats, and — separately — a
platform-owner _bypass_ smeared through the ordinary organizer read paths
(`isPlatformOwner(email) ? {} : { organizerUserId }` in `getEvents`, `canAccessEvent`,
etc.). "Platform owner" is identified today by an `@usetroptix.com` email suffix.

Two problems drove a decision during the [organizer-dashboard migration](../plans/2026-07-organizer-dashboard-migration.md):

1. **The bypass entangles an admin concern into the organizer domain.** Every organizer
   service has to remember the escape hatch; forgetting it in a new service is how the
   `updateTicketType` authorization hole happened. Authorization is supposed to live in
   the service keyed on ownership ([ADR 0013](0013-authorization-in-the-service-layer.md)),
   not fork on an email suffix.
2. **The god-list doesn't match the stated purpose.** "See what organizers see" is a
   _scoped_ view of one organizer's dashboard; a global list of everything is a different
   product, and it carried the heaviest query in the surface (per-event stats reduced in
   JS).

Today a platform owner can also _edit_ any organizer's event, create ticket types, and
toggle publish — full read+write on everything, with no audit trail of who did it.

## Decision

**Platform Owner is an Admin capability, not an Organizer role, and the Admin View is a
thin index plus read-only "View-as."**

- The cross-organizer surface moves out of `/organizer` into its own **`/admin` route
  group** with its own layout and a single `requirePlatformOwner` guard. Organizer
  services drop the platform-owner bypass and authorize purely on ownership
  (`event.organizerUserId === actor.userId`).
- `/admin` is a **cheap global event index** (event, owner, status — no per-event stats;
  the god-list aggregation is deleted, not ported). Each row deep-links into the **real**
  Organizer Dashboard scoped to that owner via **View-as** (`?viewAs=<organizerUserId>`).
- **View-as is read-only.** Organizer _read_-services accept an optional
  `viewAsOrganizerUserId`, honored only when the actor is a Platform Owner; _write_-services
  never accept it. An admin can observe any organizer but cannot mutate on their behalf.
- **Exception — platform actions on an account are legitimate admin writes.** Granting
  `Organization.verified` (trust tick) and `Organization.paidTicketingEnabled` (paid
  approval, see [ADR 0019](0019-organizing-is-open-paid-ticketing-is-a-capability.md)) are
  performed from `/admin`. The rule is: admins do not edit an organizer's _content_, but
  they do act on the _account_.
- The `@usetroptix.com` email check survives in exactly two places — the `/admin` layout
  guard and the read-service View-as gate — tagged as a stopgap until a real admin
  role/grant lands (the [ADR 0013](0013-authorization-in-the-service-layer.md) successor
  role matrix).

## Consequences

- **Good:** organizer services have one authorization rule (ownership), removing the bypass
  that caused a real IDOR class; the heaviest query is deleted rather than maintained; "see
  what organizers see" becomes literally the organizer UI, not a parallel surface; admin
  power is explicit and narrow.
- **Trade-off / behavior change:** platform owners lose silent edit-on-behalf-of any event.
  "Admin edit" with an audit trail is deferred to the role-matrix successor ADR. Until then,
  fixing an organizer's event is a manual, out-of-band action.
- **Trade-off:** View-as threads a `viewAsOrganizerUserId` through read-services and makes
  the organizer routes read a `?viewAs` param — a small, contained coupling.
- **Depends on / relates to:** [ADR 0013](0013-authorization-in-the-service-layer.md),
  [ADR 0019](0019-organizing-is-open-paid-ticketing-is-a-capability.md), the
  [organizer-dashboard migration plan](../plans/2026-07-organizer-dashboard-migration.md).
