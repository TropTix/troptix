-- Scope both public buckets' writes to the uploader's own folder.
--
-- Supersedes the write policies in
--   20260615135723_event_flyers_bucket.sql       (event-flyers)
--   20260703120000_organization_logos_bucket.sql (organization-logos)
-- which granted INSERT/UPDATE/DELETE to every authenticated user with bucket_id
-- as the only predicate. Signup is open and passwordless (ADR 0015), so that let
-- any account overwrite or delete any organizer's flyer or logo. There is no
-- bucket versioning, so deletes are unrecoverable.
--
-- Uploads happen directly from the browser under these policies (ADR 0016 —
-- apps/web/src/lib/supabase/storage.ts imports the browser client), so they are
-- the only gate. Unlike public-schema RLS, which is inert because the app
-- connects on a bypassrls role (ADR 0011), these are load-bearing.
--
-- WHY THE PATH AND NOT AN APP COLUMN
-- An earlier attempt derived ownership by matching the object name against
-- Events.imageUrl / Organization.logoUrl. Both are unvalidated free text that an
-- organizer sets, so pointing your own row at someone else's object name granted
-- you write access to it. Authorization must not depend on a value the caller
-- can write. The path prefix is assigned at upload time and is the one thing the
-- policy and the object agree on without consulting a mutable table.
--
-- storage.foldername(name) returns the subfolder array: 'a/b/f.png' -> {a,b}.
-- Pre-existing objects sit at flat paths, so foldername is empty, [1] is NULL,
-- and the comparison is NULL — they are immutable for every authenticated user.
-- That is deliberate: it closes their exposure. They are replaced by uploading a
-- new prefixed object and repointing imageUrl/logoUrl; the old file is orphaned.
--
-- INSERT is restricted too, so nobody can write into another user's folder.
-- Public SELECT is unchanged and intentionally world-readable.
-- Policies are dropped-then-created so re-running is a no-op.

-- event-flyers -------------------------------------------------------------

drop policy if exists "event-flyers authenticated insert" on storage.objects;
create policy "event-flyers authenticated insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-flyers'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

drop policy if exists "event-flyers authenticated update" on storage.objects;
create policy "event-flyers authenticated update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'event-flyers'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  )
  with check (
    bucket_id = 'event-flyers'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

drop policy if exists "event-flyers authenticated delete" on storage.objects;
create policy "event-flyers authenticated delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'event-flyers'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

-- organization-logos -------------------------------------------------------

drop policy if exists "organization-logos authenticated insert" on storage.objects;
create policy "organization-logos authenticated insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'organization-logos'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

drop policy if exists "organization-logos authenticated update" on storage.objects;
create policy "organization-logos authenticated update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'organization-logos'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  )
  with check (
    bucket_id = 'organization-logos'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

drop policy if exists "organization-logos authenticated delete" on storage.objects;
create policy "organization-logos authenticated delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'organization-logos'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );
