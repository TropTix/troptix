-- Membership carried OWNER rows and partial unique indexes from an abandoned
-- branch. Nothing reads them; they block owning more than one Organization.
drop index if exists public."Membership_one_owned_organization_per_user";
drop index if exists public."Membership_one_owner_per_organization";
-- Compared as text: on a database built from these migrations alone the enum
-- has no OWNER value, and the literal would not parse.
delete from public."Membership" where role::text = 'OWNER';
