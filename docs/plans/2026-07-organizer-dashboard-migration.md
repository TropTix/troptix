---
title: Organizer Dashboard on the Service Layer
status: proposed
created: 2026-07-01
tracking-issue: TBD
---

# Organizer Dashboard on the Service Layer

Migrate the web organizer surface (`apps/web/src/app/organizer/**`) onto the platform's new
primitives: **`@troptix/api` services + contracts** (ADR [0013](../adr/0013-authorization-in-the-service-layer.md),
[api-service-layer plan](2026-06-api-service-layer.md)) and the **reservation-era schema columns**
(`capacity`/`reserved`/`sold`, `priceCents`, `startsAt`/`endsAt`, `saleStartsAt`/`saleEndsAt`) that
the new checkout already reads. The public event surface is the finished exemplar of this
architecture — `packages/api/src/services/events.ts` + `contracts/events.ts` consumed by
`/discover` and `/e/[eventId]` — the organizer dashboard is the last major surface still on the
legacy pattern.

This plan consolidates and supersedes advisor plans `plans/004` (financials/queries), `005`
(service cutover), `006` (formatters/status), and `007` (ticket-form merge) from the 2026-07-01
organizer audit. The audit's security fixes (`plans/001–003`) are **prerequisites**, not part of
this plan — they are executor-ready and land first.

## Why

The audit (2026-07-01, commit `7f9a947f`) found the organizer surface implements the same
capabilities through four uncoordinated patterns — direct-Prisma `_lib` fetchers, server actions,
REST routes, and a service layer the web app never adopted — with authorization re-implemented in
each. That sprawl is what produced the `updateTicketType` no-auth hole and the scan-route IDOR.
On top of it sit the concrete query and UX defects:

**Bad queries**

- `getEventOverview.ts` loads **every** completed order for an event to render five and to compute
  sums in JS; `netRevenue` is fabricated (`totalRevenue * 0.97`, "assuming 3% platform fee") while
  the real fee model is 8% + $0.50 + 15% tax (`lib/fees.ts`).
- `getPlatformEventsData.ts` fetches all events with all orders and reduces per-event stats in JS.
- `Events` has no index on `organizerUserId`; every organizer query filters on it.
- Inventory reads use the drift-prone `quantitySold` counter (roadmap 2.13) instead of the
  reservation columns (`sold`, `capacity`) the checkout maintains.

**Bad UX**

- Three currency formats and three date formats across dashboard / event detail / tickets /
  orders / platform pages — while canonical helpers already exist in `lib/dateUtils.ts`.
- Two event-status derivations that disagree: the list shows Active/Upcoming/Past/Draft; the
  detail page computes its own "Starts Tomorrow / N days until event" tree.
- Two full ticket-type form implementations (drawer vs page) with diverged capabilities — the
  drawer lacks the fee preview and password gating (`AddTicketTypeDrawer.tsx:66` TODO admits it).
- Check-in state split across `status` and never-written `checkinTimestamp` (fixed by
  prerequisite `plans/003`).

Migrating reads and writes into actor-authorized services fixes the structural cause; the query
and UX repairs ride along in the same rewrite instead of patching code slated for deletion.

## Goals

1. **One seam.** Every organizer read and write goes through `@troptix/api` services taking
   `(prisma, actor, input)`, with ownership/platform-owner checks inside the service. Web pages
   (server components) import from `@troptix/api/server` exactly like `/discover` does; server
   actions become thin adapters (parse → actor → service → `revalidatePath`).
2. **New columns, legacy fallback.** Services read `priceCents ?? round(price*100)`,
   `capacity ?? quantity`, `sold` (not `quantitySold`), `startsAt ?? startDate`, matching the
   fallback idiom in `services/events.ts:135–140`. This moves the organizer surface off the legacy
   schema and unblocks the deferred column drops.

   **On reading `sold`** (verified 2026-07-01, not assumed): a snapshot showed `sold == quantitySold`
   for all 49 ticket types (1211 == 1211) — `sold` is a complete, accurate mirror today, so the
   dashboard reads it directly (no `?? quantitySold` fallback, which would never fire since `sold`
   defaults to `0`, not null). Two conditions keep this true, both tracked on the umbrella issue,
   neither a blocker for this plan:
   - This **completes the dashboard slice of the reservation-rebuild's Phase C**
     ([checkout-reservation-rebuild](2026-06-checkout-reservation-rebuild.md), "Organizer reads").
     That plan still owns the scan/check-in and complementary-path reads — coordinate so the swap
     isn't done twice.
   - Consistency holds only while nothing writes `quantitySold` **without** `sold`. The legacy
     `pages/api/stripe/webhook.ts` (`updateTicketTypeQuantitySold`) still can, but is evidently
     dormant (zero drift). Its retirement is the rebuild's B2/webhook cutover — until then, a live
     order through that path would undercount `sold` for that ticket type. Re-run the parity query
     (below) before executing Phase 2 to confirm still-zero drift.

   Parity check to re-run before Phase 2:

   ```sql
   SELECT COUNT(*) FILTER (WHERE "sold" <> COALESCE("quantitySold",0)) AS drifted,
          COUNT(*) AS total
   FROM "TicketTypes";   -- drifted must be 0
   ```

