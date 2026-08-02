-- Every event belongs to an Organization (teams Phase 0, ADR 0024).
--
-- Pure constraint, no data repair: the audit measured zero NULL rows and zero
-- org-less organizers on prod and dev, every event write dual-writes
-- `organizationId`, and the product is pre-launch. SET NOT NULL fails loudly
-- if a target database ever disagrees — that is the intended behavior.
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
