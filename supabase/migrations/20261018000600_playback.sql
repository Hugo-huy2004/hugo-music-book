-- Chương 11: quyền nghe và số đo khi nghe.
-- Khách ẩn danh nghe tối đa 3 bài khác nhau mỗi ngày; thành viên nghe không giới hạn.

create table public.playback_grants (
  user_id    uuid not null references auth.users (id) on delete cascade,
  song_id    uuid not null references public.songs (id) on delete cascade,
  day        date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  created_at timestamptz not null default now(),
  primary key (user_id, song_id, day)
);
alter table public.playback_grants enable row level security;
-- Không có chính sách nào: người dùng không đọc/ghi trực tiếp, chỉ đi qua hàm claim_playback.

create or replace function public.claim_playback(p_song_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_used  integer;
  v_limit constant integer := 3;
begin
  if auth.uid() is null then
    raise exception 'sign in (or continue as guest) first' using errcode = '28000';
  end if;
  if not exists (select 1 from public.songs where id = p_song_id and status = 'published') then
    raise exception 'song not found' using errcode = 'P0002';
  end if;

  if public.is_guest() then
    select count(*) into v_used from public.playback_grants where user_id = auth.uid() and day = v_today;
    -- Nghe lại bài đã nghe hôm nay không tốn lượt.
    if v_used >= v_limit and not exists (
      select 1 from public.playback_grants where user_id = auth.uid() and song_id = p_song_id and day = v_today
    ) then
      return jsonb_build_object('allowed', false, 'reason', 'guest_limit', 'limit', v_limit);
    end if;
  end if;

  insert into public.playback_grants (user_id, song_id, day) values (auth.uid(), p_song_id, v_today)
  on conflict do nothing;

  select count(*) into v_used from public.playback_grants where user_id = auth.uid() and day = v_today;
  return jsonb_build_object(
    'allowed', true,
    'remaining', case when public.is_guest() then greatest(v_limit - v_used, 0) end
  );
end;
$$;

revoke execute on function public.claim_playback from public, anon;
grant execute on function public.claim_playback to authenticated;

-- Số đo trải nghiệm nghe: bấm phát tới khi có tiếng mất bao lâu, ngắt quãng mấy lần, nghe bao lâu.
create table public.plays (
  id             bigint generated always as identity primary key,
  song_id        uuid not null references public.songs (id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform       text check (platform in ('web', 'ios', 'android')),
  tier_kbps      integer,
  startup_ms     integer check (startup_ms >= 0),
  rebuffer_count integer check (rebuffer_count >= 0),
  played_ms      integer check (played_ms >= 0),
  completed      boolean not null default false,
  created_at     timestamptz not null default now()
);
create index plays_song_time_idx on public.plays (song_id, created_at desc);
create index plays_user_time_idx on public.plays (user_id, created_at desc);
alter table public.plays enable row level security;

create policy "users record their own plays"
  on public.plays for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users read their own plays, admins read all"
  on public.plays for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

-- Bảng xếp hạng: lượt nghe từ 30 giây trở lên trong N ngày gần nhất.
create or replace function public.top_songs(p_days integer default 7, p_limit integer default 50)
returns table (song_id uuid, plays bigint)
language sql stable
security definer
set search_path = ''
as $$
  select p.song_id, count(*) as plays
    from public.plays p
    join public.songs s on s.id = p.song_id and s.status = 'published'
   where p.played_ms >= 30000
     and (p_days = 0 or p.created_at > now() - make_interval(days => p_days))
   group by p.song_id
   order by plays desc
   limit least(p_limit, 200)
$$;
grant execute on function public.top_songs to anon, authenticated;
