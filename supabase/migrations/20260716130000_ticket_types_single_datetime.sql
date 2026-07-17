-- Collapse the TicketTypes sale-window columns onto one pair: saleStartDate /
-- saleEndDate. The sibling of 20260716120000 (Events); same reasoning, ADR 0020.
--
-- `TicketTypes` carried three pairs for the same two instants:
--   saleStartDate/saleEndDate  — full timestamps, written and read by everything
--   saleStartTime/saleEndTime  — split-out time-of-day; nothing has ever written
--                                these. They aren't in `ticketSchema`, and the
--                                ticket form folds the time input into
--                                saleStartDate/saleEndDate via combineDateTime,
--                                exactly as the event form does.
--   saleStartsAt/saleEndsAt    — added by the reservation rebuild (PR #284) to
--                                "fix" split date/time. Unlike the Events pair
--                                these were correctly dual-written and really
--                                were read (`saleStartsAt ?? saleStartDate`) —
--                                but they only ever held a copy of the date pair.
--
-- saleStartDate/saleEndDate is the pair that works, so it is the pair that
-- survives — renamed to saleStartsAt/saleEndsAt in step 4. Landing this before
-- the timezone work (docs/plans/2026-07-date-time-standards.md, Phase 0) means
-- that work never has to make a dual-write zone-aware — a dual-write is
-- precisely the thing that rots.
--
-- Step 1 — fold any time-of-day still parked in saleStartTime/saleEndTime back
-- into the date columns, for any pre-app row that left the date at midnight.
-- A no-op for every row the app itself wrote (those have NULL time columns).
-- Rows whose date already carries a time are left alone: the form is
-- authoritative there.
UPDATE "TicketTypes"
SET "saleStartDate" = date_trunc('day', "saleStartDate") + "saleStartTime"::time
WHERE "saleStartTime" IS NOT NULL
  AND "saleStartDate" = date_trunc('day', "saleStartDate");

UPDATE "TicketTypes"
SET "saleEndDate" = date_trunc('day', "saleEndDate") + "saleEndTime"::time
WHERE "saleEndTime" IS NOT NULL
  AND "saleEndDate" = date_trunc('day', "saleEndDate");

-- Step 2 — where saleStartsAt/saleEndsAt disagree with the date pair, the
-- atomic column is the better value: it is what checkout.ts and events.ts have
-- actually been gating sales on. Preserve it before dropping.
UPDATE "TicketTypes"
SET "saleStartDate" = COALESCE("saleStartsAt", "saleStartDate"),
  "saleEndDate" = COALESCE("saleEndsAt", "saleEndDate")
WHERE "saleStartsAt" IS DISTINCT FROM "saleStartDate"
  OR "saleEndsAt" IS DISTINCT FROM "saleEndDate";

-- Step 3 — drop the redundant pairs. The two readers now use the date pair.
ALTER TABLE "TicketTypes"
DROP COLUMN "saleStartTime",
    DROP COLUMN "saleEndTime",
    DROP COLUMN "saleStartsAt",
    DROP COLUMN "saleEndsAt";

-- Step 4 — rename the survivors to the `…At` house style (see the Events
-- migration, step 3). Yes: this reuses the names step 3 just dropped — the
-- stale duplicates die, the real data takes their (correct) name. The wire
-- contract has said saleStartsAt/saleEndsAt all along; after this, the DB
-- finally agrees. Metadata-only; no rows touched.
ALTER TABLE "TicketTypes"
    RENAME COLUMN "saleStartDate" TO "saleStartsAt";
ALTER TABLE "TicketTypes"
    RENAME COLUMN "saleEndDate" TO "saleEndsAt";
