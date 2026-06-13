-- User provisioning trigger: keep public."Users" in lock-step with auth.users.
-- Decision + rationale: docs/adr/0015-passwordless-auth-and-trigger-provisioning.md
-- (this is the durable record; the summary below is for whoever is reading the SQL).
--
-- WHY A TRIGGER AND NOT APPLICATION CODE
-- Post-migration, signups are passwordless: email magic-link/OTP + Google/Apple
-- OAuth (ADR 0015). Those flows create the auth.users row inside Supabase's hosted
-- GoTrue flow — our backend does NOT run at creation time, only on the user's next
-- request. So app-level provisioning would always have a window where an auth user
-- exists with no "Users" row, plus first-request races. A trigger runs in the SAME
-- transaction as the auth insert: no window, no race, no orphans, and nothing —
-- including future clients — can bypass it.
--
-- This trigger is deliberately DUMB: it only guarantees a "Users" row exists and is
-- linked. It is referential-integrity glue, NOT business logic. Anything richer
-- (Stripe customer, welcome email, profile enrichment) stays in @troptix/api
-- services, which run on the first authenticated request where they can do network
-- calls and are unit-tested. Keep it that way — a trigger that throws BLOCKS SIGNUP.
--
-- DECOUPLED IDENTITY (ADR 0011, unchanged). "Users".id is the app PK (referenced by
-- the whole Orders/Tickets/Reservation FK graph); auth.users.id is a separate uuid
-- linked via "Users"."authUserId". They are NEVER equal — for migrated users because
-- the old id is a Firebase UID, and we keep that invariant uniform for new users too
-- (id is freshly generated here, NOT set to the auth uid).
--
-- LINK-OR-CREATE. The function first tries to LINK an existing app user by email
-- (this is what makes the trigger double as the migration backfill: inserting
-- auth.users rows for existing customers auto-links them — no separate backfill
-- script). If no unlinked match exists, it CREATES a fresh "Users" row. Email is the
-- join key (unique in "Users"); matched case-insensitively since historical rows may
-- have mixed casing.
--
-- security definer + set search_path = '': the function runs as its owner (so it can
-- write public."Users" regardless of the GoTrue role) with an empty search_path, so
-- every object below is schema-qualified. gen_random_uuid()/now()/lower() are
-- pg_catalog built-ins and resolve without qualification.
--
-- VERIFY ON A PREVIEW BRANCH before relying on this:
--   1. Creating a trigger ON auth.users can be restricted on some Supabase tiers —
--      confirm this migration applies on a preview branch.
--   2. Sign up via magic-link AND via Google → exactly one "Users" row, authUserId set.
--   3. Insert an auth.users row whose email matches an existing "Users" row → it links
--      (no duplicate). Orphan gate: SELECT count(*) FROM "Users" WHERE "authUserId"
--      IS NULL should reach 0 after the import.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Supported signup flows (email OTP/magic-link, Google, Apple) always carry an
  -- email. Guard defensively: if a future provider sends none, skip provisioning
  -- rather than fail the insert and block the signup. (Would leave an auth user
  -- with no "Users" row — acceptable only because no supported flow hits this.)
  if new.email is null then
    return new;
  end if;

  -- LINK: an existing app user (migrated customer, or pre-existing account) by email.
  update public."Users"
     set "authUserId" = new.id,
         "updatedAt"  = now()
   where lower("email") = lower(new.email)
     and "authUserId" is null;

  -- CREATE: brand-new signup with no prior app user. id is app-generated, never the
  -- auth uid (ADR 0011 invariant). role defaults to PATRON. Becomes UUIDv7 once
  -- ADR 0014 lands; gen_random_uuid()::text matches today's client-side uuid format.
  if not found then
    insert into public."Users" ("id", "authUserId", "email", "createdAt", "updatedAt")
    values (
      gen_random_uuid()::text,
      new.id,
      lower(new.email),
      now(),
      now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();
