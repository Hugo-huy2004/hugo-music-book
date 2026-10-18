-- Thể loại cho người nghe chọn khi tạo hồ sơ (màn "Chào mừng"). get_meta() trả thêm preferenceGenres.
create table public.preference_genres (
  name       text primary key,
  sort_order smallint not null default 0
);
alter table public.preference_genres enable row level security;
create policy "read preference genres" on public.preference_genres for select using (true);
insert into public.preference_genres (name, sort_order) values
  ('Pop', 1), ('Rock', 2), ('Hip Hop', 3), ('EDM', 4), ('R&B', 5), ('Jazz', 6), ('Cổ điển', 7),
  ('Indie', 8), ('Lo-fi', 9), ('Ballad', 10), ('Rap Việt', 11), ('Bolero', 12);

create or replace function public.get_meta()
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'genreGroups', (select coalesce(jsonb_agg(jsonb_build_object(
        'key', key, 'label', label, 'labelEn', label_en, 'colors', colors,
        'match', case when pattern is null then null else jsonb_build_object('source', pattern, 'flags', 'i') end
      ) order by sort_order), '[]') from public.genre_groups),
    'licenses', (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'noDerivatives', no_derivatives)), '[]') from public.licenses),
    'preferenceGenres', (select coalesce(jsonb_agg(name order by sort_order), '[]') from public.preference_genres),
    'songStatuses', to_jsonb(enum_range(null::public.song_status))
  )
$$;
