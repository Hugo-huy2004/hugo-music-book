-- Chương 9: duyệt bài và tự động hóa ngầm.
-- Admin duyệt -> một hàm SQL đổi trạng thái VÀ đưa việc vào hàng đợi trong cùng một giao dịch
-- -> worker Node.js lấy việc ra xử lý (chương 10). Không cần server API nào ở giữa.

create extension if not exists pgmq;
select pgmq.create('media');

-- Nhật ký từng lần xử lý: admin xem được bài nào đang ở bước nào, lỗi gì.
create table public.pipeline_runs (
  id          bigint generated always as identity primary key,
  song_id     uuid not null references public.songs (id) on delete cascade,
  status      text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  step        text,
  error       text,
  attempts    integer not null default 0,
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index pipeline_runs_song_idx on public.pipeline_runs (song_id, created_at desc);
alter table public.pipeline_runs enable row level security;

create policy "admins read pipeline runs"
  on public.pipeline_runs for select to authenticated
  using ((select public.is_admin()));

-- Admin duyệt hoặc từ chối một bài. Gọi từ app: supabase.rpc('review_song', { ... })
create or replace function public.review_song(p_song_id uuid, p_decision text, p_note text default null)
returns public.songs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_song public.songs;
begin
  if not public.is_admin() then
    raise exception 'only admins can review songs' using errcode = '42501';
  end if;
  if p_decision not in ('publish', 'reject') then
    raise exception 'decision must be publish or reject' using errcode = '22023';
  end if;

  update public.songs
     set status      = case when p_decision = 'publish' then 'processing' else 'rejected' end::public.song_status,
         review_note = p_note,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_song_id and status in ('pending', 'failed', 'rejected')
  returning * into v_song;

  if v_song.id is null then
    raise exception 'song not found or already processed' using errcode = 'P0002';
  end if;

  if p_decision = 'publish' then
    insert into public.pipeline_runs (song_id) values (p_song_id);
    perform pgmq.send('media', jsonb_build_object('song_id', p_song_id));
  end if;
  return v_song;
end;
$$;

revoke execute on function public.review_song from public, anon;
grant execute on function public.review_song to authenticated;

-- Ba hàm cho worker (chỉ secret key gọi được): lấy việc, xong việc, trả việc.
create or replace function public.media_read(p_count integer default 1, p_visibility_sec integer default 600)
returns setof pgmq.message_record
language sql
security definer
set search_path = ''
as $$ select * from pgmq.read('media', p_visibility_sec, p_count) $$;

create or replace function public.media_archive(p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$ select pgmq.archive('media', p_msg_id) $$;

revoke execute on function public.media_read, public.media_archive from public, anon, authenticated;
grant execute on function public.media_read, public.media_archive to service_role;

-- Dọn khách ẩn danh không quay lại sau 30 ngày (hồ sơ, lượt nghe xóa theo nhờ on delete cascade).
create extension if not exists pg_cron;
select cron.schedule(
  'cleanup-guests',
  '17 3 * * *',
  $$ delete from auth.users where is_anonymous and created_at < now() - interval '30 days' $$
);
