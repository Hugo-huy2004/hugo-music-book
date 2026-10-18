-- Trang quản trị: luật chọn bài cho từng đài/phòng, và các hàm admin cho phòng, người dùng, album.
-- Mọi hàm admin_* tự kiểm is_admin() rồi mới chạy (security definer: chạy bằng quyền của người tạo hàm).

-- 1. Luật chọn bài: thể loại được phép/loại trừ, thể loại cụ thể, không lời, nhẹ nhàng, phổ biến; bài ghim luôn được chọn.
alter table public.stations    add column rules jsonb not null default '{}', add column pinned uuid[] not null default '{}';
alter table public.blind_rooms add column rules jsonb not null default '{}', add column pinned uuid[] not null default '{}';

create or replace function public.room_pool(p_rules jsonb, p_pinned uuid[] default '{}', p_pattern text default null)
returns setof public.songs
language sql stable
set search_path = ''
as $$
  select s.* from public.songs s
   where s.status = 'published'
     and (s.id = any(p_pinned) or (
           (p_pattern is null or s.genre ~* p_pattern)
       and (coalesce(jsonb_array_length(p_rules->'groups'), 0) = 0 or exists (
             select 1 from public.genre_groups g
              where g.key in (select jsonb_array_elements_text(p_rules->'groups')) and g.pattern is not null and s.genre ~* g.pattern))
       and not exists (
             select 1 from public.genre_groups g
              where g.key in (select jsonb_array_elements_text(coalesce(p_rules->'excludeGroups', '[]'))) and g.pattern is not null and s.genre ~* g.pattern)
       and (coalesce(jsonb_array_length(p_rules->'categories'), 0) = 0
            or s.genre in (select jsonb_array_elements_text(p_rules->'categories')))
       and (not coalesce((p_rules->>'instrumental')::boolean, false) or (s.plain_lyrics is null and s.synced_lyrics is null))
       and (not coalesce((p_rules->>'calm')::boolean, false) or coalesce(s.bpm, 0) < 100)
       and (not coalesce((p_rules->>'popular')::boolean, false) or s.likes_count > 0)))
$$;

-- 2. Đài và phòng blind test chọn bài theo luật.
create or replace function public.advance_stations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  st record;
  v_song uuid;
  v_req bigint;
  v_dur numeric;
  n integer := 0;
begin
  for st in
    select s.* from public.stations s
      left join public.station_now sn on sn.station_id = s.id
     where s.active and (sn.ends_at is null or sn.ends_at <= now())
  loop
    select r.id, r.song_id into v_req, v_song from public.station_requests r
     where r.station_id = st.id and r.played_at is null
     order by r.votes desc, r.created_at limit 1;

    if v_song is null then
      select so.id into v_song from public.room_pool(st.rules, st.pinned, st.genre_pattern) so
       where so.duration_sec > 0
         and so.id is distinct from (select sn.song_id from public.station_now sn where sn.station_id = st.id)
       order by random() limit 1;
    else
      update public.station_requests set played_at = now() where id = v_req;
    end if;
    continue when v_song is null;

    select duration_sec into v_dur from public.songs where id = v_song;
    insert into public.station_now (station_id, song_id, started_at, ends_at)
    values (st.id, v_song, now(), now() + make_interval(secs => v_dur))
    on conflict (station_id) do update
      set song_id = excluded.song_id, started_at = excluded.started_at, ends_at = excluded.ends_at;
    n := n + 1;
    v_song := null; v_req := null;
  end loop;
  return n;
end;
$$;

create or replace function public.advance_blind_rooms()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.blind_rooms;
  t public.blind_trials;
  s public.songs;
  v_low integer; v_high integer; v_control boolean; v_a integer; v_b integer;
  v_start timestamptz; v_ex numeric := 10;
