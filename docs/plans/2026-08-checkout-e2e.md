---
title: Checkout E2E tests
status: active
created: 2026-08-02
tracking-issue: TBD
---

# Checkout E2E tests

Every PR must prove the money path still works before merge: the event page
loads, tickets show, a buyer can select them, and a paid checkout charges the
card and records the order. This plan adds a Playwright suite that runs that
flow in a real browser against each PR's Vercel preview deploy.

## Decision

**Playwright against the Vercel preview**, triggered by `deployment_status`,
asserting the result directly in the PR's Supabase preview-branch database.

Why this shape:

- The preview deploy is the real runtime — serverless boundaries, env wiring,
  the Supabase↔Vercel integration. A hermetic local build cannot catch the
  "works locally, breaks deployed" class.
- The suite tests against whatever database the preview actually uses. Only
  schema-change PRs get their own Supabase preview branch; every other
  preview points at the persistent dev branch. No branch is ever created just
  for the tests — that would cost branch-hours and, worse, assert against a
  different database than the deployed app reads.
- Payment confirmation does not depend on webhook delivery: after Stripe
  redirects back, the client polls `checkout.getCheckoutState`, which retrieves
  the Session and fulfills inline (`packages/api/src/services/payments.ts`).
  So the suite needs no webhook forwarding to ephemeral URLs — the hardest
  part of preview-based payment testing does not apply here.

Alternatives considered:

- **Hermetic local E2E in CI** (`supabase db start` + `next start`): free and
  fast, but tests a runtime nobody deploys. Kept as the local dev loop — the
  same suite runs against `next dev` via Playwright's `webServer`.
- **API-level only**: `packages/api` already covers reservation/settle logic
  against real Postgres with a fake Stripe. It cannot verify the browser half
  (page render, Payment Element mounts, redirect resume). It stays the deep
  layer; the browser suite stays thin on top.
- **stripe-mock**: stateless, cannot prove a charge was recorded. Rejected.
- **Synthetic monitoring** (Checkly or Actions cron reusing this suite against
  production): complement, not substitute. Future work.

## What the suite covers

| #   | Requirement                     | Spec                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Event page loads                | `event-page.spec.ts` — a per-test paid event renders name and CTA                                                                                                                                                                                                                                                       |
| 2   | Tickets visible                 | ticket type names, prices, fee labels; edge states (sold out, on sale soon, gated hidden) on a per-test edge event                                                                                                                                                                                                      |
| 3   | Tickets selectable              | stepper add/remove, `maxPurchasePerUser` clamp, running total                                                                                                                                                                                                                                                           |
| 4   | Paid checkout charges + records | `paid-checkout.spec.ts` — 2× GA with card `4242…`, survive the redirect, then assert in the DB: one COMPLETED/PAID order with correct cents, N VALID tickets, reservation CONVERTED, `sold` up by N, `reserved` back to baseline; then retrieve the PaymentIntent from Stripe and assert `succeeded`, amount, test mode |
|     | Free checkout                   | `free-checkout.spec.ts` — RSVP completes inline, FREE order, no Stripe id                                                                                                                                                                                                                                               |

The webhook path (`checkout.session.completed`) is intentionally not driven
from the browser — the poll wins the race. It is covered at the API layer
(idempotent `settle` under row lock); a signed-event replay test there is
follow-up work, not part of this suite.

## How it runs

- **Workspace**: `e2e/` (yarn workspace `@troptix/e2e`). Playwright +
  `pg` for DB assertions (raw SQL, no Prisma generate step) + plain `fetch`
  against the Stripe API for charge verification.
- **Locally**: `yarn workspace @troptix/e2e test` boots `next dev` on port
  3210 against the local Supabase stack (`supabase db start` first). Stripe
  test keys come from `apps/web/.env`.
- **CI**: `.github/workflows/e2e.yml` on `deployment_status` success for the
  Preview environment. It checks out the deployed SHA, resolves the database
  with `supabase branches get … -o env` — the PR's preview branch if one
  exists, else the persistent dev branch — and runs the suite against
  `github.event.deployment_status.environment_url`.
- **Fixture**: every test creates its own event. A Playwright fixture
  (`e2e/lib/testEvent.ts`) inserts a uniquely-id'd `Users → Organization →
Event → TicketTypes` chain — the same shape and delete order as
  `packages/api/src/services/payments.test.ts` — and removes it in teardown,
  which runs on failure too. Global setup sweeps `e2e-` rows older than a day
  in case a run died before its teardown. Nothing accumulates on the shared
  dev DB, assertions are absolute (`sold === 2`, not a delta), and concurrent
  PRs cannot race each other. The suite does not depend on `seed.sql` — that
  file stays as the reviewer-facing demo fixture for preview branches.
- One worker within a run (specs are few and fast); across runs, concurrency
  collapses same-SHA reruns only, since per-test events make parallel runs
  safe.

## Setup required (GitHub repo secrets)

| Secret                  | Purpose                                             |
| ----------------------- | --------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | resolve the preview branch DB URL                   |
| `SUPABASE_PROJECT_REF`  | same                                                |
| `E2E_STRIPE_SECRET_KEY` | test-mode key; verify the PaymentIntent server-side |

Deployment Protection is off for previews (checked 2026-08-05), so no bypass
secret is needed; the workflow still honors `VERCEL_AUTOMATION_BYPASS_SECRET`
if protection is ever turned on.

Stripe: one shared test key across dev, previews, and CI (decided 2026-08-05
— the separation a dedicated sandbox buys isn't worth previews diverging from
dev for a one-person team). Test PaymentIntents are identifiable by their
`e2e-` reservation metadata. Stripe's docs warn that its hosted surfaces
resist automation; the embedded Payment Element on our own domain works with
`frameLocator`, but treat it as the suite's flake budget and keep the paid
spec singular.

Test-run side effects, decided 2026-08-05:

- Order emails go to `delivered@resend.dev` (Resend's test inbox) so runs
  never hard-bounce and hurt sender reputation.
- The suite blocks PostHog ingestion (`/ingest` proxy + direct host) so E2E
  runs stay out of the checkout funnel; server-side events still leak and
  that is accepted for now.
- Test Events are published and may appear on dev's discover page for the
  ~minute they exist. Accepted — dev has no real audience, and test-aware
  product queries would be worse.

## Rollout

1. Land the suite with the check **not required**.
2. Promote `checkout-e2e` to a required check after a couple of clean runs on
   real PRs (decided 2026-08-05 — no formal burn-in window).
3. Committed direction, not scheduled: a post-deploy smoke against production
   and Vercel Deployment Checks (hold prod aliasing until checks pass). Both
   need the synthetic-monitoring design (test-mode toggle or
   charge-and-refund) before they can exist.
4. Other follow-ups: signed-webhook replay test in `packages/api`; gated
   ticket type unlock spec; 3DS card variant.

Known limits accepted for v1: the check only fires when Vercel reports a
deployment (a failed build means no E2E check); test orders accumulate in
Stripe test data and are periodically wiped by hand.
