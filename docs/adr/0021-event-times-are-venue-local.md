# 21. Event times are venue-local

- **Status:** Proposed
- **Date:** 2026-07-16

## Context

[The date/time audit](../audits/2026-07-16-date-time-handling.md) found that TropTix has no concept of an event's timezone. Nothing in the schema records where, in wall-clock terms, an event happens — so every rendering site invents an answer, and three are live at once:

- **America/New_York**, hard-pinned in `dateUtils.ts` and duplicated by hand in the email package.
- **The server's zone** — UTC on Vercel — wherever a Server Component calls `date-fns` `format()` or `toLocale*`. This is most of the organizer dashboard.
- **The viewer's device zone** — wherever a `'use client'` component does the same. This includes the ticket itself.

The same `Events.startDate` renders in all three, sometimes on one page. `America/New_York` is also the wrong answer for the country TropTix actually operates in: `America/Jamaica` does not observe DST (UTC-5 year-round) while New York shifts to UTC-4 from March to November, so every NY-pinned Jamaican event time is an hour late for two-thirds of the year.

The input path has the same hole. `combineDateTime` folds the date picker and time input together with `setHours` — the **organizer's browser zone**. The instant stored for "7:00 PM" depends on where the organizer was sitting. There is no timezone selector in any form.

Storage is not implicated: Prisma's pg adapter writes UTC digits and reads them back as UTC, so every stored value is an unambiguous instant, and every service-layer comparison is instant arithmetic. The defect is entirely in how instants are turned into, and back out of, wall-clock text.

## Decision

**An event's times are wall-clock times at its venue.** `Events` gains a `timeZone` column (IANA identifier, e.g. `America/Jamaica`), and every rendering of an event's start, end, or sale window resolves in that zone — for every viewer, on every surface — **always labelled** with the zone abbreviation (`6:00 PM EST`).

**Operational timestamps stay viewer-local.** "You ordered this at 4:30 PM", check-in times, and created/updated stamps are moments in the reader's own life, not appointments at a place. They render unlabelled in the viewer's zone.

Five rules follow:

1. **Instants stay UTC.** No `timestamptz` migration, no floating local times. The stored instant plus the event's zone is the complete model; neither is derivable from the other.
2. **The wall clock is the truth; the instant is derived.** What the organizer typed — "6:00pm" — is what they meant. The stored instant is computed from it plus the zone. So **changing the venue keeps the wall clock and moves the instant**: re-address a 6:00pm Kingston event to New York and it is still 6:00pm, now an hour earlier in absolute terms. The alternative — holding the instant and letting the displayed time jump to 7:00pm — makes editing an address silently rewrite what the organizer said.
3. **The zone is auto-filled from the venue's coordinates, but is always an explicit field.** The event form already runs Google Places Autocomplete and already captures `latitude`/`longitude` (`EventForm.tsx:189-193`), which `Events` already stores; a coordinate resolves to exactly one IANA zone. But `latitude` is nullable and reachable as null — an organizer can type an address without picking a suggestion — and an online event has no coordinate at all. Since rule 2 makes the zone an _input_ to storing anything, it can never be absent: it is a real control, auto-populated, defaulting to the organizer's browser zone when nothing better exists.
4. **Input constructs the instant in the event's zone**, not the browser's — and so does the form's read-back. These are one mechanism, not two (see the third consequence).
5. **Formatters take the event, not a bare `Date`.** A shared module exposes semantic names (`eventDateTime(event)`, not `format(d, 'PPP p')`), labelled with `Intl`'s `timeZoneName: 'short'` resolved per-date.

Deriving from `countryCode` was considered and rejected: `US` and `CA` map to six zones each, and `EventForm.tsx:207` already restricts Places to `jm, us, ca, gb, tt`. A coordinate is the only field that answers the question.

Rejected alternatives:

- **Viewer-local everywhere.** Consistent and needs no schema change, but wrong for the artifact that matters: a London buyer's Kingston ticket would read "1:00 AM", and the ticket would disagree with the door. A ticket must read the same for the buyer, the organizer, and the scanner.
- **A single fixed zone** (`America/Jamaica` instead of `America/New_York`). Fixes today's DST bug and the three-way inconsistency with no schema change, but re-buys the same debt the first time an event runs outside Jamaica.
- **Keep `America/New_York`.** The status quo, provably wrong ~8 months a year for the only market in production.

## Consequences

- The ticket, the confirmation email, the event page, and the organizer dashboard all show one time. Today they can show four.
- **The backfill is nearly free, because no event is live or upcoming.** All ~19 existing events are past. Nothing about them needs a correct wall clock — nobody is attending them — so the backfill only has to satisfy `NOT NULL`: derive from `latitude`/`longitude`, default otherwise. The half that is genuinely unrecoverable (what instant the organizer meant, given their browser's zone was never recorded) does not matter for events that already happened. **This is the cheapest this decision will ever be** — zero patrons to migrate, zero emails to reconcile. Every cost below is one-time and is paid now instead of compounding.
- **Changing a venue after tickets are sold moves the event** (rule 2). Not a problem today — nothing is sold — but it becomes one, and the guard is a warning on the form, not a change to the model.
- **The form's read-back and its write are one mechanism.** `formatTime` reads the time out and `combineDateTime` writes it back; today both use the browser's zone and cancel out, which is why the form appears correct for an organizer sitting in the venue's zone. Making one zone-aware without the other silently shifts an event by an hour on any save that touches the date. They change together or not at all.
- Zone labels are DST-dependent (`EST` vs `EDT`). Resolving them per-date via `Intl` rather than storing a string is required, or the label re-introduces the bug it exists to prevent. Accepted warts: Jamaica reads `EST` in July (correct — it never observes EDT), and London reads `GMT+1` rather than `BST` because ICU has no short name for it.
- `packages/transactional` must depend on the shared formatter rather than its own `Intl` wrapper. It has no `date-fns` dependency today.
- A per-event zone allows an event whose zone disagrees with its address. Accepted: the zone is the organizer's declaration of what "7pm" means, and online/hybrid events legitimately need one that no address implies.
- **This is enforced by convention, not by the compiler.** Nothing stops `format(event.startsAt, 'PPP p')` typechecking and shipping UTC. A branded `EventInstant` type would make it unrepresentable; it was rejected as disproportionate for a 1–2 developer team. The convention lives in `CLAUDE.md`, which is the closest thing to enforcement available — it is loaded into every agent session, and much of this code is agent-written. If it decays, branding the type is the upgrade.
- Sale windows resolve in the event's zone too. "Sales end Aug 1 at midnight" means midnight at the venue.
- The mobile apps (`apps/organizer`, `apps/organizer-v2`) are out of scope and will remain inconsistent until they adopt the same module or are retired.
