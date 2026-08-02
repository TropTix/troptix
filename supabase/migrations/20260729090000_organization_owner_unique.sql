-- One Organization per owner (teams Phase 0, ADR 0024).
--
-- Pure constraint, no data repair: the 2026-07-28 audit
-- (docs/audits/2026-07-28-teams-phase0-data-audit.md) measured zero duplicate
-- owners on prod and dev, and the product is pre-launch. From here the index
-- is the guarantee — a duplicate can no longer be created, only refused.
drop index if exists public."Organization_ownerUserId_idx";
create unique index "Organization_ownerUserId_key" on public."Organization" ("ownerUserId");
