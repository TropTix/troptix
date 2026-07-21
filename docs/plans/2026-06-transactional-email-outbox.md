---
title: Transactional Email Outbox + Supabase-Cron Dispatcher
status: proposed
created: 2026-06-26
tracking-issue: TBD
---

# Async Email System — Transactional Outbox + Supabase Cron

> **Sequencing:** implementation is **deferred** until the new reservation
> **paid** checkout flow is wired (see "Sequencing" below). This doc is the spec;
> no code has landed yet.

## Context

Today the only email we send is the **order confirmation**, and it goes out
**inline in the request path**. There are two checkout systems live at once
(mid-migration), and they email differently:

| Path            | Status                                   | Completes an order via                                                                                     | Emails today                                              |
| --------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Legacy paid** | Live (current event pages)               | `pages/api/stripe/webhook.ts` → `orderHelper` (updates the order directly — _not_ the reservation service) | inline `sendEmailConfirmationEmailToUser`                 |
| **Legacy free** | Live                                     | `app/api/checkout/initiate/route.ts` inline txn                                                            | inline send                                               |
| **New free**    | Live on new `/e/[eventId]` page          | tRPC `completeFree()` → `materializeOrder`                                                                 | client fire-and-forgets `POST /api/checkout/confirmation` |
| **New paid**    | **NOT wired** (WIP — no Stripe in `/e/`) | `confirm()` exists but has **no caller**                                                                   | —                                                         |

Problems with inline send: a slow/down Resend delays the response; a failed send
is only logged with **no retry** (the confirmation is silently dropped); and
there's no separation between this transactional email and future email types.

The fix's foundation already exists but is **unused**: an `OutboxMessage` table
(`packages/db/prisma/schema.prisma:340` — `type, payload, status` PENDING/SENT/
FAILED, `attempts, lastError, processedAt`) whose own comment states the intent —
"written in the same transaction as confirm_reservation and dispatched after
commit." `confirm()` and `completeFree()` both run inside a `prisma.$transaction`
and funnel through one shared `materializeOrder()`
(`packages/api/src/services/reservations.ts:296`). Roadmap **4.4** asks for exactly
this: "a database-backed email queue … decouples email delivery from checkout …
enables automatic retries."

**Outcome:** order-confirmation emails are enqueued atomically with the order on
the **new reservation path**, dispatched out of band by a Supabase cron job with
retries, and never block or break checkout. The legacy paths keep their inline
sends untouched until the legacy system is retired.

## Sequencing (why this is deferred)

**Implement the outbox only after the new reservation _paid_ flow is wired.**
Right now `materializeOrder` is reached live only by `completeFree` (free
tickets). Wiring the outbox first would exercise the tracer bullet against free
orders alone — and on the free path the user already sees their tickets on the
success screen, so the email barely matters. Once the new paid flow runs through
`confirm()` → `materializeOrder`, a single enqueue in `materializeOrder` covers
**both** free and paid on the new path, and the tracer bullet lands on the case
that actually matters (paid receipts). So: **paid checkout flow first, outbox
second.**

## The decision (the "why")

### Transactional outbox, not a dedicated queue

The core issue is the **dual-write problem**: "commit the order" and "send the
email" are two systems; a crash between them drops a confirmation or sends one for
an order that didn't persist. The outbox makes the **database the single source of
truth** — we `INSERT` an `OutboxMessage` _inside the same transaction_ that
materializes the order, so both commit or neither. A separate dispatcher delivers
it later, which gives retries for free.

A real queue (BullMQ/Redis, SQS, Inngest, QStash) is the wrong first move: no
always-on worker on Vercel serverless; an external queue _reintroduces_ the
dual-write problem unless you also keep an outbox; and Postgres `FOR UPDATE SKIP
LOCKED` is a competent queue well past our <50 orders/hr.

**Guiding principle: the outbox is permanent; the dispatcher is swappable.** Start
with "Supabase cron drains the outbox table." If we ever need more throughput /
lower latency / fan-out, the _dispatcher_ becomes an outbox-relay to pgmq / QStash
/ Inngest — the enqueue (the transactional `INSERT`) never changes.

### Cron-only delivery (no low-latency "kick")

Delivery is a single path: **Supabase Cron** (`pg_cron` + `pg_net`) POSTs a secured
Next.js dispatch endpoint every minute. We deliberately **drop** the
`after()`/`waitUntil` "instant email" kick: on the new path the buyer already sees
their tickets on-screen at success, so sub-minute email latency buys nothing, and
cron-only means **one** dispatch caller and far simpler concurrency. (The kick
stays a documented Phase-2 option if paid receipts ever need to feel instant.)