3. **Honest, bounded queries.** SQL aggregates (`aggregate`/`count`/`groupBy`) for all stats,
   `take: 5` for recent orders, indexes on `Events(organizerUserId)` and `Orders(eventId, status)`,
   fabricated `netRevenue` removed.
4. **One UX vocabulary.** Money in integer cents in every DTO, formatted at the UI edge by one
   `formatCurrency`; one date-format helper set; one event-status module shared by list and
   detail; one ticket-type form component behind both entry points.

## Non-goals

- **The four legacy REST routes** (`/api/organizer/**`) — they serve the deployed Expo organizer
  app; hardened by prerequisite `plans/002`, retired only when the RN rebuild ships tRPC.
- **Roadmap 2.5 status rename** (`VALID`/`USED`/…) and other schema drops/renames — separate
  cleanup, gated on cutovers like this one.
- **Table/mobile-card consolidation** (`TicketTable`/`OrderTable`/`AttendeeTable` and their three
  bespoke mobile renderers) — real debt, L effort, deliberately deferred (audit backlog).
- **Pagination UI** — contracts are shaped so list endpoints can grow `cursor`/`take` later; no
  UI pagination in v1.
- **Organization brand editor / spotlight** — owned by
  [event-spotlight-and-organizer-brand](2026-06-event-spotlight-and-organizer-brand.md); it should
  build on the Phase 3 write-service pattern from this plan.
- **Design-system token/color work** — owned by
  [design-system-standardization](2026-06-design-system-standardization.md).

## Decisions

1. **Server components call services directly; no new tRPC procedures for the web dashboard.**
   SSR reads don't need a transport (same rationale as the api-service-layer plan's
   "server-first"). The existing mobile-oriented `organizer.getEvents/getEvent` tRPC procedures
   stay for organizer-v2.
2. **Server actions remain the web write transport**, but every action body becomes: zod-parse →
   build `Actor` from `getUserFromIdTokenCookie()` → call service → map typed errors
   (`UnauthorizedError`/`NotFoundError`) to the existing `ActionResult` strings → revalidate.
   Next.js APIs (`redirect`, `revalidatePath`, `notFound`) never enter `packages/api`.
3. **The publish toggle moves off its bespoke REST call.** `event-management-nav.tsx` currently
   `fetch`es `PATCH /api/events/[eventId]/toggle-publish`; it becomes a server action wrapping a
   `toggleEventPublish` service (same validation-requirements response). The REST route stays
   until nothing else calls it, then is deleted in Phase 5.
4. **"Revenue" means `subtotal`, and DTO money is integer cents.** The canonical revenue metric
   (dashboard, overview, tickets/orders stat cards) is **Ticket revenue** = `Σ Order.subtotal` over
   `COMPLETED` orders — pre-fee, pre-refund (see [CONTEXT.md](../../CONTEXT.md) "Money"). Per-order
   rows show `Order.total` relabeled **"Amount charged"** (a distinct number, not a second
   definition of revenue). This fixes the current three-way split (`getDashboardData` headline uses
   `subtotal` but its order rows use `total`; `getEventOverview` uses `subtotal`;
   `getPlatformEventsData` uses `total` — the last is moot, that file is deleted per decision 9).
   DTO money is integer cents (`revenueCents`, `averageOrderCents`, `fromPriceCents`); the UI edge
   formats via `formatCurrency`. Conversion: **aggregate the float `subtotal` in SQL, then
   `Math.round(sum * 100)` once** at the service edge — not per row (avoids float error and any
   dependency on whether `subtotalCents` was backfilled), isolated in one helper so the roadmap
   2.12 cents-column swap touches one line.
5. **No "net revenue," no refund-netting — by necessity.** The overview shows Ticket revenue
   labeled "before fees & refunds". **Payout** (revenue net of absorbed fees) needs per-order
   `ticketingFees` attribution — deferred. **Refunds cannot be netted at all**: `OrderStatus` is
   only `PENDING|CANCELLED|COMPLETED` — there is no `REFUNDED`, so no metric can subtract refunds
   until refunds are modeled (connects to the deferred "order refund actions" direction finding).
