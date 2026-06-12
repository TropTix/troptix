# Plan 016: Design spike — ticket void & refund path (MVP definition)

> **Executor instructions**: This is a **design spike**, not a build plan. The
> deliverable is a written proposal, not merged feature code. Follow the steps,
> honor STOP conditions, and update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 4a435eae..HEAD -- packages/api docs/plans packages/db/prisma/schema.prisma` — the proposal must target the post-cutover model if the checkout cutover has landed.

## Status

- **Priority**: P3
- **Effort**: M (investigation + writing; no production code)
- **Risk**: LOW (read-only spike; the eventual build is MED-HIGH risk, which is exactly why it gets a spike)
- **Depends on**: none to write; the build depends on the checkout-reservation cutover
- **Category**: direction
- **Planned at**: commit `4a435eae`, 2026-06-12
- **Issue**: https://github.com/TropTix/troptix/issues/320

## Why this matters

TropTix has **no refund, void, or cancellation path of any kind**: orders can be created, paid, and scanned — never reversed. Evidence of the gap: no code path sets any refund-like state (the ticket status enum is just `AVAILABLE`/`NOT_AVAILABLE`); the check-in toggle is the only mutation and has no undo; `CheckoutContainer.tsx` carries a TODO ("Cancel the order via the API but for now just let the cron handle it"); and the planned status model in the cutover docs already reserves `REFUNDED`/`CANCELLED` ticket statuses (docs/plans/2026-06-checkout-reservation-rebuild.md, "Ticket statuses → VALID/USED/CANCELLED/REFUNDED"). Every real-world refund request today is a manual founder intervention against the DB and Stripe dashboard — unrecorded in the product, error-prone, and unscalable. This spike defines the smallest safe path and its state machine **before** anyone touches money-reversal code.

## Current state (grounding evidence — verify while investigating)

- Ticket/order state today: `TicketStatus` = `AVAILABLE | NOT_AVAILABLE` (overloaded: unpaid AND scanned), `OrderStatus` = `PENDING | COMPLETED | CANCELLED` — `packages/db/prisma/schema.prisma` enums.
- The target state machine post-cutover (`VALID/USED/CANCELLED/REFUNDED` + `checkinTimestamp`) is already specified in the cutover plan — the refund design must slot into THAT model, not the legacy one.
- Inventory: post-cutover, `sold` is a counter on `TicketTypes`; a void must decide whether to decrement `sold` (returning the seat to sale) — interacts with `reserve()`/`confirm()` semantics in `packages/api/src/services/reservations.ts`.
- Stripe: shared client at `apps/web/src/server/lib/stripe.ts`; refunds would use `stripe.refunds.create({ payment_intent, amount })`; webhook handling for `charge.refunded`/`refund.updated` does not exist.
- Authorization: ADR 0013 — the void/refund service checks the actor owns the event; `isPlatformOwner` override exists.
- Service exemplar: `packages/api/src/services/reservations.ts` (transactional, idempotent, unit+integration tested) — the refund service must meet that bar.

## Scope

**In scope** (deliverable):

- One proposal document: `docs/plans/2026-06-refund-void.md` (front-matter `status: proposed`, repo convention).

**Out of scope**:

- Any production code or schema change.
- Customer-initiated (self-serve) refunds — organizer/founder-initiated only for the MVP; note self-serve as a non-goal with one line of reasoning.

## Steps

### Step 1: Map the full state space

Document the matrix: order kind (FREE / PAID / COMPLEMENTARY) × ticket state (valid / used / pending) × action (void without money movement / refund with money movement / partial: 1 of N tickets). For each cell: allowed? what changes (ticket status, order totals, `sold` counter, Stripe)? Which cells are explicitly out of MVP scope (recommend: refuse voiding USED tickets in MVP; partial refunds of money allowed only per-whole-ticket, never arbitrary amounts).

### Step 2: Define the MVP service contract

`voidTicket(db, { ticketId, actor, reason, refund: boolean })` as a transaction: authorization check → status transition (`VALID → REFUNDED` or `CANCELLED`) → inventory decision (`sold -= 1` yes/no — recommend yes, with the trade-off stated) → audit record → if `refund`, enqueue the Stripe refund (NOT inline in the transaction — mirror the outbox pattern the cutover plan uses for emails). Define idempotency (re-void of a refunded ticket = no-op) and the failure mode when Stripe's refund later fails (status `REFUND_FAILED`? retry? operator alert?). Specify the audit shape (who, when, why, amounts) — recommend a `TicketEvent`/audit table sketch.

### Step 3: Define the surfaces

Web: a "Void / Refund" action on the attendee/order tables (`apps/web/src/app/organizer/events/[eventId]/attendees`, `orders`) with a confirm dialog capturing `reason`. Mobile organizer app: explicitly **out of MVP** (read-only visibility of refunded status only). Emails: refund confirmation to the buyer via the existing Resend path/outbox.

### Step 4: Enumerate operator decisions

(1) Refund the fee portion or ticket price only — platform-fee retention is a business decision with revenue impact; (2) who may refund — event organizer or platform owner only (recommend: platform owner only for MVP, organizers in phase 2 — smaller blast radius); (3) time limits (refundable until event start? after?); (4) whether voided seats return to sale automatically; (5) sequencing — this builds on the cutover's status model, so it cannot start before the cutover lands (state this as a hard dependency).

### Step 5: Write and file the doc

Assemble into `docs/plans/2026-06-refund-void.md`: front-matter, the state matrix, the contract, surfaces, decisions-with-recommendations, a test strategy section (the service needs the same integration-test treatment as `reservations.test.ts` — name the cases: double-refund idempotency, refund-after-expire, partial order), and phased effort (coarse, say so).

## Done criteria

- [ ] `docs/plans/2026-06-refund-void.md` exists with all five sections and valid front-matter
- [ ] The state matrix covers FREE/PAID/COMP × valid/used/pending with explicit MVP in/out per cell
- [ ] Stripe money movement is outbox/async in the design, never inside the DB transaction
- [ ] Hard dependency on the checkout cutover stated unambiguously
- [ ] No production code modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- You find an existing refund implementation or in-flight branch (search for "refund" across apps/ and packages/) — pivot to gap-analysis.
- The cutover plan's status model has changed since `4a435eae` — re-anchor to the live version of docs/plans/2026-06-checkout-reservation-rebuild.md before writing.

## Maintenance notes

- Plan 015 (financials) consumes this design: "net revenue" must subtract refunds; if both spikes are reviewed together the founder makes the fee-retention decision once.
- The event-closure report idea from the audit (scanned vs no-show breakdown after an event ends) is the natural phase-2 consumer of this state model — noted here so it isn't re-discovered from scratch.
