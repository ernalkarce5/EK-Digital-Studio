-- ════════════════════════════════════════════════════════════════════
-- EK Digital Studio — media storage
-- Public-read bucket (images are served by URL); only admins can list,
-- upload, replace or delete. Images referenced by content cannot be
-- deleted (enforced here, not just in the UI).
-- ════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', true, 5242880,  -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif',
        'image/x-icon', 'image/vnd.microsoft.icon']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "media: admins list"
  on storage.objects for select to authenticated
  using (bucket_id = 'media' and (select public.is_admin()));

create policy "media: admins upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (select public.is_admin()));

create policy "media: admins update"
  on storage.objects for update to authenticated
  using (bucket_id = 'media' and (select public.is_admin()))
  with check (bucket_id = 'media' and (select public.is_admin()));

create policy "media: admins delete unused"
  on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (select public.is_admin()) and public.media_in_use(name) is null);
