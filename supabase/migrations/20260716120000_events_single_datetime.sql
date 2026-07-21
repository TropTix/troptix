-- Collapse the Events date columns onto one pair: startDate / endDate.
--
-- `Events` carried three pairs for the same two instants:
--   startDate/endDate    — full timestamps, written and read by everything
--   startTime/endTime    — split-out time-of-day; nothing has written these
--                          since PR #192 (2025-05-01) taught the event form to
--                          fold the time input into startDate/endDate
--   startsAt/endsAt      — added by the reservation rebuild (PR #284, Phase A)
--                          to "fix" split date/time, 13 months after the form
--                          had already stopped splitting it; never written, so
--                          NULL on create and stale on edit
--
-- startDate/endDate is the pair that works, so it is the pair that survives —
-- renamed to startsAt/endsAt in step 3. Roadmap 2.10 is thereby done; ADR 0020.
--
-- Step 1 — fold any time-of-day still parked in startTime/endTime back into
-- startDate/endDate, for pre-2025 rows that left the date at midnight. This
-- preserves what those rows render today (the UI read the time from startTime),
-- and is a no-op for every row the app itself wrote. Rows whose startDate
-- already carries a time are left alone: the form is authoritative there.
UPDATE "Events"
SET "startDate" = date_trunc('day', "startDate") + "startTime"::time
WHERE "startTime" IS NOT NULL
  AND "startDate" = date_trunc('day', "startDate");

UPDATE "Events"
SET "endDate" = date_trunc('day', "endDate") + "endTime"::time
WHERE "endTime" IS NOT NULL
  AND "endDate" = date_trunc('day', "endDate");

-- Step 2 — drop the redundant pairs. Nothing reads them: startsAt/endsAt never
-- had a caller, and the four UI sites that read startTime/endTime now format
-- the surviving pair instead.
ALTER TABLE "Events"
DROP COLUMN "startTime",
    DROP COLUMN "endTime",
    DROP COLUMN "startsAt",
    DROP COLUMN "endsAt";

-- Step 3 — rename the survivors to the `…At` house style every other instant
-- column already uses (createdAt/updatedAt/deletedAt/expiresAt/processedAt).
-- "startDate" said *date* while holding a full timestamp — that lie is what let
-- four UI sites assume the time lived elsewhere. Dropping the stale startsAt
-- above frees the name for the column that actually earns it. RENAME COLUMN is
-- catalog-metadata only: no rows touched, no data moved.
ALTER TABLE "Events"
    RENAME COLUMN "startDate" TO "startsAt";
ALTER TABLE "Events"
    RENAME COLUMN "endDate" TO "endsAt";
