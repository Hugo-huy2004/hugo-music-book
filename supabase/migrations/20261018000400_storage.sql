-- Chương 8: kho file. Bốn bucket, mỗi bucket một mức truy cập.
--   originals : file gốc admin tải lên, riêng tư (chỉ admin và worker)
--   audio     : HLS do worker tạo, riêng tư (người nghe nhận link ký qua Edge Function, chương 11)
--   covers    : ảnh bìa, công khai (CDN cache, biến đổi kích thước ảnh)
--   avatars   : ảnh đại diện, công khai; mỗi người chỉ ghi vào thư mục mang id của mình

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('originals', 'originals', false, 300 * 1024 * 1024, array['audio/mpeg', 'audio/flac', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4']),
  ('audio',     'audio',     false, null, null),
  ('covers',    'covers',    true,  10 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars',   'avatars',   true,  5 * 1024 * 1024,  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Admin tải file gốc và ảnh bìa lên.
create policy "admins upload originals and covers"
  on storage.objects for insert to authenticated
  with check (bucket_id in ('originals', 'covers') and (select public.is_admin()));

create policy "admins read originals"
  on storage.objects for select to authenticated
  using (bucket_id = 'originals' and (select public.is_admin()));

create policy "admins replace covers"
  on storage.objects for update to authenticated
  using (bucket_id = 'covers' and (select public.is_admin()));

-- avatars/<user id>/avatar.webp: thư mục đầu tiên của đường dẫn phải là id của chính mình.
create policy "users manage their own avatar"
  on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and not (select public.is_guest()));
