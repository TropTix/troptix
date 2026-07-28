---
title: Team membership — Owner and Admin
status: active
created: 2026-07-27
tracking-issue: TBD
---

## What this is

Let an organizer invite someone to help run their events. One new role in v1: **Admin**, granted at the Organization, covering everything the Owner can do except managing members and money. Terms are in [CONTEXT.md](../../CONTEXT.md); the structural decisions are [ADR 0022](../adr/0022-org-level-membership-org-owns-events.md).

Not in v1: the Scanner role (waits for the organizer mobile-app rebuild), ownership transfer, per-event grants, a general audit trail.

## Decisions this rests on

| Question                            | Answer                                                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| What does a grant scope to?         | The Organization. Never a single event.                                                                                                 |
| What can an Admin not do?           | Manage members; touch payouts, Stripe, or paid-ticketing approval. Everything else, including refunds and the brand profile, is theirs. |
| Who owns an event an Admin creates? | The Organization. Removing a member never moves events.                                                                                 |
| Is the Owner a membership row?      | No — the `ownerUserId` scalar stays the one answer to "who owns this".                                                                  |
| How does an invite bind?            | To an email address. Only someone signed in as that address can accept. Expires after seven days, the industry norm.                    |
| Who checked a ticket in?            | Recorded from now on. Members always act as themselves.                                                                                 |

## Phase 0 — make the invariants real

None of this is optional, and all of it is cheap next to fixing it afterwards. The design assumes things the database does not currently guarantee.

- **One Organization per owner.** Add the unique index on `Organization.ownerUserId`, and stop [organizer/profile/page.tsx](../../apps/web/src/app/organizer/profile/page.tsx) provisioning an Organization when someone merely opens it. Today an Admin who clicks Profile silently gets an Organization of their own.
- **Every event belongs to an Organization.** Make `Events.organizationId` non-null and stop the foreign key nulling it when an Organization is deleted. Confirmed against production and the dev branch on 2026-07-28: zero null rows, zero duplicates, zero violations — the in-migration backfill is replay-safety, not data repair ([audit](../audits/2026-07-28-teams-phase0-data-audit.md)).
- **One way to authorize.** Eleven organizer write paths authorize five different ways, across `resolveOrganizerScope`, the `accessControl.ts` helpers, the frozen legacy service, and inline checks. Bring them onto one seam before teaching any of them about membership. Row-level security is not a safety net here — it is on for twelve tables with no policies, and the app bypasses it.
- **Name the platform staff explicitly.** Platform-owner status is read off an email suffix. Replace it with a real grant before anyone outside the company can be invited.

## Phase 1 — Membership and the acting organization

- `Membership`: organization, user, role, timestamps. Unique on the pair. Only `ADMIN` is written in v1; `SCANNER` is reserved.
- The organizer scope stops meaning "the actor" and starts meaning "the acting Organization" — defaulted when a person has only one, remembered across requests, and offered as a choice only to the handful of people who own one Organization and belong to others.
- Reads and writes resolve through that scope. An Admin sees exactly what the Owner sees.
- The two owner-only areas refuse Admins: member management, and payouts / Stripe / paid-ticketing approval.
- Record who checked each ticket in, at all four paths that currently write `checkinTimestamp`.

## Phase 2 — Invites

- `Invite`: organization, email, role, token, expiry, state, who sent it. Match the email case-insensitively — the stored address is lowercased at signup but older rows are not, and the unique index is case-sensitive.
- The Owner invites by email and role, sees pending invites, and can revoke.
- Delivery is a direct Resend call from the invite action, alongside the order-confirmation mail. The outbox table exists but nothing produces or consumes it; wiring it is a separate job.
- Accepting requires being signed in as the invited address. A stranger's path is the ordinary passwordless one: the link lands on sign-in, the magic link verifies the address, the signup trigger creates their user row, and the accept button appears. Nobody sets a password.
- Only the Owner may invite, so nobody can grant a role above their own. The pending-invite list is visible to the Owner alone.

## Open

- Whether the Scanner role or the mobile rebuild comes first.
- What happens to a person's Membership when their auth email changes — the app's copy is written once at signup and never updated, so the match silently breaks.
