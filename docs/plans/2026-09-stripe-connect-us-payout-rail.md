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

This amends the 2026-07 decision to launch on Stripe Global Payouts for
everyone. Connect becomes the US rail; the manual rail keeps serving
organizers Stripe cannot reach (Jamaica has no Connect support and no
cross-border transfer path — re-verify against live docs at build time, the
finding dates to 2026-07). Global Payouts stays parked as the eventual
Jamaican rail, not dead.

## Decisions

Settled in review on 2026-09-17:

1. **Scope**: Connect is the **US rail**. Jamaican organizers stay on the
   manual rail. Global Payouts is deferred, not superseded.
2. **Charge model**: **separate charges and transfers**. Checkout keeps
   charging the platform account exactly as today; sales revenue pools in the
   platform's Stripe balance; paying an organizer is a `transfers.create`
   from that balance. TropTix stays merchant of record. The ledger — not
   Stripe — decides when money is available. (US organizers as their own
   merchant of record is a possible future initiative; it changes refund,
   dispute, and tax ownership and gets its own plan. Nothing here builds for
   it.)
3. **Account type**: Express-equivalent **controller-configured accounts**
   (Stripe owns the dashboard, platform pays fees and owns losses), hosted
   onboarding via Account Links. Verify the current account/controller API
   surface at build time.
4. **Rail assignment is derived, never declared.** An Organization whose
   Connect account has payouts active is on the Stripe rail; otherwise
   manual. No new enum column; the per-request `rail` field keeps recording
   what actually happened, and the mark-paid rail select stays as the
   per-request override.
5. **Transfer first, resolve second**, with the payout request id as the
   Stripe idempotency key (a retry after a crash returns the same transfer —
   no double pay) and in the transfer metadata. The resolve is the existing
   guarded `updateMany`; if it writes 0 rows (organizer cancelled in the
   race window), surface the transfer id with the conflict error and recover
   by hand. Insufficient platform balance is an expected, typed failure: the
   request stays `REQUESTED` and the admin retries later or pays manually.
   No outbox or worker until payouts become automatic.
6. **Country is self-selected** at the bank step. The checklist's bank step
   forks: "US bank account → Connect with Stripe" creates the account with
   `country: 'US'` and hands off to hosted onboarding; anything else shows
   today's we-set-it-up-together copy. Stripe's KYC is the validator; a wrong
   self-selection just never activates and is replaced with a new account.
   No country column on `Organization` — the Connect account holds the fact.
   The payout meeting stays a hard gate on **every** rail (in practice the
   paid-ticketing meeting, which covers both).
7. **One Connect-scoped webhook** (`/api/stripe/connect-webhook`, own signing
   secret) handling `account.updated`: when the payouts capability goes
   active, set `payoutBankLinkedAt` — the same timestamp the manual checkbox
   sets, so `setup.complete` and everything downstream are unchanged. No
   reversal listening in v1; reversals are rare, admin-visible in the Stripe
   dashboard, and become load-bearing only when payouts run without a human.
   A capability revocation flips the derived rail back to manual but never
   clears `payoutBankLinkedAt` (the gate applies at request time; the
   platform queue shows the restricted state instead).
8. **The platform absorbs Connect costs** (monthly active-account fee plus
   per-payout volume — confirm current pricing at build time). A transfer
   carries the request's full `amountCents`; the request amount is what the
   organizer receives, on every rail. If the costs ever matter, the lever is
   `FeeConfig`, not payout netting.
9. **Two PRs, flagged.** The organizer-facing Connect button sits behind a
   PostHog flag (ADR 0023): merge dark, enable for one friendly US
   organizer, watch the first real transfer land, then open up. The webhook
   and send rail need no flag — they are inert without a connected account.

## Non-goals

- No change to checkout, fees, or the ledger. The earnings math, holdback,
  per-org overrides, and request lifecycle are rail-agnostic and untouched.
- No Jamaican Connect accounts, no Global Payouts work.
- No automatic payouts. The admin still clicks — the click just does the
  transfer. Automation is the phase after this one and inherits the
  idempotency discipline unchanged.
- No reversal/dispute machinery beyond what the Stripe dashboard shows.
- No US-organizer merchant-of-record work.

## Phases

### PR 1 — onboarding

- Migration: `stripeConnectAccountId String?` on `Organization` (one column;
  onboarding state lives in Stripe). Seed: one US-flavored org with a fake
  account id so the preview branch renders the connected state.
- Service (`platform-payouts` or a new `connect-payouts`): create account +
  Account Link, and the webhook handler that flips `payoutBankLinkedAt` —
  pure over an injected Stripe client, unit-tested without Stripe.
- Web: the bank-step fork on the organizer checklist (behind the flag),
  Account Link return/refresh routes, `/api/stripe/connect-webhook` route
  (verify signature, call service).

### PR 2 — the send rail

- Service: `sendPayout` — transfer-first with request-id idempotency, then
  the existing resolve; typed errors for insufficient balance and restricted
  accounts.
- Platform View: for orgs on the derived Stripe rail, the mark-paid cockpit's
  Mercury fields give way to one "Send via Stripe" action; the rail select
  stays as the manual override. Requests table copy becomes rail-aware
  ("via Stripe" with the transfer id, instead of "via bank transfer").

## Build-time verifications

Do these against live Stripe docs before writing code — the research they
rest on is from 2026-07:

- Jamaica: still no Connect/cross-border path (if this changed, revisit the
  scope decision).
- Current account-creation surface (controller properties vs `type`
  parameter) on the pinned SDK.
- Current Connect pricing for Express-equivalent accounts.
- Test-mode Connect lifecycle on preview branches (simulated onboarding
  completion) so both PRs are exercisable before a real account exists.

## Decisions to record

When implementation starts, one ADR: _separate charges and transfers on the
platform account; Connect is the US rail; rail assignment is derived_ —
amending the 2026-07 Global Payouts decision and recording why destination
charges were rejected (the ledger, not Stripe, owns release timing; one
charge path regardless of organizer; the fee model is derived, not
Stripe-native).