6. **Status derivation is a pure shared function** with injectable `now`, defined once
   (`getEventStatus`, `getEventStatusDisplay` built on it) so list and detail cannot disagree.
   It lives with the code that needs it server-side (services `_shared`) and is re-exported for
   UI badge mapping.
7. **Actor construction is one helper** (`apps/web/src/server/actor.ts`,
   `userToActor(user): Actor`), used by every page and action — no inline actor literals.
   `getServerUser`/`getUserFromIdTokenCookie` already return `{ uid, email, role }` off a live
   Supabase session, so a real `{ kind:'user', userId, role }` Actor is constructible today (ADR
   0013's "until Stage 1c every request is anonymous" note is stale for `apps/web`).
8. **Access is ownership-only; there is no `ORGANIZER` role gate.** Anyone authenticated may use the
   Organizer Dashboard (it shows their own events, empty if none) — "Organizer" is not a granted
   role (see [CONTEXT.md](../../CONTEXT.md)). Organizer services authorize purely on
   `event.organizerUserId === actor.userId` ownership; **no `role` check**. This reverses an earlier
   draft that gated on `role === ORGANIZER` — that model is being retired (see the separate
   _organizer onboarding & paid-ticketing approval_ direction below). What replaces the role as a
   gate is **`Organization.paidTicketingEnabled`**, and only for the paid-ticketing action, enforced
   in the ticket-type write service (decision 10) — not for dashboard access.
   Platform Owner remains an **Admin capability, not an Organizer bypass**: the cross-organizer view
   moves out of `/organizer/platform` into its own **`/admin` route group with its own layout + a
   single `requirePlatformOwner` guard**; the `isPlatformOwner ? {} : {…}` bypass is removed from
   every organizer service. The `@usetroptix.com` email check survives in exactly two places (the
   `/admin` layout guard and the read-service View-as gate), tagged as a stopgap for the
   ADR-0013-successor role matrix.
9. **The Admin View is a thin index + read-only View-as, not a god-list.** `getPlatformEventsData`
   and its per-event JS-reduce aggregation are **deleted, not ported** (this removes the audit's
   heaviest query). The `/admin` landing is a cheap global event index (event, owner, status — no
   stats) on indexed columns; each row deep-links into the **real** Organizer Dashboard scoped to
   the row's owner via View-as (`?viewAs=<organizerUserId>` on the organizer routes). The organizer
   **read**-services accept an optional `viewAsOrganizerUserId`, honored **only** when
   `isPlatformOwner(actor)`; **write**-services never accept it. So a Platform Owner can observe any
   organizer but cannot mutate on their behalf — a behavior change from today (admins currently can
   edit any event); "admin edit" with an audit trail is deferred (ADR-0013 successor).
10. **Paid ticketing is gated on `Organization.paidTicketingEnabled`, in the write service.** When
    the ticket-type write service (Phase 3) creates/updates a ticket type with `price > 0`, it
    requires the owning organization's `paidTicketingEnabled` (off by default; TropTix flips it
    after the organizer talks to us). RSVP (`price = 0`) tickets are always allowed. Enforced in the
    application layer, **not** a DB constraint; there is **no** `Event`-level RSVP/paid flag — the
    create-form toggle is UI visibility over the price field (see [CONTEXT.md](../../CONTEXT.md)).
    This is the migration's only interaction with the retired role model; the full onboarding /
    approval experience is its **own initiative** (below) — this plan just makes the write service
    honor the flag rather than the role.

## Spawned initiative — organizer onboarding & paid-ticketing approval

Surfaced during plan review; **not built by this plan**, but this plan is shaped to be compatible
(decisions 8 and 10). Its own plan doc + ADR to follow. Decided so far:

- **Everyone can organize.** The `ORGANIZER` role stops being an access gate (this plan already
  authorizes on ownership). The fate of the `Role` enum (`PATRON`/`ORGANIZER`/`PROMOTER`) — retire
  vs keep vestigial — is resolved in that initiative, not here.
