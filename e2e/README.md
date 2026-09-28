# Browser end-to-end tests

Playwright tests for the buyer flow: events load, tickets load with the right
prices and states, free RSVP and paid checkout complete, a declined card is
handled. Stripe is a fake served from this package, so the suite needs no
secrets and no network. A failed test keeps its video and trace.

Design and rationale: [docs/plans/2026-09-e2e-browser-tests.md](../docs/plans/2026-09-e2e-browser-tests.md)
and [ADR 0034](../docs/adr/0034-hermetic-browser-e2e.md).

## Run locally

Needs Docker and the Supabase CLI.

```sh
supabase db start          # local Postgres with migrations + seed (once)
pnpm e2e                   # build web, then run the suite
```

Then open `e2e/playwright-report/index.html` for the report; failed tests carry
a video and a trace.

While iterating, keep the servers up and re-run only the tests:

```sh
pnpm --filter @troptix/e2e build:web   # after app changes
pnpm --filter @troptix/e2e test        # starts the fake Stripe and next start, reuses them if running
pnpm --filter @troptix/e2e test:ui     # Playwright UI mode
```

## How it works

- The app runs as a production build (`next start`) on port 3210 against the
  local Postgres. Supabase auth is a placeholder: nothing in the buyer flow
  signs in.
- Stripe is faked at the network edge, following Stripe's guidance to mock
  its UI and API in automated tests. `scripts/fake-stripe.ts` stands in for
  `api.stripe.com` on port 3211 (Checkout Sessions, refunds, PaymentIntents)
  and the app's SDK is pointed at it with `STRIPE_API_BASE`.
  `lib/fake-stripe-js.js` is served in place of Stripe.js: it renders plain
  card inputs and its `confirm()` asks the fake server for the outcome, which
  the card number decides the way Stripe's test cards do (`4242…` succeeds,
  `…0002` is declined). Every other Stripe domain, analytics and the venue map
  are blocked.
- Each test creates its own event, organization and ticket types with
  `e2e-` ids and deletes them afterwards, so assertions are absolute and tests
  run in parallel. The discover test uses the seeded demo events.
- No webhook forwarding: the checkout page's one sync finalize attempt fulfils
  the order (ADR 0030). The order email is attempted with a placeholder Resend
  key and rejected; the app logs it and the flow does not depend on it.
