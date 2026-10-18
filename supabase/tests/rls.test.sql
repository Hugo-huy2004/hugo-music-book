-- Kiểm thử bảo mật từ góc nhìn kẻ tấn công. Chạy: supabase test db
begin;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.dev');
insert into public.artists (name) values ('Test Artist');
insert into public.songs (id, title, artist_id, license, source_url, status) values
  ('00000000-0000-0000-0000-0000000000f1', 'Published', (select id from public.artists where name = 'Test Artist'), 'cc-by', 'https://x', 'published'),
  ('00000000-0000-0000-0000-0000000000f2', 'Pending', (select id from public.artists where name = 'Test Artist'), 'cc-by', 'https://x', 'pending');

-- đóng vai người dùng A
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.song_likes (user_id, song_id) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f1') $$,
  '42501', null, 'A cannot like a song on behalf of B');

select lives_ok(
  $$ insert into public.song_likes (song_id) values ('00000000-0000-0000-0000-0000000000f1') $$,
  'A can like a published song');

select is((select count(*) from public.songs where id = '00000000-0000-0000-0000-0000000000f2'), 0::bigint,
  'unpublished songs are invisible to normal users');

select throws_ok($$ select public.review_song('00000000-0000-0000-0000-0000000000f2', 'publish') $$,
  '42501', 'only admins can review songs', 'a normal user cannot publish songs');

-- đóng vai khách ẩn danh
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated", "is_anonymous": true}';
select throws_ok(
  $$ insert into public.song_likes (song_id) values ('00000000-0000-0000-0000-0000000000f1') $$,
  '42501', null, 'guests cannot like songs');

select * from finish();
rollback;
