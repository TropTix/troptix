# Plan 002: Harden the four organizer REST routes (scan IDOR, atomic scan, input validation, consistent authz)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7f9a947f..HEAD -- apps/web/src/app/api/organizer apps/web/src/server/accessControl.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (live mobile-app clients consume these routes — response shapes must not change)
- **Depends on**: none (001 can land in parallel)
- **Category**: security
- **Planned at**: commit `7f9a947f`, 2026-07-01

## Why this matters

The four REST routes under `apps/web/src/app/api/organizer/` are the API for the legacy Expo organizer app (`apps/organizer/hooks/useTicket.ts:17,45`, `useOrders.ts:19`, `useFetchEvents.tsx:24`). The **scan** route authenticates the caller but never checks event ownership: any authenticated user can scan (invalidate) tickets on any event on the platform — the same IDOR class already fixed on the orders route in commit `443c937c`. The scan route also has a check-then-act race (two simultaneous scans of one ticket can both report success), a `ticketType: any` that null-derefs into a 500 when a ticket references a deleted ticket type, and none of the four routes schema-validate input (roadmap item 3.4). Policy is also inconsistent: events and orders routes allow `@usetroptix.com` platform owners; check-in denies them.

## Current state

Files (all under `apps/web/src/app/api/organizer/`):

- `tickets/scan/route.ts` — PUT; auths token, then calls local `updateScannedTicketStatus(ticketId, eventId)` with **no ownership check** (line 32). Lines 68–79: `let ticketType: any = { name: 'Complementary', ... }` then unconditionally reassigned from `prisma.ticketTypes.findUnique(...)` which can return null → `ticketType.name` at line 83/98 throws. Lines 81–102: reads `ticket.status`, then a separate `update` — check-then-act race.
- `tickets/check-in/route.ts` — PUT; has the ownership check (line 43: `if (ticket.event.organizerUserId !== organizerId.uid)`) but no platform-owner bypass, and line 65 returns the **full** ticket record (`NextResponse.json(updatedTicket)`).
- `events/route.ts` — GET; correct authz (line 29: `isPlatformOwner(organizerId.email) ? {} : { organizerUserId: organizerId.uid }`). Note line 40 `isDraft: false` inside `select` is valid Prisma (field exclusion), NOT a filter — do not "fix" it.
- `orders/[eventId]/route.ts` — GET; correct authz via `canAccessEvent` (fixed in `443c937c`). Fetches unbounded `include: { tickets: { include: { ticketType: true } } }` — payload noted, but response-shape changes are OUT of scope here (mobile client parses it).

Auth helpers: `apps/web/src/server/accessControl.ts` exports `isPlatformOwner(email)` and `canAccessEvent(userId, userEmail, eventId)` (platform owner → true; else compares `event.organizerUserId`). Token resolution: `getUserFromIdTokenCookie(token)` from `apps/web/src/server/authUser.ts`.

Scan route ownership gap (`tickets/scan/route.ts:22–33`):

```ts
  const { ticketId, eventId } = await request.json();
  if (!ticketId || !eventId) {
    return NextResponse.json(
      { error: 'ticketId and eventId are required' },
      { status: 400 }
    );
  }

  try {
    const scannedTicket = await updateScannedTicketStatus(ticketId, eventId);
```

Response contracts the mobile app depends on (must stay identical):

- scan → `{ ticketName, ticketDescription, scanSucceeded }`
- check-in → currently the full ticket object; the mobile hook (`apps/organizer/hooks/useTicket.ts:45`) treats it as opaque JSON. Minimizing to `{ id, status }` is allowed ONLY after step 5 confirms the mobile app reads nothing else; otherwise keep the full shape.

Zod is already a dependency of `apps/web`. Existing schema convention: `apps/web/src/lib/schemas/ticketSchema.ts` (zod object + exported inferred type).

## Commands you will need

| Purpose   | Command                         | Expected on success |
| --------- | ------------------------------- | ------------------- |
| Typecheck | `yarn --cwd apps/web typecheck` | exit 0              |
| Lint      | `yarn --cwd apps/web lint`      | exit 0              |
| Tests     | `yarn --cwd apps/web test`      | all pass            |

Never use npm (Yarn v1 workspaces — `CLAUDE.md`).

## Scope

**In scope** (the only files you should modify):

- `apps/web/src/app/api/organizer/tickets/scan/route.ts`
- `apps/web/src/app/api/organizer/tickets/check-in/route.ts`
- `apps/web/src/app/api/organizer/events/route.ts` (input validation only, if any; no query changes)
- `apps/web/src/app/api/organizer/orders/[eventId]/route.ts` (input validation only; no query/response changes)
- `apps/web/src/lib/schemas/organizerApiSchemas.ts` (create)
- `apps/web/src/app/api/organizer/__tests__/ticketRoutes.test.ts` (create; adjust path/name to jest config if needed)

**Out of scope** (do NOT touch, even though they look related):

- Response shapes of events/orders routes — the Expo app parses them.
- `apps/web/src/server/lib/ticketHelper.ts` — contains a near-duplicate `updateScannedTicketStatus`; verify nothing imports it (`grep -rn "ticketHelper" apps/web/src`) and if unused, note it in your report for deletion in a follow-up. Do not delete in this plan.
- Writing `checkinTimestamp` — that is plan 003, which builds on this file.
- `apps/organizer/**`, `apps/organizer-v2/**` — mobile apps.

## Git workflow

- Branch: `advisor/002-harden-organizer-rest-routes`.
- Conventional commits, e.g. `fix(api): enforce event ownership on organizer ticket scan (IDOR)`.
- Do NOT push or open a PR unless instructed. No `--no-verify`.

## Steps

### Step 1: Add ownership check to the scan route

In `tickets/scan/route.ts`, after resolving `organizerId` and parsing the body, add:

```ts
const hasAccess = await canAccessEvent(
  organizerId.uid,
  organizerId.email,
  eventId
);
if (!hasAccess) {
  return NextResponse.json({ error: 'Event not found' }, { status: 404 });
}
```

Import `canAccessEvent` from `@/server/accessControl`. Use 404 (not 403) to match the orders route's non-enumeration behavior (`orders/[eventId]/route.ts:47`).

**Verify**: `yarn --cwd apps/web typecheck` → exit 0.

### Step 2: Make the scan status flip atomic and fix the `any`

Rewrite `updateScannedTicketStatus` in the same file:

1. Replace the check-then-act (read status → separate update) with a single conditional update using Prisma's `updateMany`, which returns a count and only succeeds if the ticket is still unscanned:

```ts
const result = await prisma.tickets.updateMany({
  where: { id: ticketId, eventId, status: TicketStatus.AVAILABLE },
  data: { status: TicketStatus.NOT_AVAILABLE },
});
const scanSucceeded = result.count === 1;
```

2. Fetch the ticket (with `include: { ticketType: true }`) once for the name/description; type it properly — delete `let ticketType: any` and handle both null ticket and null `ticketType` (complementary tickets have `ticketTypeId` null → name `'Complementary'`; a dangling `ticketTypeId` → fall back to `'Complementary'` as well rather than crashing).
3. Preserve the exact response contract: `{ ticketName, ticketDescription, scanSucceeded }` with `scanSucceeded: false` when the ticket doesn't exist or was already scanned.

**Verify**: `yarn --cwd apps/web typecheck` → exit 0; `grep -n "any" apps/web/src/app/api/organizer/tickets/scan/route.ts` → no `: any` matches.

### Step 3: Consistent platform-owner policy on check-in

In `tickets/check-in/route.ts:43`, change the ownership check to:

```ts
if (
  !isPlatformOwner(organizerId.email) &&
  ticket.event.organizerUserId !== organizerId.uid
) {
```

