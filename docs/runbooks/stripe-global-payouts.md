# Runbook: Stripe Global Payouts, the international payout rail

Covers the Stripe Dashboard settings the code cannot set for itself, the
environment variables, and the sandbox walk-through for organizers whose bank
is outside the United States. The design is in
[docs/plans/2026-09-global-payouts-rail.md](../plans/2026-09-global-payouts-rail.md)
and [ADR 0034](../adr/0034-global-payouts-is-the-international-rail.md). US
organizers stay on Connect ([runbook](stripe-connect.md)).

## Dashboard settings, once per mode (live and sandbox)

1. **Treasury**: activate it on the account (Balances → Financial account).
   Stripe reviews the account before it opens; start this first. Note the
   financial account id (`fa_…`) from Settings → Payouts, or run
   `stripe-lab.ts fa` in the sandbox. Put it in `STRIPE_FINANCIAL_ACCOUNT_ID`.
2. **Restricted key** (Developers → API keys → Create restricted key) with
   Recipient Configuration: Write, Money Management Financial Accounts: Read,
   Money Management Payout Methods: Write, Money Management Outbound
   Payments: Write. Live Global Payouts calls refuse the secret key. Put it in
   `STRIPE_PAYOUTS_KEY`. A sandbox accepts the secret key, so the variable is
   optional there.
3. **Global Payouts settings** (Settings → Global Payouts): enable the bank
   account payout method; choose whether Stripe emails recipients a receipt
   for each payout.
4. **Branding** is shared with Connect and already set; the recipient's
   hosted form uses it.
5. **Event destination**: the Connect one. The two `v2.core.account…` events
   it carries fire for recipient accounts too. Nothing to add.
6. **Balance settings**: the Connect floor stands. The send tops the financial
   account up from the payments balance, so the floor is what keeps a send
   fundable.

## Environment variables

| Variable                      | Where                            | Purpose                                                                                    |
| ----------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------ |
| `STRIPE_PAYOUTS_KEY`          | production                       | Restricted key for recipient and money-management calls; falls back to `STRIPE_SECRET_KEY` |
| `STRIPE_FINANCIAL_ACCOUNT_ID` | production, preview, development | The financial account outbound payments draw on (PR 2)                                     |

The preview SDK (`stripe-preview`, the `public-preview` tag of `stripe`) is
pinned to the exact beta in `apps/web/package.json` and
`packages/api/package.json`. Bump it on purpose, in its own PR, and re-run
the sandbox walk-through: the money-management surface is a preview.

## Sandbox walk-through

1. Turn the `global-payouts-onboarding` flag on for your account (release
   condition on your email; never globally). `stripe-connect-onboarding` must
   be on too; it shows the bank dialog.
2. `/organizer/payouts` → **Connect bank** → **Another country** → Jamaica →
   **Myself** → **Continue with Stripe**.
3. In Stripe's hosted form enter a name and a Jamaican bank account (the form
   asks for the local format: account number, bank code, branch code).
4. Back on the payouts page the banner reads "connected" or "reviewing"; the
   webhook stamps the step when the capability flips to active.
5. Platform Payouts → the organization's row shows "Stripe recipient · acct\_…
   · active" with a link to the Recipients page in the Dashboard.

## Proving the money movement without the UI

From `apps/web`:

```
pnpm exec tsx --env-file=.env scripts/stripe-lab.ts create jamaica-global-payouts
pnpm exec tsx --env-file=.env scripts/stripe-lab.ts link <acct_…>      # complete the form
pnpm exec tsx --env-file=.env scripts/stripe-lab.ts inspect <acct_…>   # bank_accounts.local active
pnpm exec tsx --env-file=.env scripts/stripe-lab.ts payout-methods <acct_…>
pnpm exec tsx --env-file=.env scripts/stripe-lab.ts fa
pnpm exec tsx --env-file=.env scripts/stripe-lab.ts fund 10000
pnpm exec tsx --env-file=.env scripts/stripe-lab.ts pay <acct_…> 5000
```

`pay` prints the debited USD, the credited JMD, and the receipt. Run this
before reviewing PR 1 and again after any bump of the preview SDK.

## Local events

The Connect listener already forwards the two account events; see the
[Connect runbook](stripe-connect.md#local-events).

## When something is wrong

- **`platform_registration_required` or a 403 on a recipient call**: Treasury
  is not active on this account, or the key lacks a permission. Check step 1
  and 2.
- **The organizer's row stays "setting up" after the form**: `inspect` the
  account. A `requirements` entry that restricts `bank_accounts.local` is
  something the form still needs; **Finish setting up with Stripe** mints a
  new link. A preview deploy receives no events, so the status there is
  whatever the return route wrote.
- **A recipient shows no payout method**: the form was left before the bank
  step. Mint a new link.