### Resend constraints that shape the dispatcher

Verified against current Resend docs (2026):

- **Batch endpoint can't carry attachments** (`attachments`/`scheduled_at`
  unsupported). Our confirmation email attaches an `.ics` calendar invite, so we
  **send one-by-one** via `resend.emails.send` (attachments + idempotency
  supported), not the batch API.
- **Rate limit: 5 req/s per team** (raisable). Sequential processing of a small
  batch stays well under it (each attachment send is >200ms).
- **Pricing:** free = 100/day + 3,000/month; Pro = $20/mo → 50,000/month. At ~50
  orders/hr peak (≈1,200/day) we exceed the free daily cap — so this assumes a
  paid Resend plan (already sending confirmations in prod, so presumed yes).

### Auth emails are already isolated — nothing to build

Supabase Auth OTP / magic-link emails are sent by **Supabase's own email infra**,
outside our outbox and outside our Resend account (different sender, quota,
system). They **cannot** block, delay, or rate-limit order-confirmation emails.
The within-our-system version (a future marketing blast starving transactional
mail) is deferred — the `type` column already supports prioritizing later.

## Locked decisions (from design review)

1. **Scope:** new reservation path only. Legacy webhook + initiate inline sends
   untouched.
2. **Delivery:** cron-only (Supabase `pg_cron` + `pg_net`, every 1 min). No
   `after()` kick.
3. **Concurrency:** claim with `FOR UPDATE SKIP LOCKED` (the pattern already in
   `reserve()`), with Resend `idempotencyKey: confirmation-${orderId}` as the
   backstop. Reliable `attempts`/retry accounting is the whole point of the
   outbox, so we don't lean on Resend idempotency alone.
4. **Retry/dead-letter:** `MAX_ATTEMPTS = 5`, then `status = FAILED`. **No backoff
   column** — failed rows stay `PENDING` and the 1-min cron retries (~5 linear
   tries over ~5 min). `nextAttemptAt` backoff is a Phase-2 add.
5. **Don't hold a DB txn open during the Resend HTTP call.** Claim the batch in a
   short txn (lock, `attempts++`, commit), then send outside any txn. A row
   claimed already at `attempts >= MAX` is marked FAILED instead of sent (also
   rescues rows orphaned by a mid-send crash).
6. **Payload:** minimal `{ orderId }`; dispatcher re-fetches + rebuilds the email
   (incl. `.ics`) at send time.
7. **Dispatcher location:** `apps/web/src/server/lib/outbox.ts` (transport in
   `apps/web` per ADR 0017; enqueue helper stays framework-agnostic in
   `packages/api`).
8. **Observability:** `console.error(orderId, lastError)` on dead-letter (Vercel
   logs). No alerting in the tracer bullet.
9. **Retention:** none now; a "delete SENT older than N days" prune job is a
   trivial later add (mirrors the `expire-reservations` cron shape).

## Implementation (tracer bullet — runs AFTER the paid flow)

1. **Enqueue helper** — `enqueueOutbox(tx, { type, payload })` in
   `packages/api/src/services/_shared/outbox.ts` (framework-agnostic; uses
   `tx.outboxMessage.create`, `generateId()`, `OutboxStatus.PENDING`). Define
   `OUTBOX_TYPES.ORDER_CONFIRMATION = 'order_confirmation'`.
2. **Enqueue in `materializeOrder`** — one call inside the existing txn:
   `enqueueOutbox(tx, { type: ORDER_CONFIRMATION, payload: { orderId } })`.
   Covers both `confirm()` (paid) and `completeFree()` (free) on the new path.
3. **Refactor `apps/web/src/server/lib/email.ts`** — extract
   `sendOrderConfirmation(orderId)` that **throws** on failure (missing order/
   email or Resend error), keeping `sendEmail`'s idempotency key. Keep
   `sendEmailConfirmationEmailToUser` as a thin try/catch wrapper so the _legacy_
   webhook/initiate callers keep their fire-and-forget semantics.
4. **Dispatcher** — `apps/web/src/server/lib/outbox.ts`: `dispatchOutbox()` claims
   a batch (`WITH claimed AS (SELECT id … WHERE status='PENDING' ORDER BY
createdAt LIMIT n FOR UPDATE SKIP LOCKED) UPDATE … SET attempts=attempts+1 …
RETURNING`), then per row: if `attempts > MAX` → FAILED; else dispatch by a
   `type → handler` registry (`order_confirmation → sendOrderConfirmation`),
   success → `SENT, processedAt`, failure → `lastError` (+ FAILED at MAX).
