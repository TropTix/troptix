-- Collapse the TicketTypes inventory columns onto one standard: the counter
-- model availability = capacity - reserved - sold. The sibling of
-- 20260716130000 (sale-window columns); same "one pair survives, no backfill"
-- reasoning.
--
-- `TicketTypes` carried two representations of the same inventory:
--   quantity / quantitySold  — the original totals. `quantity` is NOT NULL and
--                              has always been written; `quantitySold` is the
--                              sold counter maintained by every order path,
--                              legacy and new.
--   capacity / sold          — added by the reservation rebuild (PR #284) to
--                              "fix" inventory as counters. `capacity` was only
--                              ever written as a copy of `quantity`
--                              (`capacity: input.quantity`) and read as
--                              `capacity ?? quantity`; `sold` was incremented in
--                              lockstep with `quantitySold`. `reserved` (also
--                              from #284) is genuinely new and stays.
--
-- Renaming quantity → capacity and quantitySold → sold carries the data across
-- for free — the survivors are the columns that were always fully populated —
-- so this replaces the deferred "Stage 3 backfill" with a metadata-only rename.
-- reserved is untouched.
--
-- Step 1 — preserve, defensively, before dropping. The additive mirrors were
-- dual-written in lockstep, so these are no-ops for every app-written row; they
-- only matter if a mirror ever drifted ahead of its source.
UPDATE "TicketTypes"
SET "quantity" = COALESCE("capacity", "quantity");

UPDATE "TicketTypes"
SET "quantitySold" = GREATEST(COALESCE("quantitySold", 0), COALESCE("sold", 0));

-- Step 2 — drop the redundant additive mirrors. reserved is NOT dropped.
ALTER TABLE "TicketTypes"
DROP COLUMN "capacity",
    DROP COLUMN "sold";

-- Step 3 — rename the survivors to the counter vocabulary. Yes: this reuses the
-- names step 2 just dropped — the stale mirrors die, the real data takes their
-- name. The reservation code has read `capacity`/`sold` all along; after this
-- the DB finally agrees, with no `?? quantity` fallback left. Metadata-only.
ALTER TABLE "TicketTypes"
    RENAME COLUMN "quantity" TO "capacity";
ALTER TABLE "TicketTypes"
    RENAME COLUMN "quantitySold" TO "sold";

-- Step 4 — `sold` is now an inventory counter alongside `reserved`; give it the
-- same NOT NULL / default 0 shape (quantitySold was nullable). Step 1's GREATEST
-- already coalesced every row to a non-null value, so SET NOT NULL is safe.
ALTER TABLE "TicketTypes"
    ALTER COLUMN "sold" SET DEFAULT 0;
ALTER TABLE "TicketTypes"
    ALTER COLUMN "sold" SET NOT NULL;
