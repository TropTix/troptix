# Plan 006: One currency formatter, one date formatter, one event-status derivation across the organizer surface

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7f9a947f..HEAD -- apps/web/src/app/organizer apps/web/src/lib/dateUtils.ts`
> Plans 004/005 may have moved/renamed fetchers — re-locate call sites by
> grep (commands below) rather than trusting line numbers. Excerpt mismatch
> beyond that = STOP.

## Status

- **Priority**: P3
- **Effort**: M (mechanical but wide)
- **Risk**: LOW (display-only)
- **Depends on**: none (coordinate with 005 if running concurrently — prefer after 005 Stage A)
- **Category**: tech-debt
- **Planned at**: commit `7f9a947f`, 2026-07-01

## Why this matters

Organizers see the same money and dates formatted differently on every page: the dashboard formats revenue with `toLocaleString('en-US', {minimumFractionDigits: 2, ...})` (no `$` style), the tickets and orders pages use `new Intl.NumberFormat('en-US', {style: 'currency'...})`, and the platform page uses a compact zero-decimal variant. Dates appear as "Jun 5" (dashboard), "June 5, 2025" (event detail, via date-fns `PPP`), and bare `toLocaleDateString()` elsewhere. Event status is derived by two different functions that disagree: the events list shows Active/Upcoming/Past/Draft while the event detail computes its own "Starts Tomorrow / N days until event" tree. A canonical `formatCurrency` already exists at `apps/web/src/lib/dateUtils.ts:31` and is already used by `CreateTicketTypeForm` — the fix is consolidation onto existing helpers, not new abstraction.

## Current state

Canonical helpers that already exist — `apps/web/src/lib/dateUtils.ts` exports: `getDateFormatter(date, formatString?)`, `getDateRangeFormatter`, `getTimeRangeFormatter`, `formatCurrency(amount)`, `combineDateTime`, `formatTime`. Read the file first; extend it rather than creating a parallel module.

Divergent call sites (verified at `7f9a947f`; re-grep before editing):

- Currency, hand-rolled: `apps/web/src/app/organizer/page.tsx:140`; `events/[eventId]/page.tsx:200,266–270,320`; `events/[eventId]/tickets/page.tsx:171–174,216–220`; `events/[eventId]/orders/page.tsx:176–179,205–208,225–229,240`; `platform/events/page.tsx` (compact formatter ~line 51); `events/[eventId]/tickets/_components/TicketTable.tsx` (price cell, `Free` special-case ~lines 86–91).
- Dates, hand-rolled: `organizer/page.tsx:101,214`; `events/page.tsx:131`; `events/[eventId]/page.tsx:121,129,132` (date-fns `PP`/`PPP`/`p`); `TicketTable.tsx` (bare `toLocaleDateString()` ~line 110); `platform/events/page.tsx` (date-fns `MMM d, yyyy` ~line 211).
- Status derivation, duplicated:
  - `apps/web/src/app/organizer/_lib/getEventsData.ts:49–65` (or its plan-005 service successor) — computes `'Active' | 'Upcoming' | 'Past' | 'Draft'`.
  - `apps/web/src/app/organizer/events/page.tsx:27–40` — `getStatusBadgeVariant(status)` mapping to badge variants.
  - `apps/web/src/app/organizer/events/[eventId]/_lib/getEventOverview.ts:81` — a second `getEventStatus(...)`.
  - `apps/web/src/app/organizer/events/[eventId]/page.tsx:52–100` — `getEventStatusDisplay(eventData)` with its own label tree ("Starts Today", "N days until event").
  - `apps/web/src/app/organizer/platform/_lib/getPlatformEventsData.ts:93–104` — a third copy of the same date-window logic.

Find them all fresh with:

```
grep -rn "toLocaleString\|NumberFormat\|toLocaleDateString" apps/web/src/app/organizer
grep -rn "getEventStatus\|getStatusBadgeVariant\|getEventStatusDisplay" apps/web/src/app/organizer
```

Design constraints (settled): light-only, indigo brand, tokens over raw palette (ADRs 0001–0003) — this plan changes no colors, only formatting logic.

## Commands you will need

| Purpose   | Command                         | Expected |
| --------- | ------------------------------- | -------- |
| Typecheck | `yarn --cwd apps/web typecheck` | exit 0   |
| Lint      | `yarn --cwd apps/web lint`      | exit 0   |
| Tests     | `yarn --cwd apps/web test`      | pass     |

## Scope

**In scope**:

- `apps/web/src/lib/dateUtils.ts` (extend: compact currency option, table-date helper if needed)
- New `apps/web/src/lib/eventStatus.ts` + `eventStatus.test.ts`
- All organizer files listed above (formatting call sites + status derivation call sites only)

**Out of scope**:

- Non-organizer pages (public event page, checkout) — same drift exists there; the design-system plan (`docs/plans/2026-06-design-system-standardization.md`) owns the global pass.
- Colors, tokens, spacing, empty states — design-system plan territory.
- Changing WHAT is displayed (labels like "Starts Tomorrow" stay; only their derivation centralizes).
- `apps/web/src/lib/fees.ts`.

## Git workflow

- Branch: `advisor/006-organizer-formatters`.
- Conventional commit, e.g. `refactor(organizer): consolidate currency/date/status formatting on shared helpers`.
- No push/PR unless instructed. No `--no-verify`.

## Steps

### Step 1: Extend the canonical helpers

In `dateUtils.ts`: read `formatCurrency`'s current behavior first (it takes `number | null`). Add an options form or a sibling `formatCurrencyCompact` for the platform page's zero-decimal style. Add `formatDateShort` ("Jun 5") and `formatDateMedium` ("Jun 5, 2025") using date-fns (already a dependency — `format` is imported in `events/[eventId]/page.tsx`).

**Verify**: `yarn --cwd apps/web typecheck` → exit 0.

### Step 2: Create the single status module

Create `apps/web/src/lib/eventStatus.ts`:

- `getEventStatus(isDraft: boolean, startDate: Date, endDate: Date, now?: Date): 'Draft' | 'Active' | 'Upcoming' | 'Past'` — port the logic from `getEventsData.ts:49–65` exactly (it is the most-consumed variant).
- `getEventStatusBadgeVariant(status)` — port from `events/page.tsx:27–40`.
- `getEventStatusDisplay(...)` — port the detail page's label tree from `events/[eventId]/page.tsx:52–100`, but make it call `getEventStatus` for the phase decision so list and detail can no longer disagree.
- `now` is an injectable parameter defaulting to `new Date()` — required for tests.

Write `eventStatus.test.ts` (jest): draft, upcoming, active (today within range), past, boundary day, and one assertion that list-status and display-status agree for the same inputs.

**Verify**: `yarn --cwd apps/web test --testPathPattern=eventStatus` → all pass.

### Step 3: Migrate call sites

Mechanically replace every hand-rolled formatting/status call site found by the grep commands with the shared helpers. Keep rendered output identical where formats already agree; where they disagree (the point of this plan), converge on: currency = `formatCurrency` standard style ($1,234.56) everywhere except the platform page (compact); dates = `formatDateShort` in dense tables/cards, `formatDateMedium` on detail headers. Preserve the `Free` label special-case in `TicketTable` (wrap it: `price === 0 ? 'Free' : formatCurrency(price)`).

**Verify**: `grep -rn "toLocaleString('en-US'\|Intl.NumberFormat" apps/web/src/app/organizer` → no matches; `grep -rn "toLocaleDateString" apps/web/src/app/organizer` → no matches; `yarn --cwd apps/web typecheck && yarn --cwd apps/web lint` → exit 0.

### Step 4: Delete the duplicated status functions

Remove the local `getEventStatus`/`getStatusBadgeVariant`/`getEventStatusDisplay` definitions from the files in "Current state" (or their plan-005 service successors — status derivation for LIST data may live server-side; importing `lib/eventStatus.ts` from a `packages/api` service is NOT allowed (package boundary) — if plan 005 landed first, put `getEventStatus` in the service package's `_shared` and have `lib/eventStatus.ts` re-export the types for UI-only helpers; note what you did in the report).

**Verify**: `grep -rn "function getEventStatus\|function getStatusBadgeVariant\|function getEventStatusDisplay" apps/web/src/app/organizer` → no matches; `yarn --cwd apps/web test` → pass.

## Done criteria

- [ ] `yarn --cwd apps/web typecheck`, `lint`, `test` all exit 0
- [ ] The three greps in steps 3–4 return no matches
- [ ] `eventStatus.test.ts` exists with ≥6 passing cases including the list/detail agreement case
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The list-vs-detail status logics are intentionally different in a way that centralizing would break (e.g. detail page treats multi-day events specially) — you find a case where converging changes a correct label; report the divergence table instead of picking a winner.
- Plan 005 landed and moved status derivation into `packages/api` in a shape that conflicts with step 2 — coordinate via report, don't create two sources of truth.

## Maintenance notes

- The design-system plan's typography/token pass (5.3–5.5) will touch these same files; formatting-consolidation landing first shrinks that diff.
- Follow-up deferred: the three mobile card renderers (`MobileCardView`, `MobileAttendeeView`, `MobileTicketCardView`) and per-table filter logic duplication — larger UI consolidation, recorded in `plans/README.md` backlog, not planned yet.
- Reviewer: spot-check rendered pages (dashboard, event detail, tickets, orders, platform) for label regressions — this is display-wide.
