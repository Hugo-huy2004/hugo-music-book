-- Chương 14: phòng blind test nghe chung. Cả phòng nghe cùng một đoạn ở hai mức chất lượng (A rồi B),
-- mỗi người chọn bản hay hơn hoặc "như nhau", rồi cùng xem đáp án. Kết quả kiểm chứng thang PSL (chương 10).
-- Không có server game: cron 1 giây/lần đẩy phòng sang bước tiếp theo, database phát sự kiện qua Realtime.

create table public.blind_rooms (
  id         bigint generated always as identity primary key,
  slug       text not null unique,
  name       text not null,
  tagline    text,
  colors     text[] not null default array['#FF375F', '#5E5CE6'],
  active     boolean not null default true,
  sort_order integer not null default 0
);

create table public.blind_trials (
  id            uuid primary key default gen_random_uuid(),
  room_id       bigint not null references public.blind_rooms (id) on delete cascade,
  no            integer not null,
  song_id       uuid not null references public.songs (id) on delete cascade,
  a_kbps        integer not null,
  b_kbps        integer not null,
  is_control    boolean not null,     -- A và B giống hệt: đáp án đúng là "same"
  excerpt_start numeric(8, 2) not null,
  excerpt_sec   numeric(6, 2) not null default 10,
  a_at          timestamptz not null, -- lúc cả phòng bắt đầu nghe A
  b_at          timestamptz not null,
  vote_until    timestamptz not null,
  reveal_until  timestamptz not null,
  revealed      boolean not null default false
);
create index blind_trials_room_idx on public.blind_trials (room_id, no desc);

create table public.blind_votes (
  trial_id   uuid not null references public.blind_trials (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  choice     text not null check (choice in ('A', 'B', 'same')),
  correct    boolean,
  created_at timestamptz not null default now(),
  primary key (trial_id, user_id)
);

alter table public.blind_rooms enable row level security;
alter table public.blind_trials enable row level security;
alter table public.blind_votes enable row level security;
create policy "blind rooms are public" on public.blind_rooms for select to anon, authenticated using (active);
-- Lượt đang diễn ra ai cũng xem được, NHƯNG không được thấy a_kbps/b_kbps: biết bên nào bitrate cao hơn là biết đáp án.
-- Quyền theo cột: client chỉ đọc được các cột liệt kê dưới đây. Âm thanh A/B lấy qua Edge Function playback
-- (?trial=<id>&side=A), function tự tra mức bitrate bằng secret key.
create policy "trials are public" on public.blind_trials for select to anon, authenticated using (true);
revoke select on public.blind_trials from anon, authenticated;
grant select (id, room_id, no, song_id, excerpt_start, excerpt_sec, a_at, b_at, vote_until, reveal_until, revealed)
  on public.blind_trials to anon, authenticated;
create policy "users see their own votes, admins see all" on public.blind_votes for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy "admins manage blind rooms" on public.blind_rooms for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Thông tin lượt gửi cho client lúc bắt đầu: không có mức bitrate.
create or replace function public.blind_trial_json(t public.blind_trials)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', t.id, 'no', t.no, 'songId', t.song_id, 'excerptStart', t.excerpt_start, 'excerptSeconds', t.excerpt_sec,
    'aAt', extract(epoch from t.a_at) * 1000, 'bAt', extract(epoch from t.b_at) * 1000,
    'voteFrom', extract(epoch from t.b_at) * 1000, 'voteUntil', extract(epoch from t.vote_until) * 1000,
    'revealUntil', extract(epoch from t.reveal_until) * 1000)
    -- không gửi a_kbps/b_kbps: chỉ sự kiện reveal (sau khi hết giờ bỏ phiếu) mới có
$$;

create or replace function public.vote_blind(p_trial_id uuid, p_choice text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare t public.blind_trials; v_count integer;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '28000'; end if;
  select * into t from public.blind_trials where id = p_trial_id;
  if t.id is null or t.revealed or now() > t.vote_until or now() < t.b_at then
    raise exception 'voting is closed for this trial' using errcode = '22023';
  end if;
  insert into public.blind_votes (trial_id, choice) values (p_trial_id, p_choice)
  on conflict (trial_id, user_id) do update set choice = excluded.choice, created_at = now();
  select count(*) into v_count from public.blind_votes where trial_id = p_trial_id;
  perform realtime.send(jsonb_build_object('trialId', p_trial_id, 'voted', v_count), 'votes', 'blind:' || t.room_id, false);
end;
$$;
revoke execute on function public.vote_blind from public, anon;
grant execute on function public.vote_blind to authenticated;

-- Đẩy mọi phòng sang bước kế tiếp. Cron gọi mỗi giây.
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
      select * into s from public.songs
       where status = 'published' and cardinality(hls_tiers) >= 2 order by random() limit 1;
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
revoke execute on function public.advance_blind_rooms from public, anon, authenticated;
select cron.schedule('advance-blind-rooms', '1 seconds', $$ select public.advance_blind_rooms() $$);

-- Tổng hợp cho nghiên cứu: ở mỗi cặp mức, bao nhiêu phần trăm người nghe phân biệt được.
create view public.blind_results with (security_invoker = true) as
  select least(t.a_kbps, t.b_kbps) as low_kbps, greatest(t.a_kbps, t.b_kbps) as high_kbps,
         count(*) as votes,
         round(avg(case when v.correct then 1.0 when v.correct = false then 0.0 end), 3) as hit_rate,
         round(avg(case when v.choice = 'same' then 1.0 else 0.0 end), 3) as same_rate
    from public.blind_votes v join public.blind_trials t on t.id = v.trial_id
   where not t.is_control
   group by 1, 2;

insert into public.blind_rooms (slug, name, tagline, colors) values
  ('blind-main', 'Tai vàng', 'Nghe hai bản, đoán bản nào chất lượng cao hơn', array['#FF375F', '#5E5CE6']);
