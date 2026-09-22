# 29. Browser end-to-end tests run hermetically, with real Stripe test mode and no webhook

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

We want confidence that the buyer flow works in a real browser: events load,
tickets load with the right prices and states, free and paid checkout complete,
a declined card is handled. Unit and service tests cover the pieces; nothing
proved the whole path end to end, and a prior attempt (PR #517) targeted Vercel
preview deploys and was never run.

Three facts about the app decide the shape:

- Nothing in the buyer flow signs in. Every checkout procedure is public; the
  reservation id is the credential.
- The success screen does not depend on the Stripe webhook. After Stripe
  redirects back, the page polls `checkout.getCheckoutState`, which retrieves
  the Session and fulfils the order itself. The webhook and the poll converge
  on one idempotent settle.
- The `packages/api` integration tests already run in CI against a local
  Postgres started with `supabase db start`.

## Decision

- Browser tests live in the `e2e/` workspace and run **against a local stack**:
  the same `supabase db start` Postgres, a production build of `apps/web`
  served with `next start`, and Stripe **test mode** reached over the network.
  Supabase auth is a placeholder URL; no auth container runs.
- **No webhook forwarding.** The suite relies on the poll path to fulfil paid
  orders. The webhook handler stays covered at the service layer.
- **Per-test fixtures.** Each test inserts and deletes its own organizer,
  organization, event and ticket types with `e2e-` ids. Assertions are
  absolute and specs run in parallel. The seeded demo events serve only the
  discover-page test, and their dates are now relative so they never go stale.
- **Every test is recorded**, with actions and the test title stamped on the
  frames. The HTML report embeds each video and trace; a stitched
  `proof.mp4` of the whole run is the artifact a reviewer watches. CI uploads
  both.
- Preview deploys are **not** the PR gate. Running against previews stays an
  option for a later production smoke, not for this suite.

## Consequences

- **Good:** Deterministic and free. A fresh runner is a fresh database, no
  branch-hours, no shared state between PRs, no dependence on the Vercel or
  Supabase integrations being healthy. The Stripe iframe is filled like any
  other input; the poll removes the hardest part of paid-checkout testing.
- **Trade-off:** The suite does not exercise the deployed runtime (serverless
  boundaries, Vercel env wiring) or the webhook path in a browser. Both stay
  covered elsewhere or are accepted gaps.
- **Trade-off:** Stripe test mode is a real network dependency and the one
  place a flake can come from. Paid specs are few and skip themselves when
  the keys are absent, so the job never blocks on a missing secret.
- **Bad:** A test-mode PaymentIntent is created per paid run and accumulates
  in Stripe test data. It is identifiable by its Session metadata (`eventId`
  starts with `e2e-event-`) and wiped by hand.
