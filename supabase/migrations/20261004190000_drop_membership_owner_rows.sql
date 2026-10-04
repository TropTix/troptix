-- Membership carried OWNER rows and partial unique indexes from an abandoned
-- branch. Nothing reads them; they block owning more than one Organization.
drop index if exists public."Membership_one_owned_organization_per_user";
drop index if exists public."Membership_one_owner_per_organization";
delete from public."Membership" where role = 'OWNER';
