# 35. Membership roles grant capabilities; the Owner is a Membership

- **Status:** Accepted
- **Date:** 2026-09-28

## Context

Every organizer check keyed on one person: `Events.organizerUserId` for events and `Organization.ownerUserId` for the Organization. The product now wants three levels of access to an Organization's events:

- **Owner**, set when a person creates their first event.
- **Admin**, who runs events but does not touch money or members.
- **Scanner**, who checks guests in and out and scans tickets in the mobile app, and nothing else.

More will follow. Stripe payouts are the first: requesting one must stay with the Owner. Inline "is this the owner" checks would have to be found and changed each time a role gains or loses something.

The teams plan (PR #587, ADR 0031 there) already proposes the Owner as an `OWNER` Membership row. This ADR takes that step and adds the capability layer on top of it.

## Decision

1. **`MembershipRole` is `OWNER | ADMIN | SCANNER`.** The Owner is a Membership row. One `OWNER` row per Organization and one per user, each a partial unique index. `Organization.ownerUserId` is dropped; the migration writes an `OWNER` row for every Organization first.
2. **Code asks for a capability, never a role.** `packages/api/src/services/_shared/access.ts` holds one map from role to capabilities (`event.edit`, `event.checkIn`, `event.orders`, `organization.payouts`, …). A new feature adds a capability there and grants it to roles.
3. **Access resolves through the event's Organization.** `eventsWhereCan(userId, capability)` is the Prisma filter for "events this person may do this on", and `requireEventCapability` guards one event. Both read the Membership on the event's Organization. `Events.organizerUserId` stays as a record of who created the event and is never an access key.
4. **The map lives in code, not a table.** Changing what a role may do is a code change with review and tests. Per-Organization custom roles are not a need anyone has.
5. **The Scanner gets the door slice.** The mobile API lists events a Scanner may check in at and returns guest name, ticket type and check-in state, without email. The web dashboard asks for `event.orders`, which a Scanner lacks, so it shows them nothing.

## Consequences

- Payouts, Stripe onboarding and payout terms ask for `organization.payouts`, held only by the Owner today. Letting Admins request payouts later is one line in the map.
- The paid-ticketing gate and the event's display name read the event's own Organization, so an Admin's edit never moves an event to another Organization.
- Until the acting-Organization switcher (teams plan Phase 2) lands, the dashboard lists every event a person may see across their Organizations, and Organization-level pages (profile, payouts) still mean the Organization the person owns.
- No one can yet grant Admin or Scanner from the product. Grants are rows written by hand or by the seed until the invite flow (teams plan Phase 3) ships.
- The Scanner's name is a placeholder until product settles it; renaming is one enum value and a word in the glossary.
