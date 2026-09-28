# Stripe Connect account shapes: what the sandbox accepts (2026-09-24)

Point-in-time results from `apps/web/scripts/stripe-lab.ts` run against the
TropTix sandbox on 2026-09-24, with `stripe@22.3.0` pinned to API version
`2026-06-24.dahlia` (and `2026-08-26.preview` where noted). Frozen; rerun the
lab rather than editing this file.

Context: [docs/plans/2026-09-stripe-connect-us-payout-rail.md](../plans/2026-09-stripe-connect-us-payout-rail.md),
[ADR 0030](../adr/0030-stripe-is-the-payout-rail.md), PR #583.

## Account creation

| Shape                                                                    | Result                                                                                                                                    |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| v2, US, Express dashboard, recipient `stripe_transfers` only             | Rejected: `capability_not_available_without_other_capability`                                                                             |
| v2, US, Express, `stripe_transfers` + merchant `card_payments`           | Accepted. 13 open requirements, both capabilities `restricted` until onboarding. **What PR 1 creates.**                                   |
| v2, US, `dashboard: none`, same capabilities                             | Accepted, same 13 requirements                                                                                                            |
| v2, US, same plus `entity_type: individual` and a business URL prefilled | Accepted. 17 requirements: the generic entity-type line becomes the individual's address, date of birth, phone, email, SSN last four      |
| v1, US, Express-style controller, `transfers` only                       | Rejected: "Your platform needs approval for accounts to have requested the `transfers` capability without the `card_payments` capability" |
| v1, US, Custom, `transfers` only                                         | Same approval error                                                                                                                       |
| v1, US, no type, `transfers` only (Stripe support's snippet)             | Rejected: not allowed for accounts with the full Dashboard                                                                                |
| v1, US, Express-style controller, both capabilities                      | Accepted. 12 `currently_due` items, the v1 twin of PR 1's shape                                                                           |
| v1, JM, Express-style, both capabilities                                 | Rejected: "You cannot request the `card_payments` capability for accounts in JM"                                                          |
| v1, JM, recipient service agreement, `transfers` only                    | Stopped at the transfers-only approval gate before any country check                                                                      |
| v2, JM, `stripe_transfers` + `card_payments`, Express or no dashboard    | Rejected: `capability_not_available_in_country` ("stripe_transfers is not available in country JM")                                       |
| v2, JM, `stripe_transfers`, preview API version                          | Same country rejection                                                                                                                    |
| v2, JM, recipient `bank_accounts.local` (Global Payouts), pinned version | Rejected: `invalid_fields`, the capability is preview-only                                                                                |
| v2, JM, recipient `bank_accounts.local`, preview API version             | **Accepted.** 4 open requirements (name, address). Hosted onboarding link minted. Not a Connect account.                                  |

## Findings

1. **Transfers-only accounts need a platform-level approval from Stripe**, on
   v1 and v2 alike. Until it is granted, every account also requests
   `card_payments`, which nothing uses. Support ticket open; Stripe's own
   platform-guide prompt emits the rejected shape.
2. **Stripe rejects `localhost` as a business URL** (`url_invalid`). Real
   https hosts, including Vercel preview hosts, are accepted. PR 1 now
   prefills the URL only when the app's base URL is https.
3. **Prefilling the entity type does not shorten onboarding**; it replaces
   one generic requirement with the individual's specific ones. PR 1 leaves
   entity type to the form.
4. **Connect cannot hold a Jamaican account under any version.** The
   capability that receives a transfer does not exist for JM.
5. **Global Payouts accepts a Jamaican recipient today** on the preview API
   version, mints hosted onboarding links, and the sandbox platform already
   has an open financial account (`fa_test_…`) to pay from. The unproven leg
   is a completed recipient plus an outbound payment in JMD.

## Global Payouts for US organizers, considered

Global Payouts also lists the United States as a destination, so one rail
for everyone is possible. Compared on 2026-09-24:

- Cost: $1.50 flat per US local-bank payout, no monthly fee, against Connect's
  $2 per active account-month plus 0.25% + $0.25.
- Onboarding: name, address, bank account; no merchant fields, no approval.
- Against it: every Global Payouts call rides `Stripe-Version: 2026-08-26.preview`
  and needs a restricted key; no 1099 filing (TropTix would file); no
  organizer dashboard; TropTix carries the licensing position rather than
  Stripe; no payee balance to reverse into.

Decision on 2026-09-24: keep Connect for US organizers (built, GA, Stripe
carries licensing and 1099s); prototype Global Payouts end to end for Jamaica,
which also gives a tested fallback for the US.

## Sandbox residue

Lab accounts carry `metadata.lab = connect-lab`; `stripe-lab.ts cleanup`
closes them. Earlier one-off reproductions created accounts named "Smoke Test
Org", "Variant Test", and "JM Recipient Test" without the tag; close those by
hand in the sandbox.
