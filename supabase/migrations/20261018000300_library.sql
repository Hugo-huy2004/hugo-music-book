-- Chương 7: thư viện cá nhân (thích bài, danh sách phát) và quyền admin trên danh mục.
-- Mỗi chính sách RLS trả lời một câu: AI được làm GÌ với DÒNG NÀO.

-- Admin quản lý toàn bộ danh mục, kể cả bài chưa phát hành.
create policy "admins manage songs"
  on public.songs for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "admins manage artists"
  on public.artists for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------- bài đã thích
create table public.song_likes (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  song_id    uuid not null references public.songs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);
create index song_likes_song_idx on public.song_likes (song_id);
alter table public.song_likes enable row level security;

create policy "users see their own likes"
  on public.song_likes for select to authenticated
  using ((select auth.uid()) = user_id);

-- Khách ẩn danh không được thích bài (phải đăng nhập thật): kiểm tra ngay trong chính sách.
create policy "members like songs"
  on public.song_likes for insert to authenticated
  with check ((select auth.uid()) = user_id and not (select public.is_guest()));

create policy "users unlike their own likes"
  on public.song_likes for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Đếm lượt thích bằng trigger: đọc likes_count rẻ hơn đếm song_likes mỗi lần hiển thị.
create or replace function public.sync_likes_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.songs
     set likes_count = likes_count + (case when tg_op = 'INSERT' then 1 else -1 end)
   where id = coalesce(new.song_id, old.song_id);
  return null;
end;
$$;

create trigger song_likes_count
  after insert or delete on public.song_likes
  for each row execute function public.sync_likes_count();

-- ---------- danh sách phát
create table public.playlists (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(name) between 1 and 80),
  description text not null default '' check (length(description) <= 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index playlists_owner_idx on public.playlists (owner_id);

create table public.playlist_songs (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  song_id     uuid not null references public.songs (id) on delete cascade,
  position    integer not null,
  added_at    timestamptz not null default now(),
  primary key (playlist_id, song_id)
);

alter table public.playlists enable row level security;
alter table public.playlist_songs enable row level security;

create policy "owners manage their playlists"
  on public.playlists for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id and not (select public.is_guest()));

-- Bài trong danh sách: được phép nếu danh sách đó thuộc về mình.
create policy "owners manage playlist songs"
  on public.playlist_songs for all to authenticated
  using (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = (select auth.uid())));
