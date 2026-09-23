# Runbook: Stripe Connect, the organizer payout rail

Covers the Stripe Dashboard settings the code cannot set for itself, the
environment variables, and the sandbox walk-through. The design is in
[docs/plans/2026-09-stripe-connect-us-payout-rail.md](../plans/2026-09-stripe-connect-us-payout-rail.md)
and [ADR 0030](../adr/0030-stripe-is-the-payout-rail.md).

## Dashboard settings, once per mode (live and sandbox)

1. **Connect platform onboarding**: complete the platform profile. Account
   creation fails with `platform_registration_required` until it is.
2. **Branding** (Connect settings): name, colour, icon. Hosted onboarding and
   the Express dashboard both require them.
3. **Onboarding options → countries**: United States only. Keep "collect bank
   account during onboarding" on.
4. **Express dashboard features**: payments, refunds, disputes, and manual
   payouts off. The account carries `card_payments` only because Stripe
   requires it alongside transfers; nothing charges through it.
5. **Transfers-only approval (optional)**: Stripe support can approve the
   platform for accounts that request transfers without `card_payments`.
   Until then the merchant configuration stays, and hosted onboarding asks
   for merchant details (business type, statement descriptor); the business
   URL is prefilled with the Organization's public page.
6. **Event destination** (Workbench → Webhooks):
   - Events from: **Your account** (not Connected accounts).
   - Payload: **thin**. Thin events need their own endpoint; do not add them
     to the reservation webhook's destination.
   - Events: `v2.core.account[configuration.recipient].capability_status_updated`
     and `v2.core.account[requirements].updated`.
   - URL: `https://<host>/api/stripe/connect-webhook`.
   - Copy the signing secret into `STRIPE_CONNECT_WEBHOOK_SECRET` for that
     environment.
7. **Balance settings** (before the first live send, PR 2): a USD minimum
   balance at least the size of open payout requests, so the daily sweep to
   the ops bank leaves enough to fund transfers.

## Environment variables

| Variable                        | Where                            | Purpose                                                    |
| ------------------------------- | -------------------------------- | ---------------------------------------------------------- |
| `STRIPE_SECRET_KEY`             | all                              | Already set; the same key drives Connect calls             |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | production, preview, development | Signing secret of the thin-event destination for that mode |

Previews share one sandbox destination pointed at a stable non-production
host; a per-PR preview never receives events. The return route stamps the
gate on its own, so the click-through still reaches the right end state.

## Sandbox walk-through

1. Turn the `stripe-connect-onboarding` flag on for your account (release
   condition on your email; never globally).
2. `/organizer/payouts` → "Connect your bank account" → United States →
   **Connect with Stripe**.
3. In Stripe's form use the test data: SMS code `000-000`, date of birth
   `1901-01-01`, ID number `000000000`, address line 1 `address_full_match`,
   bank routing `110000000`, account `000123456789`.
4. Back on the payouts page the banner reads "connected" (or "reviewing" if
   Stripe is still verifying; the webhook stamps the step when it flips).
5. **Open Stripe dashboard** signs in with SMS code `000-000` in the sandbox.
6. Platform Payouts → the organization's row shows "Stripe · acct\_… ·
   active" with a link into the Stripe Dashboard.

## Local events

```
stripe listen --forward-thin-to localhost:3000/api/stripe/connect-webhook \
  --thin-events "v2.core.account[configuration.recipient].capability_status_updated,v2.core.account[requirements].updated"
```

Put the printed secret in `apps/web/.env` as `STRIPE_CONNECT_WEBHOOK_SECRET`.

## When something is wrong

- **"Couldn't reach Stripe just now" on the payouts page**: the live read
  failed. Nothing is cached, so a refresh after Stripe recovers is enough.
- **An organizer's step never turns done**: check the event destination's
  delivery log in Workbench, then the account's capability status in the
  Stripe Dashboard. The return route and the webhook both stamp the gate;
  neither having run means the capability is not `active`.
- **A restricted account**: the organizer sees "Update with Stripe" and gets a
  fresh onboarding link. The platform panel shows the account state and a
  link to the account in the Stripe Dashboard.
