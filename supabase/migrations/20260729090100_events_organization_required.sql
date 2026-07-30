-- Every event belongs to an Organization (teams Phase 0, ADR 0022).
--
-- `organizationId` was added nullable and backfilled by a hand-run script
-- (apps/web/scripts/backfill-organizations.ts), and the FK's ON DELETE SET NULL
-- could re-orphan rows afterwards. A membership -> organization -> events
-- lookup silently loses null rows, so the column becomes NOT NULL and the FK
-- becomes RESTRICT. The backfill is repeated here in SQL so the invariant holds
-- no matter what state the target database is in.
--
-- Runs after 20260729090000 (one org per owner), so "the owner's org" is unambiguous.

-- Organizers who have events but no Organization: create one. Display name from
-- their newest event's `organizer` label (the backfill script's pick); slug is
-- the slugified name plus a stable short suffix so it cannot collide.
with owners as (
  select distinct on (e."organizerUserId")
    e."organizerUserId" as owner_id,
    e.organizer         as display_name
  from public."Events" e
  where e."organizationId" is null
    and not exists (
      select 1 from public."Organization" o
      where o."ownerUserId" = e."organizerUserId"
    )
  order by e."organizerUserId", e."createdAt" desc
)
insert into public."Organization"
  (id, "createdAt", "updatedAt", slug, "displayName", "ownerUserId")
select
  gen_random_uuid()::text,
  now(),
  now(),
  coalesce(
    nullif(trim(both '-' from regexp_replace(lower(display_name), '[^a-z0-9]+', '-', 'g')), ''),
    'organizer'
  ) || '-' || substr(md5(owner_id), 1, 6),
  coalesce(nullif(trim(display_name), ''), 'Organizer'),
  owner_id
from owners;

-- Link every unlinked event to its organizer's (now guaranteed, unique) org.
update public."Events" e
set "organizationId" = o.id
from public."Organization" o
where e."organizationId" is null
  and o."ownerUserId" = e."organizerUserId";

alter table public."Events"
  alter column "organizationId" set not null;

-- SET NULL created orphans on org delete; RESTRICT makes deleting an
-- Organization that still owns events an error instead.
alter table public."Events"
  drop constraint "Events_organizationId_fkey";
alter table public."Events"
  add constraint "Events_organizationId_fkey"
  foreign key ("organizationId") references public."Organization" (id)
  on delete restrict on update cascade;
