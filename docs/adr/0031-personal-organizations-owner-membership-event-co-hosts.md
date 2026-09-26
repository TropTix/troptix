# 31. Personal organizations, Owner as a Membership, event co-hosts

- **Status:** Proposed
- **Date:** 2026-09-23
- **Supersedes:** [ADR 0024](0024-org-level-membership-org-owns-events.md) in part. Decisions 2 and 3 of that ADR stand: the organizer scope is an explicit acting organization, and the Organization owns every event.

## Context

ADR 0024 shaped teams around three assumptions: a person owns at most one Organization, the Owner is a scalar on the Organization rather than a Membership row, and access is granted only at the Organization. Membership v1 landed the table (#505) but nothing reads it yet, so changing the model now costs one migration and no product behaviour.

The product wants something closer to how Luma seats people:

- Everyone who enters the organizer area has somewhere to put an event straight away, with no setup step.
- One person can run several brands under one login.
- An event can name co-hosts, and a co-host is either a name on the page or a person who helps run that one event.

The first two break the one-Organization-per-owner index. The third is the per-event grant ADR 0024 turned down. Reopening it is deliberate: the request is not "let a scanner see one show" but "let a co-host run one show", and that is a product concept in its own right rather than a narrower staff role.

Signup today collects only an email. A personal Organization needs a name to be called something, and invites and co-host listings need a name to show.

## Decision

1. **Signup collects first name, last name, email, and an optional phone.** OAuth signups take the name from the provider. Anyone entering the organizer area without a first name completes their profile first; that one gate covers older accounts too.

2. **Every organizer has a personal Organization.** On first entry to the organizer area a person with no Membership gets an Organization called "`<First name>`'s Events". It is an ordinary Organization with no flag marking it personal: renamable, and the same shape as any other. A person may create more Organizations and may own several.

3. **The Owner is a Membership row.** `MembershipRole` gains `OWNER`. Exactly one `OWNER` row per Organization, enforced by a partial unique index. `Organization.ownerUserId` is dropped. "Which Organizations am I in" is one query over Memberships; ownership transfer is a swap of two rows in one transaction.

4. **The query key is `Events.organizationId`.** With one person owning several Organizations, `organizerUserId` can no longer say which brand an event belongs to. The organizer scope resolves to an Organization id, every organizer read and write filters on it, and `Events.organizerUserId` is dropped once the last path moves.

5. **An event has co-hosts.** An `EventHost` row names a co-host on one event with a display name, a visibility flag, and an access level: **name only** or **manage**. Name-only co-hosts are a listing, need no account, and are added by an Owner or Admin. A managing co-host is a person, holds an email-bound Invite until accepted, and once accepted can do on that event what an Admin can, except delete it or manage its co-hosts. They see nothing else of the Organization.

6. **Invites bind to an email and target either an Organization or an EventHost.** One `Invite` table; the target decides what accept creates: an `ADMIN` Membership, or the `userId` on the EventHost row. Only Owners invite Admins. Owners and Admins invite co-hosts.

7. **Authorization has two seams and nothing else.** `resolveOrganizerScope` answers "which Organization is this person acting in", checked against Membership. `resolveEventAccess` answers "may this person act on this event", true through Membership on the owning Organization or through a managing EventHost row. Every inline ownership check in the web app and the frozen mobile service moves onto one of the two.

## Consequences

- The acting-organization switcher becomes a normal part of the organizer header for anyone in more than one Organization, rather than a corner case hidden from most people. Someone invited as Admin still gets a personal Organization; the invite link lands them in the inviting Organization.
- Two grant shapes now exist, but they answer different questions and never overlap: Membership scopes a person to a brand, EventHost scopes a person to one show. A dashboard event list is the acting Organization's events plus a "co-hosting" section, which does not change with the acting Organization.
- The paid-ticketing gate keys on the owning Organization, so a co-host's own capability never matters.
- Removing a Membership or an EventHost row never moves or removes events. Deleting an Organization is still not offered.
- Name-only co-hosts cannot yet link to another Organization's public page; a free-text link covers that until someone asks.
- Scanner stays deferred to the mobile rebuild, unchanged from ADR 0024.
- Phone is collected but nothing reads it yet. It exists so the next feature that needs it (door contact, SMS) does not have to backfill.
- The migration inserts an `OWNER` row for every existing Organization from `ownerUserId` before dropping the column, and backfills nothing else; every event already has an `organizationId`.
