---
title: Date & Time Standards
status: proposed
created: 2026-07-16
tracking-issue: TBD
---

# Date & Time Standards

Give TropTix one answer to "what time is this event?" — venue-local, labelled, everywhere — and one vocabulary for rendering it.

Findings: [2026-07-16 date/time audit](../audits/2026-07-16-date-time-handling.md). Decision: [ADR 0021](../adr/0021-event-times-are-venue-local.md). Prior art: [ADR 0020](../adr/0020-events-has-one-datetime-pair.md) collapsed `Events` onto a single DateTime pair.

## Context

The audit found the storage and service layers correct — instants are stored as unambiguous UTC and compared with instant arithmetic — and the display layer incoherent. Three timezones are live simultaneously (hard-pinned New York, the server's UTC, the viewer's device), because nothing records an event's own zone. The consequences are customer-facing:

- The **ticket** renders in the holder's device zone (`TicketDisplay.tsx:32`).
- The **public event page** shows two different times for one event, on one screen (`EventPageClean.tsx:220` vs `:363`).
- The **orders list** puts an NY-formatted date beside a UTC time-of-day (`orders/page.tsx:98-99`).
- The **organizer dashboard** renders UTC throughout.
- **New York is an hour wrong for Jamaica** March–November; every seed venue is in Kingston.

For "an event's start" alone the repo has 4 formatting mechanisms, ~14 format specs, 6 helpers named some variant of `formatDate`, and 3 timezone behaviours.

## Goals

1. One stored model: **UTC instant + IANA zone**, neither derivable from the other.
2. One rendering vocabulary: semantic formatters that **take the event**, so the zone is hard to forget.
3. Event times are venue-local and labelled; operational timestamps are viewer-local and unlabelled.
4. The input path constructs instants in the **event's** zone, not the browser's.
5. **Do it before the first real event exists.** All ~19 events are past; nothing is live or upcoming. There are no patrons to migrate and no emails to reconcile. Every month this waits, the migration gets more expensive and never gets cheaper.

Explicitly **not** a goal: making the mistake unrepresentable. A branded `EventInstant` type would do that; it was judged disproportionate for a 1–2 developer team ([ADR 0021](../adr/0021-event-times-are-venue-local.md)). This plan buys a convention, and says so.

## Non-goals

- **No `timestamptz` migration.** Storage is already correct; changing it buys nothing and risks a lot.
- **No mobile-app work.** `apps/organizer` has had no feature commit since 2025-08-10; `apps/organizer-v2` is a stub-data prototype. They stay inconsistent until adopted or retired.
- **No `.ics` change.** `packages/transactional/src/calendar.ts` emits UTC `DTSTART`/`DTEND`, which is correct for RFC 5545.
- **No locale work.** `en-US`, 12-hour with AM/PM, stays the only locale.

## The model

```
instant (UTC, stored)  +  Events.timeZone (IANA, stored)  =  wall-clock text
```

Both halves are required. An instant alone cannot say what "7pm" meant; a zone alone cannot say when. This is why the zone is a column and not a config constant — a constant is what `dateUtils.ts` has today, and it is the bug.

## Phases

### Phase 0 — Collapse `TicketTypes` onto one DateTime pair

Independent of every timezone decision, and it shrinks Phase 1. `TicketTypes` has the identical three-pair shape [ADR 0020](../adr/0020-events-has-one-datetime-pair.md) removed from `Events` — **verified, not assumed**:

- `saleStartDate`/`saleEndDate` — full timestamps; `AddTicketTypeDrawer.tsx:246` folds the time in with the same `combineDateTime`/`formatTime` pair the event form uses.
- `saleStartTime`/`saleEndTime` — dead. Nothing writes them; they aren't in `ticketSchema`.
- `saleStartsAt`/`saleEndsAt` — duplicates of the date pair.

One difference from `Events`: these duplicates are **correctly dual-written** by `reservationColumns()` and **do have readers** — `checkout.ts:73` and `events.ts:140` both do `saleStartsAt ?? saleStartDate`. Collapsing means updating those two, then deleting `reservationColumns()`'s sale-window half.

Why first: Phase 1 must make the ticket forms zone-aware anyway. If the duplicates still exist, Phase 1 also has to make the **dual-write** zone-aware — more surface, and a dual-write is precisely the thing that rots. Landing this first means the timezone work never touches a column that's about to be deleted.

No new ADR — this applies ADR 0020's decision to the sibling table. A separate PR, same diff shape as the `Events` one.

