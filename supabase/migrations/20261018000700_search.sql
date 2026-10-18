-- Chương 12: tìm kiếm tiếng Việt không dấu, gõ sai vẫn ra.
-- "mua dem", "Mưa Đêm", "muadem", "mua deem" đều phải tìm thấy bài "Mưa Đêm".

-- search_text = tên bài + tên nghệ sĩ, bỏ dấu, chữ thường. Trigger giữ nó luôn đúng.
create or replace function public.songs_search_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_text := lower(public.f_unaccent(
    new.title || ' ' || coalesce((select a.name from public.artists a where a.id = new.artist_id), '')
    || ' ' || coalesce(new.album_title, '')
  ));
  return new;
end;
$$;

create trigger songs_search_text
  before insert or update of title, artist_id, album_title on public.songs
  for each row execute function public.songs_search_text();

-- Index trigram chỉ trên bài đã phát hành: nhỏ hơn và đúng với câu truy vấn của người nghe.
create index songs_search_trgm on public.songs using gin (search_text extensions.gin_trgm_ops)
  where status = 'published';

-- Gọi từ app: supabase.rpc('search_songs', { q: 'mua dem' })
create or replace function public.search_songs(q text, p_limit integer default 30)
returns setof public.songs
language sql stable
set search_path = ''
as $$
  with term as (select lower(public.f_unaccent(trim(q))) as t)
  select s.*
    from public.songs s, term
   where s.status = 'published'
     and length(term.t) > 0
     and (s.search_text like '%' || term.t || '%' or term.t operator(extensions.<%) s.search_text)
   order by extensions.word_similarity(term.t, s.search_text) desc, s.likes_count desc
   limit least(p_limit, 100)
$$;
grant execute on function public.search_songs to anon, authenticated;
