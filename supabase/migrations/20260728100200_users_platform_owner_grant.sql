-- Platform Owner becomes an explicit grant (teams Phase 0, ADR 0022).
--
-- Until now platform-staff power was inferred from an @usetroptix.com email
-- suffix at every check site. Once outsiders can be invited to Organizations,
-- an email domain must not confer cross-organizer access — the grant becomes a
-- column, seeded from the emails that hold the power today. Granting or
-- revoking is now a row update, not a mailbox.
alter table public."Users"
  add column "isPlatformOwner" boolean not null default false;

update public."Users"
set "isPlatformOwner" = true
where lower(email) like '%@usetroptix.com';
