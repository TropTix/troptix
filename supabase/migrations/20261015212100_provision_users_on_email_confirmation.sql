-- Provision public."Users" when the email is confirmed, not when auth.users is
-- inserted. An OTP request inserts the auth row before anyone proves they own
-- the address, so provisioning there filled "Users" with junk and let a
-- stranger link an existing account by typing its email. Rationale: ADR 0036.
-- An error here rolls back the auth write on purpose: the sign-in fails visibly
-- and a retry runs this again, instead of leaving a session with no "Users" row.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null then
    return new;
  end if;

  if exists (select 1 from public."Users" where "authUserId" = new.id) then
    return new;
  end if;

  update public."Users"
     set "authUserId" = new.id,
         "updatedAt"  = now()
   where lower("email") = lower(new.email)
     and "authUserId" is null;
  if found then
    return new;
  end if;

  insert into public."Users" ("id", "authUserId", "email", "createdAt", "updatedAt")
  values (gen_random_uuid()::text, new.id, lower(new.email), now(), now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_confirmed on auth.users;

create trigger on_auth_user_confirmed
  after insert or update of email_confirmed_at on auth.users
  for each row
  when (new.email_confirmed_at is not null)
  execute function public.handle_new_auth_user();
