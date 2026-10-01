-- =============================================================================
-- Step 2: owner dashboard support
--   1. Business name from sign-up metadata
--   2. Storage bucket for worker photos
-- =============================================================================

-- 1. Sign-up passes { business_name } as user metadata; use it for the
--    owner's settings row instead of the generic default.
create or replace function private.handle_new_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.owner_settings (owner_id, business_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'business_name'), ''), 'My Business')
  )
  on conflict (owner_id) do nothing;
  return new;
end;
$$;

-- 2. Worker photos.
-- Public bucket: the kiosk (anon) must show photos. Paths are
-- "<owner_id>/<random uuid>.jpg", so URLs can't be guessed or listed.
-- Owners can only write inside their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('worker-photos', 'worker-photos', true, 1048576,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "owners read own worker photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'worker-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "owners upload own worker photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'worker-photos'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "owners update own worker photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'worker-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "owners delete own worker photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'worker-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
