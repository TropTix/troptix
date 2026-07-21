-- spotlight-images Storage bucket + RLS for per-event Spotlight card images.
--
-- Mirrors the event-flyers / organization-logos buckets (ADR 0016): a PUBLIC
-- bucket (spotlight cards show on public event pages), Spotlight.imageUrl stores
-- the object PATH (not a URL). storage.buckets / storage.objects are
-- Supabase-managed (not in schema.prisma), so this is hand-written, not
-- `yarn db:new`-generated. Idempotent — safe on prod and reproducible on every
-- preview branch.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'spotlight-images',
  'spotlight-images',
  true,
  5242880, -- 5 MiB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "spotlight-images public read" on storage.objects;
create policy "spotlight-images public read"
  on storage.objects for select
  to public
  using (bucket_id = 'spotlight-images');

drop policy if exists "spotlight-images authenticated insert" on storage.objects;
create policy "spotlight-images authenticated insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'spotlight-images');

drop policy if exists "spotlight-images authenticated update" on storage.objects;
create policy "spotlight-images authenticated update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'spotlight-images')
  with check (bucket_id = 'spotlight-images');

drop policy if exists "spotlight-images authenticated delete" on storage.objects;
create policy "spotlight-images authenticated delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'spotlight-images');
