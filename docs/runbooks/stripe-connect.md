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
7. **Balance settings** (before the first live send): Balance → Payout
   settings → a USD minimum balance at least the size of open payout requests
   with headroom, so the daily sweep to the ops bank leaves enough to fund
   transfers. The platform queue header shows the available balance against
   open requests and turns amber when it is short.
8. **Dispute events**: add `charge.dispute.created` to the reservation
   webhook's destination (the snapshot one, not the thin one). The handler
   emails info@usetroptix.com the day a chargeback opens.

## Environment variables

| Variable                        | Where                            | Purpose                                                    |
| ------------------------------- | -------------------------------- | ---------------------------------------------------------- |
| `STRIPE_SECRET_KEY`             | all                              | Already set; the same key drives Connect calls             |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | production, preview, development | Signing secret of the thin-event destination for that mode |

Previews share one sandbox destination pointed at a stable non-production
host; a per-PR preview never receives events. The return route syncs the
status and stamps the gate on its own, so the click-through still reaches the
right end state; anything Stripe decides after that never reaches the preview
(ADR 0032).

## Sandbox walk-through

1. Turn the `stripe-connect-onboarding` flag on for your account (release
   condition on your email; never globally).
2. `/organizer/payouts` → **Connect bank** → United States → **Continue with
   Stripe**.
3. In Stripe's form use the test data: SMS code `000-000`, date of birth
   `1901-01-01`, ID number `000000000`, address line 1 `address_full_match`,
   bank routing `110000000`, account `000123456789`.
4. Back on the payouts page the banner reads "connected" (or "reviewing" if
   Stripe is still verifying; the webhook stamps the step when it flips).
5. Settings tab → **Open Stripe dashboard** signs in with SMS code `000-000`
   in the sandbox.
6. Platform Payouts → the organization's row shows "Stripe · acct\_… ·
   active" with a link into the Stripe Dashboard.

## Sending a payout

1. Platform Payouts → an open request whose organization shows "Stripe ·
   acct\_… · active" gets a **Pay** button. The panel names the account and
   the Connect fee; **Send via Stripe** creates the transfer and marks the row
   paid with the transfer id as its reference. **Pay another way** opens the
   manual cockpit.
2. The request id is the transfer's idempotency key and `transfer_group`, so
   a retry after any failure is safe: the send looks the group up first and
   reuses the transfer it finds.
3. Failures leave the row open and say why: the platform balance is short
   (wait for the sweep to leave the floor, or top up), or Stripe has paused
   the account (the organizer sees **Update with Stripe**). "Transfer tr\_…
   was sent but the request was already resolved" means the money moved and
   the row did not: open the transfer in the Stripe Dashboard and either
   reverse it or mark the row paid by hand with that id.
4. The organizer's table reads "via Stripe, tr\_…"; their Express dashboard
   shows the deposit and its arrival estimate.

## Reconciliation

`POST /api/cron/reconcile-payouts` lists Stripe transfers carrying a
`payoutRequestId` over the last 35 days and compares them with the rows. It
flags three cases: a paid row with no transfer, an open row with a transfer,
and two transfers for one request. The platform queue runs the same check on
every render and marks the rows; the cron logs mismatches so they show up in
Vercel's logs even when nobody opens the queue. Schedule it like the
reservation sweep ([runbook](expire-reservations-cron.md)), once a day:

```sql
select cron.schedule(
  'reconcile-payouts',
  '0 9 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url')
           || '/api/cron/reconcile-payouts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 30000
  );
  $$
);
```

A healthy run returns `200` with `{ "success": true, "mismatches": [] }`.

## A chargeback after a payout

Stripe's marketplace guidance is to reverse the transfer promptly. On the
dispute email: find the charge in the Stripe Dashboard, note its event and
organization, and if that organization has been paid for the event, reverse
the matching transfer (Transfers → the transfer → Reverse) for the disputed
amount. Refunds the organizer issues themselves need no action; they net out
of the ledger (ADR 0030).

## Local events

```
stripe listen --forward-thin-to localhost:3000/api/stripe/connect-webhook \
  --thin-events "v2.core.account[configuration.recipient].capability_status_updated,v2.core.account[requirements].updated"
```

Put the printed secret in `apps/web/.env` as `STRIPE_CONNECT_WEBHOOK_SECRET`.

## When something is wrong

- **The payouts page shows a stale state**: the page reads
  `Organization.stripeTransfersStatus`, which only the webhook and the return
  route write. Check the event destination's delivery log in Workbench; a
  failed delivery is retried by Stripe. Sending the organizer back through
  **Connect bank** resyncs on return.
- **An organizer's step never turns done**: check the delivery log, then the
  account's capability status in the Stripe Dashboard. The return route and
  the webhook both stamp the gate; neither having run means the capability is
  not `active`.
- **A restricted account**: the organizer sees "Update with Stripe" and gets a
  fresh onboarding link. The platform panel shows the account state and a
  link to the account in the Stripe Dashboard.