begin
  for r in select * from public.blind_rooms where active loop
    select * into t from public.blind_trials where room_id = r.id order by no desc limit 1;

    -- 1) hết giờ bỏ phiếu: chấm điểm, công bố
    if t.id is not null and not t.revealed and now() >= t.vote_until then
      update public.blind_votes set correct = case
          when t.is_control then choice = 'same'
          when choice = 'same' then null
          else (choice = 'A') = (t.a_kbps > t.b_kbps)
        end
       where trial_id = t.id;
      update public.blind_trials set revealed = true where id = t.id;
      perform realtime.send(jsonb_build_object(
        'trialId', t.id, 'aKbps', t.a_kbps, 'bKbps', t.b_kbps, 'control', t.is_control,
        'tally', (select jsonb_build_object(
            'A', count(*) filter (where choice = 'A'), 'B', count(*) filter (where choice = 'B'),
            'same', count(*) filter (where choice = 'same')) from public.blind_votes where trial_id = t.id),
        'leaderboard', (select coalesce(jsonb_agg(x order by x.correct desc), '[]') from (
            select v.user_id as "userId", coalesce(p.nickname, 'Người nghe') as name,
                   count(*) filter (where v.correct) as correct, count(*) as total
              from public.blind_votes v
              join public.blind_trials bt on bt.id = v.trial_id and bt.room_id = r.id
              left join public.profiles p on p.id = v.user_id
             where bt.a_at > now() - interval '1 hour'
             group by v.user_id, p.nickname order by 3 desc limit 10) x)
      ), 'reveal', 'blind:' || r.id, false);

    -- 2) công bố xong (hoặc phòng chưa có lượt nào): tạo lượt mới
    elsif t.id is null or (t.revealed and now() >= t.reveal_until) then
      select * into s from public.room_pool(r.rules, r.pinned)
       where cardinality(hls_tiers) >= 2 order by random() limit 1;
      continue when s.id is null;
      v_low := s.hls_tiers[1];
      v_high := s.hls_tiers[cardinality(s.hls_tiers)];
      v_control := random() < 1.0 / 6;
      v_a := v_low; v_b := case when v_control then v_low else v_high end;
      if random() < 0.5 then select v_b, v_a into v_a, v_b; end if; -- đảo vị trí để không đoán theo thứ tự
      v_start := now() + interval '3 seconds';
      insert into public.blind_trials (room_id, no, song_id, a_kbps, b_kbps, is_control, excerpt_start, excerpt_sec,
                                       a_at, b_at, vote_until, reveal_until)
      values (r.id, coalesce(t.no, 0) + 1, s.id, v_a, v_b, v_control,
              round((greatest(0, s.duration_sec - v_ex) * (0.2 + random() * 0.5))::numeric, 2), v_ex,
              v_start, v_start + make_interval(secs => v_ex + 1),
              v_start + make_interval(secs => 2 * v_ex + 9), v_start + make_interval(secs => 2 * v_ex + 15))
      returning * into t;
      perform realtime.send(public.blind_trial_json(t), 'trial', 'blind:' || r.id, false);
    end if;
  end loop;
end;
$$;

-- 3. Phòng: danh sách cho admin, xem trước luật, chuyển bài, thêm/bớt hàng chờ.
create or replace function public.admin_rooms()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'rooms', (select coalesce(jsonb_agg(r order by r->>'kind' desc, (r->>'order')::int), '[]') from (
        select jsonb_build_object('id', 'station:' || id, 'kind', 'station', 'slug', slug, 'name', name, 'tagline', tagline,
                 'colors', colors, 'order', sort_order, 'active', active, 'allowRequests', allow_requests, 'rules', rules, 'pinned', pinned) r
          from public.stations
        union all
        select jsonb_build_object('id', 'blind:' || id, 'kind', 'blind', 'slug', slug, 'name', name, 'tagline', tagline,
                 'colors', colors, 'order', sort_order, 'active', active, 'rules', rules, 'pinned', pinned)
          from public.blind_rooms) x),
    'genres', (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'label', label) order by sort_order), '[]')
                 from public.genre_groups where pattern is not null),
    'categories', (select coalesce(jsonb_agg(distinct genre), '[]') from public.songs where status = 'published' and genre is not null));
end;
$$;

create or replace function public.admin_room_preview(p_rules jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'count', (select count(*) from public.room_pool(p_rules)),
    'sample', (select coalesce(jsonb_agg(t), '[]') from (select title as t from public.room_pool(p_rules) order by random() limit 5) x));
