# 34. Browser end-to-end tests run hermetically, with Stripe faked at the network edge

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

We want confidence that the buyer flow works in a real browser: events load,
tickets load with the right prices and states, free and paid checkout complete,
a declined card is handled. Nothing rendered a page before this; the unit and
service tests are strong on rules and blind to the browser.

Three facts about the app decide the shape:

- Nothing in the buyer flow signs in. Every checkout procedure is public; the
  reservation id is the credential.
- The success screen does not depend on the Stripe webhook. After `confirm()`
  resolves, the client calls `checkout.finalizePayment` once, which retrieves
  the Session and fulfils the order (ADR 0030). The webhook and that sync
  attempt converge on one idempotent settle.
- The `packages/api` integration tests already run in CI against a local
  Postgres started with `supabase db start`.

Stripe's own guidance for automated tests is to mock its UI and API: the
Payment Element carries measures against automation, and test-mode rate limits
are stricter than live. A first cut of this suite drove the real Payment
Element in Stripe test mode. It worked, but it needed repo secrets, could not
run without network, and stood on behaviour Stripe says not to rely on.

Neither existing mock fits this integration. Stripe's own `stripe-mock` is
stateless by design: it validates requests and returns fixtures, so a Session
never becomes paid and a card can never decline. `localstripe` is stateful and
ships a Stripe.js shim, but it implements PaymentIntents and the legacy Card
Element, not Checkout Sessions or the Checkout Elements SDK
(`initCheckoutElementsSdk`) that the payment step uses.

## Decision

- Browser tests live in the `e2e/` workspace and run **against a local stack**:
  the same `supabase db start` Postgres, a production build of `apps/web`
  served with `next start`, and a fake Stripe. Supabase auth is a placeholder
  URL; no auth container runs.
- **Stripe is faked at the network edge, not inside the app.** A small HTTP
  server in the e2e package stands in for `api.stripe.com` (Checkout Sessions
  create, retrieve and expire; refunds; PaymentIntent retrieval), and the app's
  Stripe SDK is pointed at it through one env var, `STRIPE_API_BASE`, read
  where the client is constructed. In the browser, Playwright serves a shim in
  place of Stripe.js that implements only what `@stripe/react-stripe-js` and
  the payment step call; its `confirm()` asks the fake server for the outcome,
  and the card number decides it the way Stripe's test cards do. The app code
  under test is unchanged apart from the host override.
- **No webhook forwarding.** The suite relies on the sync finalize attempt to
  fulfil paid orders. The webhook handler stays covered at the service layer.
- **Per-test fixtures.** Each test inserts and deletes its own organizer,
  organization, event and ticket types with `e2e-` ids. Assertions are
  absolute (sold is 2, not 2 more), and specs run in parallel against one
  database.
- **Failures keep evidence.** Video and trace are recorded for every test and
  kept only when it fails; the HTML report is uploaded from CI either way.

## Consequences

- **Good:** Deterministic and free, with no Stripe traffic. No secrets, no Stripe rate
  limits, no dependence on Stripe's iframe tolerating automation. A fresh
  runner is a fresh database, with no shared state between PRs. The fake
  records what the app asked Stripe to do, so the paid spec can assert the
  charge amount as well as the database.
- **Trade-off:** The real Payment Element, Stripe.js, and Stripe's API
  behaviour are not exercised in a browser. The fake mirrors the fields the
  app reads and can drift if the integration starts reading more; the
  `packages/api` tests and Stripe's own test mode remain the check on the real
  contract. The deployed runtime (serverless boundaries, Vercel env wiring)
  and the webhook path in a browser are also not covered.
- **Watch:** if `finalizePayment` ever stops fulfilling synchronously, the paid
  specs will need the fake to deliver a `checkout.session.completed` event to
  the webhook route.
