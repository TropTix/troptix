# Browser end-to-end tests

Playwright tests for the buyer flow: events load, tickets load with the right
prices and states, free RSVP and paid checkout complete, a declined card is
handled. Every test is recorded, and a run ends with one stitched video a
reviewer can watch.

Design and rationale: [docs/plans/2026-09-e2e-browser-tests.md](../docs/plans/2026-09-e2e-browser-tests.md)
and [ADR 0029](../docs/adr/0029-hermetic-browser-e2e.md).

## Run locally

Needs Docker and the Supabase CLI. Stripe test keys come from `apps/web/.env`.

```sh
supabase db start          # local Postgres with migrations + seed (once)
pnpm e2e                   # build web, run the suite, stitch the proof video
```

Then open `e2e/playwright-report/index.html` (or `pnpm --filter @troptix/e2e report`)
for per-test videos and traces, and `e2e/playwright-report/proof.webm` for
the whole run in one file.

While iterating, keep a server up and re-run only the tests:

```sh
pnpm --filter @troptix/e2e build:web   # after app changes
pnpm --filter @troptix/e2e test        # starts next start on :3210, reuses it if running
pnpm --filter @troptix/e2e test:ui     # Playwright UI mode
```

## How it works

- The app runs as a production build (`next start`) on port 3210 against the
  local Postgres. Supabase auth is a placeholder: nothing in the buyer flow
  signs in.
- Each test creates its own event, organization and ticket types with
  `e2e-` ids and deletes them afterwards, so assertions are absolute and tests
  run in parallel. The discover test uses the seeded demo events.
- Paid checkout hits Stripe test mode with the standard test cards. No webhook
  forwarding: the checkout page's own poll fulfils the order.
- Analytics and the venue map are blocked at the network layer. Order emails
  go to Resend's sink address.
