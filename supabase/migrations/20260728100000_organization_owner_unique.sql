-- One Organization per owner (teams Phase 0, docs/plans/2026-07-team-membership.md).
--
-- ADR 0022 fixes "exactly one Owner per Organization"; the schema comment has
-- always said "v1 exposes exactly one" but nothing enforced it, and the profile
-- page used to provision an Organization on render — so duplicates are possible.
-- Dedupe first (oldest wins — the pick findOrganizationForOwner already makes),
-- re-pointing events before the delete so the SET NULL FK can't orphan them,
-- then lock the invariant in with a unique index.

-- Re-point events owned by a duplicate org to the keeper (oldest, id as tiebreak).
update public."Events" e
set "organizationId" = keep.id
from public."Organization" cur
cross join lateral (
  select k.id
  from public."Organization" k
  where k."ownerUserId" = cur."ownerUserId"
  order by k."createdAt" asc, k.id asc
  limit 1
) keep
where e."organizationId" = cur.id
  and keep.id <> cur.id;

-- Delete every org that has an older (or equal-aged, smaller-id) sibling.
delete from public."Organization" o
using public."Organization" k
where k."ownerUserId" = o."ownerUserId"
  and (
    k."createdAt" < o."createdAt"
    or (k."createdAt" = o."createdAt" and k.id < o.id)
  );

drop index if exists public."Organization_ownerUserId_idx";
create unique index "Organization_ownerUserId_key" on public."Organization" ("ownerUserId");
