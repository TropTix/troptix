---
title: Payout onboarding — from free events to payable
status: proposed
created: 2026-09-22
tracking-issue: TBD
---

# Payout onboarding — from free events to payable

Give an organizer one visible path from "I run free events" to "TropTix can
pay me", with every step in the app, every transition recorded, and no dead
ends. Today that path is three disconnected pieces: a dashboard banner that
links to a mailto and a Google Calendar booking page, a `paidTicketingEnabled`
flag a Platform Owner flips by hand in the database, and two payout-setup
timestamps ticked on the platform payouts panel. Nothing records that an
organizer asked, nobody accepts payout terms, and no email goes out at any
step.

This plan sits between two others. It realizes phases 3 and 4 of
[2026-07-organizer-onboarding-paid-approval](2026-07-organizer-onboarding-paid-approval.md)
(the in-app request and the admin approval queue, never built) and it wraps
the bank step that
[2026-09-stripe-connect-us-payout-rail](2026-09-stripe-connect-us-payout-rail.md)
builds. It does not touch the ledger, the request lifecycle, or the rails.

## Why now

- Connect makes the bank step self-serve. A self-serve step inside a flow
  that otherwise runs on email and database edits is the worst of both: the
  organizer expects the rest to be as smooth, and it is not.
- Counsel cleared the agent-of-the-payee position on 2026-09-22. That position
  rests on the organizer appointing TropTix, in writing, to collect ticket
  payments on their behalf. Nothing in the product records that today. The
  terms step below is the contract half of that legal answer.
- The 2026-07 plan deferred a general checklist "until there is a real second
  onboarding task". Stripe onboarding is that task. Four steps with three
  different owners (organizer, TropTix, Stripe) is where a hand-run process
  starts dropping people.

## The journey

Four steps. Every organizer sees the same four in the same order; each step
has one owner and one way to complete it.

| # | Step                     | Owner          | Done when                                                                                      | Recorded as                                                    |
| - | ------------------------ | -------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1 | Ask to sell paid tickets | Organizer      | The organizer clicks "Request paid ticketing" and books the call                               | `paidTicketingRequestedAt` (column exists, nothing sets it)    |
| 2 | Talk to TropTix          | Platform Owner | The call happens and a Platform Owner approves in Platform View                                | `paidTicketingEnabled` + `payoutMeetingAt`, set by one action  |
| 3 | Accept payout terms      | Organizer      | The owner reads the terms in the app and accepts                                               | `payoutTermsAcceptedAt` + `payoutTermsVersion` (new)           |
| 4 | Connect a payout destination | Organizer, Stripe verifies | Stripe activates the account (US, Connect; later Jamaica, Global Payouts) or, during the transition, TropTix enters a Mercury recipient | `payoutBankLinkedAt` (exists), `stripeAccountId` (Connect plan) |

**Ready** is all four recorded. `requestPayout` gains one more gate (step 3);
everything else it checks today stays.

Steps 3 and 4 are independent of each other and of step 2: an organizer can
accept terms and connect Stripe the day they sign up. Step 1 exists so
TropTix hears about the organizer, and step 2 stays a human gate because the
paid-ticketing approval is one (ADR 0019). The order in the UI is the natural
order, not an enforced one.

## Decisions

1. **One checklist, one source.** A single read service, `getPayoutSetup`,
   returns the four steps with a status each (`done`, `in_progress`,
   `blocked`, `todo`), the next action for the organizer, and the timestamps.
   The dashboard card, the payouts page, and the platform onboarding queue all
   render from it. Nothing computes "is setup complete" anywhere else; the
   Connect plan's `PayoutSetupState` folds into this.
2. **Step 1 is a real request, in the app.** The dashboard banner's mailto and
   calendar links become one card: "Request paid ticketing" sets
   `paidTicketingRequestedAt`, shows the booking link, and emails TropTix and
   the organizer. A second click is a no-op with "Requested on <date>". The
   column has existed since 2026-07 with nothing writing it; this is the
   write.
