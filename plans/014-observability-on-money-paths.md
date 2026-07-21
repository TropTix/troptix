# Plan 014: Add structured, alertable observability to the checkout money paths

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`, and post a short progress comment on the
> tracking issue (#459) when you start and finish.
>
> **Drift check (run first)**: `git diff --stat abab1702..HEAD -- packages/api/src/services/payments.ts apps/web/src/app/api/stripe/reservation-webhook/route.ts apps/web/src/server/lib/email.ts`
> If any changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt / observability
- **Planned at**: commit `abab1702`, 2026-07-18
- **Issue**: https://github.com/TropTix/troptix/issues/459

## Why this matters

This is a live revenue system, and its most consequential branches are currently
invisible. The auto-refund on the paid-after-expiry race (`confirmPaid` →
`needs_refund` → `stripe.refunds.create`), a webhook handler failure, and a
failed confirmation/refund email are all handled with `console.error` /
`console.warn` only — no structured event, no metric, no alert. If a refund
silently failed, a webhook consistently 500'd, or the oversell backstop fired in
production, nobody would know without grepping function logs. The `needs_refund`
branch moves real money and is exactly what you want paged on. This plan adds a
single structured logging seam and emits alertable events at each money-path
branch. It does **not** build new infrastructure (the durable outbox is a
separate initiative) — it makes the existing branches observable.

## Current state

- The money-path branches that are log-only today:
  - `packages/api/src/services/payments.ts:217-225` — `confirmPaid` performs the
    auto-refund on `needs_refund` and updates the reservation to `REFUNDED`. No
    structured event; the caller's outcome is a plain return value.
  - `apps/web/src/app/api/stripe/reservation-webhook/route.ts:39` — signature
    verification failure (`console.error`).
  - `.../reservation-webhook/route.ts:54-61` — handler error → 500 (Stripe
    retries); `console.error` only.
  - `.../reservation-webhook/route.ts:93-96` — completed Session with no
    `payment_intent` (`console.error`).
  - `.../reservation-webhook/route.ts:108-113` — confirmation email failed
    (non-fatal `console.error`).
  - `.../reservation-webhook/route.ts:131-133` — unexpected async-payment event
    (`console.warn`).
  - `apps/web/src/server/lib/email.ts` — refund-notice / confirmation email
    failures (locate `console.error` calls:
    `grep -n "console\." apps/web/src/server/lib/email.ts`).
- `OutboxMessage` / `OutboxStatus` exist in `packages/db/prisma/schema.prisma`
  but have **zero code references** (`grep -rni "outbox" packages/api/src apps/web/src`
  → none). Emails are fired inline post-commit. Wiring the outbox is a _separate_
  plan (`docs/plans/2026-06-transactional-email-outbox.md`) — **out of scope
  here**.
- Observability stack available: the repo uses **PostHog** (there is a PostHog
  project; `grep -rn "posthog" apps/web/src` to find the client) and Vercel
  function logs. Determine what server-side logging/telemetry already exists
  before adding a new dependency — prefer reusing what's here (Step 1).

## Design decision (do this, don't improvise)

1. Add **one small server-side structured-log helper** (e.g.
   `apps/web/src/server/lib/observability.ts` exporting
   `logMoneyEvent(event: string, data: Record<string, unknown>)`), that emits a
   single structured JSON line (and, if a server-side telemetry client already
   exists in the repo, forwards to it). Keep it dependency-light: a structured
   `console.error/​warn/info` with a stable `event` field and no PII beyond ids
   and amounts is acceptable and alertable in Vercel/log drains. Do **not** add a
   new SaaS/logging dependency in this plan.
2. Call it at each money-path branch with a **stable event name** and structured
   context (reservation id, order id, amount in cents, stripe ids) — never buyer
   email/name (see Hard Rule on PII). Events to emit:
   - `checkout.auto_refund` — on the `needs_refund` refund in `confirmPaid`
     (this is the alert-worthy one).
   - `checkout.webhook.signature_failed`
   - `checkout.webhook.handler_error`
   - `checkout.webhook.completed_without_payment_intent`
   - `checkout.email.confirmation_failed`
   - `checkout.email.refund_notice_failed`
3. Because `confirmPaid` lives in the Stripe-free-adjacent `payments.ts` service
   (which is injected/framework-agnostic), do **not** import a Next.js/web logger
   into the service. Instead, have `confirmPaid` **return** enough for the caller
   (the webhook route and the `getCheckoutState` sync path) to emit the event, OR
   accept an optional `onEvent` callback in the service. Prefer the return-value
   approach: `confirmPaid` already returns a `CheckoutState`; add a discriminated
   signal (e.g. include `refunded: true` context) the route can log. Keep the
   service pure — the log call happens in the web layer.

## Commands you will need

| Purpose                        | Command                                                         | Expected on success            |
| ------------------------------ | --------------------------------------------------------------- | ------------------------------ |
| Find existing server telemetry | `grep -rn "posthog\|logger\|pino\|winston" apps/web/src/server` | shows what's already available |
| API tests                      | `yarn workspace @troptix/api test`                              | all pass                       |
| Web tests                      | `yarn test`                                                     | all pass                       |
| Typecheck                      | `yarn typecheck`                                                | exit 0                         |

## Scope

**In scope**:

- New `apps/web/src/server/lib/observability.ts` (the log helper)
- `apps/web/src/app/api/stripe/reservation-webhook/route.ts` (emit events at the
  branches above)
- `apps/web/src/server/lib/email.ts` (emit email-failure events)
- `packages/api/src/services/payments.ts` — _only_ if you choose to surface the
  auto-refund via a return-value signal for the caller to log (keep it pure; no
  web imports)
- Tests for the webhook route branches (co-located per `apps/web` conventions)

**Out of scope** (do NOT touch):

- Wiring the `OutboxMessage` table / durable email delivery — separate plan.
- Adding a new logging/telemetry SaaS dependency.
- Changing any money _logic_ — this plan only observes. The refund, settle, and
  sweep behavior must be byte-for-byte unchanged.
- Emitting any buyer PII (email/name) into logs/events.

## Git workflow

- Branch: `advisor/014-money-path-observability`
- Commit per logical unit; Conventional Commits, e.g.
  `feat(observability): structured events on checkout money paths`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Inventory existing telemetry, then add the helper

Run the telemetry grep. If a server-side logger/telemetry client already exists,
have `observability.ts` delegate to it; otherwise emit a structured
`console.{info,warn,error}` with a stable shape `{ event, ...context }`. Keep the
helper tiny and synchronous (fire-and-forget; never throw).

**Verify**: `yarn workspace web typecheck` → exit 0.

### Step 2: Emit at the webhook branches

Add `logMoneyEvent(...)` calls at each enumerated branch in the webhook route,
replacing or augmenting the `console.*` calls with the stable event names and
structured context (ids + amounts only). Keep the existing control flow and
status codes exactly.

**Verify**: `yarn workspace web typecheck` → exit 0.

### Step 3: Emit the auto-refund event

Surface the `needs_refund` auto-refund as `checkout.auto_refund` with the
reservation id, payment-intent id, refund id, and amount. Do this at the **web
layer** (webhook route / the sync-fulfillment caller), not inside the pure
service — see the design decision. If you add a return-value signal to
`confirmPaid`, keep its `CheckoutState` contract backward-compatible (extend, do
not break).

**Verify**: `yarn workspace @troptix/api test` → all pass (service behavior
unchanged); `yarn workspace web typecheck` → exit 0.

### Step 4: Emit email-failure events

In `email.ts`, at each send-failure catch, emit `checkout.email.*_failed` with
the order/reservation id (no address).

**Verify**: `yarn test` → web suite passes.

### Step 5: Test the webhook branches (pairs with plan 012/TEST-02 gap)

Add a webhook-route test (mock `stripe.webhooks.constructEvent`, fake `prisma`,
stub email + `logMoneyEvent`) asserting the right event is emitted for: signature
failure, handler error, and the refunded fork. This closes part of the
untested-webhook gap.

**Verify**: `yarn test` → new webhook tests pass.

## Test plan

- New webhook-route tests assert `logMoneyEvent` is called with the expected
  `event` name for signature-failure, handler-error, and the refunded branch.
  Mock the logger to capture calls. Model after any existing `apps/web` route
  test (`grep -rl "constructEvent\|route" apps/web/src --include=*.test.ts`); if
  none exists for routes, create the first one following the org/attendee action
  tests' mocking style.
- Verification: `yarn test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `apps/web/src/server/lib/observability.ts` exists and is used at every
      enumerated branch (`grep -rn "logMoneyEvent" apps/web/src`)
- [ ] `checkout.auto_refund` is emitted on the `needs_refund` path
- [ ] No buyer email/name appears in any emitted event (grep the new call sites)
- [ ] Money logic unchanged: `yarn workspace @troptix/api test` exits 0 with no
      edits to refund/settle/sweep _behavior_
- [ ] New webhook-route tests pass under `yarn test`
- [ ] `yarn typecheck` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Making the auto-refund observable would require importing web/Next code into
  the pure `payments.ts` service — use the return-value/callback seam instead; if
  that's not clean, report.
- You discover an existing telemetry client whose API you're unsure about — ask
  rather than guessing its call shape.
- Emitting an event would require logging buyer PII to be useful — stop; ids and
  amounts must suffice.

## Maintenance notes

- Alerts should be configured (outside the codebase) on `checkout.auto_refund`
  and a rate of `checkout.webhook.handler_error` — mention this in the PR so ops
  wires the alert.
- This overlaps the transactional-email-outbox plan
  (`docs/plans/2026-06-transactional-email-outbox.md`): once the outbox is wired,
  email-failure observability moves to the outbox drain. Keep the event names
  stable so dashboards survive that change.
- A reviewer should scrutinize that no control flow or status code changed — this
  is an additive, observe-only change.