- **Paid ticketing is a capability, not a role**: `Organization.paidTicketingEnabled` (exists as a
  concept via this plan's decision 10; default off, admin-flipped). Separate from
  `Organization.verified` (attendee trust tick — orthogonal; earnable via free events).
- **MVP is a single approval flow, not a general task engine.** The dashboard shows one
  "Getting started" card — _"Talk to us to sell paid tickets"_ — that files a request; the general
  task/checklist system is explicitly deferred until there's a real second task.
- **Approval happens in `/admin`.** Flipping `paidTicketingEnabled` (and granting `verified`) is a
  Platform-Owner **platform action on an organization** — a legitimate admin _write_, distinct from
  read-only View-as (decision 9): admins don't edit an organizer's content, but they do act on the
  account. `/admin` grows a "pending paid-ticketing requests" queue + approve action.

## Phases

Each phase is one PR referencing the umbrella issue; the codebase works at every boundary.

### Phase 0 — Prerequisites (already specified, executor-ready)

`plans/001` (auth on `updateTicketType`), `plans/002` (REST hardening: scan IDOR, atomic scan,
zod, platform-owner policy), `plans/003` (write `checkinTimestamp` on all check-in paths). Their
fixes are carried into the services as the code moves; landing them first means the migration
never re-opens a security hole.

### Phase 1 — Organizer contracts + read services

In `packages/api`:

- `contracts/organizer.ts` — DTOs (zod): `OrganizerDashboard` (stat cards + daily sales series +
  recent orders + active events), `OrganizerEventSummary` (list card: status enum, `soldCount`,
  `capacity`, `fromPriceCents`), `OrganizerEventOverview` (overview page: info, financials in
  cents, ticket-type breakdown, recent orders, daily revenue series), and `AdminEventIndexRow`
  (event id, name, owner {id,name,email}, status — **no stats**). All money integer cents; all
  statuses from the shared enum.
- `services/organizer.ts` (extend; split `organizer-dashboard.ts` if it outgrows one file) —
  `getDashboardData`, `getEventsList`, `getEventOverview`, each `(prisma, actor, …)`. Authorization
  gates on `role === ORGANIZER` + `organizerUserId` ownership (no platform-owner bypass — decision
  8). The read-services take an **optional `viewAsOrganizerUserId`** that is honored **only** when
  `isPlatformOwner(actor)` (decision 9); otherwise scope is the actor's own id. Plus
  `getAdminEventIndex(prisma, actor)` — the thin cross-organizer index, gated on
  `isPlatformOwner(actor)`, a single cheap `findMany` on indexed columns with **no per-event
  aggregation** (this replaces the deleted `getPlatformEventsData` god-list). Typed errors
  (`UnauthorizedError` added to `_shared/errors.ts` beside `NotFoundError`); **SQL aggregates only**
  for stats (pattern: `getDashboardData.ts:25–40`); `take: 5` recent orders; ticket-type inventory
  from `sold`/`capacity` with legacy fallback.
- `services/_shared/eventStatus.ts` — decision 6.
- Migration: `@@index([organizerUserId])` on `Events`, `@@index([eventId, status])` on `Orders`
  (generated via `yarn --cwd apps/web db:new`, applied by the operator).
- Vitest suites per service with fake prisma (exemplar `services/events.test.ts`): anonymous
  rejected, non-owner rejected, platform-owner allowed, aggregate mapping, cents conversion,
  legacy-fallback columns.

(No role-gate pre-check — decision 8 authorizes on ownership only, so there is no `role === ORGANIZER`
requirement that could lock owners out.)

**Exit:** `yarn --cwd packages/api test` green; services exported from `server.ts`; web untouched.

### Phase 2 — Read cutover: pages consume services, `_lib` deleted

- `organizer/page.tsx`, `organizer/events/page.tsx`, `organizer/events/[eventId]/page.tsx` switch
  to `@troptix/api/server` imports + `userToActor`; `NotFoundError` → `notFound()` at the page.
  The organizer routes read an optional `?viewAs=<organizerUserId>` search param and pass it as
  `viewAsOrganizerUserId` (the service ignores it unless the actor is a Platform Owner).
- **Admin surface**: create the `/admin` route group with its own layout carrying a single
  `requirePlatformOwner` guard; `/admin` renders the `getAdminEventIndex` table, each row linking to
  `/organizer/events/[eventId]?viewAs=<ownerId>` (and/or `/organizer?viewAs=<ownerId>`). Delete the
  old `/organizer/platform/**` tree.
- Delete `_lib/getDashboardData.ts`, `_lib/getEventsData.ts`, `[eventId]/_lib/getEventOverview.ts`,
  `platform/_lib/getPlatformEventsData.ts` (the god-list — replaced by the thin index, not ported).
- UI edge adopts the unified vocabulary in the same PR (the DTO shape forces it): `formatCurrency`
  (+ compact variant) and the shared date helpers replace every hand-rolled
  `toLocaleString`/`Intl.NumberFormat`/`toLocaleDateString` in organizer files; local
  `getEventStatus`/`getStatusBadgeVariant`/`getEventStatusDisplay` definitions are deleted in
  favor of the shared module; the fabricated net-revenue card becomes "Ticket revenue — before
  fees & refunds".

**Exit:** `grep -rn "from '@/server/prisma'" apps/web/src/app/organizer` → only `_actions` files;
`grep -rn "Intl.NumberFormat\|toLocaleDateString" apps/web/src/app/organizer` → none;
`yarn --cwd apps/web build` green.

### Phase 3 — Write services + thin actions

- Services: `createEvent` (event + ticket types in one transaction, dual-writing reservation
  columns — the `reservationColumns` mapping moves into the service), `updateEvent`,
  `createTicketType`, `updateTicketType`, `toggleTicketCheckIn` (status + `checkinTimestamp`
  together, from plan 003), `toggleEventPublish` (decision 3, returning the same
  validation-requirements shape the nav renders).
- Input schemas move to `contracts/` (or re-export from the existing `lib/schemas` until the
  spotlight plan's EventForm rework settles — implementer's call, recorded in the PR).
- `_actions` files thin to the decision-2 adapter shape; form components unchanged.
- Ownership tests move to vitest at the service level; jest keeps thin tests that actions still
  revalidate the right paths.

**Exit:** no `prisma` import anywhere under `apps/web/src/app/organizer`; every organizer service
has authz tests; both suites green.

### Phase 4 — Form and interaction unification

- Extract `TicketTypeFields` (all fields from `CreateTicketTypeForm`: fee-mode radio + live fee
  preview via `calculateFeesCents`, password toggle, sale window); `AddTicketTypeDrawer` and
  `CreateTicketTypeForm` become thin wrappers (drawer keeps its values-return contract for the
  `createEvent` batch; verify `discountCode` flows into the batch mapping). Removes the drawer's
  `errors: any`.
- Publish switch gets an in-flight indicator (it already has `disabled={isLoading}`; add the
  visible state).

**Exit:** fields exist in exactly one component; both funnels smoke-tested (create-event drawer
and `/tickets/new` + edit).

### Phase 5 — Retirement

- Migrate remaining `verifyEventAccess` page-guards (attendees/orders/tickets pages) to the
  service calls' own authz; `apps/web/src/server/accessControl.ts` then has only the legacy REST
  routes as importers — it is deleted together with them when the RN rebuild lands (tracked on
  the umbrella issue, not this plan).
- Switch `trpc/routers/organizer.ts` from string-match error mapping to
  `instanceof UnauthorizedError/NotFoundError`.
- Delete the `toggle-publish` REST route once the nav uses the action; delete
  `server/lib/ticketHelper.ts` if the plan-002 check confirmed it unused.

**Exit:** `grep -rn "UNAUTHORIZED'" packages/api/src/trpc` → none; dead files gone.

## Verification

- Per PR: root `yarn typecheck` (fans out to all workspaces), `yarn --cwd apps/web test`,
  `yarn --cwd packages/api test`, `yarn --cwd apps/web lint`, `yarn --cwd apps/web build`.
- Phase 1/3 carry the regression net: every service has anonymous/non-owner/owner/platform-owner
  authz cases — the structural guard against the next plan-001-class hole.
- Manual smoke per cutover phase: dashboard, events list, event overview, tickets, orders,
  attendees, platform view; drawer + page ticket funnels after Phase 4.
- Numbers parity check on Phase 2: for one real event, stat cards before vs after (expected
  deltas: net-revenue card replaced; sold counts may differ where `quantitySold` had drifted from
  `sold` — that delta is the fix, note it in the PR).

## Risks & mitigations

- **Numbers change on organizer dashboards** (counter drift vs computed/`sold`, fee-lie removal).
  Mitigation: parity check above; PR description explains each expected delta.
- **Package-boundary regressions** (date serialization, `server-only` constraints — ADR 0009).
  Mitigation: `/discover` and `/e/[eventId]` prove the import path; typecheck is the net.
- **Spotlight plan collision** on `EventForm` (it removes the free-text `organizer` field).
  Mitigation: this plan doesn't touch `EventForm`'s field set; Phase 4 only swaps the drawer's
  internals. Coordinate merge order on the umbrella issue if both are in flight.
- **Checkout-rebuild collision** in `packages/api` (active plan owns reservations/checkout
  services). Mitigation: this plan adds organizer services only; `_shared` additions
  (`eventStatus`, `UnauthorizedError`) are additive.