3. **Step 2 is one approval action.** "Approve for paid ticketing" in Platform
   View sets `paidTicketingEnabled = true` and `payoutMeetingAt` together,
   because the glossary already says one meeting covers both and the current
   two-place process is how they drift apart. The existing meeting switch on
   the payouts panel stays for corrections. Approval emails the organizer with
   the next two steps as links.
4. **Step 3 is versioned acceptance, owner-only.** The terms live as a
   markdown document in the repo (`docs/legal/payout-terms.md`, rendered by
   the app), with a version string in front matter. Acceptance records the
   version and the time on the Organization. Bumping the version turns the
   step back to `todo` for everyone and blocks new requests until re-accepted;
   open and paid requests are untouched. Only the Owner can accept, because
   money is owner-only. The terms text itself is counsel's; the product
   records assent, nothing more.
5. **Step 4 is the Connect plan's bank step, unchanged**, including its five
   derived states and the "Jamaica or elsewhere" transition branch. This plan
   adds the surrounding steps and the reminders; it does not redesign the
   step.
6. **A Platform View onboarding queue replaces database edits.** One page,
   `/organizer/platform/onboarding`, lists every Organization that is not yet
   Ready, grouped by what they are waiting on: waiting on TropTix (requested,
   not approved), waiting on the organizer (approved, terms or destination
   missing), waiting on Stripe (account pending or restricted). Each row shows
   the four timestamps, the owner's email, days in the current state, and the
   one action that applies. The payouts panel's setup switches stay as the
   correction tool.
7. **Reminders go through the outbox, on transitions and on silence.** Five
   messages, each one template in `packages/transactional`:
   - to TropTix: a new paid-ticketing request (step 1).
   - to the organizer: request received, with the booking link (step 1).
   - to the organizer: approved, with "accept terms" and "connect your bank"
     links (step 2).
   - to the organizer: destination connected, "you can request payouts"
     (step 4 done, if steps 2 and 3 are done too), or "one step left" naming
     it.
   - to the organizer: nudge after 3 and 10 days of silence in any organizer-
     owned step, sent by a cron that reads `getPayoutSetup`; the third silence
     goes to TropTix instead so a human reaches out. Never more than one nudge
     per Organization per day, recorded on the Organization
     (`payoutSetupNudgedAt`).
8. **Selling is never blocked by payout setup.** An approved organizer can put
   paid tickets on sale with steps 3 and 4 open. Publishing a paid event with
   setup incomplete shows one non-blocking notice on the publish confirmation
   ("You can sell now; finish payout setup to withdraw"). Withholding sales
   would punish the organizer for TropTix's process.
9. **Every step change is an analytics event** (`payout_setup_step_changed`
   with step, from, to, organization id) so the funnel is readable in PostHog
   from day one. Drop-off between step 2 and step 4 is the number this plan
   exists to move.
10. **Behind one flag**, `PAYOUT_ONBOARDING`, on the organizer-facing card and
    checklist. The platform queue and the request write need no flag: off
    means the banner and the two switches, exactly today.

## Non-goals

- No tax forms. Connect can issue 1099s through Stripe Tax for US organizers
  later; Jamaican organizers have no equivalent here. A decision for the
  unattended-payouts phase.
- No identity verification beyond Stripe's. TropTix does not collect ID.
- No automated approval. Step 2 stays a conversation by policy.
- No change to the meeting's content, the ledger, the request lifecycle, or
  either rail.
- No ownership transfer. Terms are accepted by the Owner; if ownership
  transfer ever lands, the new Owner re-accepts.
- No mobile app work. The organizer app links out to the web checklist.

## Screens

**Organizer Dashboard, "Get paid" card** (replaces `PaidWarningBannerOrganizer`
when the flag is on). Shows the four steps as a compact progress row with the
current step expanded:

> **Get paid for your events**  ●●○○
> Step 3 of 4 · Accept payout terms
> A short read covering when earnings release, the 20% holdback, and how
> TropTix collects on your behalf. [Read and accept]
> Steps: Requested Jul 3 · Approved Jul 9 · Terms · Bank