5. **Dispatch endpoint** — `apps/web/src/app/api/cron/dispatch-outbox/route.ts`
   (modeled on `expire-reservations`): `Authorization: Bearer ${CRON_SECRET}` guard,
   then `dispatchOutbox()`.
6. **Supabase cron migration** — `supabase/migrations/<ts>_email_outbox_cron.sql`:
   `create extension if not exists pg_cron/pg_net`; `cron.schedule('dispatch-
outbox', '* * * * *', …)` doing `net.http_post` to the endpoint with the bearer
   header. URL + secret read from **Supabase Vault**, not hardcoded; setup
   documented in the migration header. Guard with `cron.unschedule` for re-runs.
7. **Repoint the new path** — delete the now-orphaned
   `app/api/checkout/confirmation/route.ts` and remove the
   `fetch('/api/checkout/confirmation')` call in
   `app/e/[eventId]/_components/CheckoutSheet.tsx`; the outbox + cron now own
   delivery.
8. **ADR** — `docs/adr/0018-transactional-email-outbox.md` capturing the
   outbox-vs-queue decision, cron-only choice, Resend attachment/batch constraint,
   "auth emails are separate," and the upgrade ladder.

### Files at a glance

| File                                                         | Change                                        |
| ------------------------------------------------------------ | --------------------------------------------- |
| `packages/api/src/services/_shared/outbox.ts`                | **new** — `enqueueOutbox` + `OUTBOX_TYPES`    |
| `packages/api/src/services/reservations.ts`                  | enqueue inside `materializeOrder`             |
| `apps/web/src/server/lib/email.ts`                           | extract throwing `sendOrderConfirmation`      |
| `apps/web/src/server/lib/outbox.ts`                          | **new** — `dispatchOutbox` + handler registry |
| `apps/web/src/app/api/cron/dispatch-outbox/route.ts`         | **new** — secured drain endpoint              |
| `apps/web/src/app/api/checkout/confirmation/route.ts`        | **delete** (orphaned)                         |
| `apps/web/src/app/e/[eventId]/_components/CheckoutSheet.tsx` | remove client confirmation `fetch`            |
| `supabase/migrations/<ts>_email_outbox_cron.sql`             | **new** — `pg_cron` + `pg_net` job            |
| `docs/adr/0018-transactional-email-outbox.md`                | **new** ADR                                   |

_Legacy `pages/api/stripe/webhook.ts` and `app/api/checkout/initiate/route.ts`
inline sends are intentionally **untouched**._

## Future work (NOT in this tracer bullet)

- **Priority/fairness:** `priority` (or a type→rank ORDER BY) so transactional
  drains before bulk; prevents a marketing blast starving confirmations.
- **Backoff:** `nextAttemptAt DateTime?` + exponential backoff — protects a down
  provider from retry storms.
- **Provider isolation:** separate Resend keys (transactional vs broadcast) so
  marketing volume can't exhaust the transactional rate limit / reputation.
- **Retention prune** and **dead-letter alerting**.
- **Latency kick** (`after()`) if paid receipts ever need to feel instant.
- **Throughput upgrade:** swap the dispatcher for an outbox-relay to **pgmq** or
  QStash/Inngest — the transactional `INSERT` is unchanged.

## Verification

1. **Service tests** (`reservations.test.ts`, real Postgres): `confirm()` and
   `completeFree()` each write exactly one `PENDING` `order_confirmation` row with
   the right `orderId`; a rolled-back txn writes none.
2. **Dispatcher:** seed a `PENDING` row; `POST /api/cron/dispatch-outbox` with the
   secret → email sends, row → `SENT` + `processedAt`; re-POST → no resend
   (idempotency + status). Force a Resend failure → `attempts++`, `lastError` set,
   stays `PENDING`; after `MAX` → `FAILED`.
3. **Auth:** wrong/missing secret → 401, no rows touched.
4. **End-to-end:** new-path paid + free checkout → order commits, row enqueued in
   the same txn, email arrives within one cron tick.
5. **Cron wiring (staging):** `pg_cron` job present in `cron.job`;
   `net._http_response` shows 2xx each minute.

## Sources (current docs)

- Next.js `after`: https://nextjs.org/docs/app/api-reference/functions/after
- Vercel Fluid compute pricing: https://vercel.com/docs/functions/usage-and-pricing
- Supabase Cron (pg_cron + pg_net): https://supabase.com/docs/guides/cron
- pg_net: https://supabase.com/docs/guides/database/extensions/pg_net
- Resend batch limits (no attachments): https://resend.com/docs/api-reference/emails/send-batch-emails
- Resend pricing: https://resend.com/pricing