**Exit:** `TicketTypes` has one DateTime pair, renamed `saleStartsAt`/`saleEndsAt` to match the `…At` house style (both tables' survivors are renamed in their collapse migrations — hand-authored `RENAME COLUMN`, never a diff-emitted `DROP`+`ADD`); `reservationColumns()` handles only `capacity`/`priceCents`.

### Phase 1 — The zone becomes data

The zone is **auto-filled from the venue's coordinates, but is always an explicit field**. `EventForm.tsx:202` already runs Google Places Autocomplete and already writes `latitude`/`longitude`/`countryCode` into the form (`:189-193`); `Events` already stores all three. Picking the address already picks the zone — the app just never asked the question. It stays a real control rather than a hidden derivation because `latitude` is nullable _and reachable as null_ (type an address, never touch the dropdown, submit), because an online event has no coordinate at all, and because a geocode can simply be wrong.

- Add `Events.timeZone String` (IANA identifier). Nullable on arrival, backfilled, then `NOT NULL`.
- Resolve `lat/lng → IANA zone` with an **offline lookup** (`tz-lookup` or equivalent). Deliberately not the Google Time Zone API: an offline table needs no key scope change, no network call in the form, no quota, and — decisively — runs inside the backfill migration, where a per-row HTTP call would be untenable.
- **Not `countryCode`**: `US` maps to six zones. The coordinate is the only field that answers the question.
- Event form: a **real zone control**, auto-filled on address selection, displayed beside the date inputs — offset with the zone name on hover, per the reference UX. Defaults to the organizer's browser zone when there's no coordinate. Never absent: under the wall-clock-wins rule the zone is an _input_ to storing an instant at all.
- **Changing the address keeps the wall clock and moves the instant** (ADR 0021, rule 2). The form must therefore read the wall clock back out via the **old** zone before re-encoding in the new one — it can't just swap the zone and keep the `Date`.
- **The form's write and read-back change together.** `combineDateTime` (`setHours`) → `fromZonedTime(date, time, zone)`, **and** `formatTime` (`toTimeString`) → `toZonedTime`. They are a matched pair that currently cancel out in the browser's zone; changing one alone shifts the event an hour on any save that touches the date, worst for exactly the organizer this plan is for — the one not sitting in the venue's zone. This is the same failure shape as `startsAt`: two things that must agree, changed independently.
- **Thread the zone into the ticket forms.** `AddTicketTypeDrawer` renders _inside_ `EventForm` during creation (`EventForm.tsx:645`) — the event has no id yet, so the zone arrives as a prop alongside the existing `eventStartDate`. `CreateTicketTypeForm` takes only `eventId` today and needs it passed from the server page. Both use the same `combineDateTime`/`formatTime` pair and so are part of this phase, not a later one.
- **Backfill — trivial, because nothing is live.** All ~19 events are past, so no wall clock needs to be right; the column just has to be non-null. Derive from `latitude`/`longitude`; default otherwise. Log the split rather than silently defaulting.
- Update `supabase/seed.sql` per CLAUDE.md — new NOT NULL column, plus resolving open question 2 below.

**Exit:** every event has a zone; the form round-trips in the event's zone. Read-only display surfaces are still as wrong as they are today — no regression, no gap.

### Phase 2 — One vocabulary

Add `apps/web/src/lib/eventTime.ts` (name TBD) exposing only semantic formatters:

| Formatter                 | Example                           | Zone   |
| ------------------------- | --------------------------------- | ------ |
| `eventDateTime(event)`    | `Wed, Aug 15, 2026 · 6:00 PM EST` | venue  |
| `eventDateRange(event)`   | `Wed, Aug 15 – Thu, Aug 16, 2026` | venue  |
| `eventTimeRange(event)`   | `6:00 PM – 11:00 PM EST`          | venue  |
| `eventDateShort(event)`   | `Aug 15`                          | venue  |
| `eventRelativeDay(event)` | `Today` / `In 3 days`             | venue  |
| `<LocalTime instant>`     | `Aug 15, 2026, 4:30 PM`           | viewer |

**Operational timestamps need a client island.** A Server Component cannot know the viewer's zone — there is no header for it, and `Intl…resolvedOptions()` on the server returns the _server's_ zone, which is the UTC bug. But most operational timestamps render in Server Components (`orders/page.tsx:311`, `getEventOverview.ts:288`, `receipt/page.tsx:216`, `orders/[orderId]/page.tsx:209`). So `timestamp()` is not a function but a small `'use client'` `<LocalTime>` that takes an ISO instant and formats on hydration.

Storing the zone on `Users`/`Organization` would make these server-renderable and would give cross-event charts a well-defined day boundary. **Deliberately not bought** — it's a preference to manage and it's wrong the moment someone travels. Revisit if the charts (Phase 4) justify it.

**The label is `Intl` `timeZoneName: 'short'`, everywhere** — resolved per-date from the IANA zone, never hardcoded, or the label re-introduces the DST bug it exists to prevent. It needs no maintained table and degrades on its own: an abbreviation where ICU has one, a GMT offset where it doesn't. Verified across every zone reachable from `EventForm`'s five Places countries (`jm, us, ca, gb, tt`):

- `EST`/`EDT`, `CST`/`CDT`, `PST`/`PDT`, `AST`, `AKDT`, `HST` — the common cases.
- `GMT+1` for `Europe/London` in summer — ICU has no short name for BST.
- `GMT-2:30` for `America/St_Johns`.

Two accepted warts: Kingston reads `EST` in July (correct — Jamaica never observes EDT — and will look wrong to Americans), and London reads `GMT+1` rather than `BST`.

Then migrate every call site in the audit's §3b/§3c/§3d tables and delete the six ad-hoc `formatDate` helpers, `getDateFormatter`, `getDateRangeFormatter`, `getTimeRangeFormatter`, and `formatTime`.

**Exit:** no `format()`, `toLocale*`, or `Intl.DateTimeFormat` call touches an event field anywhere in `apps/web`.

### Phase 3 — Email and the rest of the funnel

- `packages/transactional` imports the shared formatter and drops its hand-rolled `Intl` wrapper and duplicated `TIME_ZONE` constant. It has no `date-fns` dependency today — adding one is part of this phase.
- Confirmation email, receipt, ticket, and success screen all render venue-local and labelled.

**Exit:** one instant, one rendering, across sheet → success → email → ticket → door.

### Phase 4 — Enforcement and cleanup

- **Write the convention into `CLAUDE.md`** — event times go through the formatter module; never `format()`/`toLocale*`/`Intl` on an event field. Not a lint rule and not a branded type: both were considered and rejected as disproportionate for a 1–2 developer team (ADR 0021). `CLAUDE.md` is the honest choice because it's loaded into every agent session and much of this code is agent-written. This is discouragement, not prevention, and the plan says so rather than pretending otherwise.
- Analytics day-bucketing (`getDashboardData.ts:126-165`, `getEventOverview.ts:294-302`) currently uses UTC `.toISOString().split('T')[0]`, so a 9pm Kingston sale lands on the next day's bar. **Deferred, not solved**: a chart spanning an organizer's events has no single event zone to bucket by, and there is no `Organization.timeZone` (see Phase 2). Fixing it properly means buying that column. Left UTC until someone cares.
- Dead code from the audit: `server/lib/eventHelper.ts` (no callers), `dateUtils.ts` `formatCurrency` (no callers), the duplicate sale-window logic (`checkout.ts:73` vs `events.ts:140`), the duplicate `getEventStatus` (`_shared/eventStatus.ts` has no importers; `getEventOverview.ts:79` reimplements it), the two identical on-sale checks in `TicketTable.tsx`, unused imports at `organizer/events/[eventId]/page.tsx:37`, and the three rival `formatCurrency` implementations.

## Open questions

1. **How many existing events have coordinates?** Now low-stakes — every event is past, so a wrong zone harms nobody. Still worth one query before writing the backfill, to know whether the default path is the common path: `SELECT count(*) FILTER (WHERE latitude IS NULL), count(*) FROM "Events";`
2. **Seed intent.** `supabase/seed.sql` inserts bare `'2026-08-15 18:00:00'`, which Postgres stores verbatim and the app therefore reads as 18:00 **UTC** = 1:00 PM in Kingston. Was 18:00 meant as Kingston local? The fixture has been wrong-by-five-hours or right-by-accident this whole time, and nothing recorded which.
3. **Zone label on every surface?** Unambiguous but noisy on dense organizer tables where every row shares a zone. Possibly: label on customer-facing surfaces, state it once where it's constant.
4. **Does the organizer want the venue's zone in the dashboard?** An organizer in Kingston running a Miami event: do their tables read Miami time (the event's) or Kingston (theirs)? ADR 0021 says the event's. Worth confirming against real use — it is the same question that would justify buying `Organization.timeZone`, which Phase 2 deliberately defers.
5. **`Reservation.expiresAt` countdown.** Currently instant arithmetic, correct, and zone-free. It should stay a duration ("4:32 left"), never a wall-clock time.

## Verification

- Unit tests for each formatter across a DST boundary in both `America/Jamaica` (no DST) and a DST-observing zone — the Jamaica/New_York August divergence is the regression to pin.
- A test asserting an instant stored from one browser zone renders identically in another.
- Manual pass across the funnel — event page → sheet → success → email → ticket — with the device zone forced to something non-Eastern.
- The ~19-row backfill verified by hand against organizer intent.

## Rollout

Phase 0 lands first and is independent of every timezone decision. Phases 1–2 are one PR each and must land in order. Phase 3 depends on 2. Phase 4 is independent cleanup and can be split freely. Each PR references the umbrella issue and its phase.

The one hard constraint: **nothing inside Phase 1 can be split out**. The form's write and its read-back are a matched pair, and the three ticket/event forms all share it. Shipping half of Phase 1 shifts events by an hour on save.
