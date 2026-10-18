-- Chương 17: số liệu tổng quan cho trang quản trị, một lượt gọi. Chỉ admin gọi được.
create or replace function public.admin_overview()
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'songs', (select jsonb_object_agg(status, n) || jsonb_build_object('licenseMissing', 0)
                from (select status, count(*) n from public.songs group by status) x),
    'users', jsonb_build_object(
      'total',     (select count(*) from auth.users where not is_anonymous),
      'new7d',     (select count(*) from auth.users where not is_anonymous and created_at > now() - interval '7 days'),
      'active7d',  (select count(distinct user_id) from public.plays where created_at > now() - interval '7 days'),
      'disabled',  (select count(*) from auth.users where banned_until > now())),
    'listening', jsonb_build_object(
      'plays7d',     (select count(*) from public.plays where created_at > now() - interval '7 days'),
      'minutes7d',   (select coalesce(sum(played_ms), 0) / 60000 from public.plays where created_at > now() - interval '7 days'),
      'listeners7d', (select count(distinct user_id) from public.plays where created_at > now() - interval '7 days'),
      'series', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'plays', n) order by d), '[]') from (
          select date_trunc('day', g) d, (select count(*) from public.plays p where p.created_at >= g and p.created_at < g + interval '1 day') n
            from generate_series(date_trunc('day', now()) - interval '6 days', date_trunc('day', now()), interval '1 day') g) s)),
    'topSongs', (select coalesce(jsonb_agg(jsonb_build_object('_id', s.id, 'title', s.title, 'artist', a.name, 'plays', t.plays)), '[]')
                   from public.top_songs(7, 5) t join public.songs s on s.id = t.song_id join public.artists a on a.id = s.artist_id),
    'pipeline', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from public.pipeline_runs group by status) x),
    'rooms', jsonb_build_object('stations', (select count(*) from public.stations), 'blind', (select count(*) from public.blind_rooms))
  );
end;
$$;
revoke execute on function public.admin_overview from public, anon;
grant execute on function public.admin_overview to authenticated;
