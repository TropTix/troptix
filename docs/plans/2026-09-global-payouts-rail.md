---
title: Global Payouts — the international payout rail
status: proposed
created: 2026-09-28
tracking-issue: TBD
---

# Global Payouts — the international payout rail

Give organizers outside the United States a self-serve payout rail on Stripe
Global Payouts. Jamaica is the first market; the same rail reaches every
country Stripe pays by local bank transfer. The Connect plan
([2026-09-stripe-connect-us-payout-rail](2026-09-stripe-connect-us-payout-rail.md),
ADR 0030) built the account column, hosted onboarding, the thin-event webhook,
the transfer-first send, and reconciliation so that only the account shape
and the money-movement call would change for a second Stripe rail. This plan
changes those two things.

Counsel reviewed TropTix's position as the organizer's collection agent on
2026-09-22 and cleared it. That question is settled and is not reopened here.

## What Stripe's docs say (checked 2026-09-27)

| Question               | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Source                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Availability           | Generally available for businesses in the US and UK. It "requires Treasury": the platform activates Treasury and opens a financial account. Stripe describes it as "best for businesses that already hold the Money Transmitter License", which is positioning, not an eligibility rule. Connect's comparison table reads: "Manage your own legal and compliance requirements. This might require a Money Transmitter license if you manage your customers' funds." | [Global Payouts](https://docs.stripe.com/global-payouts), [Cross-border payouts, compare integrations](https://docs.stripe.com/connect/cross-border-payouts)                                                            |
| Why not Connect        | Cross-border payouts reach only the US, UK, EEA, Canada and Switzerland. "Stripe doesn't support self-serve cross-border payouts to countries outside the listed regions."                                                                                                                                                                                                                                                                                          | [Cross-border payouts](https://docs.stripe.com/connect/cross-border-payouts)                                                                                                                                            |
| Jamaica                | JMD, local bank method. The hosted form asks an individual for email and name, a company for email and company name. Minimum 0 JMD. Arrival "typically 1-7 days".                                                                                                                                                                                                                                                                                                   | [Recipient requirements](https://docs.stripe.com/global-payouts/recipient-requirements), [Payout methods and amounts](https://docs.stripe.com/global-payouts/payout-methods)                                            |
| Cost                   | $1.50 per local-bank payout, plus a cross-border fee of 0.25% to 1.25% by country (Jamaica 0.50%), plus 1% FX for a US sender converting to anything but EUR or GBP. Fees are collected from the financial account, separately from the payout. Wires are $25 and are out of scope.                                                                                                                                                                                 | [Pricing](https://docs.stripe.com/global-payouts/pricing)                                                                                                                                                               |
| The recipient          | A v2 Account with a `recipient` configuration requesting `bank_accounts.local`. `identity.country`, `identity.entity_type`, `contact_email` and `display_name` are required. No dashboard, no merchant configuration, no responsibilities. Same Account Links call as Connect with `configurations: ['recipient']`; the URL is single use and expires in ten minutes.                                                                                               | [Create recipients](https://docs.stripe.com/global-payouts/recipient-creation)                                                                                                                                          |
| Knowing the status     | Retrieve the account with `include: ['configuration.recipient']` and read `bank_accounts.local.status`; it must be `active`, and a payout method must be attached, before a send. The same two thin events Connect subscribes to fire for recipient accounts.                                                                                                                                                                                                       | [Create recipients, confirm recipient is enabled](https://docs.stripe.com/global-payouts/recipient-creation), [Event types](https://docs.stripe.com/api/v2/core/events/event-types)                                     |
| The payout method      | `GET /v2/money_management/payout_methods` with `Stripe-Context` set to the recipient's account id lists what the hosted form collected. A send may name `to.payout_method`; without it Stripe needs a default set on the account (`default_payout_method_config_not_found` otherwise).                                                                                                                                                                              | [Create recipients, view payout methods](https://docs.stripe.com/global-payouts/recipient-creation), [Create an OutboundPayment, error codes](https://docs.stripe.com/api/v2/money-management/outbound-payments/create) |
| Sending                | `POST /v2/money_management/outbound_payments` with `from.financial_account`, `from.currency`, `to.recipient`, `amount`. `to.currency` may be omitted when the destination supports one currency. The response carries `from.debited` and `to.credited`, so the JMD figure comes back with the id. Status runs `processing → posted`, or `failed`, `canceled`, `returned`. Cross-border payouts cannot be reversed once posted.                                      | [Create an OutboundPayment](https://docs.stripe.com/api/v2/money-management/outbound-payments/create), [Manage payouts](https://docs.stripe.com/global-payouts/manage-payouts)                                          |
| Currency               | A US entity's financial account holds USD, USDC, GBP and EUR. Send USD; Stripe converts at its rate.                                                                                                                                                                                                                                                                                                                                                                | [Fund your financial account, regional availability](https://docs.stripe.com/treasury/add-funds)                                                                                                                        |
| Funding                | `POST /v1/payouts` with `payout_method` = the financial account id moves settled payments balance into it. The docs list this source as "Instant" and free.                                                                                                                                                                                                                                                                                                         | [Fund your financial account](https://docs.stripe.com/treasury/add-funds), [Create a payout](https://docs.stripe.com/api/payouts/create)                                                                                |
| Idempotency            | v2 keys are honoured for 30 days, and a replay of a failed request "re-executes the failed requests" instead of returning the cached failure. This is the opposite of v1's 24-hour replay that ADR 0033 designed around.                                                                                                                                                                                                                                            | [API v2 overview, idempotency](https://docs.stripe.com/api-v2-overview)                                                                                                                                                 |
| Finding a lost payment | The list endpoint filters by `recipient`, `status` and `created`, not metadata. Metadata is matched client side.                                                                                                                                                                                                                                                                                                                                                    | [List OutboundPayments](https://docs.stripe.com/api/v2/money-management/outbound-payments/list)                                                                                                                         |
| Events                 | `v2.money_management.outbound_payment.{created,posted,failed,returned,canceled,under_review}`, thin, on a **Your account** destination. Not subscribed in this plan (decision 9).                                                                                                                                                                                                                                                                                   | [Event types](https://docs.stripe.com/api/v2/core/events/event-types)                                                                                                                                                   |
| API version and keys   | Every money-management call and the `bank_accounts` capability need `Stripe-Version: 2026-08-26.preview`. Live calls must use a restricted key with Recipient Configuration: Write, Money Management Financial Accounts: Read, Payout Methods: Write, Outbound Payments: Write.                                                                                                                                                                                     | [Send money, use API keys](https://docs.stripe.com/global-payouts/send-money)                                                                                                                                           |
| SDK                    | `stripe@latest` (22.6.2) ships no `V2/MoneyManagement` resources and no `bank_accounts` capability type. `stripe@public-preview` (22.7.0-beta.1) ships FinancialAccounts, OutboundPayments, PayoutMethods, the preview account capabilities, and a `stripeContext` request option, pinned to `2026-08-26.preview`.                                                                                                                                                  | npm dist-tags, the package's `resources/V2/MoneyManagement/*.d.ts`                                                                                                                                                      |
| Verification           | "Your business is responsible for all interactions with your recipients and for collecting all the necessary information to verify them."                                                                                                                                                                                                                                                                                                                           | [Create recipients, considerations](https://docs.stripe.com/global-payouts/recipient-creation)                                                                                                                          |

## Decisions

1. **Scope**: Global Payouts is the second and last Stripe rail. It serves
   every organizer whose bank is in a country Stripe pays by local bank
   method from a US sender, except the United States, which stays on Connect.
   Wire-only countries stay on the manual rail until someone asks.
2. **One account column, one kind column.** The recipient is a v2 account,
   so `stripeAccountId` holds it as the Connect plan intended. A second
   column, `stripeAccountKind` (`CONNECT` | `GLOBAL_PAYOUTS`), records which
   shape was created, because the two are told apart by a capability that
   only the preview API version returns. The kind is Stripe's fact about an
   immutable account shape, mirrored once at creation; the rail is still
   derived from the account and its status, never declared.
3. **`stripeTransfersStatus` holds the payout capability's status, whichever
   capability the account has**: `stripe_balance.stripe_transfers` on a
   Connect account, `bank_accounts.local` on a recipient. `connectStateOf`
   is unchanged. Renaming the column would touch the migration, seed, every
   DTO and every test for no behaviour change.
4. **Two Stripe clients.** The pinned GA SDK keeps every existing call. A
   second client, from the `public-preview` package under the alias
   `stripe-preview`, pinned to the exact beta, makes only the recipient and
   money-management calls. It authenticates with `STRIPE_PAYOUTS_KEY`, the
   restricted key, falling back to the secret key in a sandbox. The alias
   escapes the workspace `stripe` override by narrowing that override to
   `stripe@^22.3.0`. Raw requests against the GA SDK were the alternative;
   they would hand-type the same contracts the beta ships.
5. **The organizer picks a country and an entity type; nothing is stored.**
   The bank dialog's "Jamaica or elsewhere" fork becomes a country select
   drawn from a registry in `@troptix/api` contracts, plus individual or
   business. Both go straight into the account create call. The registry is
   Stripe's local-bank list for US senders and is the whitelist. A country
   not on it keeps today's manual-rail copy.
6. **Hosted onboarding, same routes.** The account link requests the
   `recipient` configuration only and lands on the existing return and
   refresh routes. The return route and the webhook fetch the account
   through the client that matches the kind.
7. **The send picks the payout method explicitly.** Before creating the
   payment the send lists the recipient's payout methods and uses the first
   usable bank account. No bank account means the account is not ready, the
   same error as a restricted Connect account. Relying on a Stripe-side
   default would make readiness depend on a Dashboard setting.
8. **Fund the financial account per send, from the payments balance.** The
   send reads the financial account's available USD; if it is short of the
   amount plus fee headroom, a v1 payout moves the shortfall from the
   platform balance. Headroom is 2.25% plus $1.50, the worst case on the
   pricing page; whatever is left stays at Stripe. The Connect plan's minimum
   balance rule keeps the payments balance able to fund it. This is the
   second funding rule decision 10 of the Connect plan promised, and it needs
   no Dashboard schedule.
9. **Returned payouts surface through reconciliation, not the webhook.** A
   paid row whose payment later reads `failed` or `returned` is a new
   mismatch kind on the platform page and in the daily job. Stamping it on
   the row the moment the event arrives belongs to the unattended-payouts
   plan, which also decides what happens to the request. Nothing subscribes
   to outbound payment events in this plan.
10. **A deterministic idempotency key per request** for the outbound
    payment: `global-payout-<request id>`. Under v2 semantics a retry within
    30 days returns the payment or re-executes a failure, which is what ADR
    0033's per-attempt key had to work around on v1. The list-and-match
    lookup stays as the guard past 30 days and for a lost response. The row
    lock and guarded resolve are unchanged.
11. **No quote in v1.** An OutboundPaymentQuote would lock the rate for five
    minutes and itemise fees before the send. Jamaica does not require one,
    the delivered amount comes back on the payment itself, and the fee is
    absorbed. A quote is the lever if the admin cockpit ever needs a preview.
12. **The platform balance header adds the financial account.** What can be
    sent is the payments balance plus the financial account's available USD,
    against open requests on either Stripe rail.
13. **A flag on the organizer button only.** `global-payouts-onboarding`
    gates the country select and the server action that creates a recipient.
    Off, the dialog is exactly today's. Sends, reconciliation and the
    platform panel need no flag: they act only on accounts that exist.
14. **The payout meeting stays a hard gate.** Stripe's docs put recipient
    verification on the sender; the meeting is where TropTix does it.
15. **TropTix absorbs the fees**, as on every rail. The organizer receives the
    full requested amount converted at Stripe's rate.

## Non-goals

- Wires, cards, stablecoin and Link payouts, PayoutIntents (private preview).
- Automatic sends, allocations, a signed balance: the unattended-payouts plan.
- Stamping outbound payment events on rows (decision 9).
- A stored country. The account holds it.
- Retiring the manual rail. That happens when the last manual-rail
  Organization has moved, with its own PR.

## The organizer's journey

The bank step of the payouts checklist. Everything below the fork is new.

1. **Connect bank** opens the dialog. The first question is unchanged:
   "Where is the bank account you want paid?" with **United States** and
   **Another country**. With the flag off the second option reads "Jamaica or
   elsewhere" and shows the manual-rail copy, as today.
2. **Another country** reveals a country select (the registry, Jamaica
   first), a choice between "Myself" and "A registered business", and the
   ready list: an email address, the bank's account details, and about five
   minutes. Countries not in the select get one line: "Don't see your
   country? We set this up together during your payout meeting."
3. **Continue with Stripe** posts country and entity type to a server
   action, which creates the recipient account, claims the id on the row
   with `stripeAccountKind = 'GLOBAL_PAYOUTS'`, mints the account link and
   redirects. A double click returns the same account: the idempotency key
   is `global-payouts-account-<org id>`.
4. Stripe's hosted form collects the name and the bank account. The return
   route syncs the status through the preview client and redirects to the
   payouts page with the same three banners as Connect.
5. The webhook records `bank_accounts.local` status changes into the same
   column, stamping the gate once it reads `active`.

States, copy and actions on the bank step are the Connect ones with two
differences: the active copy says "Payouts are converted to <currency> and
land in your bank within about a week", and there is no Stripe dashboard
button, because a recipient has no dashboard. "Finish setting up" and "Update
with Stripe" mint a recipient link.

## Paying an organizer through Global Payouts

The admin's cockpit shows the same one-click panel as Connect with the copy
"Send $X through Stripe to <account> (<Organization>). Converted to <currency>
at Stripe's rate, usually in the bank within a week. Fee to TropTix: about
$Y." "Pay another way" is unchanged.

The send, inside the same row lock as the Connect branch:

1. Refuse unless the organization's account kind is `GLOBAL_PAYOUTS` and its
   state is active.
2. List outbound payments for the recipient created since the request, and
   reuse one whose metadata names the request and whose status is not
   `failed`, `canceled` or `returned`.
3. List the recipient's payout methods; take the first bank account that is
   not restricted and is eligible for payments. None: restricted-account
   error.
4. Read the financial account. If available USD is below amount plus
   headroom, create a v1 payout of the difference to the financial account.
   `balance_insufficient` maps to the existing insufficient-balance error
   with the shortfall.
5. Create the outbound payment: from the financial account in USD, to the
   recipient and payout method, amount in USD, description
   `TropTix payout — <slug> — <short id>`, metadata with the request and
   organization ids, idempotency key `global-payout-<request id>`.
6. Resolve the row: `PAID`, rail `STRIPE`, reference = the payment id.

Errors: `insufficient_funds` on the financial account maps to the
insufficient-balance error (the top-up has not settled; retry); any
`recipient_*`, `payout_method_*`, `account_not_configured_as_recipient` or
`outbound_payment_not_allowed` code maps to the restricted-account error;
everything else is rethrown as on Connect.

### Reconciliation

The daily pass gains a second sweep: every outbound payment in the window,
grouped by the request id in its metadata. A `failed`, `canceled` or
`returned` payment does not count as live, like a reversed transfer. A paid
row whose only payments are failed or returned is reported as
`payment_returned`, its own label on the platform page, rather than "no
transfer found". The mismatch's id list carries `obp_…` ids alongside
`tr_…` ids; the platform page shows them the same way.

## Schema

One migration (`pnpm --filter web db:new stripe_account_kind`):

```prisma
// Which shape the account is: a Connect account or a Global Payouts
// recipient. Immutable at Stripe; set once when the account is created.
stripeAccountKind String?
```

With a backfill in the same file: every row that has a `stripeAccountId` is
`CONNECT`, because nothing else could have created one. The seed adds the
column as `null` to both Organization inserts that name the Stripe columns.

## Service layer

- `organizer-connect.ts` keeps Connect. It gains a `PayoutClients` type,
  `{ connect: Stripe; global: StripePreview }`, that the return route, the
  status sync and the link minting take, so each branch uses the client its
  kind needs. `transfersStatus` reads whichever capability is present.
- `organizer-global-payouts.ts` (new): the country registry lookup,
  `startGlobalPayoutsOnboarding` (create the recipient, claim, link), the
  recipient link for an existing account, and the status read.
- `connect-webhook.ts` looks the organization up by the related object's id
  first, then fetches the account through the client for its kind.
- `platform-payouts.ts`: `sendPayoutViaStripe` takes `PayoutClients` and
  branches on the kind; `sendViaGlobalPayouts` and `fundFinancialAccount`
  live beside `findOrCreateTransfer`; `readPlatformPayoutBalance` adds the
  financial account; `reconcileStripePayouts` runs both sweeps.
- Contracts: `stripeAccountKindSchema`, `kind` on `ConnectSetup`,
  `PlatformPayoutRequest` and `PayoutOrganization`, the country registry,
  `startGlobalPayoutsOnboardingInputSchema`, the new mismatch kind, and the
  flag key.
- Environment: `STRIPE_PAYOUTS_KEY` (restricted key, live only) and
  `STRIPE_FINANCIAL_ACCOUNT_ID`. The preview client lives in
  `apps/web/src/server/lib/stripePayouts.ts`.

## Web

- `ConnectBankDialog`: the country select and entity type, behind the flag,
  posting to `startGlobalPayoutsOnboarding` in `payoutActions.ts`.
- `BankStep`, `PayoutSettings`, `RequestsTable`: copy by kind.
- `PlatformRequestsTable`: send-panel copy by kind, the new mismatch label,
  fee estimate by kind.
- `PayoutSetupPanel`: the account line names the kind and links to the
  Recipients page for a recipient.
- `stripe-lab.ts`: `fa`, `fund <cents>`, `payout-methods <acct>` and
  `pay <acct> <cents>` commands on the preview client, so the send can be
  proven in the sandbox before any UI exists.

## Stripe Dashboard setup (once, by hand)

Recorded in `docs/runbooks/stripe-global-payouts.md`, written in PR 1:

1. Activate Treasury on the live account; open a USD financial account. Copy
   its id to `STRIPE_FINANCIAL_ACCOUNT_ID`. The sandbox already has one.
2. Create the restricted key with the four permissions; store it as
   `STRIPE_PAYOUTS_KEY`.
3. Global Payouts settings: enable the bank account payout method; set the
   recipient communication preference (Stripe emails the recipient a receipt,
   or not).
4. The existing Connect event destination already carries the two account
   events for recipient accounts; nothing to add.
5. Balance settings: the Connect floor stands. Top-ups draw on it.

## Testing

- Unit: the recipient create (parameters, idempotency key, the claim race),
  the link by kind, `transfersStatus` for both capability shapes, the
  webhook choosing its client, the send (payout method choice, top-up
  arithmetic, reuse of a live payment, rejection of a returned one, each
  error mapping, deterministic key), the balance sum, both reconciliation
  sweeps and the new kind.
- Sandbox, before PR 1 review: `stripe-lab.ts create jamaica-global-payouts`,
  `link`, complete the form, `payout-methods`, `fund`, `pay`. This is the leg
  the 2026-09-24 audit left unproven and the one that validates the
  preview SDK.
- Sandbox, PR 1 review: the country select on a preview deploy, the return
  banner, the status on the platform panel.
- Sandbox, PR 2 review: a request from a recipient-rail organization sent
  through the cockpit; `obp_…` on both tables; the financial account
  transaction in the Dashboard.

## Phases

### PR 1 — recipient onboarding

- The `stripe-preview` alias and the override change; the preview client.
- Migration, Prisma, seed; the kind on every DTO.
- `organizer-global-payouts.ts`, the `PayoutClients` change in
  `organizer-connect.ts`, the webhook's client choice.
- The dialog, the flag, the action, the copy by kind.
- Lab commands, the runbook.

### PR 2 — the send rail

- `sendViaGlobalPayouts`, `fundFinancialAccount`, the balance header, the
  second reconciliation sweep and mismatch kind.
- Platform cockpit copy and labels.
- Runbook: the send walk-through and the returned-payout procedure.

### Rollout

Flag on for staff, one Jamaican organizer onboards, one real send lands,
then the release condition widens. The manual rail keeps working throughout.

## What comes after

- **Unattended payouts** (the Connect plan's next phase) inherits both
  rails. Outbound payment events get subscribed there, where a returned
  payment can reopen or re-send a request.
- **Retiring the manual rail** once every Organization is on Stripe: the
  Mercury cockpit, the bank switch, and the "elsewhere" copy go.
- **A quote before the send**, if the cockpit ever shows the converted
  amount and exact fee up front.

## Vocabulary (CONTEXT.md, when PR 1 ships)

**Recipient account** (new): the Global Payouts recipient that receives a
non-US Organization's payouts. **Connect account** and **Payout rail**
amended to name it.

## Decisions recorded

[ADR 0034](../adr/0034-global-payouts-is-the-international-rail.md) records
the rail, the kind column, the two clients, per-send funding, the explicit
payout method, deterministic v2 keys, and reconciliation over events.

## Open questions

- Whether the hosted recipient form sets a default payout method. The send
  does not depend on it (decision 7); noted so nobody builds on it.
- Whether Stripe's review of a payout (`under_review`) ever holds a Jamaican
  send long enough to matter. The first live sends will say.
