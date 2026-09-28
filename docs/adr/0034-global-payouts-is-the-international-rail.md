# 34. Global Payouts is the international rail: a mirrored account kind, two clients, per-send funding, deterministic v2 keys

- **Status:** Proposed
- **Date:** 2026-09-28

## Context

ADR 0030 made Stripe the only payout rail and said Global Payouts would serve
Jamaican organizers after Connect. Connect shipped for US organizers in
September 2026. Stripe's docs, checked on 2026-09-27, say Global Payouts is
generally available for US senders, reaches Jamaica by local bank transfer in
JMD, and needs three things Connect did not: Treasury with a financial
account, the `2026-08-26.preview` API version on every money-management
call, and a restricted API key in live mode. Counsel cleared TropTix's
position as the organizer's collection agent on 2026-09-22.

The recipient is the same v2 Account object as a Connect account, with a
`recipient` configuration that requests `bank_accounts.local` instead of
`stripe_balance.stripe_transfers`. That capability is returned only on the
preview API version, so a row cannot tell the two shapes apart from the
account id alone. The pinned GA SDK ships no money-management resources; the
`public-preview` package does.

Stripe's v2 idempotency differs from v1: keys are honoured for 30 days and a
replay of a failed request re-executes it instead of returning the cached
error. ADR 0033's per-attempt key exists because of v1's 24-hour replay.

## Decision

1. **Global Payouts is the second and last Stripe rail.** It serves every
   organizer whose bank is in a country Stripe pays by local bank method from
   a US sender, except the United States, which stays on Connect. Wire-only
   countries stay manual until asked for.
2. **One new column, `Organization.stripeAccountKind`** (`CONNECT` |
   `GLOBAL_PAYOUTS`), set once when the account is created, mirrors which
   shape Stripe holds. The rail remains derived from the account and its
   capability status (ADR 0030 decision 4); the kind only says which
   capability, and therefore which send, applies. `stripeTransfersStatus`
   holds that capability's status, whichever one it is.
3. **Two Stripe clients.** The GA SDK keeps every existing call. A second
   client from `stripe@public-preview`, installed under the alias
   `stripe-preview` and pinned to the exact beta, makes only recipient and
   money-management calls and authenticates with the restricted key.
4. **Fund the financial account per send.** The send tops the financial
   account up from the payments balance by the shortfall against amount plus
   fee headroom, with a v1 payout whose destination is the financial account.
   The Connect minimum-balance rule keeps the payments balance able to fund
   it. No recurring transfer schedule.
5. **The send names the payout method** it found by listing the recipient's
   payout methods, and fails as "restricted" when there is no usable bank
   account. Readiness never depends on a Stripe-side default.
6. **A deterministic idempotency key per request** for the outbound payment,
   `global-payout-<request id>`, because v2 re-executes failures. The
   list-and-match lookup by recipient, window and metadata stays as the guard
   past 30 days. The row lock and guarded resolve from ADR 0033 stand.
7. **Returned and failed payments surface through reconciliation**, as a new
   mismatch kind, not through outbound payment events. Acting on them on
   arrival belongs to the unattended-payouts plan.

## Consequences

- Adding the rail touches the account create, the link, the status read and
  the send. The ledger, holdback, request lifecycle, both screens and the
  reconciliation shape are unchanged.
- Two packages of the Stripe SDK are installed. The preview one is a beta and
  will need deliberate bumps; it is imported from one server module and the
  services that take it, nowhere else. The workspace `stripe` override is
  narrowed to `stripe@^22.3.0` so the alias escapes it.
- A restricted key and a financial account id join the environment. Missing
  either fails a send with a clear error and touches nothing else.
- Fee headroom left in the financial account is TropTix's money at Stripe,
  used by the next send.
- The organizer receives USD converted at Stripe's rate; the JMD figure comes
  back on the payment. Cross-border payouts cannot be reversed, so the admin
  click stays the launch control until reconciliation has run clean.
- ADR 0033's per-attempt key stays correct for transfers, which are v1.
  Nothing there is superseded.