The card disappears when Ready. An organizer who has never requested sees
step 1 expanded with the booking link beside the button.

**Payouts page checklist** (replaces the two-step `SetupChecklistCard`). The
same four steps, full width, each with its state line and action. Step 4
renders the Connect plan's bank step. The request card appears below it only
when Ready, as today.

**Terms page** `/organizer/payouts/terms`: the rendered markdown, the version
and effective date, the last acceptance (who, when, which version), and an
Accept button for the Owner. Admins can read; the button says "Only the
Organization's owner can accept". Re-acceptance shows a "What changed" block
from the document's changelog section.

**Platform View onboarding queue** `/organizer/platform/onboarding`: three
groups as in decision 6, newest request first. Row actions: Approve (opens a
confirm with the meeting date defaulting to today), Nudge now (sends the
silence email regardless of cadence), View as (existing). Stripe rows link to
the account in the Stripe Dashboard.

**Publish notice**: one line on the publish confirmation for a paid event when
setup is incomplete, linking to the payouts page.

## Schema

One migration (`pnpm db:new payout_onboarding`), all on `Organization`:

```prisma
// Payout terms, versioned. Null = never accepted. A version bump in
// docs/legal/payout-terms.md turns the step back to todo.
payoutTermsAcceptedAt DateTime?
payoutTermsVersion    String?   @db.VarChar(20)
// Last silence nudge, so the cron never sends twice in a day.
payoutSetupNudgedAt   DateTime?
```

`paidTicketingRequestedAt`, `paidTicketingEnabled`, `payoutMeetingAt`, and
`payoutBankLinkedAt` already exist. `stripeAccountId` comes from the Connect
plan; this migration must sort after that one.

`supabase/seed.sql`: the demo Organization gets all timestamps set and the
current terms version, so the preview branch renders Ready; the second
Organization ("Island Nights") gets `paidTicketingRequestedAt` only, so it
sits in "waiting on TropTix" and the queue has a row to approve.

## Service layer

**`packages/api/src/services/organizer-onboarding.ts`**

- `getPayoutSetup(prisma, stripe, actor, { viewAsOrganizerUserId })` →
  `PayoutSetup`: the four steps, `ready`, `nextAction`. Reads the Connect
  state for step 4 through the Connect plan's `readConnectState`. View-as
  works, read-only.
- `requestPaidTicketing(prisma, actor)` — owner-only; sets the timestamp if
  null; enqueues the two step-1 messages. Idempotent.
- `acceptPayoutTerms(prisma, actor, { version })` — owner-only; rejects if
  `version` is not the current version (the page was stale); writes both
  columns; emits the analytics event.
- `currentPayoutTerms()` — reads the document's front matter (version,
  effective date) and body; pure, cached per process.

**`packages/api/src/services/platform-onboarding.ts`**

- `listOnboarding(prisma, stripe, actor)` — every Organization not Ready,
  grouped; Stripe state fetched only for rows with a `stripeAccountId`.
- `approvePaidTicketing(prisma, actor, { organizationId, meetingAt })` —
  Platform-Owner-only; sets `paidTicketingEnabled` and `payoutMeetingAt`;
  enqueues the approval message. Guarded on `paidTicketingEnabled = false`.
- `nudgeOrganization(prisma, actor, { organizationId })` — enqueues the
  silence message and stamps `payoutSetupNudgedAt`.

**Outbox**: five message types in the outbox catalog; templates in
`packages/transactional/emails` next to `EmailConfirmation.tsx`. The silence
cron is a route under `apps/web/src/app/api/cron/` that calls one service,
`sendSilenceNudges(prisma, now)`.

**Gate**: `requestPayout` adds the terms check
(`payoutTermsAcceptedAt !== null && payoutTermsVersion === current`) and a
new `PayoutTermsNotAcceptedError`. `PayoutSetupIncompleteError` keeps
covering the meeting and the destination.

