# Plan 015: Design spike — organizer financials/payout dashboard

> **Executor instructions**: This is a **design spike**, not a build plan. The
> deliverable is a written proposal, not merged feature code. Follow the steps,
> honor STOP conditions, and update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 4a435eae..HEAD -- packages/api docs/plans` — if the service-layer cutover landed since planning, read the merged service shapes before proposing new ones.

## Status

- **Priority**: P3
- **Effort**: M (investigation + writing; no production code)
- **Risk**: LOW (read-only spike)
- **Depends on**: none to write; the eventual build depends on the Stage-2/3 service-layer cutover
- **Category**: direction
- **Planned at**: commit `4a435eae`, 2026-06-12
- **Issue**: https://github.com/TropTix/troptix/issues/319

## Why this matters

The marketing site promises organizers "quick payouts" (`apps/web/src/app/_components/cta.tsx:77` — `{ icon: Wallet, label: 'Quick payouts' }`; line 112 repeats it), but the product has **no financial surface at all**: organizers can create paid events and see sales counts/charts, yet cannot see revenue earned, fees deducted, or what's owed to them. For a solo-operated platform, every "how much did I make?" question is a founder escalation. The data already exists (`Orders.total/subtotal/fees` per completed order, plus the new `*Cents` columns from the reservation schema), so a read-only reporting page is disproportionately cheap relative to its trust value. The spike's job: define the queries, the page, and the open money-semantics questions — and get the fee/payout math agreed **before** anyone builds UI on wrong numbers.

## Current state (grounding evidence — verify each while investigating)

- `apps/web/src/app/organizer/_lib/getDashboardData.ts` — the existing dashboard aggregation (sales counts; revenue treatment to be characterized in Step 1).
- `apps/web/src/app/organizer/events/[eventId]/_lib/getEventOverview.ts` — per-event stats.
- `Orders` carry `total`, `subtotal`, `fees` (legacy Floats) and `totalCents/subtotalCents/feesCents` (new, nullable until cutover) — `packages/db/prisma/schema.prisma:145-189`.
- Fee model: 8% + $0.50, with `TicketFeeStructure` deciding ABSORB vs PASS (`packages/api/src/services/_shared/fees.ts` — the canonical new calculator; the legacy `apps/web/src/lib/fees.ts` still applies a tax-on-fee and diverges — a known Stage-3 item that **directly affects** what "organizer net revenue" means).
- Stripe is the money source of truth; there is no Stripe Connect — payouts to organizers happen outside the product today (the spike must document how, by asking the operator).
- New-pattern exemplar for any service you propose: `packages/api/src/services/checkout.ts` + its router `packages/api/src/trpc/routers/checkout.ts` (pure `(db, input) => result` functions, zod contracts in `packages/api/src/contracts`, authorization in the service per ADR 0013).

## Scope

**In scope** (deliverable):

- One proposal document: `docs/plans/2026-06-organizer-financials.md` with front-matter `status: proposed` (this repo's convention for substantial initiatives — see CLAUDE.md; plans/ is the advisor workspace, docs/plans/ is the durable home).

**Out of scope**:

- Any production code, schema change, or new dependency.
- Stripe Connect onboarding/automated payouts (document as a later phase only).

## Steps

### Step 1: Characterize today's money math

Read `getDashboardData.ts`, `getEventOverview.ts`, and both fee calculators. Write down, with file:line citations: what "revenue" currently means on each existing surface (gross? net of fees? which fee formula?), and where the numbers would disagree between legacy and new calculators.

### Step 2: Define the service contracts

Propose (as TypeScript signatures + zod contract sketches, in the doc — not in code):

- `getOrganizerFinancials(db, { organizerUserId, from, to })` → totals: gross, fees retained by platform, net to organizer, refunds placeholder (0 until a refund path exists — cross-reference plan 016), per-event breakdown rows.
- `getEventFinancials(db, { eventId, actor })` → same per single event, per ticket-type.
- State explicitly: cents-only arithmetic (use the `*Cents` columns; define the fallback for legacy Float-only rows — e.g. `Math.round(total * 100)` — and flag its rounding risk).
- Authorization per ADR 0013: the service checks the actor owns the events (or is platform owner) — cite `accessControl.ts` semantics.

### Step 3: Define the UI surface

One new route `/organizer/financials` (plus a per-event "Financials" tab as phase 2). Sketch in prose: summary cards (gross / fees / net, date-range picker), per-event table, CSV export (organizers will ask; it's cheap server-side). Reuse: `TicketSalesChart`'s Card patterns, the existing data-table component. Light-only, indigo brand (ADR 0002/0003).

### Step 4: Enumerate the open questions for the operator

At minimum: (1) How do payouts actually happen today (manual bank transfer? when?) — the page must reflect reality, not invent a schedule; (2) should "net" deduct Stripe's own processing fee (visible only via Stripe API/Balance, not in the DB) or only the platform fee — this changes the architecture (DB-only vs Stripe-API-backed reporting); (3) does the founder want this before or after the checkout cutover (the cutover changes which columns are trustworthy); (4) refunds interplay with plan 016.

### Step 5: Write and file the doc

Assemble Steps 1–4 into `docs/plans/2026-06-organizer-financials.md` with the repo's plan front-matter (`title`, `status: proposed`, `created`, `tracking-issue: TBD`), an explicit "Phase 1: DB-only reporting / Phase 2: Stripe-reconciled / Phase 3: Stripe Connect payouts" ladder, and a coarse effort estimate per phase (state that estimates are coarse).

## Done criteria

- [ ] `docs/plans/2026-06-organizer-financials.md` exists with valid front-matter and all five sections
- [ ] Every factual claim in it carries a file:line citation you verified
- [ ] Open questions are framed as decisions with options + a recommendation each, not vague prompts
- [ ] No production code modified (`git status` shows only the new doc + the index row)
- [ ] `plans/README.md` status row updated

## STOP conditions

- A financials/payout surface already exists somewhere you find during Step 1 (search `apps/web/src/app/organizer` for "revenue", "payout", "financial") — pivot the doc to gap-analysis of it instead, and say so.
- You cannot determine what the legacy `fees` column actually contains for historical orders (absorbed vs passed) — record it as the first open question; do NOT guess in the contract design.

## Maintenance notes

- The proposal intentionally lands as `proposed` — per repo workflow it then gets a `Plan:` review PR and an umbrella issue before any build starts.
- If plan 016's refund spike lands first, its status-model decisions (REFUNDED tickets) feed straight into the net-revenue definition here.
