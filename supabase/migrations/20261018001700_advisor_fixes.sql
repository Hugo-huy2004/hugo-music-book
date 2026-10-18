-- Sửa theo Security Advisor và Performance Advisor của Supabase (chương 21).

-- 1. Hàm trigger không phải API: không ai được gọi qua /rest/v1/rpc.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.sync_likes_count() from public, anon, authenticated;
revoke execute on function public.broadcast_station_now() from public, anon, authenticated;
-- Hàm dùng trong chính sách RLS: người đăng nhập cần quyền gọi, khách thì không.
revoke execute on function public.is_group_member(uuid) from public, anon;

-- 2. search_path cố định cho mọi hàm.
alter function public.server_now() set search_path = '';

-- 3. Một chính sách cho mỗi hành động: chính sách "for all" của admin chồng lên chính sách đọc công khai,
--    Postgres phải chạy cả hai cho mỗi dòng. Tách ra: đọc gộp một chính sách, ghi chỉ admin.
do $$
declare t text;
begin
  foreach t in array array['songs', 'artists', 'stations', 'blind_rooms'] loop
    execute format('drop policy if exists "admins manage %s" on public.%I', replace(t, '_', ' '), t);
    execute format('create policy "admins insert %1$s" on public.%1$I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('create policy "admins update %1$s" on public.%1$I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('create policy "admins delete %1$s" on public.%1$I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end $$;

drop policy "published songs are public" on public.songs;
create policy "published songs are public, admins see all" on public.songs for select to anon, authenticated
  using (status = 'published' or (select public.is_admin()));
drop policy "stations are public" on public.stations;
create policy "active stations are public, admins see all" on public.stations for select to anon, authenticated
  using (active or (select public.is_admin()));
drop policy "blind rooms are public" on public.blind_rooms;
create policy "active blind rooms are public, admins see all" on public.blind_rooms for select to anon, authenticated
  using (active or (select public.is_admin()));

-- 4. Chỉ mục cho khóa ngoại: xóa một bài, một người dùng không phải quét cả bảng con.
create index on public.blind_trials (song_id);
create index on public.blind_votes (user_id);
create index on public.group_members (user_id);
create index on public.listening_groups (host_id);
create index on public.playback_grants (song_id);
create index on public.playlist_songs (song_id);
create index on public.songs (reviewed_by);
create index on public.songs (uploaded_by);
create index on public.station_now (song_id);
create index on public.station_requests (song_id);
create index on public.station_requests (user_id);
create index on public.station_votes (user_id);