Contracts in `packages/api/src/contracts/onboarding.ts`; unit tests beside
each service with a fake Stripe, as the payout services do.

## Web

- `apps/web/src/components/PaidWarningBanner.tsx` → replaced by
  `apps/web/src/app/organizer/_components/GetPaidCard.tsx` (flag on).
- `apps/web/src/app/organizer/payouts/_components/SetupChecklistCard.tsx` →
  the four-step version; step 4 embeds the Connect plan's `BankStep`.
- `apps/web/src/app/organizer/payouts/terms/page.tsx` + an accept action in
  `_actions/payoutActions.ts`.
- `apps/web/src/app/organizer/platform/onboarding/page.tsx`, components and
  actions; a nav entry beside Platform Payouts.
- The publish confirmation gains the one-line notice.
- `docs/legal/payout-terms.md` with front matter `version` and `effective`,
  rendered with the markdown renderer the app already uses for event
  descriptions.
- `packages/api/src/contracts/featureFlags.ts`: `PAYOUT_ONBOARDING`.

## Dependencies and order

- Connect PR 1 lands first (it owns step 4 and `stripeAccountId`).
- This plan's PR A can land before or after Connect PR 2.
- The 2026-07 onboarding plan's phases 3 and 4 are superseded by this plan
  once it is approved; mark that plan `superseded` in the same PR.

## Phases

### PR A — the four steps

- Migration + seed; `docs/legal/payout-terms.md` v1 (counsel's text).
- `organizer-onboarding.ts`, `platform-onboarding.ts`, contracts, errors,
  tests; the terms gate in `requestPayout`.
- Dashboard card, four-step checklist, terms page, platform queue, nav.
- The three transition emails (request to TropTix, request received,
  approved). Analytics events.

### PR B — reminders and the publish notice

- Destination-connected email; silence cron with the 3/10-day nudges and the
  hand-off to TropTix; the publish confirmation notice.
- Supersede the 2026-07 plan's phases 3 and 4.

### Rollout

Flag on for staff, then for every organizer who has requested but not been
approved (they are the ones stuck today), then everyone. The platform queue
is live from the PR A merge; it reads state the app already has.

## Verification

- Unit: `getPayoutSetup` for every combination of the four timestamps and
  every Connect state; `acceptPayoutTerms` rejects a stale version; the
  request gate rejects a missing or outdated acceptance; the silence cron
  never sends twice in a day and hands off on the third.
- Preview branch: the seeded "Island Nights" row appears in the queue; approve
  it; sign in as its owner; accept terms; connect a sandbox Stripe account;
  see the card disappear and the request button appear. Both emails arrive in
  the outbox table.
- Funnel: after two weeks live, the PostHog funnel from step 1 to Ready has a
  number, and the queue's "waiting on organizer" group has an age
  distribution. Both are inputs to whether the nudges work.

## Vocabulary (CONTEXT.md, when PR A ships)

- **Payout setup** (rewrite): four steps, one per owner, in the order above;
  Ready when all four are recorded. The meeting and the paid-ticketing
  approval are one action by a Platform Owner.
- **Payout terms** (new): the versioned agreement under which TropTix
  collects ticket payments as the Organization's agent and pays them out;
  accepted by the Owner in the app; a version bump requires re-acceptance
  before the next request.
- **Paid-ticketing request** (new): the Organization's in-app ask to sell paid
  tickets; the start of payout setup; answered by a Platform Owner's
  approval.

## Decisions to confirm before approval

- The 3-day and 10-day nudge cadence, and the hand-off to TropTix on the
  third silence.
- Whether Admins (not only the Owner) may make the paid-ticketing request.
  The plan says Owner, matching "members and money".
- Whether approval should default `payoutMeetingAt` to the approval time or
  ask for the meeting date. The plan asks, defaulting to today.
- Whether the terms document lives in the repo or in a CMS. The plan says
  repo: versioned, reviewable, diffable, and the app already renders markdown.
