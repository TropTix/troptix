---
title: Organizer Onboarding & Paid-Ticketing Approval
status: proposed
created: 2026-07-03
tracking-issue: TBD
---

# Organizer Onboarding & Paid-Ticketing Approval

Open organizing to everyone and replace the `ORGANIZER` role gate with a per-Organization
paid-ticketing capability that TropTix grants after a conversation. Realizes
[ADR 0019](../adr/0019-organizing-is-open-paid-ticketing-is-a-capability.md); the admin approval
surface it needs is [ADR 0018](../adr/0018-admin-view-is-read-only-view-as.md). Sibling to the
[organizer-dashboard migration](2026-07-organizer-dashboard-migration.md), which is already shaped
to honor `paidTicketingEnabled` (its decision 10) instead of the role.

## Why

Today `role === ORGANIZER` fuses two unrelated things: access to the organizer surface **and**
permission to sell paid tickets (`toggle-publish/route.ts:36`). We want anyone to organize and run
**RSVP** (free) events with zero gatekeeping, while **paid** ticketing stays gated behind a
business/payout approval ("talk to us first"). A single coarse role can't express "open to all,
except taking money."

## Goals

1. **Anyone can organize.** Remove the role as an access gate (the dashboard migration already
   authorizes on ownership). Resolve the `Role` enum's fate here.
2. **Paid ticketing = a capability.** `Organization.paidTicketingEnabled` (default off) gates
   creating a ticket type with `price > 0`, enforced in the ticket-type write service. RSVP
   tickets always allowed. `verified` (trust tick) stays separate and orthogonal.
3. **A single onboarding flow.** The organizer dashboard shows one "Getting started" card —
   "Talk to us to sell paid tickets" — that files a request. No general task engine.
4. **Admin approval.** A Platform Owner reviews requests and flips `paidTicketingEnabled` from
   `/admin` (a platform action, distinct from read-only View-as — ADR 0018).

## Non-goals

- **General task/checklist engine** — deferred until there is a real second onboarding task
  (e.g. Stripe Connect). The MVP is one card backed by one boolean.
- **Self-serve / automated approval** — approval is a manual admin flip while "talk to us first"
  is the intentional policy. No Stripe Connect onboarding here.
- **Per-org Stripe accounts, teams/membership** — carried by the teams/tenancy initiative
  (deferred in the [Organization + Spotlight plan](2026-06-event-spotlight-and-organizer-brand.md)).
- **The `Event`-level RSVP/paid flag** — explicitly rejected; RSVP-vs-paid is derived from ticket
  prices, the form toggle is visibility only (dashboard-migration decision 10).

## Decisions

1. **Capability on the Organization, not the User.** `paidTicketingEnabled` lives on
   `Organization` (where `verified` already is and where per-org Stripe is headed). v1 is
   one-org-per-user, so it is effectively per-user today but won't need re-modeling when teams land.
2. **Gate in the write service, not the DB.** The ticket-type create/update service rejects
   `price > 0` unless the owning org has `paidTicketingEnabled`. No DB constraint, no `Event` flag.
3. **Request state is lightweight.** Model the request as a nullable timestamp / status on the
   Organization (e.g. `paidTicketingRequestedAt`), not a new table — enough to build the admin
   queue and the dashboard card. Revisit if the flow grows steps.
4. **Existing organizers are backfilled `paidTicketingEnabled = true`.** They can sell paid
   tickets today; the flag defaults off, so rollout **must** grant it to every org that already has
   a paid ticket type (or every existing org) or it is a regression. This backfill is a required,
   ordered step — see Phase 1.
5. **`Role` enum fate (open question to resolve during design):** retire the enum entirely vs keep
   it non-gating/vestigial. Leaning retire-the-gate now, drop the enum in a later cleanup once no
   code reads it. Confirm before touching the provisioning trigger (ADR 0015) that sets
   `role = PATRON`.

## Phases

1. **Schema + backfill.** Add `Organization.paidTicketingEnabled Boolean @default(false)` and
   `paidTicketingRequestedAt DateTime?` (additive migration via `yarn --cwd apps/web db:new`).
   **Backfill `paidTicketingEnabled = true` for existing organizations that already have paid
   ticket types** (decision 4) in the same migration/runbook. Behavior-neutral until the gate lands.
2. **Move the gate off the role.** Rewire `toggle-publish` and the ticket-type write service to
   read `organization.paidTicketingEnabled` instead of `role === 'ORGANIZER'`; enforce
   `price > 0 ⇒ paidTicketingEnabled` in the write service. Remove `isOrganizer`/role reads that
   only served the gate.
3. **Dashboard onboarding card.** A "Getting started" card on the organizer dashboard, shown when
   `!paidTicketingEnabled`: "Talk to us to sell paid tickets" → files the request (sets
   `paidTicketingRequestedAt`, notifies TropTix). Hidden once enabled. The create-form price field
   is hidden/disabled (RSVP-only visibility) when not enabled.
4. **Admin approval queue.** In `/admin` (ADR 0018), a "pending paid-ticketing requests" list
   (orgs with `paidTicketingRequestedAt` set, not yet enabled) + an "Approve for paid ticketing"
   action that flips the flag. Reuse the same surface for granting `verified`.
5. **Retire the role gate / enum cleanup** (decision 5) — once nothing reads `role` as a gate.

## Verification

- Per phase: root `yarn typecheck`, `yarn --cwd apps/web test`, `yarn --cwd packages/api test`,
  lint, `build`.
- Backfill parity (Phase 1): every org with an existing paid ticket type has
  `paidTicketingEnabled = true` before Phase 2 flips the gate — else those organizers regress.
- Gate tests: unapproved org creating a `price > 0` ticket type is rejected; RSVP allowed;
  approved org allowed. Admin approve action flips the flag and is Platform-Owner-only.

## Risks

- **Regression on rollout** if the backfill misses orgs with live paid tickets → they can't edit
  their own paid tickets. Mitigated by Phase 1's parity check gating Phase 2.
- **`verified` / `paidTicketingEnabled` conflation** if a future reader treats them as one — the
  ADR and CONTEXT.md keep them explicitly separate.
- **Coupling with the dashboard migration**: this plan's Phase 2 write-service gate lands cleanest
  after that migration's Phase 3 (write services) exists — coordinate order on the umbrella issue.
