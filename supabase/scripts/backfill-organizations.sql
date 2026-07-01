-- One-time backfill: give every existing organizer an Organization (brand) and
-- point their events at it via Events."organizationId".
--
-- Run manually in the Supabase SQL editor (Dashboard → SQL). This is the SQL
-- equivalent of `yarn db:backfill-orgs` (packages/api ensureOrganizationForUser /
-- backfillOrganizations) — use whichever is convenient. It is IDEMPOTENT: it only
-- touches events with a NULL organizationId and reuses an org a user already owns,
-- so re-running is safe.
--
-- Prereq: the 20260630120000_add_organization_and_spotlight migration must be
-- applied first (the Organization/Spotlight tables + Events.organizationId exist).
--
-- Divergence from the TS path: slugify here does NOT strip diacritics (no unaccent
-- dependency), so an accented name may yield a slightly different slug. Slugs are
-- user-editable afterward, so this is cosmetic for a one-time backfill.

-- Optional preview — inspect what WOULD be created before running the block below:
--   SELECT DISTINCT ON (e."organizerUserId")
--          e."organizerUserId", NULLIF(btrim(e.organizer), '') AS display_name
--   FROM "Events" e
--   WHERE e."organizationId" IS NULL
--   ORDER BY e."organizerUserId", e."createdAt" DESC;

DO $$
DECLARE
  rec        record;
  base       text;
  candidate  text;
  n          int;
  new_id     text;
  existing   text;
  reserved   text[] := ARRAY[
    'new','edit','settings','admin','api','o','organizer','organization',
    'organizations','event','events','discover','auth','login','signin','signup',
    'order','orders','profile','me','about','help','terms','privacy'
  ];
BEGIN
  FOR rec IN
    SELECT DISTINCT ON (e."organizerUserId")
           e."organizerUserId"            AS owner_id,
           NULLIF(btrim(e.organizer), '') AS name          -- most-recent, trimmed
    FROM "Events" e
    WHERE e."organizationId" IS NULL
    ORDER BY e."organizerUserId", e."createdAt" DESC
  LOOP
    -- Already owns an org? Reuse it (idempotent), just link the loose events.
    SELECT o.id INTO existing
    FROM "Organization" o
    WHERE o."ownerUserId" = rec.owner_id
    ORDER BY o."createdAt" ASC
    LIMIT 1;

    IF existing IS NOT NULL THEN
      UPDATE "Events"
      SET "organizationId" = existing
      WHERE "organizerUserId" = rec.owner_id AND "organizationId" IS NULL;
      CONTINUE;
    END IF;

    -- slugify(displayName) with fallback 'Organizer'
    base := lower(coalesce(rec.name, 'Organizer'));
    base := btrim(regexp_replace(base, '[^a-z0-9]+', '-', 'g'), '-');
    IF length(base) < 3 THEN base := btrim(base || '-org', '-'); END IF;
    IF length(base) < 3 THEN base := 'org'; END IF;
    base := btrim(left(base, 32), '-');

    -- Unique + non-reserved, appending -2, -3, … (case-insensitive, like the TS path)
    candidate := base;
    n := 1;
    WHILE candidate = ANY (reserved)
          OR EXISTS (SELECT 1 FROM "Organization" o WHERE lower(o.slug) = candidate)
    LOOP
      n := n + 1;
      candidate := btrim(left(base, 32 - (length(n::text) + 1)), '-') || '-' || n::text;
    END LOOP;

    new_id := gen_random_uuid()::text;
    INSERT INTO "Organization" (id, slug, "displayName", "ownerUserId", "updatedAt")
    VALUES (new_id, candidate, coalesce(rec.name, 'Organizer'), rec.owner_id, now());

    UPDATE "Events"
    SET "organizationId" = new_id
    WHERE "organizerUserId" = rec.owner_id AND "organizationId" IS NULL;
  END LOOP;
END $$;

-- Verify: expect events_still_unlinked = 0 (or only events with a null organizerUserId).
SELECT
  (SELECT count(*) FROM "Organization")                                  AS organizations,
  (SELECT count(*) FROM "Events" WHERE "organizationId" IS NOT NULL)     AS events_linked,
  (SELECT count(*) FROM "Events" WHERE "organizationId" IS NULL)         AS events_still_unlinked;
