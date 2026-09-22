---
title: Stripe Connect — the US payout rail
status: proposed
created: 2026-09-17
tracking-issue: TBD
---

# Stripe Connect — the US payout rail

Give US organizers a self-serve, one-click payout rail on Stripe Connect. The
manual rail ([2026-08-organizer-payout-requests](2026-08-organizer-payout-requests.md),
ADR 0028) built the ledger, the request lifecycle, and both screens so that
only the "send money by hand" step would change — this plan changes that step,
for US organizers only.

Stripe is the payout rail. Connect serves US organizers now; Global Payouts
serves Jamaican organizers next; manual Mercury transfers are a transition,
not a rail. The money-transmission question that Global Payouts raises was
checked with counsel and cleared on 2026-09-22, so the Jamaican rail is a
build, not a bet. This narrows the 2026-07 decision to launch on Global
Payouts for everyone: Connect goes first because Stripe carries the licence
for it and the product is generally available.

Revised 2026-09-21: every "verify at build time" item from the 2026-09-17
draft was checked against Stripe's live docs (next section), and the plan now
spells out the organizer's onboarding journey screen by screen and the money
movement end to end. The section after the table lists what changed.

## What Stripe's docs say (checked 2026-09-21)

| Question                       | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Source                                                                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which Accounts API             | "If you're a new Connect user, use the Accounts v2 API instead." v1 stays supported, and v1 endpoints (transfers, login links) accept v2 account ids. `stripe@22.3.0`, pinned to `2026-06-24.dahlia`, types `stripe.v2.core.accounts`, `stripe.v2.core.accountLinks`, and `stripe.parseEventNotification`.                                                                                                                                                                           | [Design an integration](https://docs.stripe.com/connect/design-an-integration), [Accounts v2 in an existing integration](https://docs.stripe.com/connect/accounts-v2/migrate-integration), `node_modules/stripe/cjs/resources/V2/Core` |
| Express-equivalent in v2       | `dashboard: 'express'` with `defaults.responsibilities.fees_collector: 'application'` and `losses_collector: 'application'`. Stripe rejects any other pairing for Express (`account_controller_express_dash_without_application_losses_or_fees`). The dashboard type is immutable; changing it means a new account.                                                                                                                                                                  | [Create an account (v2)](https://docs.stripe.com/api/v2/core/accounts/create)                                                                                                                                                          |
| Which configuration            | `configuration.recipient`: "Utilize this configuration if the Account will not be the Merchant of Record, like with Separate Charges & Transfers." Its capability `stripe_balance.stripe_transfers` "Enables this Account to receive /v1/transfers into their Stripe Balance." No `merchant` configuration and no `card_payments`; TropTix stays merchant of record.                                                                                                                 | [Create an account (v2), configuration.recipient](https://docs.stripe.com/api/v2/core/accounts/create?query=configuration.recipient)                                                                                                   |
| Hosted onboarding              | `POST /v2/core/account_links` with `use_case.type: 'account_onboarding'`, `account_onboarding.configurations: ['recipient']`, `refresh_url`, `return_url`, and `collection_options.fields` (`currently_due` by default, `eventually_due` for up-front). The URL is single use and expires in minutes (the reference example shows ten). Never send it outside the app. Returning to `return_url` carries no state and does not mean onboarding finished. Browser only, no web views. | [Account Links (v2)](https://docs.stripe.com/api/v2/core/account-links/create), [Stripe-hosted onboarding](https://docs.stripe.com/connect/hosted-onboarding)                                                                          |
| Knowing the status             | Retrieve the account with `include: ['configuration.recipient', 'requirements']` and read the capability `status`: `active`, `pending` (Stripe is verifying, nothing to collect), `restricted` (outstanding requirements; see `requirements.entries[].impact.restricts_capabilities`), or `unsupported`.                                                                                                                                                                             | [Track onboarding status (v2)](https://docs.stripe.com/connect/track-account-onboarding?dashboard-or-api=api&accounts-namespace=v2)                                                                                                    |
| Hearing about changes          | v2 accounts emit thin events. Listen on an event destination scoped to **Your account** for `v2.core.account[configuration.recipient].capability_status_updated` and `v2.core.account[requirements].updated`. The payload carries only ids; call `fetchRelatedObject()` for the current account. Thin events are unversioned. v1 `account.updated` also fires (Connected-accounts scope) but is not needed.                                                                          | [Event destinations](https://docs.stripe.com/event-destinations), [Account event types](https://docs.stripe.com/api/v2/core/accounts/event-types), [Connect webhooks](https://docs.stripe.com/connect/webhooks)                        |
| Requirements that change later | Accounts with a Stripe-hosted dashboard cannot use `account_update` links. Send them through a fresh `account_onboarding` link; the form knows what is missing. The Express dashboard also shows a notification banner and Stripe emails the account holder.                                                                                                                                                                                                                         | [Stripe-hosted onboarding, account link types](https://docs.stripe.com/connect/hosted-onboarding)                                                                                                                                      |
| Express dashboard              | `POST /v1/accounts/{id}/login_links` (`stripe.accounts.createLoginLink`) returns a single-use URL; the organizer signs in with an SMS or email code. Shows balance, upcoming payouts, bank account changes. Sandbox accounts can only get in through a login link.                                                                                                                                                                                                                   | [Integrate the Express Dashboard](https://docs.stripe.com/connect/integrate-express-dashboard), [Express Dashboard](https://docs.stripe.com/connect/express-dashboard)                                                                 |
| Sending money                  | `POST /v1/transfers` `{ amount, currency, destination, description, metadata }`. Draws on the platform's **available** balance; an overdraw fails with `balance_insufficient` and Stripe never retries. "Automatic payouts can interfere with transfers that don't have a defined `source_transaction`." Platform and connected account must be in the same region (US↔US is fine).                                                                                                  | [Separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers), [Create a transfer](https://docs.stripe.com/api/transfers/create), [Error codes](https://docs.stripe.com/error-codes)                |
| Reaching the organizer's bank  | The connected account pays out its balance daily by default. Payout status runs `pending → in_transit → paid`, or `failed` (the bank account is then disabled). `payout.paid` and `payout.failed` are v1 events only. v2 payout settings live in the Balance Settings API.                                                                                                                                                                                                           | [Payouts to connected accounts](https://docs.stripe.com/connect/payouts-connected-accounts), [Manage payout schedule](https://docs.stripe.com/connect/manage-payout-schedule)                                                          |
| Cost                           | $2 per monthly active account (active = a payout was sent that month), plus 0.25% + $0.25 per payout. Onboarding and verification: no fee. A $1,000 payout costs $2.00 + $2.75.                                                                                                                                                                                                                                                                                                      | [Connect pricing](https://stripe.com/connect/pricing)                                                                                                                                                                                  |
| Jamaica                        | Connect cross-border payouts reach only US, UK, EEA, Canada, and Switzerland; no Jamaica. Global Payouts now lists Jamaica (JMD, local bank method; email and name) for US senders and is GA for US businesses, but it requires Treasury and Stripe positions it for "businesses that already hold the Money Transmitter License". The scope decision stands; the Jamaican rail gets its own plan.                                                                                   | [Cross-border payouts](https://docs.stripe.com/connect/cross-border-payouts), [Global Payouts](https://docs.stripe.com/global-payouts), [Recipient requirements](https://docs.stripe.com/global-payouts/recipient-requirements)        |
| Testing                        | Sandbox accounts; SMS code `000-000`; DOB `1901-01-01`; ID number `000000000`; address line 1 `address_full_match`; US bank routing `110000000`, account `000123456789`. Forward events locally with `stripe listen`; trigger with `stripe trigger`.                                                                                                                                                                                                                                 | [Testing Connect](https://docs.stripe.com/connect/testing)                                                                                                                                                                             |

### What changed since the 2026-09-17 draft

- **Accounts v2, not v1 controller properties.** Same shape (Express dashboard,
  platform pays fees and owns losses), newer API, typed in the pinned SDK.
- **Thin events, not `account.updated`.** The webhook parses a notification
  and fetches the account; it does not read a snapshot.
- **Live status, no cached state.** The organizer page and the admin's send
  action ask Stripe at the moment they need to know. One column is enough.
- **A platform balance floor.** Transfers draw on the platform's available
  balance, which today sweeps to Mercury daily. Without a floor every send
  fails with `balance_insufficient`.
- **The seed carries no fake account id.** Preview branches exercise the real
  sandbox flow instead of rendering a state Stripe cannot back.
- **Jamaica re-checked.** Global Payouts can now reach Jamaican banks, but
  with Treasury and licensing strings attached. Noted, not acted on.

## Decisions

Settled in review on 2026-09-17, revised 2026-09-21; items 14 to 16 settled in
the 2026-09-21 grilling session:

1. **Scope**: Connect is the **US rail** and the first of two Stripe rails.
   Jamaican organizers stay on the manual rail only until the Global Payouts
   rail ships (its own plan; see "What comes after"). Nothing in these two
   PRs may assume the manual rail is permanent.
2. **Charge model**: **separate charges and transfers**. Checkout keeps
   charging the platform account exactly as today; sales revenue pools in the
   platform's Stripe balance; paying an organizer is a `transfers.create`
   from that balance. TropTix stays merchant of record. The ledger — not
   Stripe — decides when money is available. (US organizers as their own
   merchant of record is a possible future initiative; it changes refund,
   dispute, and tax ownership and gets its own plan. Nothing here builds for
   it.)
3. **Account shape**: **Accounts v2, recipient configuration only, Express
   dashboard.** Created with `dashboard: 'express'`, `fees_collector` and
   `losses_collector` both `'application'`, `identity.country: 'US'`, and
   `configuration.recipient.capabilities.stripe_balance.stripe_transfers.requested: true`.
   Prefilled with `display_name` (the Organization's display name),
   `contact_email` (the owner's email), and `metadata.organizationId`. No
   `merchant` configuration: the organizer never charges anyone through this
   account. The Express dashboard is what gives the organizer a place to see
   deposits and change their bank without TropTix building either.
4. **Rail assignment is derived, never declared.** An Organization is on the
   Stripe rail when `stripeAccountId` is set and `payoutBankLinkedAt`
   is set; otherwise manual. Whether that account can take a transfer right
   now is read live from Stripe at the two moments it matters: rendering the
   organizer's payouts page and the admin clicking send. Nothing caches
   Stripe's status in our database, so nothing drifts. The per-request `rail`
   field keeps recording what actually happened, and the mark-paid rail
   select stays as the per-request override.
5. **Transfer first, resolve second**, with the payout request id as the
   Stripe idempotency key (a retry after a crash returns the same transfer —
   no double pay) and in the transfer metadata. The resolve is the existing
   guarded `updateMany`; if it writes 0 rows (organizer cancelled in the race
   window), surface the transfer id with the conflict error and recover by
   hand. Stripe prunes idempotency keys after 24 hours, so the key alone
   cannot stop a double pay a week later: every transfer also carries
   `transfer_group` = the request id, and the send lists transfers for that
   group first; if one exists, it resolves with it instead of creating
   another. `balance_insufficient` is an expected, typed failure: the request
   stays `REQUESTED` and the admin retries after the balance refills or pays
   manually. `payouts_not_allowed`, `transfers_not_allowed`, and
   `capability_not_active` map to a typed "organizer must finish Stripe
   setup" failure. No outbox or worker until payouts become automatic.
6. **Country is self-selected** at the bank step. The checklist's bank step
   forks: "US bank account → Connect with Stripe" creates the account with
   `identity.country: 'US'` and hands off to hosted onboarding; anything else
   shows today's we-set-it-up-together copy. Stripe's KYC is the validator; a
   wrong self-selection never activates and is replaced with a new account.
   No country column on `Organization` — the Connect account holds the fact.
   The payout meeting stays a hard gate on **every** rail (in practice the
   paid-ticketing meeting, which covers both). The "Jamaica or elsewhere"
   branch is a transition: when the Global Payouts rail ships it becomes a
   second Stripe-hosted form, and the platform panel's manual switch retires.
   Nobody builds the manual branch out further.
7. **One event destination, thin events** at `/api/stripe/connect-webhook`
   with its own signing secret (`STRIPE_CONNECT_WEBHOOK_SECRET`), scoped to
   **Your account**, subscribed to
   `v2.core.account[configuration.recipient].capability_status_updated` and
   `v2.core.account[requirements].updated`. The handler fetches the account
   and, when `stripe_transfers` is `active`, sets `payoutBankLinkedAt` — the
   same timestamp the manual checkbox sets, so `setup.complete` and
   everything downstream are unchanged. A later restriction never clears
   `payoutBankLinkedAt` (the gate applies at request time); the live status
   read shows the organizer a "needs attention" state and the send action
   refuses. `ProcessedStripeEvent` dedupes v2 event ids the same way it does
   v1.
8. **The platform absorbs Connect costs**: $2 per active account-month plus
   0.25% + $0.25 per payout. A transfer carries the request's full
   `amountCents`; the request amount is what the organizer receives, on every
   rail. If the costs ever matter, the lever is `FeeConfig`, not payout
   netting.
9. **Onboarding collects `eventually_due` up front.** One longer form beats a
   payout blocked months later by a missed deadline; Stripe's own guidance
   lists "avoids the possibility of payout and processing issues due to
   missed deadlines" as the reason.
10. **Money stays at Stripe; a funding policy, not a single floor.** The end
    state is that sales revenue never leaves Stripe until it is the
    organizer's or TropTix's: Connect transfers draw on the payments balance,
    the Global Payouts rail draws on a Treasury financial account funded from
    that balance (Stripe moves settled balance there instantly, one-off or on
    a recurring schedule), and only TropTix's own fee is paid out to Mercury.
    For these two PRs the policy is one rule: the platform account's Balance
    Settings get a `payments.payouts.minimum_balance_by_currency.usd` at least
    the size of open requests with headroom, so the daily sweep to Mercury
    leaves enough available balance to fund sends. The runbook records the
    rule; the Global Payouts plan adds the second one.
11. **Connected accounts keep Stripe's default payout schedule** (daily,
    automatic). The organizer sees "on its way" in the Express dashboard the
    day we send; we do not schedule, hold, or track the bank leg in v1.
12. **Return and refresh are GET route handlers** under
    `/organizer/payouts/stripe/`. Stripe redirects with a plain GET, so a
    server action cannot receive it. Both require a signed-in owner and never
    accept a View-as target.
13. **Two PRs, flagged.** The organizer-facing Connect button sits behind a
    PostHog flag (`STRIPE_CONNECT_ONBOARDING` → `stripe-connect-onboarding`,
    ADR 0023): merge dark, enable for one friendly US organizer, watch the
    first real transfer land, then open up. The webhook and send rail need no
    flag — they are inert without a connected account.
14. **Connect is available before the meeting.** The bank step and the
    meeting step are independent; Stripe's verification takes a day or two,
    so starting early means the organizer is ready when the meeting is done.
    The meeting still gates the first request, on every rail.
15. **Switching an existing manual-rail Organization to Stripe** needs no new
    UI: a Platform Owner clears the bank step with the existing switch, the
    fork reappears for the organizer, and requests are blocked until Stripe
    activates. There is never a moment with two valid destinations.
16. **Refunds after a Stripe payout net out in the ledger.** A refunded order
    leaves earnings, so Available shrinks (floored at zero) and the next
    request is smaller; the platform balance fronts the difference meanwhile.
    No reversal machinery; a Platform Owner can reverse a transfer by hand in
    the Stripe Dashboard for a large or final-event case. A chargeback after a
    payout is different: Stripe's marketplace guidance is to reverse the
    transfer promptly, so the runbook carries that step and the reservation
    webhook listens for `charge.dispute.created` to tell a Platform Owner the
    day it happens.
17. **Reconcile daily.** A cron route beside the existing ones lists Stripe
    transfers carrying a request id in metadata and compares them with
    `PayoutRequest` rows. Three mismatches are flagged in the platform queue:
    `PAID` with no transfer, `REQUESTED` with a transfer, and two transfers
    for one request. This is the safety net under the idempotency rules and
    under every later automation.
18. **The queue shows the money before the click.** The platform queue header
    reads the platform's available balance live and the sum of open requests,
    and turns amber when the first is below the second. Stripe never retries a
    failed transfer once funds arrive, so the shortfall must be visible
    before the send, not after.
19. **The admin click is a launch control.** It is removed for Stripe-rail
    Organizations once the reconciliation cron has run clean for a month; the
    phase after this plan makes sends automatic (see "What comes after").

## Non-goals

- No change to checkout, fees, or the ledger. The earnings math, holdback,
  per-org overrides, and request lifecycle are rail-agnostic and untouched.
- No Global Payouts work in these two PRs. It is the next plan.
- No automatic payouts. The admin still clicks — the click just does the
  transfer. Automation is the phase after this one and inherits the
  idempotency discipline unchanged.
- No tracking of the bank leg (`payout.paid`, `payout.failed`). The Express
  dashboard shows it; if a bank deposit fails, Stripe disables the bank
  account and the organizer fixes it there.
- No email when a payout is sent. The request row flips to `PAID · via
  Stripe` and the Express dashboard shows the deposit. One outbox template
  later, with the rejection email the manual-rail plan deferred.
- No reversal/dispute machinery beyond what the Stripe dashboard shows.
  Refunds are still unmodeled in the ledger; when they land, the ledger
  subtracts and `transfers.createReversal` becomes the tool.
- No embedded components. Hosted onboarding plus the Express dashboard cover
  every screen Stripe needs; embedding is a later polish.
- No US-organizer merchant-of-record work.
- No mobile app work. Hosted onboarding is browser-only; when the organizer
  app grows a payouts screen it links out to the web.

## The organizer's onboarding journey

The entry point is the existing setup checklist on `/organizer/payouts`
(`SetupChecklistCard`), which today has two read-only steps a Platform Owner
checks off. Step one stays as it is. Step two becomes something the organizer
can do alone.

### States

Everything the screen shows is a function of three facts: the
`stripeAccountId` column, `payoutBankLinkedAt`, and (only when an
account id exists) the live `stripe_transfers` capability status.

| State           | Facts                                                               | What the bank step shows                                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manual`        | no account id                                                       | The fork (below). If `payoutBankLinkedAt` is set, the step is done and the fork is hidden — today's manual-rail organizer.                                                                                       |
| `in_progress`   | account id; status `restricted`; never linked                       | "Finish setting up with Stripe" button (new onboarding link). Subtext: "Stripe still needs a few details from you."                                                                                              |
| `pending`       | account id; status `pending`                                        | Disabled step with a clock icon: "Stripe is reviewing your details. This usually takes a day or two; we'll mark this done for you."                                                                              |
| `active`        | status `active` (and `payoutBankLinkedAt` set by webhook or return) | Step checked. "Bank connected through Stripe." An **Open Stripe dashboard** button (login link) and one line: "Payouts land in your bank on Stripe's schedule, usually within two business days of our sending." |
| `needs_updates` | linked earlier; status now `restricted` or `unsupported`            | Warning card above the request button: "Stripe needs updated information before we can send your next payout." Button: "Update with Stripe" (new onboarding link). The request button stays enabled.             |

The status read is one `stripe.v2.core.accounts.retrieve(id, { include })`
per page render when an id exists. If Stripe is unreachable the page shows
the last known column facts with a muted "Couldn't reach Stripe just now" line
and no buttons; it never throws.

### Screens

1. **Bank step, not started** (inside the checklist card, replaces today's
   static text):

   > **Connect your bank account**
   > Where is the bank account you want paid?
   > [ United States → Connect with Stripe ] [ Jamaica or elsewhere ]
   >
   > _Under "Jamaica or elsewhere":_ We set this up together during your
   > payout meeting. Your bank details are held at our bank — TropTix never
   > stores them.
   >
   > _Under "United States":_ We need a U.S. address, an SSN or EIN, and a
   > U.S. bank account to verify with Stripe. TropTix never sees your bank
   > details. Takes about five minutes.

   The choice is not stored. Picking "Jamaica or elsewhere" only reveals the
   manual copy. Clicking **Connect with Stripe** calls the server action
   `startStripeOnboarding`, which:
   - refuses unless the actor owns the Organization (owner-only, "members and
     money") and the flag is on;
   - creates the v2 account if `stripeAccountId` is null and stores
     the id (one row update, guarded on `stripeAccountId IS NULL` so a
     double click cannot create two accounts);
   - creates an account link with `configurations: ['recipient']`,
     `collection_options.fields: 'eventually_due'`, `refresh_url` =
     `/organizer/payouts/stripe/refresh`, `return_url` =
     `/organizer/payouts/stripe/return`;
   - redirects the browser to the link URL.

2. **Stripe-hosted onboarding.** Stripe's form, co-branded with the TropTix
   name, colour, and icon set in the Connect settings. It collects the
   business type, identity, address, SSN/EIN, bank account, and Stripe's
   service agreement. The organizer can "Save for later" at any point, which
   also lands on the return URL.

3. **Return** (`GET /organizer/payouts/stripe/return`): requires the signed-in
   owner; retrieves the account; if `stripe_transfers` is `active` and
   `payoutBankLinkedAt` is null, stamps it (idempotent with the webhook);
   then redirects to `/organizer/payouts?stripe=active|pending|incomplete`.
   The payouts page turns that query into one dismissible banner:
   - `active`: "Your bank account is connected. Request a payout whenever you
     have an available balance."
   - `pending`: "Thanks — Stripe is reviewing your details. We'll finish this
     step for you once they're done."
   - `incomplete`: "You can pick up where you left off any time." (the step
     shows the `in_progress` button)

4. **Refresh** (`GET /organizer/payouts/stripe/refresh`): the organizer hit
   an expired or reused link. Requires the signed-in owner; creates a fresh
   account link with the same parameters; redirects to it. If there is no
   account id, redirects to `/organizer/payouts`.

5. **Webhook** (`POST /api/stripe/connect-webhook`): `parseEventNotification`
   with the Connect secret; dedupe on the event id; `fetchRelatedObject()`;
   look up the Organization by `metadata.organizationId` (fallback: by
   account id); if the capability is `active`, stamp `payoutBankLinkedAt`
   when null. Any other status is logged and acknowledged. Unknown accounts
   are acknowledged, not retried.

6. **Connected** (state `active`): the step is checked, the request card
   appears as today, and the checklist card gains the **Open Stripe
   dashboard** button. That button is the server action `openStripeDashboard`
   → `stripe.accounts.createLoginLink(accountId)` → redirect. Copy under it:
   "See deposits, change your bank account, or download statements."

7. **Needs attention** (state `needs_updates`): a warning card sits between
   the stat cards and the request card. The organizer can still request;
   the admin cannot send until Stripe is satisfied, and the platform queue
   says so.

8. **Platform View setup panel** (`PayoutSetupPanel`): for an Organization
   with an account id, the "Bank linked" switch becomes read-only and shows
   "Stripe · acct\_… · <status>" with a link to the account in the Stripe
   Dashboard (`https://dashboard.stripe.com/connect/accounts/<id>`). The
   status there is the live read too, fetched only for rows with an id. The
   manual switch is unchanged for everyone else. The meeting switch is
   unchanged for everyone.

### Sequence

```
Organizer                TropTix (web)                 Stripe
   |  click Connect         |                             |
   |----------------------->| v2 accounts.create          |
   |                        |---------------------------->|
   |                        |<-- acct_…                   |
   |                        | store stripeAccountId|
   |                        | v2 accountLinks.create      |
   |                        |---------------------------->|
   |<-- 303 to link url ----|<-- url (single use) --------|
   |  fill in the form      |                             |
   |------------------------------------------------------>|
   |<-- redirect return_url --------------------------------|
   |----------------------->| GET /stripe/return          |
   |                        | accounts.retrieve(include)  |
   |                        |---------------------------->|
   |                        |<-- status active|pending|.. |
   |                        | stamp payoutBankLinkedAt?   |
   |<-- 303 /payouts?stripe=|                             |
   |                        |                             |
   |                        |<== thin event (later) ======|
   |                        | fetchRelatedObject          |
   |                        | stamp payoutBankLinkedAt?   |
```

## Paying an organizer through Connect

Nothing before the admin's click changes: the organizer requests an amount up
to Available, the row lands `REQUESTED` in the platform queue, and the ledger
already subtracted it.

### The admin's cockpit

`MarkPaidPanel` in `PlatformRequestsTable` becomes rail-aware. For a request
whose Organization is on the derived Stripe rail it renders:

> **Send $250.00 via Stripe** to `acct_1Nv…` (Island Nights)
> Stripe deposits to their bank within about two business days. Fee to
> TropTix: about $2.88.
> [ Send via Stripe ] [ Pay another way ▾ ]

"Pay another way" opens today's manual cockpit (Mercury fields, rail select)
as the override. For manual-rail Organizations the panel is exactly today's.
The requests table copy becomes rail-aware: `PAID` rows show "via Stripe ·
tr\_…" or "via bank transfer · ref …", on both the platform and organizer
tables.

### The send

`sendPayoutViaStripe(prisma, stripe, actor, { id })` in
`platform-payouts.ts`, Platform-Owner-only:

1. Load the request with its Organization; require `status: 'REQUESTED'` and
   a `stripeAccountId`.
2. `stripe.transfers.create(
{ amount: amountCents, currency: 'usd', destination: accountId,
  description: 'TropTix payout — <slug> — <id prefix>',
  metadata: { payoutRequestId, organizationId } },
{ idempotencyKey: 'payout-request-' + id })`.
3. The existing guarded resolve: `status: 'PAID'`, `rail: 'STRIPE'`,
   `reference: transfer.id`, `resolvedAt`, `resolvedByUserId`.
4. Errors, all typed and all leaving the row `REQUESTED`:
   - `balance_insufficient` → `InsufficientPlatformBalanceError` (message
     includes the shortfall from a `balance.retrieve`). UI: "The platform
     balance is $X short. Wait for the next sweep to leave the floor, or top
     up, then retry."
   - `payouts_not_allowed`, `transfers_not_allowed`, `capability_not_active`
     → `StripeAccountRestrictedError`. UI: "Stripe has paused this account
     until the organizer updates their details."
   - resolve wrote 0 rows → `ConflictError` whose message carries
     `transfer.id`. The money moved; the admin reconciles by hand (reverse the
     transfer or re-mark the row).
   - anything else → rethrown; the idempotency key makes the retry safe.

The idempotency key and the metadata together are the audit trail: from a
request id you can find its transfer in Stripe, and from a transfer you can
find its request.

### After the send

Stripe credits the connected account's balance at once (the platform balance
was already available). The connected account's default schedule pays it out
to the organizer's bank daily; the Express dashboard shows the payout and its
arrival estimate. The organizer's requests table shows `PAID · via Stripe ·
tr_…` with the resolved timestamp, plus one line under the table for Stripe
rail organizers: "Stripe deposits payouts to your bank within about two
business days. Open your Stripe dashboard to track them."

### Keeping the platform balance funded

Sales revenue lands in the platform balance and, on today's settings, sweeps
to Mercury daily. Decision 10 sets a floor so sends do not fail. The runbook
step: Stripe Dashboard → Balance → Payout settings → minimum balance (USD),
set to at least the sum of open requests with headroom. Revisit when payouts
become automatic; at that point a top-up or a manual platform schedule is the
right tool.

## Schema

One migration (`pnpm db:new stripe_account`):

```prisma
// On Organization. The organizer's Stripe account: a Connect account today,
// a Global Payouts recipient for Jamaica later. Both are v2 accounts with a
// recipient configuration; the active capability says which rail applies.
// Onboarding state lives in Stripe; this is the key.
stripeAccountId String? @unique
```

The name is rail-neutral on purpose. One Organization has one Stripe
account, and renaming a column after PR 1 costs a migration, the seed, and
every DTO.

Nothing else. `payoutBankLinkedAt` keeps meaning "a verified payout
destination exists", whichever rail verified it.

`supabase/seed.sql`: add the column to the explicit `Organization` insert
lists as `null` for both seed organizations. No fake account id — a preview
branch runs with sandbox keys, and a reviewer creates a real sandbox account
by clicking through (test data in the testing section). That exercises the
whole flow instead of a state Stripe cannot return.

## Service layer

Same shape as `payments.ts`: services take an injected `stripe: Stripe` and
the unit tests pass a fake object, as `payments.test.ts` does. No gateway
abstraction.

**`packages/api/src/services/organizer-connect.ts`** (owner-only writes,
never View-as):

- `startStripeOnboarding(prisma, stripe, actor, { baseUrl })` → `{ url }`.
  Creates the account when missing (guarded update), then the account link.
- `finishStripeOnboardingReturn(prisma, stripe, actor)` →
  `'active' | 'pending' | 'incomplete'`. Retrieves the account, stamps
  `payoutBankLinkedAt` when active and null.
- `refreshStripeOnboarding(prisma, stripe, actor, { baseUrl })` → `{ url }`.
- `createStripeDashboardLink(prisma, stripe, actor)` → `{ url }`.
- `readConnectState(stripe, org)` → the state enum from the table above;
  used by `getPayouts` (organizer page) and `listPayoutOrganizations`
  (platform panel, only for rows with an id). Swallows Stripe transport
  errors into an `unavailable` value.

**`packages/api/src/services/connect-webhook.ts`**:

- `handleConnectEvent(prisma, stripe, notification)` — pure over the parsed
  notification; fetches the account; stamps the gate. Tested with a fake
  `fetchRelatedObject`.

**`packages/api/src/services/platform-payouts.ts`** gains
`sendPayoutViaStripe` (above). `listPayoutOrganizations` and
`listPayoutRequests` add `stripeAccountId` and the derived
`rail: 'stripe' | 'manual'` to their DTOs.

**Contracts** (`packages/api/src/contracts/payouts.ts`): `connectStateSchema`
(`manual | in_progress | pending | active | needs_updates | unavailable`),
`setup.stripe: { accountId, state } | null` on `OrganizerPayouts`, the same
on `PayoutOrganization`, and `sendPayoutViaStripeInputSchema`. Errors in
`_shared/errors.ts`: `InsufficientPlatformBalanceError`,
`StripeAccountRestrictedError`.

## Web

- `apps/web/src/app/organizer/payouts/_components/SetupChecklistCard.tsx`:
  the bank step renders `BankStep` (new client component) with the fork and
  the five states. Behind `isFlagEnabled(FeatureFlag.STRIPE_CONNECT_ONBOARDING)`
  on the page; off means today's static copy.
- `_actions/payoutActions.ts`: `startStripeOnboarding`, `openStripeDashboard`
  (both end in `redirect()` to the Stripe URL).
- `apps/web/src/app/organizer/payouts/stripe/return/route.ts` and
  `.../refresh/route.ts`: GET handlers, `getServerUser`, call the service,
  `NextResponse.redirect`.
- `apps/web/src/app/organizer/payouts/page.tsx`: reads `?stripe=` for the
  banner; passes `setup.stripe` down.
- `apps/web/src/app/api/stripe/connect-webhook/route.ts`: mirrors
  `reservation-webhook/route.ts` but with `stripe.parseEventNotification`
  and `STRIPE_CONNECT_WEBHOOK_SECRET`.
- `apps/web/src/app/organizer/platform/payouts/_components/PlatformRequestsTable.tsx`:
  the Stripe branch of `MarkPaidPanel`; rail-aware resolution copy.
- `.../PayoutSetupPanel.tsx`: read-only Stripe row state.
- `apps/web/src/app/organizer/payouts/_components/RequestsTable.tsx`:
  rail-aware `PAID` copy and the Stripe deposit line.
- `packages/api/src/contracts/featureFlags.ts`: `STRIPE_CONNECT_ONBOARDING`.
- Env: `STRIPE_CONNECT_WEBHOOK_SECRET` (prod, preview, local), added to the
  deploy checklist beside `STRIPE_RESERVATION_WEBHOOK_SECRET`.

## Stripe Dashboard setup (once, by hand)

Recorded in a runbook (`docs/runbooks/stripe-connect.md`, written in PR 1):

1. Onboard the platform to Connect (platform profile questionnaire). Confirm
   the platform account's country is US; US↔US is what makes same-region
   transfers legal. If it is not, stop and rethink the region.
2. Connect settings → branding: name, colour, icon (hosted onboarding
   requires them; the Express dashboard uses them).
3. Onboarding options → countries: US only. Keep "collect bank account during
   onboarding" on.
4. Express dashboard features: leave payments, refunds, and disputes off (the
   account never charges); leave manual payouts off.
5. Event destination: **Your account** scope, thin payload, the two
   `v2.core.account…` events, endpoint `https://<host>/api/stripe/connect-webhook`;
   copy the secret to `STRIPE_CONNECT_WEBHOOK_SECRET`. One per environment
   (live, sandbox for previews).
6. Balance settings: the platform floor (decision 10), before the first live
   send.
7. Sandbox smoke on day one of PR 1: create one v2 account with the exact
   parameters from decision 3. If Stripe answers `accounts_v2_access_blocked`
   or `platform_registration_required`, that is a Dashboard/enablement task,
   not a code change.

## Testing

- Unit: the four onboarding service functions, `handleConnectEvent`, and
  `sendPayoutViaStripe` with a fake `stripe` (transfer success,
  `balance_insufficient`, restricted, 0-row resolve, idempotency key
  asserted). `readConnectState` for every capability status and for a
  transport error.
- Sandbox walk-through (PR 1 review, on the preview branch): click Connect,
  fill the form with the test data (`000-000`, `1901-01-01`, `000000000`,
  `address_full_match`, routing `110000000` / account `000123456789`), watch
  the return banner, confirm the event destination stamped the gate, open the
  Express dashboard through the login link.
- Sandbox send (PR 2 review): with a sandbox balance (a test card sale on the
  preview), send a request via Stripe; see `tr_…` on both tables and the
  payout in the sandbox Express dashboard. Then drain the sandbox balance and
  send again to see the `balance_insufficient` path.
- Local events: `stripe listen --forward-to localhost:3000/api/stripe/connect-webhook`
  from a sandbox; confirm the CLI's thin-event forwarding flag at the time
  (the CLI is at 1.43+, the docs say `stripe listen` handles both scopes).

## Phases

### PR 1 — onboarding

- Migration + seed column; `STRIPE_CONNECT_ONBOARDING` flag registered in
  PostHog at 0%.
- `organizer-connect.ts`, `connect-webhook.ts`, contracts, errors, tests.
- Web: `BankStep`, actions, return/refresh routes, the webhook route, the
  page banner, the platform panel's read-only Stripe row.
- Runbook with the Dashboard checklist; the sandbox smoke done and its
  account id noted in the PR.

### PR 2 — the send rail

- `sendPayoutViaStripe` with the `transfer_group` lookup + tests; DTO `rail`
  fields.
- The reconciliation cron route and its flags in the platform queue; the
  queue's balance header.
- `charge.dispute.created` handling on the reservation webhook (a Platform
  Owner notice, nothing automatic).
- Platform cockpit's Stripe branch and override; rail-aware copy on both
  tables; the organizer's deposit line.
- Balance floor set in the live Dashboard before merge.

### Rollout

1. Flag on for staff; a staff-owned US organization onboards in live mode
   with a real bank account and a $1 request is sent and lands.
2. Flag on for one friendly US organizer; first real payout watched end to
   end.
3. Flag to 100%; remove the flag in a cleanup PR (item on the umbrella
   issue from birth, per the flags runbook).

## What comes after

Two plans follow this one. Neither changes anything these two PRs build.

**Unattended payouts** (the phase decision 19 points at):

- Ledger memory through allocations: when a request is created, one row per
  event it draws from (request id, event id, amount). Answers "which events
  did this payout cover", makes a refund attributable to a paid event, and
  freezes history against fee-config drift.
- A signed balance internally, so a refund after a full payout shows "owed to
  TropTix" on the platform panel instead of hiding behind the zero floor.
- Auto-send on the Stripe rail: a request calls the send service at once,
  no click; then a scheduled job pays the full Available and the request
  button disappears for Stripe-rail Organizations. The amount field retires
  with it.
- A per-event breakdown on the payouts page (event, earned, held until,
  released, paid) from the rows the ledger already computes.
- A payouts freeze (`payoutsFrozenAt`, Platform-Owner-set, checked by the
  send) so a cancelled event cannot be paid out unattended.

**The Global Payouts rail for Jamaica** (cleared with counsel 2026-09-22):

- Treasury activation and a financial account funded from the payments
  balance on a recurring schedule.
- A recipient account per Jamaican Organization: the same v2 account with a
  `recipient` configuration, `bank_accounts.local` requested, onboarded
  through the same Account Links flow and the same events as Connect; the
  `stripeAccountId` column holds it.
- `sendPayout` gains a second branch: an outbound payment from the financial
  account, reference = the OutboundPayment id, rail `STRIPE`, same
  idempotency and reconciliation rules.
- The manual rail, the Mercury cockpit, and the platform panel's bank switch
  retire when the last manual-rail Organization has moved.

## Vocabulary (CONTEXT.md, when PR 1 ships)

Added to CONTEXT.md in this PR: **Connect account** (new), **Payout rail**
and **Payout setup** (amended).

## Decisions to record

When implementation starts, one ADR: _separate charges and transfers on the
platform account; Connect (Accounts v2, recipient-configured, Express) is the
US rail; rail assignment is derived; Stripe's status is read live, never
cached_ — amending the 2026-07 Global Payouts decision and recording why
destination charges were rejected (the ledger, not Stripe, owns release
timing; one charge path regardless of organizer; the fee model is derived, not
Stripe-native) and why v1 controller accounts were not used (Stripe's
direction for new platforms; identical shape; typed thin events).

## Open questions

- ~~Platform account country.~~ Confirmed US on 2026-09-21.
- **Who owns the Connect account if ownership transfer ever lands.** The
  account belongs to the Organization row, so it moves with the row. The
  identity inside it belongs to whoever onboarded; a new owner would onboard
  a new account. Noted for the ownership-transfer plan, not solved here.
