# Plan 003: Make `checkinTimestamp` the written record of check-in (all three check-in paths)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7f9a947f..HEAD -- apps/web/src/app/api/organizer/tickets 'apps/web/src/app/organizer/events/[eventId]/attendees/_actions/attendeeActions.ts' packages/api/src/services/organizer.ts`
> If plan 002 landed, the scan/check-in routes will have changed — that is
> expected; re-locate the update calls in their new form. Any OTHER drift is a
> STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the door-scanning paths used at live events)
- **Depends on**: plans/002-harden-organizer-rest-routes.md (same files; land 002 first)
- **Category**: bug
- **Planned at**: commit `7f9a947f`, 2026-07-01

## Why this matters

Check-in state is currently split across two representations that don't talk to each other. The three writers (web attendee toggle, REST check-in, REST scan) flip `Tickets.status` between `AVAILABLE`/`NOT_AVAILABLE` and never touch `Tickets.checkinTimestamp`. The one reader of the new representation — `packages/api/src/services/organizer.ts:100–101`, which serves the rebuilt organizer mobile app via tRPC — derives `checkedIn: !!t.checkinTimestamp`. Verified by grep: **no code path in the repo ever writes `checkinTimestamp`**, so the new app reports every attendee as not checked in regardless of what happens at the door. This also blocks the roadmap's check-in analytics (item 2.11 — the schema comment on the column says "set when scanned/checked in at the door") because no data is being captured at live events today.

## Current state

- `packages/db/prisma/schema.prisma` — `Tickets` model has `status TicketStatus @default(NOT_AVAILABLE)` and `checkinTimestamp DateTime?` with comment `// set when scanned/checked in at the door (roadmap 2.11)`. NOTE the status overload (roadmap 2.5): `NOT_AVAILABLE` means both "unsold/pending payment" and "checked in" — that rename is out of scope here.
- Writers (none set `checkinTimestamp` today):
  - `apps/web/src/app/api/organizer/tickets/scan/route.ts` — one-way scan; after plan 002 this is a single `updateMany({ where: { ..., status: AVAILABLE }, data: { status: NOT_AVAILABLE } })`.
  - `apps/web/src/app/api/organizer/tickets/check-in/route.ts` — toggle: `AVAILABLE ↔ NOT_AVAILABLE` (`route.ts:53–63`).
  - `apps/web/src/app/organizer/events/[eventId]/attendees/_actions/attendeeActions.ts` — `toggleTicketStatus`, same toggle (`attendeeActions.ts:37–55`).
- Reader: `packages/api/src/services/organizer.ts:94–102`:

```ts
    guests: event.tickets.map((t) => ({
      ...
      checkedIn: !!t.checkinTimestamp,
      checkedInAt: t.checkinTimestamp?.toISOString(),
    })),
```

- Web UI reader: `apps/web/src/app/organizer/events/[eventId]/attendees/_components/AttendeeTable.tsx` derives checked-in display from `status` (badge "Checked In" when `NOT_AVAILABLE`). Leave its logic alone in this plan; it stays consistent because status keeps being written.

Semantics to implement (dual-write, status remains authoritative for the legacy UI):

- Any transition INTO checked-in (scan success; toggle to `NOT_AVAILABLE`) → also set `checkinTimestamp: new Date()`.
- Any transition OUT of checked-in (toggle back to `AVAILABLE` — the "undo mistaken check-in" path) → also set `checkinTimestamp: null`.

## Commands you will need

| Purpose             | Command                             | Expected on success |
| ------------------- | ----------------------------------- | ------------------- |
| Typecheck (web)     | `yarn --cwd apps/web typecheck`     | exit 0              |
| Typecheck (api pkg) | `yarn --cwd packages/api typecheck` | exit 0              |
| Tests (web)         | `yarn --cwd apps/web test`          | all pass            |
| Tests (api pkg)     | `yarn --cwd packages/api test`      | all pass (vitest)   |
| Lint                | `yarn --cwd apps/web lint`          | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `apps/web/src/app/api/organizer/tickets/scan/route.ts`
- `apps/web/src/app/api/organizer/tickets/check-in/route.ts`
- `apps/web/src/app/organizer/events/[eventId]/attendees/_actions/attendeeActions.ts`
- Their test files (created in plans 001/002; extend, or create `attendeeActions.test.ts`)

