-- The Owner becomes an OWNER Membership row and Organization.ownerUserId goes
-- (ADR 0035). Every Organization has an owner today, so every one gets a row.
-- An owner who somehow also held an ADMIN row keeps one row, now OWNER.
insert into public."Membership" (id, "createdAt", "updatedAt", role, "organizationId", "userId")
select gen_random_uuid()::text, o."createdAt", now(), 'OWNER', o.id, o."ownerUserId"
from public."Organization" o
on conflict ("organizationId", "userId") do update set role = 'OWNER', "updatedAt" = now();

-- One Owner per Organization.
create unique index "Membership_one_owner_per_organization"
  on public."Membership" ("organizationId") where role = 'OWNER';

-- One owned Organization per person, carried over from the unique
-- ownerUserId. Owning several is a later step of the teams plan.
create unique index "Membership_one_owned_organization_per_user"
  on public."Membership" ("userId") where role = 'OWNER';

alter table public."Organization" drop constraint if exists "Organization_ownerUserId_fkey";
drop index if exists public."Organization_ownerUserId_key";
alter table public."Organization" drop column "ownerUserId";
