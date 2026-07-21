# Plan 005: Cut the web organizer surface over to `@troptix/api` services (one authz seam, one data layer)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7f9a947f..HEAD -- apps/web/src/app/organizer packages/api/src apps/web/src/server`
> Plans 001–004 are expected drift in `_actions`, REST routes, and
> `getEventOverview.ts` — carry their fixes forward into the moved code.
> Other drift: compare excerpts; mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: L (multi-PR; execute one stage per session)
- **Risk**: MED (moves live read paths; mitigated by stage-by-stage cutover and tests)
- **Depends on**: plans/001, 002, 003, 004 (their fixes must exist so they aren't lost in the move)
- **Category**: tech-debt
- **Planned at**: commit `7f9a947f`, 2026-07-01

## Why this matters

The web organizer surface implements the same capabilities through four uncoordinated patterns: direct-Prisma fetchers in `_lib/`, server actions in `_actions/`, four REST routes for the legacy mobile app, and a new-but-unused-by-web service layer in `packages/api`. Authorization is re-implemented in each: `apps/web/src/server/accessControl.ts` (`canAccessEvent`), inline `organizerUserId` where-clauses in actions, `authorizeOrganizer()` in `packages/api/src/services/organizer.ts:9–22`, and per-route checks. This is exactly what `docs/plans/2026-06-api-service-layer.md` (the decided target architecture, ADR 0013) exists to end: _"services → one seam; server components call services directly; authz enforced in the services via an explicit actor."_ The practical costs today: the ticket-type IDOR (plan 001) happened because each action hand-rolls authz; dashboard aggregates are duplicated between `getDashboardData.ts` and `getPlatformEventsData.ts`; and event-status derivation is duplicated in three files. This plan moves organizer reads and writes into `packages/api` services and deletes the web-local copies.

## Current state

Capability → implementation today:

| Capability                                      | Today          | File                                                                                                     |
| ----------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| Dashboard stats                                 | direct Prisma  | `apps/web/src/app/organizer/_lib/getDashboardData.ts` (no authz — trusts caller's `organizerUserId`)     |
| Events list                                     | direct Prisma  | `apps/web/src/app/organizer/_lib/getEventsData.ts` (same trust model)                                    |
| Platform (admin) events                         | direct Prisma  | `apps/web/src/app/organizer/platform/_lib/getPlatformEventsData.ts`                                      |
| Event overview                                  | direct Prisma  | `apps/web/src/app/organizer/events/[eventId]/_lib/getEventOverview.ts` (authz via `getEventWhereClause`) |
| Create/update event                             | server action  | `apps/web/src/app/organizer/events/_actions/eventActions.ts`                                             |
| Ticket-type CRUD                                | server action  | `.../tickets/_actions/ticketActions.ts`                                                                  |
| Attendee check-in toggle                        | server action  | `.../attendees/_actions/attendeeActions.ts`                                                              |
| Events/orders/check-in/scan for legacy Expo app | REST           | `apps/web/src/app/api/organizer/**`                                                                      |
| getEvents/getEvent for rebuilt mobile app       | service + tRPC | `packages/api/src/services/organizer.ts`, `trpc/routers/organizer.ts`                                    |

Target architecture (quoted from `docs/plans/2026-06-api-service-layer.md`):

```
@troptix/db  ◄── services  ◄── trpc router
                   ▲                ▲
   webhook(REST)+cron ─┘            │
   server components ─── direct ────┤
   web client comps ─── tRPC RQ ────┤
   apps/organizer (RN) ── tRPC RQ ──┘   (later — RN is being rebuilt)
```

Key conventions from that plan + ADR 0013 (the executor must honor):

- Services are pure `(prisma, actor, input) => result`; import only `@troptix/db` + zod. Never Next.js APIs (`redirect`, `revalidatePath`, `notFound` stay in the web layer).
- `Actor` type lives in `packages/api/src/trpc/context.ts` (`anonymous | user{userId} | system`); `authorizeOrganizer(prisma, actor)` in `services/organizer.ts:9–22` is the existing organizer gate (platform owner = `@usetroptix.com` email).
- Error convention: `packages/api/src/services/_shared/errors.ts` (`NotFoundError` class exists) — throw typed errors from services; web layer maps them (`notFound()`, form error strings). Note `services/organizer.ts` currently throws `new Error('UNAUTHORIZED')` strings — migrate what you touch to typed errors.
- Tests: Vitest with injected fake prisma — exemplar `packages/api/src/services/events.test.ts` and `organizations.test.ts` (ADR 0010).
- Web pages keep calling fetchers as plain async functions from server components — only the import source changes.

## Commands you will need

| Purpose       | Command                                                        | Expected      |
| ------------- | -------------------------------------------------------------- | ------------- |
| Typecheck all | `yarn typecheck` (root — fans out to web/db/api/transactional) | exit 0        |
| Web tests     | `yarn --cwd apps/web test`                                     | pass          |
| API pkg tests | `yarn --cwd packages/api test`                                 | pass (vitest) |
| Lint          | `yarn --cwd apps/web lint`                                     | exit 0        |

## Scope

**In scope**:

- `packages/api/src/services/organizer.ts` (extend), new `packages/api/src/services/organizer-dashboard.ts` if size warrants a split, sibling `.test.ts` files
- `packages/api/src/services/_shared/errors.ts` (add `UnauthorizedError` if absent)
- `apps/web/src/app/organizer/**/_lib/*` (delete after cutover), `**/_actions/*` (thin down to: parse form → call service → revalidate/redirect)
- `apps/web/src/app/organizer/**/page.tsx` import changes only
- `packages/api/src/trpc/routers/organizer.ts` (switch string-match error mapping to `instanceof` typed errors for what you touch)

**Out of scope**:

- The four REST routes under `apps/web/src/app/api/organizer/**` — they serve the deployed legacy Expo app and die when the RN rebuild ships tRPC (per the service-layer plan). Do NOT rewrite them to call services in this plan; note residual duplication in your report.
- Checkout/reservation services, `apps/web/src/server/lib/**` order helpers — owned by the active checkout-reservation-rebuild plan.
- UI components, formatting, tables — plans 006/007.
- `apps/web/src/server/accessControl.ts` — keep until Stage 4 confirms zero importers; deletion is the last step, not the first.
- Any tRPC procedure additions for web client components — web server components call services directly; don't add transport that nothing consumes.

## Git workflow

- One branch per stage: `advisor/005a-organizer-read-services`, `005b-…`, etc. Each stage is a reviewable PR.
- Conventional commits, e.g. `refactor(organizer): move dashboard data into @troptix/api service`.
- No push/PR unless instructed. No `--no-verify`.

## Steps

### Stage A: Read services (dashboard, events list, event overview, platform list)

1. In `packages/api/src/services/organizer.ts` (or `organizer-dashboard.ts`), create:
   - `getDashboardData(prisma, actor)` — port `apps/web/src/app/organizer/_lib/getDashboardData.ts` verbatim queries, but derive `organizerUserId` from `authorizeOrganizer(prisma, actor)` instead of a raw param.
   - `getEventsList(prisma, actor)` — port `getEventsData.ts`. Note the existing service `getEvents` (`organizer.ts:24–60`) returns a different, mobile-oriented shape — do NOT merge them yet; name the new one distinctly and record the overlap in your report.
   - `getEventOverview(prisma, actor, eventId)` — port `getEventOverview.ts` (post-plan-004 shape). Replace `notFound()` with `throw new NotFoundError(...)` and `getEventWhereClause` with an ownership check via `authorizeOrganizer` + `organizerUserId`/platform-owner logic. The web page catches `NotFoundError` and calls `notFound()`.
   - `getPlatformEventsData(prisma, actor)` — port from `platform/_lib/`; require platform owner via `authorizeOrganizer` result, else throw `UnauthorizedError`.
2. Add `UnauthorizedError` to `_shared/errors.ts` following `NotFoundError`'s shape.
3. Vitest tests per service with fake prisma (model on `events.test.ts`): authz rejection for `actor: anonymous`, non-owner rejection where applicable, happy-path shape.
4. Update the four `page.tsx` callers to import from `@troptix/api` (check `packages/api/src/server.ts` for the server entry export path; match how existing web code imports services — search `from '@troptix/api` in `apps/web/src`), passing `prisma` from `@/server/prisma` and an actor built from `getUserFromIdTokenCookie()`. Add a tiny `apps/web/src/server/actor.ts` helper `userToActor(user): Actor` if none exists.
5. Delete the four `_lib` files.

**Verify**: `yarn typecheck` → 0; `yarn --cwd packages/api test` → pass; `find apps/web/src/app/organizer -name '_lib' -type d` → only `platform/_lib` gone too / no results; manual smoke: `yarn --cwd apps/web build` compiles.

### Stage B: Write services (event create/update, ticket-type CRUD, check-in toggle)

1. Create `createEvent`, `updateEvent`, `createTicketType`, `updateTicketType`, `toggleTicketCheckIn` services in `packages/api` mirroring the (post-001/003) server actions: zod-parse input with the schemas moved or re-exported from `packages/api/src/contracts/` (the contracts dir is the decided home — see the service-layer plan "contracts/"), ownership via the Stage A authz helpers, transactions preserved (`prisma.$transaction` for event+tickets create, `eventActions.ts:43–88`).
2. Thin the web `_actions` files to: `'use server'` → build actor → call service → map typed errors to the existing `ActionResult` strings → `revalidatePath`/`redirect` exactly as today. Form components must not change.
3. Port plan 001/003 tests to vitest at the service level; keep thin jest tests asserting the actions still call `revalidatePath` with the same paths.

**Verify**: `yarn typecheck` → 0; both test suites pass; `grep -rn "prisma\." apps/web/src/app/organizer --include='*.ts' --include='*.tsx' -l` → no `_actions` files remain (only none, since `_lib` already gone).

### Stage C: Retire duplicated authz + status logic

1. Switch `trpc/routers/organizer.ts` error mapping from `e.message === 'UNAUTHORIZED'` string checks to `instanceof UnauthorizedError`/`NotFoundError`.
2. `grep -rn "accessControl" apps/web/src` — migrate any remaining importer (expected: attendees/orders/tickets `page.tsx` files using `verifyEventAccess`) to service-level checks (their data fetches moved in Stage A/B; page-level guards become the service call itself). When zero importers remain, delete `apps/web/src/server/accessControl.ts`. If the REST routes still import it (they do — out of scope to rewrite), keep the file and instead note in your report that it dies with the REST routes.

**Verify**: `yarn typecheck` → 0; `grep -rn "UNAUTHORIZED'" packages/api/src/trpc` → no string-comparison matches.

## Test plan

Each stage above embeds its tests. Net-new coverage this plan must add: authz unit tests for every organizer service (anonymous, non-owner, owner, platform-owner cases) — this is the regression net that prevents the next plan-001-style IDOR.

## Done criteria

- [ ] `yarn typecheck` exits 0 (root, all workspaces)
- [ ] `yarn --cwd apps/web test` and `yarn --cwd packages/api test` exit 0
- [ ] `apps/web/src/app/organizer` contains no `_lib` directories and no direct `prisma.` calls (`grep -rn "from '@/server/prisma'" apps/web/src/app/organizer` → no matches)
- [ ] Every organizer service has authz tests (anonymous + non-owner rejected)
- [ ] `yarn --cwd apps/web build` succeeds
- [ ] `plans/README.md` status row updated per stage

## STOP conditions

Stop and report back if:

- `docs/plans/2026-06-api-service-layer.md` has changed status to `superseded` (target architecture changed).
- The `@troptix/api` server entry cannot be imported from web server components without pulling client-unsafe code (check `packages/api/src/server.ts` and ADR 0009) — report the topology problem; do not invent a new entry point.
- A page relies on `_lib`-fetcher behavior that authz-in-service would change for platform owners (e.g. platform pages intentionally showing all events) — verify platform behavior parity before deleting; on ambiguity, stop.
- Stage B's transaction port hits Prisma interactive-transaction limitations inside the package (different Prisma client instance/config) — report before restructuring.

## Maintenance notes

- After this plan, the four REST routes are the ONLY organizer code outside the seam; when the RN rebuild adopts tRPC, delete them plus `accessControl.ts` (if still present) — file that as an issue when closing this plan.
- The spotlight/org-brand initiative (`docs/plans/2026-06-event-spotlight-and-organizer-brand.md`) should build its organizer-profile editor directly on services from day one — this plan creates the pattern to copy (point its implementer at Stage B).
- Reviewer per stage: shape parity between old fetcher output and service output (the pages are typed — typecheck is the main net, but watch date serialization across the package boundary).
