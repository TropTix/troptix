-- organization-logos Storage bucket + RLS for organization brand logos.
--
-- Mirrors the event-flyers bucket (ADR 0016): a PUBLIC bucket (logos show on
-- public /o/[slug] + event pages), Organization.logoUrl stores the object PATH
-- (not a URL). storage.buckets / storage.objects are Supabase-managed (not in
-- schema.prisma), so this is hand-written, not `yarn db:new`-generated.
-- Idempotent — safe on prod and reproducible on every preview branch.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-logos',
  'organization-logos',
  true,
  5242880, -- 5 MiB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "organization-logos public read" on storage.objects;
create policy "organization-logos public read"
  on storage.objects for select
  to public
  using (bucket_id = 'organization-logos');

drop policy if exists "organization-logos authenticated insert" on storage.objects;
create policy "organization-logos authenticated insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'organization-logos');

drop policy if exists "organization-logos authenticated update" on storage.objects;
create policy "organization-logos authenticated update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'organization-logos')
  with check (bucket_id = 'organization-logos');

drop policy if exists "organization-logos authenticated delete" on storage.objects;
create policy "organization-logos authenticated delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'organization-logos');