**Out of scope** (do NOT touch):

- `packages/db/prisma/schema.prisma` — no schema change needed; the column exists.
- The `TicketStatus` enum / roadmap 2.5 rename (`VALID`/`USED`/...) — separate initiative.
- `AttendeeTable.tsx` display logic — keeps reading `status`.
- Backfilling historical check-ins — impossible (no timestamp data exists); do not invent one.
- `packages/api/src/services/organizer.ts` — reader is already correct.

## Git workflow

- Branch: `advisor/003-unify-checkin-state`.
- Conventional commit, e.g. `fix(organizer): record checkinTimestamp on every check-in path`.
- No push/PR unless instructed. No `--no-verify`.

## Steps

### Step 1: Scan route writes the timestamp

In the scan route's conditional update (post-plan-002 shape), add the timestamp to `data`:

```ts
data: { status: TicketStatus.NOT_AVAILABLE, checkinTimestamp: new Date() },
```

If plan 002 has NOT landed (drift check shows the original read-then-update shape), apply the same `data` addition to the `prisma.tickets.update` at `scan/route.ts:88–95` instead.

**Verify**: `yarn --cwd apps/web typecheck` → exit 0.

### Step 2: Check-in route toggle writes/clears the timestamp

In `check-in/route.ts`, where `newStatus` is computed, also compute the timestamp:

```ts
const checkingIn = ticket.status === 'AVAILABLE';
const updatedTicket = await prisma.tickets.update({
  where: { id: ticketId },
  data: {
    status: checkingIn ? 'NOT_AVAILABLE' : 'AVAILABLE',
    checkinTimestamp: checkingIn ? new Date() : null,
  },
});
```

**Verify**: `yarn --cwd apps/web typecheck` → exit 0.

### Step 3: Web attendee toggle writes/clears the timestamp

Same change in `attendeeActions.ts` `toggleTicketStatus` — the `prisma.tickets.update` at lines 43–55 gains `checkinTimestamp: newStatus === TicketStatus.NOT_AVAILABLE ? new Date() : null` in `data`.

**Verify**: `yarn --cwd apps/web typecheck` → exit 0; `yarn --cwd apps/web lint` → exit 0.

### Step 4: Tests

Extend the route tests from plan 002 and add `attendeeActions.test.ts` (mock pattern per plan 001). Cases:

1. scan success → update payload includes a `checkinTimestamp` that is a `Date`.
2. check-in toggle AVAILABLE→NOT_AVAILABLE → `checkinTimestamp` set; NOT_AVAILABLE→AVAILABLE → `checkinTimestamp: null`.
3. `toggleTicketStatus` same two assertions.

**Verify**: `yarn --cwd apps/web test` → all pass. `yarn --cwd packages/api test` → all pass (unchanged, regression guard).

## Done criteria

- [ ] `yarn --cwd apps/web typecheck` and `yarn --cwd packages/api typecheck` exit 0
- [ ] `yarn --cwd apps/web test` and `yarn --cwd packages/api test` exit 0
- [ ] `grep -rn "checkinTimestamp" apps/web/src` shows writes in exactly the three writer files
- [ ] Every write that sets `status: NOT_AVAILABLE` in those three files also sets `checkinTimestamp`
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `checkinTimestamp` does not exist on the `Tickets` model (schema drift).
- You find an additional writer flipping `Tickets.status` for check-in purposes beyond the three listed (search: `grep -rn "NOT_AVAILABLE" apps/web/src packages/api/src` and inspect) — report it; the plan must cover all writers or none.
- The checkout/payment flow also sets `status: NOT_AVAILABLE` (it does — that means "unsold/pending", NOT check-in; those call sites must NOT set `checkinTimestamp`. If you cannot cleanly distinguish a check-in write from an inventory write at any call site, stop and report).

## Maintenance notes

- When roadmap 2.5 lands (statuses `VALID`/`USED`/`CANCELLED`/`REFUNDED`), `checkinTimestamp` + `USED` become the canonical pair and the dual meaning of `NOT_AVAILABLE` disappears; this plan's dual-write makes that migration a pure rename.
- This unblocks check-in analytics (roadmap 2.11 / direction finding DIR-06): once timestamps accumulate, an "attendance timeline" card on the event overview becomes a read-only feature.
- Reviewer should scrutinize: that no checkout-path `status` write accidentally gained a timestamp.
