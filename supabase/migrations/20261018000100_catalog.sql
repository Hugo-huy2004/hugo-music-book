-- Chương 4: danh mục nhạc (nghệ sĩ, bài hát).
-- Mọi bảng bật RLS ngay khi tạo: mặc định không ai đọc được gì, sau đó mới mở từng quyền (chương 7).

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- unaccent() gốc là STABLE nên không dùng được trong cột sinh tự động hay index.
-- Bọc lại thành IMMUTABLE với từ điển ghi rõ: kết quả chỉ phụ thuộc đầu vào.
create or replace function public.f_unaccent(text)
returns text
language sql immutable parallel safe strict
set search_path = ''
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

create table public.artists (
  id          bigint generated always as identity primary key,
  name        text not null unique check (length(name) between 1 and 120),
  photo_url   text,
  bio         text not null default '',
  source_url  text,
  created_at  timestamptz not null default now()
);

create type public.song_status as enum ('pending', 'processing', 'published', 'rejected', 'failed');

create table public.songs (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(title) between 1 and 200),
  artist_id     bigint not null references public.artists (id),
  album_title   text,
  album_year    smallint,
  genre         text,
  country       text,
  duration_sec  numeric(8, 2) not null default 0,

  -- giấy phép: Hugo Music chỉ phát nhạc có giấy phép mở (CC, public domain)
  license       text not null,
  license_url   text,
  source_url    text not null,
  attribution   text,

  -- file trong Storage (đường dẫn trong bucket, không phải URL)
  original_path text,
  cover_path    text,
  cover_color   text,

  -- kết quả worker (chương 10)
  hls_path      text,
  hls_tiers     integer[] not null default '{}',
  psl_mos       jsonb,
  loudness_lufs numeric(5, 2),
  bpm           numeric(6, 2),

  -- lời bài hát (chương 12)
  plain_lyrics  text,
  synced_lyrics text,

  status        public.song_status not null default 'pending',
  review_note   text,
  uploaded_by   uuid references auth.users (id) on delete set null,
  reviewed_by   uuid references auth.users (id) on delete set null,
  reviewed_at   timestamptz,
  published_at  timestamptz,
  likes_count   integer not null default 0,
  created_at    timestamptz not null default now(),

  -- cột tìm kiếm: tên bài + nghệ sĩ không dấu, chữ thường (chương 12 dùng)
  search_text   text
);

create index songs_artist_idx on public.songs (artist_id);
create index songs_published_idx on public.songs (published_at desc) where status = 'published';

alter table public.artists enable row level security;
alter table public.songs enable row level security;

-- Ai cũng đọc được bài đã phát hành và nghệ sĩ (kể cả khách chưa đăng nhập).
create policy "published songs are public"
  on public.songs for select
  to anon, authenticated
  using (status = 'published');

create policy "artists are public"
  on public.artists for select
  to anon, authenticated
  using (true);
