# 24. Org-level Membership; the Organization owns every event

- **Status:** Accepted
- **Date:** 2026-07-27

## Context

Teams are the first feature that lets more than one person act on an organizer's events. Three prior facts shaped the decision:

- The original schema had per-event delegation (`DelegatedUsers`, roles `OWNER | TICKET_SCANNER`). It was never used and was dropped as dead code (migration `20260609152804`).
- The spotlight plan built `Organization` as the deliberate home for teams and deferred a `Membership[]` join to this initiative.
- Every organizer query keys on `Events.organizerUserId`, dual-written to equal `Organization.ownerUserId`. `resolveOrganizerScope` (ADR 0013) resolves each organizer read to exactly one organizer id.

Teams force four interlocking choices: what a grant scopes to, how the dashboard knows which organization a person is acting in, who owns an event a member creates, and how the owner is modeled.

A survey of the field backs the org-level shape: Eventbrite, Ticket Tailor and Luma all seat permanent staff at the account or calendar level, and Eventbrite's Owner/Admin pair matches the roles below almost word for word.

## Decision

1. **Grants are org-level.** A `Membership` ties a User to an Organization with a role. The role applies to every event the Organization owns. There are no per-event grants; `DelegatedUsers` does not come back.
2. **The organizer scope is an explicit acting organization.** `resolveOrganizerScope` today returns the actor's own user id, which assumes a person maps to one organizer. A person may own one Organization and hold Memberships in others, so the scope resolves from a chosen Organization — defaulted when there is only one, and only then offered as a choice. The scope must never be guessed from the actor alone.
3. **The Organization owns every event, no matter who creates it.** A member's event write records `organizerUserId = organization.ownerUserId`, keeping today's invariant and every existing query. `organizerUserId` is now a derived legacy key; the true owner is the Organization. Who created or scanned what is attribution, never ownership.
4. **The Owner is the `ownerUserId` scalar, never a Membership row.** Membership rows hold only the other roles (Admin now; Scanner reserved). One source of truth per question: the scalar answers "who owns it", the join table answers "who else is in".

Members act as themselves: the actor is the member's own user id, checked against their Membership at the service seam. Nobody impersonates the Owner. View-as ([ADR 0018](0018-admin-view-is-read-only-view-as.md)) stays a separate, read-only, platform-only concept.

## Consequences

- Org-level grants fit the shape of the reads: membership → organization → `ownerUserId` → the organizer id every query already keys on. No per-event filter threads through the service layer.
- The trade-off accepted: a grant covers all the org's events. "Scan only this one show" needs a per-event grant we chose not to build. Most of the market ships a per-event door credential — a code or PIN carrying scan rights and nothing else — and we turned that down: door access here is a role held by a person, not a secret that gets passed around.
- **The seam is narrower than the design assumed, and this is the main cost.** Only four of eleven organizer write paths resolve through `resolveOrganizerScope`; the rest authorize through `accessControl.ts` helpers, the frozen legacy service, or inline checks. Membership has to reach all of them. Postgres is no backstop: row-level security is enabled on twelve tables with no policies at all, and the app connects as a role that bypasses it, so every guarantee is application code. A missed call site leaks data rather than returning nothing.
- Two invariants the design leans on are unenforced today and must be made real first: `Organization.ownerUserId` has no unique index (and a dashboard page provisions an Organization on render, so a member browsing to it acquires one of their own), and `Events.organizationId` is nullable, backfilled by a hand-run script, and set to null when an Organization is deleted.
- Matching an Invite to a person has to be case-insensitive on email, and a person who changes their email with the auth provider will no longer match — the app's copy of the address is written once at signup and never synced.
- Platform-owner status is inferred from an email suffix. Once outsiders can be invited, that inference has to be replaced with an explicit grant.
- The eventual flip of the query key from `organizerUserId` to `organizationId` becomes a mechanical migration, not a semantic one — the semantics moved here.
- Removing a member never moves or removes events.
- Exactly one Owner per Organization; the Owner cannot leave or be demoted; ownership transfer does not exist yet. When it lands it is an atomic swap of the scalar.
- A rogue-admin ceiling exists by construction: members and money (Membership management, payout/Stripe, paid-ticketing approval) stay with the Owner. The boundary itself is product policy and lives in the glossary, not here.