Import `isPlatformOwner` from `@/server/accessControl`.

**Verify**: `yarn --cwd apps/web typecheck` → exit 0.

### Step 4: Zod input validation on the two mutation routes

Create `apps/web/src/lib/schemas/organizerApiSchemas.ts`:

```ts
import { z } from 'zod';

export const scanTicketSchema = z.object({
  ticketId: z.string().min(1),
  eventId: z.string().min(1),
});

export const checkInTicketSchema = z.object({
  ticketId: z.string().min(1),
});
```

In scan and check-in routes, replace the manual presence checks with `schema.safeParse(await request.json())`, returning the existing 400 error messages on failure (keep messages byte-identical: `'ticketId and eventId are required'` / `'ticketId is required'` — the mobile app may display them). GET routes (events, orders) take no body; for orders, `eventId` comes from the path and is already presence-checked — leave as is.

**Verify**: `yarn --cwd apps/web typecheck` → exit 0; `yarn --cwd apps/web lint` → exit 0.

### Step 5: Check the mobile consumer before minimizing check-in response

Read `apps/organizer/hooks/useTicket.ts` and any screen consuming its check-in result (search `apps/organizer/app` for the hook name). If the app only uses success/failure (or specific fields), change `check-in/route.ts:65` to return only those fields via `select` on the update. If it renders arbitrary ticket fields, leave the response unchanged and record that in your report.

**Verify**: `yarn --cwd apps/web typecheck` → exit 0.

### Step 6: Tests

Create route tests (model on any existing test under `apps/web/src` — if none test route handlers, call the exported `PUT` directly with a mocked `NextRequest` and mocked `headers()`/`prisma`/`getUserFromIdTokenCookie`). Cases:

1. scan: authenticated non-owner → 404, no update executed.
2. scan: owner, unscanned ticket → `scanSucceeded: true`; second scan of same ticket → `scanSucceeded: false` (updateMany count 0).
3. scan: ticket with null `ticketTypeId` → `ticketName: 'Complementary'`, no throw.
4. scan: missing `eventId` in body → 400 with the exact legacy message.
5. check-in: platform-owner email on someone else's event → 200 (policy change from step 3).
6. check-in: non-owner → 403.

**Verify**: `yarn --cwd apps/web test --testPathPattern=ticketRoutes` → all pass.

## Test plan

Covered in step 6. Mock strategy mirrors plan 001: jest module mocks for `@/server/prisma`, `@/server/authUser`, `next/headers`.

## Done criteria

- [ ] `yarn --cwd apps/web typecheck` exits 0
- [ ] `yarn --cwd apps/web lint` exits 0
- [ ] `yarn --cwd apps/web test` exits 0, including the 6 new route tests
- [ ] scan route calls `canAccessEvent` before any ticket read/write
- [ ] `grep -rn ": any" apps/web/src/app/api/organizer/` → no matches
- [ ] scan status flip is a single `updateMany` conditional write (no read-then-write)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The scan route already contains an ownership check (drift).
- The mobile hook files (`apps/organizer/hooks/useTicket.ts`) do not exist or consume different URLs — the consumer analysis in step 5 would be invalid.
- Making the route handlers testable requires restructuring them into separate handler files — propose it in your report instead of doing it.
- `TicketStatus` enum values differ from `AVAILABLE` / `NOT_AVAILABLE`.

## Maintenance notes

- Plan 003 modifies the same scan/check-in files to write `checkinTimestamp` — land this plan first, then 003 rebases trivially.
- These REST routes are scheduled to be replaced by tRPC when the React Native app is rebuilt (see `docs/plans/2026-06-api-service-layer.md`, "apps/organizer (RN) ── tRPC RQ ── later"). Hardening now is still required — "later" has no date and the IDOR is live.
- Reviewer should scrutinize: the scan response contract against the deployed Expo app's parsing (`apps/organizer/hooks/useTicket.ts`), and that 404-on-unauthorized matches the orders route convention.