end;
$$;

create or replace function public.admin_room_skip(p_station_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  update public.station_now set ends_at = now() where station_id = p_station_id;
  perform public.advance_stations();
end;
$$;

-- Admin thêm bài vào hàng chờ: số phiếu rất lớn để luôn được phát trước gợi ý của người nghe.
create or replace function public.admin_room_enqueue(p_station_id bigint, p_song_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  insert into public.station_requests (station_id, song_id, votes) values (p_station_id, p_song_id, 1000000);
end;
$$;

create or replace function public.admin_room_dequeue(p_request_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  delete from public.station_requests where id = p_request_id and played_at is null;
end;
$$;

-- 4. Người dùng: đọc auth.users (chỉ admin), kèm số liệu nghe nhạc.
create or replace function public.admin_user_row(u auth.users)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    '_id', u.id, 'email', coalesce(u.email, ''), 'emailVerified', u.email_confirmed_at is not null, 'phone', u.phone,
    'username', coalesce(p.username, ''), 'nickname', p.nickname, 'avatarUrl', p.avatar_url, 'musicGenres', p.music_genres,
    'role', case when u.raw_app_meta_data->>'role' = 'admin' then 'admin' else 'user' end,
    'disabled', coalesce(u.banned_until > now(), false), 'guest', u.is_anonymous,
    'googleLinked', exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google'),
    'hasPassword', u.encrypted_password is not null and u.encrypted_password <> '',
    'createdAt', u.created_at, 'lastSeenAt', u.last_sign_in_at,
    'favorites', (select count(*) from public.song_likes l where l.user_id = u.id),
    'playlists', (select count(*) from public.playlists pl where pl.owner_id = u.id),
    'plays', (select count(*) from public.plays x where x.user_id = u.id),
    'minutes', (select coalesce(sum(played_ms), 0) / 60000 from public.plays x where x.user_id = u.id))
  from (select 1) one left join public.profiles p on p.id = u.id
$$;
revoke execute on function public.admin_user_row from public, anon, authenticated;

create or replace function public.admin_users(p_q text default '', p_role text default '', p_status text default '',
                                              p_page integer default 1, p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_total integer; v_rows jsonb;
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  with f as (
    select u.* from auth.users u left join public.profiles p on p.id = u.id
     where (p_q = '' or u.email ilike '%' || p_q || '%' or p.nickname ilike '%' || p_q || '%' or p.username ilike '%' || p_q || '%')
       and (p_role = '' or (p_role = 'admin') = (u.raw_app_meta_data->>'role' = 'admin'))
       and (p_status = '' or (p_status = 'disabled') = coalesce(u.banned_until > now(), false))
       and not u.is_anonymous)
  select (select count(*) from f),
         (select coalesce(jsonb_agg(public.admin_user_row(x) order by x.created_at desc), '[]')
            from (select * from f order by created_at desc offset (p_page - 1) * p_limit limit p_limit) x)
    into v_total, v_rows;
  return jsonb_build_object('total', v_total, 'page', p_page, 'limit', p_limit, 'users', v_rows);
end;
$$;

create or replace function public.admin_user(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare u auth.users;
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  select * into u from auth.users where id = p_id;
  if u.id is null then raise exception 'user not found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'user', public.admin_user_row(u),
    'stats', (select jsonb_build_object('plays', count(*), 'minutes', coalesce(sum(played_ms), 0) / 60000,
                       'completionRate', coalesce(avg(case when completed then 1.0 else 0 end), 0),
                       'avgStartupMs', coalesce(avg(startup_ms), 0)::int, 'rebuffers', coalesce(sum(rebuffer_count), 0))
                from public.plays where user_id = p_id),
    'platforms', (select coalesce(jsonb_agg(jsonb_build_object('platform', platform, 'plays', n)), '[]')
                    from (select coalesce(platform, 'web') as platform, count(*) as n from public.plays where user_id = p_id group by 1) x),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('at', x.created_at, 'playedMs', x.played_ms, 'cdn', 'supabase',
                         'song', jsonb_build_object('_id', s.id, 'title', s.title))), '[]')
                 from (select * from public.plays where user_id = p_id order by created_at desc limit 20) x join public.songs s on s.id = x.song_id),
    'topSongs', (select coalesce(jsonb_agg(jsonb_build_object('song', jsonb_build_object('_id', s.id, 'title', s.title), 'plays', n)), '[]')
                   from (select song_id, count(*) n from public.plays where user_id = p_id group by 1 order by 2 desc limit 10) x
                   join public.songs s on s.id = x.song_id),
    'topGenres', (select coalesce(jsonb_agg(jsonb_build_object('genre', g, 'plays', n)), '[]')
                    from (select s.genre g, count(*) n from public.plays x join public.songs s on s.id = x.song_id
                           where x.user_id = p_id and s.genre is not null group by 1 order by 2 desc limit 5) y),
    'favorites', (select coalesce(jsonb_agg(jsonb_build_object('_id', s.id, 'title', s.title)), '[]')
                    from public.song_likes l join public.songs s on s.id = l.song_id where l.user_id = p_id),
    'playlists', (select coalesce(jsonb_agg(jsonb_build_object('name', pl.name,
                     'songs', (select count(*) from public.playlist_songs ps where ps.playlist_id = pl.id))), '[]')
                    from public.playlists pl where pl.owner_id = p_id),
    'activity', '[]'::jsonb);
