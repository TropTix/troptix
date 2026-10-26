---
title: Teams and co-hosts — personal organizations, Admins, event co-hosts
status: proposed
created: 2026-09-23
tracking-issue: TBD
---

## What this is

Give every organizer a home Organization on day one, let one person run several, let an Owner bring Admins into an Organization, and let an event name co-hosts who are either a name on the page or a person who helps run that one event. Terms are in [CONTEXT.md](../../CONTEXT.md); the structural decisions are [ADR 0031](../adr/0031-personal-organizations-owner-membership-event-co-hosts.md).

Supersedes [2026-07-team-membership.md](2026-07-team-membership.md). Its Phase 0 (invariants, one platform-owner grant, ownership-scoped reads) and the `Membership` table (#505) carry over unchanged. Umbrella issue #481 retires when this plan's umbrella opens.

Not in scope: the Scanner role (mobile rebuild), deleting an Organization, co-hosts that link to another Organization's page, an audit trail.

## Decisions this rests on

| Question                                  | Answer                                                                                                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What does signup collect?                 | First name, last name, email; phone optional. OAuth fills the name from the provider.                                                                      |
| When does a person get an Organization?   | On first entry to the organizer area, if they belong to none. Named "`<First name>`'s Events". Nothing marks it personal.                                  |
| Can one person own several Organizations? | Yes. The Owner is an `OWNER` Membership row; one per Organization.                                                                                         |
| What can an Admin not do?                 | Manage members, or touch payouts, Stripe, or paid-ticketing approval. Everything else, including co-hosts, is theirs.                                      |
| What is a co-host?                        | An `EventHost` row on one event: display name, visible or hidden, access `NAME_ONLY` or `MANAGE`.                                                          |
| What can a managing co-host do?           | On that event, what an Admin can: edit, ticket types, publish, orders, refunds, attendees, check-in. Not delete it, not manage its co-hosts, nothing else. |
| How does an invite bind?                  | To an email address, for an Organization (Admin) or an EventHost (manage). Only the invited address can accept. Expires after seven days.                  |
| Who invites?                              | Owners invite Admins. Owners and Admins add and invite co-hosts.                                                                                           |
| Where do co-hosted events show?           | In a "Co-hosting" section of the events list, whatever the acting Organization.                                                                            |
| What is the query key?                    | `Events.organizationId`. `organizerUserId` is dropped at the end of Phase 2.                                                                               |

## Phase 1 — signup collects a name

Independent of everything below and shippable first.

- The email signup form asks for first name, last name, and an optional phone, and passes them as user metadata on the OTP call. The provisioning trigger copies them onto the new `Users` row. OAuth signups take `given_name` and `family_name` from the provider claims.
- A profile-completion page gates the organizer area: anyone arriving without a first name fills one in once. This is the only path for accounts that predate the change.
- Phone is stored on the existing `Users.telephoneNumber` and read by nothing yet.

## Phase 2 — Owner as a Membership, personal Organizations, the Organization as the key

The largest phase. Split into PRs in this order, each green on its own.

1. **Migration.** Add `OWNER` to `MembershipRole`. Insert one `OWNER` row per Organization from `ownerUserId`. Add a partial unique index on `(organizationId) WHERE role = 'OWNER'`. Drop the unique index on `ownerUserId`, then the column. Update `supabase/seed.sql`. Every service that read `ownerUserId` (organizations, organizer payouts, platform payouts, event write, ticket-type write) reads the `OWNER` Membership instead.
2. **Scope.** `resolveOrganizerScope` returns an Organization id. It takes the requested Organization from a cookie set by the switcher, defaults to the person's first Membership by creation date, and refuses any Organization the actor has no Membership in. View-as keeps working: a Platform Owner may name any Organization. The organizer services filter on `organizationId`; their tests move with them.
3. **Personal Organization.** The organizer layout mints "`<First name>`'s Events" with an `OWNER` Membership for anyone with no Membership, and never otherwise. `ensureOrganizationForUser` and its lazy-create branches in the event and profile writes go away: a write always has an acting Organization.
4. **More Organizations.** A "New organization" action in the switcher creates one with the caller as `OWNER`. The switcher lists every Organization the person belongs to, with their role.
5. **Inline paths onto the seam.** The event layout, edit page, attendees page, tickets page, toggle-publish route, the two REST routes the legacy Expo app calls, and the public event page's organizer check all resolve through the scope or through `resolveEventAccess` (introduced here as Membership-only; co-hosts join in Phase 4). The frozen mobile service does the same.
6. **Owner-only areas.** Members, payouts, Stripe, and paid-ticketing approval refuse Admins at the service.
7. **Drop `Events.organizerUserId`.** Migration plus the `@@index`. Nothing reads it after PR 5.

## Phase 3 — Admin invites

- `Invite`: `organizationId`, `eventHostId` (null for an Admin invite), `email`, `tokenHash`, `expiresAt`, `acceptedAt`, `revokedAt`, `invitedByUserId`. Match email case-insensitively by comparing lowercased values on both sides; never Prisma's `mode: 'insensitive'` (#519). Refuse an address that already holds a Membership.
- The Owner invites by email, sees pending invites, and can revoke. Delivery is a direct Resend send from the invite action.
- Accepting needs a session for the invited address. A stranger's path is the ordinary passwordless one; the callback returns them to the accept page. Accept creates the `ADMIN` Membership and sets the acting-Organization cookie to the inviting Organization, so they land in the team, not in their personal Organization.
- Members page: list, change role between Admin and Owner (ownership transfer is the two-row swap in one transaction), remove.

## Phase 4 — Co-hosts

1. **Listing.** `EventHost`: `eventId`, `displayName`, `imageUrl`, `link`, `visible`, `access` (`NAME_ONLY` | `MANAGE`), `userId` (null until a manage invite is accepted), `order`. Owners and Admins add, edit, reorder, hide, and remove co-hosts from the event's settings. The public event page shows the owning Organization first, then visible co-hosts. Hidden co-hosts appear only in the dashboard.
2. **Managing co-hosts.** Adding a co-host with manage access asks for an email and creates an `Invite` pointing at the row. Accept sets `userId`. `resolveEventAccess` grants access through a `MANAGE` row with a matching `userId`. The events list gains a "Co-hosting" section. A managing co-host's event pages hide the Organization navigation and refuse delete and co-host management at the service.
3. **Check-in attribution.** All check-in writes record the acting user, now that more than one person can act on an event.

## Open

- Whether the acting Organization also persists per device in the mobile app, or the mobile app always uses the first Membership until it gains a switcher.
- What happens to a Membership or EventHost when the person's auth email changes; the app's copy of the address is written once at signup.
