---
title: Browser end-to-end tests for the buyer flow
status: proposed
created: 2026-09-21
tracking-issue: TBD
---

# Browser end-to-end tests for the buyer flow

We want to lean on end-to-end tests for confidence when changing the product,
and we want each run to leave proof a person can watch. This plan adds a
Playwright suite for the buyer flow, runs it on every web PR, and ships a
video of the run as the artifact.

Decision record: [ADR 0029](../adr/0029-hermetic-browser-e2e.md).

## What we had

- 370 unit and service tests (`apps/web` jest, `packages/api` vitest against a
  real Postgres), verified by mutation in August. Strong on rules, blind to
  the browser: nothing rendered a page, mounted the Payment Element, or
  survived the Stripe redirect.
- No Playwright or Cypress anywhere. Zero `data-testid` attributes.
- PR #517 (August) drafted a Playwright suite aimed at Vercel preview deploys.
  It was closed without ever running; its per-test fixture design was sound
  and is reused here.
- `supabase/seed.sql` carried absolute 2026 dates. By today every seeded
  event on sale had ended, so a fresh preview branch showed an empty discover
  page and a "No longer on sale" button.

## Research summary

Checked against current docs (September 2026):

- **Playwright 1.63** is the standard. Next.js recommends testing the
  production build (`next build && next start`) through Playwright's
  `webServer`. Video and trace can be kept per test; the HTML report embeds
  both. 1.59+ can stamp actions, test titles and chapter cards into the
  recording, which makes a self-narrating video.
- **Stripe** says its hosted Checkout resists automation, but the embedded
  Payment Element on our own page fills like any iframe. Test cards: `4242…`
  succeeds, `4000 0000 0000 0002` declines, `…9995` insufficient funds,
  `4000 0025 0000 3155` needs 3DS. Declines should be asserted on server
  state, not just the message.
- **Supabase's** documented CI pattern is the local stack with migrations and
  `seed.sql`. Preview branches are for humans to click; they cannot be reset
  mid-run and share a database with the preview deploy.
- **Vercel previews** as the target need the bypass header, a registered
  webhook per preview, and give no database reset. Better as a later
  production smoke than as the PR gate.
- **Cypress** still routes parallelism through its cloud and handles iframes
  worse. Playwright's test agents (planner, generator, healer) draft ordinary
  specs we own; they are a drafting aid, not a runtime.

## Design

- **Workspace** `e2e/` (`@troptix/e2e`): Playwright + `pg` for direct
  database assertions + `ffmpeg-static` to stitch the proof video.
- **Runtime**: `supabase db start` Postgres, production build of `apps/web`
  on port 3210, real Stripe test mode. Build and start share one environment
  (`e2e/lib/env.ts`) because `NEXT_PUBLIC_*` values bake in at build time.
  Supabase auth is a placeholder; the buyer flow never signs in.
- **Fixtures**: each test creates and deletes its own organizer →
  organization → event → ticket types chain with `e2e-` ids. The discover
  test uses the seeded demo events, whose dates are now `now()`-relative.
- **Selectors**: roles, labels and visible text. One `data-testid` on the
  ticket-type card (`ticket-type-<id>`) so a test can address a tier by id.
  The checkout sheet's screen-reader title names the dialog after the
  current step, which is the step oracle.
- **Isolation**: analytics (`/ingest`, PostHog) and Google Maps are blocked
  at the network layer. Order emails go to `delivered@resend.dev`.
- **Proof**: `video: 'on'` with action and title overlays, chapter cards per
  step, `trace: 'retain-on-failure'`. After the run, `scripts/stitch-proof.ts`
  concatenates every video into `playwright-report/proof.mp4`. CI uploads the
  report directory (videos, traces, proof) as the `e2e-report` artifact.

## Coverage

| Question                                | Spec                                                                                                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Do the events load?                     | `discover.spec.ts`: seeded events listed, private one hidden, card opens the event page                                                                                                 |
| Do the tickets load, correctly?         | `event-page.spec.ts`: names, prices, fee lines; sold out / on sale soon / gated hidden; per-user clamp and running total                                                                |
| Can you check out free?                 | `free-checkout.spec.ts`: RSVP completes; DB shows COMPLETED FREE order, VALID ticket, hold converted, counters absolute                                                                 |
| Can you check out paid?                 | `paid-checkout.spec.ts`: 2 × GA at $55.00 with `4242…`; survives the Stripe redirect; DB order, tickets, reservation, inventory; PaymentIntent `succeeded` on Stripe; ticket page opens |
| What happens when the card is declined? | `paid-checkout.spec.ts`: `…0002` shows the decline, buyer stays on the payment step, no order, hold still `HELD`, then a retry with a good card succeeds                                |

Seven tests, about 30 seconds wall clock locally with parallel workers.

## Rollout

1. Land the suite and the `e2e` CI job **not required**. Paid specs skip
   until the two repo secrets exist: `E2E_STRIPE_SECRET_KEY` and
   `E2E_STRIPE_PUBLISHABLE_KEY` (test mode). Stripe recommends a separate
   sandbox for CI; one shared test key is acceptable for now.
2. Make `e2e` a required check after a few clean runs on real PRs.
3. Post the proof video in the PR conversation from the workflow, so
   reviewers see it without opening artifacts.
4. Next specs, in order of value: 3DS challenge card; hold expiry
   (drive `/api/cron/expire-reservations` with `CRON_SECRET`); organizer
   sign-in via the local auth container and Mailpit, then create an event
   from the dashboard and buy it.
5. Later, not scheduled: a production smoke reusing the free RSVP spec
   against a live event, and a signed synthetic webhook test in
   `packages/api`.

## Known limits

- The deployed runtime and the webhook path are not exercised in a browser.
- Stripe test mode is a network dependency; paid specs are the flake budget.
- The checkout copy says tickets are held for 10 minutes; the server hold is
  12 with a 2-minute client buffer. Not a test concern, noted for a follow-up.
- Event cards on `/discover` have no accessible link name (the link wraps an
  `<article>`). The test works around it; it is an accessibility follow-up.
