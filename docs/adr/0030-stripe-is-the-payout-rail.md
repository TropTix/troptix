# 30. Stripe is the payout rail: Connect for US organizers, separate charges and transfers, derived rail, live status

- **Status:** Accepted (the live-status clause of decision 4 is superseded by ADR 0032)
- **Date:** 2026-09-22

## Context

ADR 0028 built the payout ledger and a request lifecycle with the money moved
by hand from the ops bank (Mercury). It left the rail open: the 2026-07
decision was Stripe Global Payouts for every organizer, and the 2026-08 plan
built the ledger so that only the "send money by hand" step would change.

Verifying that against Stripe's docs in 2026-09 changed the picture:

- Connect cross-border payouts reach only the US, UK, EEA, Canada, and
  Switzerland. Jamaica is unreachable through Connect.
- Global Payouts now lists Jamaican banks for US senders, but it requires
  Treasury and Stripe places the money-transmission responsibility on the
  sender. Counsel reviewed that on 2026-09-22 and cleared TropTix's position
  as the organizer's collection agent, which the payout-onboarding plan
  records as accepted terms.
- Stripe now directs new Connect platforms to the Accounts v2 API; v1
  endpoints (transfers, login links) accept v2 accounts; the pinned SDK types
  v2 accounts, account links, and thin-event parsing.
- Stripe prunes idempotency keys after 24 hours.

## Decision

1. **Stripe is the only payout rail.** Connect serves US organizers first;
   Global Payouts serves Jamaican organizers next; manual Mercury transfers
   are a transition that ends when every Organization is on Stripe.
2. **Separate charges and transfers, on the platform account.** Checkout
   keeps charging the platform account; TropTix stays merchant of record;
   revenue pools in the platform balance; paying an organizer is a
   `transfers.create` from that balance for the request's full amount. The
   ledger, not Stripe, decides when money is available (ADR 0028 stands).
3. **Accounts v2, recipient plus merchant configuration, Express dashboard.**
   The Connect account requests `stripe_balance.stripe_transfers` (the rail)
   and `card_payments`, the latter only because Stripe refuses transfers
   without it unless the platform has been approved for transfers-only
   accounts (`capability_not_available_without_other_capability`; the v1 API
   says the same in words: "Your platform needs approval"). Nothing charges
   through the account. Platform pays fees and owns losses. Hosted onboarding
   through Account Links; status through thin events on an event destination.
4. **Rail assignment is derived, never declared.** One column,
   `Organization.stripeAccountId`, rail-neutral because the Global Payouts
   recipient is the same v2 account object. An Organization is on the Stripe
   rail when that column and a verified payout destination are both set.
   Whether the account can take a transfer right now is read live from Stripe
   at the two moments it matters (rendering the organizer's payouts page and
   the admin's send) and never cached.
5. **Transfer first, resolve second.** The request id is the idempotency key
   and the `transfer_group`; the send lists the group before creating, so a
   retry after the 24-hour pruning finds the existing transfer instead of
   paying twice. A daily reconciliation compares paid rows with Stripe's
   transfers.
6. **Money stays at Stripe.** Connect transfers draw on the payments balance;
   the Global Payouts rail will draw on a financial account fed from it; only
   TropTix's fee leaves to Mercury. Until then, a minimum balance on the
   platform account keeps the daily sweep from starving transfers.

## Consequences

- Adding Connect touches one step of the request flow and one column. The
  ledger, holdback, per-organizer overrides, and request lifecycle are
  untouched, and the Global Payouts rail reuses the same onboarding
  mechanics with a different capability and a different send call.
- Two rails means the ledger cannot live inside Stripe. The Stripe-native
  alternative, a transfer per order at sale time with `source_transaction`
  and payouts held in the connected balance, would have removed the platform
  balance floor and made refunds reverse one transfer each, but would have
  put US organizers' ledger in Stripe and Jamaican organizers' ledger in
  TropTix. Rejected while any organizer is off Connect.
- Destination charges were rejected for the same reason: they move money at
  charge time, and the release rule is TropTix's.
- Requesting `card_payments` means hosted onboarding also collects merchant
  fields (business type, statement descriptor, a business URL, which the
  platform prefills with the Organization's public page) and Stripe may set a
  merchant category code. If Stripe support ever approves transfers-only
  accounts for the platform, the merchant configuration can be dropped for
  new accounts without touching anything downstream.
- Accounts v1 controller properties would have produced an identical account
  shape. Rejected because Stripe's direction for new platforms is v2, the
  shape maps one-to-one, and thin events are typed in the SDK.
- Live status reads cost one Stripe call per organizer payouts-page render and
  one before each send. Accepted: nothing drifts and nothing needs a backfill.
  A cache is the lever if the platform panel's per-row reads ever hurt.
- The admin click is a launch control, not the design. Once reconciliation
  has run clean, sends on the Stripe rail become automatic under the
  unattended-payouts plan, inheriting these idempotency rules unchanged.
- TropTix absorbs Connect's costs ($2 per active account-month, 0.25% +
  $0.25 per payout). The organizer receives the full requested amount on
  every rail.