end;
$$;

-- Thu hồi mọi phiên: xóa phiên và refresh token; access token còn hạn tối đa một giờ.
create or replace function public.admin_revoke_sessions(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  delete from auth.sessions where user_id = p_id;
end;
$$;

-- 5. Album: không có bảng riêng, album là các bài cùng nghệ sĩ + tên album.
create or replace function public.admin_albums(p_q text default '', p_page integer default 1, p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_total integer; v_rows jsonb;
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  with a as (
    select s.artist_id || ':' || s.album_title as key, s.album_title as title, ar.name as artist, max(s.album_year) as year,
           count(*) as tracks, count(*) filter (where s.status = 'published') as published,
           (array_agg(s.cover_path) filter (where s.cover_path is not null))[1] as cover, array_agg(distinct s.license) as licenses
      from public.songs s join public.artists ar on ar.id = s.artist_id
     where s.album_title is not null and (p_q = '' or s.album_title ilike '%' || p_q || '%' or ar.name ilike '%' || p_q || '%')
     group by s.artist_id, s.album_title, ar.name)
  select (select count(*) from a), (select coalesce(jsonb_agg(to_jsonb(x) order by x.title), '[]')
     from (select * from a order by title offset (p_page - 1) * p_limit limit p_limit) x)
    into v_total, v_rows;
  return jsonb_build_object('total', v_total, 'page', p_page, 'limit', p_limit, 'albums', v_rows);
end;
$$;

create or replace function public.admin_update_album(p_key text, p_title text, p_artist text, p_year smallint default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_artist bigint := split_part(p_key, ':', 1)::bigint; v_title text := substr(p_key, strpos(p_key, ':') + 1); n integer;
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  update public.songs set album_title = p_title, album_year = coalesce(p_year, album_year),
                          artist_id = public.ensure_artist(p_artist)
   where artist_id = v_artist and album_title = v_title;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 6. Nghệ sĩ: kèm số bài, số album.
create or replace view public.artist_stats with (security_invoker = true) as
  select a.*, count(s.id) as songs, count(s.id) filter (where s.status = 'published') as published,
         count(distinct s.album_title) as albums, coalesce(sum(s.likes_count), 0) as popularity,
         (array_agg(s.cover_path) filter (where s.cover_path is not null))[1] as cover_path
    from public.artists a left join public.songs s on s.artist_id = a.id
   group by a.id;

do $$
declare f text;
begin
  foreach f in array array['admin_rooms()', 'admin_room_preview(jsonb)', 'admin_room_skip(bigint)', 'admin_room_enqueue(bigint, uuid)',
    'admin_room_dequeue(bigint)', 'admin_users(text, text, text, integer, integer)', 'admin_user(uuid)', 'admin_revoke_sessions(uuid)',
    'admin_albums(text, integer, integer)', 'admin_update_album(text, text, text, smallint)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
