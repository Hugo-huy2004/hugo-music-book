-- Bảng xếp hạng theo thể loại, và không bao giờ trống: bài chưa ai nghe vẫn có hạng,
-- xếp sau theo lượt thích rồi theo ngày phát hành. Danh mục nhỏ lúc đầu vẫn có bảng xếp hạng.
drop function if exists public.top_songs(integer, integer);

create or replace function public.top_songs(p_days integer default 7, p_limit integer default 50, p_group text default null)
returns table (song_id uuid, plays bigint, listeners bigint)
language sql stable
security definer
set search_path = ''
as $$
  select s.id, count(p.id) as plays, count(distinct p.user_id) as listeners
    from public.songs s
    left join public.plays p
      on p.song_id = s.id and p.played_ms >= 30000
     and (p_days = 0 or p.created_at > now() - make_interval(days => p_days))
   where s.status = 'published'
     and (p_group is null or s.genre ~* (select g.pattern from public.genre_groups g where g.key = p_group and g.pattern is not null))
   group by s.id
   order by plays desc, s.likes_count desc, s.published_at desc
   limit least(p_limit, 200)
$$;
grant execute on function public.top_songs to anon, authenticated;
