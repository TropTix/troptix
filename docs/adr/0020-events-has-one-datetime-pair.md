# 20. Events has one DateTime pair

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

`Events` carried three column pairs describing the same two instants:

| Pair                  | State                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| `startDate`/`endDate` | Full timestamps. Written by the event form, read by every consumer.         |
| `startTime`/`endTime` | Split-out time-of-day. Nothing had written them since PR #192 (2025-05-01). |
| `startsAt`/`endsAt`   | Added by the reservation rebuild (PR #284, Phase A). Never written.         |

PR #192 taught `EventForm` to fold its time input into `startDate`/`endDate` via
`combineDateTime` before submitting. From that day, `startDate` **was** the
atomic DateTime and `startTime` was vestigial — but four UI sites still gated the
time display on `startTime`, so every event created after 2025-05-01 rendered a
date with no time. The time was in `startDate` the whole time, unread.

Thirteen months later, Phase A added `startsAt`/`endsAt` to fix "split date/time
ignores the time" ([the plan's schema table](../plans/2026-06-checkout-reservation-rebuild.md)).
For `Events` that premise was already false. The cited bug (`initiate/route.ts:394`)
was in the ticket **sale window**; the event-date columns appear to have come
along by symmetry with `TicketTypes` without re-checking. Phase A also wired the
`TicketTypes` dual-write but not the `Events` one, so `startsAt`/`endsAt` were
NULL on create and stale on edit — decaying from the day they were added.

Nothing read them: `getEventStatus`'s `startsAt ?? startDate` had zero callers.
The decay was invisible, and roadmap 2.10's "merge split date/time into single
DateTime" was quietly already done — in the app layer, in May 2025.

## Decision

`Events` keeps **one** pair — the `startDate`/`endDate` data, renamed to
**`startsAt`/`endsAt`**, full timestamps. `TicketTypes` gets the identical
treatment in a sibling migration (`saleStartDate`/`saleEndDate` data, renamed
`saleStartsAt`/`saleEndsAt`); the same three-pair shape was verified there, not
assumed.

The stale duplicate `startsAt`/`endsAt` columns and the dead `startTime`/
`endTime` columns are dropped. Any time-of-day still parked in the time columns
is folded back into the surviving pair first, for pre-2025 rows that left the
date at midnight; rows whose date already carries a time are untouched, because
the form is authoritative there. For `TicketTypes`, where the duplicates
genuinely disagreed, the atomic value wins — it is what the checkout was
actually gating sales on.

The survivors take the `…At` name, not the `…Date` one, because:

- `startDate` said _date_ while holding a full timestamp. That lie is what let
  four UI sites assume the time-of-day lived elsewhere, producing the
  missing-time bug this ADR fixes.
- Every other instant column already uses `…At` (`createdAt`, `updatedAt`,
  `deletedAt`, `expiresAt`, `processedAt`). `startDate` was the outlier.
- The wire contract already exposes `saleStartsAt`/`saleEndsAt`; renaming makes
  the DB, service, and wire vocabularies identical.

The rename is a hand-authored `RENAME COLUMN` (catalog-metadata only, no rows
touched) — never the `DROP`+`ADD` a schema-diff tool would emit for it, which
destroys the column's data. A Prisma `@map` (code says `startsAt`, column stays
`startDate`) was rejected: it is a permanent two-names-for-one-thing trap for
every raw SQL query and seed file, the exact pattern this ADR removes.

Roadmap 2.10 is therefore satisfied with no data migration — deletion and a
rename.

## Consequences

- The missing-time bug is fixed: the organizer list, platform list, and event
  detail now format `startDate`, which has carried the time since May 2025. The
  order receipt already rendered it (`getDateFormatter` defaults to
  `'MMM dd, yyyy, h:mm a'`) and merely appended a redundant second time for
  legacy rows; that duplicate is gone.
- No dual-write to forget. The bug this replaces was caused by a write path that
  had to remember a helper; one column cannot drift from itself. This is why a
  `GENERATED ALWAYS AS` column was rejected — a generated copy of `startDate`
  carries no information that `startDate` doesn't.
- Dropping is irreversible under forward-only migrations. Accepted: the dropped
  columns held either a byte-for-byte copy of `startDate` or a time-of-day that
  the fold preserves.
- `TicketTypes` still has the same three-pair shape (`saleStartDate`/
  `saleStartTime`/`saleStartsAt`). Whether its `saleStartsAt` is equally
  redundant is untested and deliberately out of scope here; `reservationColumns()`
  keeps it correctly dual-written meanwhile.
- Reverses part of Phase A of
  [the checkout reservation rebuild](../plans/2026-06-checkout-reservation-rebuild.md)
  for `Events` only. The reservation columns on `TicketTypes`/`Orders` stand.
