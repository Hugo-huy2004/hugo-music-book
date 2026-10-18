-- Chương 13: đài 24/7 nghe chung. Database giữ "đang phát bài gì, bắt đầu lúc nào";
-- mọi máy tự tính vị trí = giờ hiện tại - started_at, nên ai vào cũng nghe đúng cùng một đoạn.

create table public.stations (
  id             bigint generated always as identity primary key,
  slug           text not null unique,
  name           text not null check (length(name) <= 40),
  tagline        text check (length(tagline) <= 120),
  colors         text[] not null default array['#5E5CE6', '#0A84FF'],
  genre_pattern  text,                 -- regex trên songs.genre; null = mọi thể loại
  allow_requests boolean not null default true,
  active         boolean not null default true,
  sort_order     integer not null default 0
);

-- Trạng thái đang phát: một dòng mỗi đài, cập nhật bởi cron.
create table public.station_now (
  station_id bigint primary key references public.stations (id) on delete cascade,
  song_id    uuid not null references public.songs (id) on delete cascade,
  started_at timestamptz not null,
  ends_at    timestamptz not null
);

-- Người nghe gợi ý bài; bài có nhiều phiếu nhất được phát tiếp theo.
create table public.station_requests (
  id         bigint generated always as identity primary key,
  station_id bigint not null references public.stations (id) on delete cascade,
  song_id    uuid not null references public.songs (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  votes      integer not null default 1,
  played_at  timestamptz,
  created_at timestamptz not null default now(),
  unique (station_id, song_id, played_at)
);
create table public.station_votes (
  request_id bigint not null references public.station_requests (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (request_id, user_id)
);

alter table public.stations enable row level security;
alter table public.station_now enable row level security;
alter table public.station_requests enable row level security;
alter table public.station_votes enable row level security;

create policy "stations are public" on public.stations for select to anon, authenticated using (active);
create policy "now playing is public" on public.station_now for select to anon, authenticated using (true);
create policy "requests are public" on public.station_requests for select to anon, authenticated using (played_at is null);
create policy "admins manage stations" on public.stations for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Gợi ý / bỏ phiếu đi qua một hàm để giữ đúng luật: mỗi người một phiếu cho mỗi bài.
create or replace function public.request_song(p_station_id bigint, p_song_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint;
begin
  if auth.uid() is null or public.is_guest() then
    raise exception 'sign in to request songs' using errcode = '42501';
  end if;
  select id into v_id from public.station_requests
   where station_id = p_station_id and song_id = p_song_id and played_at is null;
  if v_id is null then
    insert into public.station_requests (station_id, song_id) values (p_station_id, p_song_id) returning id into v_id;
    insert into public.station_votes (request_id) values (v_id);
  else
    insert into public.station_votes (request_id) values (v_id) on conflict do nothing;
    update public.station_requests
       set votes = (select count(*) from public.station_votes where request_id = v_id)
     where id = v_id;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.request_song from public, anon;
grant execute on function public.request_song to authenticated;

-- Chuyển bài cho mọi đài đã hết bài: ưu tiên bài được gợi ý nhiều phiếu, không thì chọn ngẫu nhiên đúng thể loại.
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
      select so.id into v_song from public.songs so
       where so.status = 'published' and so.duration_sec > 0
         and (st.genre_pattern is null or so.genre ~* st.genre_pattern)
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
revoke execute on function public.advance_stations from public, anon, authenticated;

-- pg_cron chạy được theo giây: 5 giây kiểm tra một lần, bài chuyển trễ tối đa 5 giây.
select cron.schedule('advance-stations', '5 seconds', $$ select public.advance_stations() $$);

-- Báo cho mọi máy đang nghe ngay khi đài chuyển bài: phát sự kiện Broadcast từ chính database.
create or replace function public.broadcast_station_now()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('song_id', new.song_id, 'started_at', new.started_at, 'ends_at', new.ends_at),
    'now_playing',
    'station:' || new.station_id,
    false  -- kênh công khai: ai cũng nghe được đài, kể cả khách
  );
  return null;
end;
$$;
create trigger station_now_broadcast
  after insert or update on public.station_now
  for each row execute function public.broadcast_station_now();

-- Đồng hồ máy chủ: client gọi vài lần, lấy lần có độ trễ thấp nhất để tính lệch giờ.
create or replace function public.server_now()
returns timestamptz language sql stable as $$ select clock_timestamp() $$;
grant execute on function public.server_now to anon, authenticated;

insert into public.stations (slug, name, tagline, colors, genre_pattern, sort_order) values
  ('chill', 'Hugo Chill', 'Lo-fi, ambient và jazz nhẹ, phát 24/7', array['#5AC8FA', '#5856D6'], 'lo.?fi|ambient|chill|jazz|instrumental', 1),
  ('energy', 'Hugo Energy', 'Điện tử và pop sôi động', array['#BF5AF2', '#FF2D55'], 'electro|house|dance|pop', 2),
  ('acoustic', 'Hugo Acoustic', 'Folk, acoustic và cổ điển', array['#30D158', '#A2845E'], 'folk|acoustic|classical|orchestral', 3);
