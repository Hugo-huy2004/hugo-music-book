-- Dữ liệu tham chiếu (nhóm thể loại, giấy phép) nằm trong database, không viết cứng trong app:
-- thêm một nhóm thể loại là thêm một dòng, mọi app thấy ngay mà không cần phát hành bản mới.

create table public.genre_groups (
  key        text primary key,
  label      text not null,
  label_en   text not null,
  colors     text[] not null,
  pattern    text,            -- regex trên songs.genre; null = tất cả
  sort_order integer not null default 0
);

create table public.licenses (
  key            text primary key,
  label          text not null,
  no_derivatives boolean not null default false  -- ND: không được chuyển mã (không tạo HLS)
);

alter table public.genre_groups enable row level security;
alter table public.licenses enable row level security;
create policy "genre groups are public" on public.genre_groups for select to anon, authenticated using (true);
create policy "licenses are public" on public.licenses for select to anon, authenticated using (true);

-- Một lượt gọi trả đủ dữ liệu tham chiếu cho app, đúng hình dạng app cần.
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
    'songStatuses', to_jsonb(enum_range(null::public.song_status))
  )
$$;
grant execute on function public.get_meta to anon, authenticated;

-- Admin tải bài lên với tên nghệ sĩ: có rồi thì dùng, chưa có thì tạo.
create or replace function public.ensure_artist(p_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint;
begin
  if not public.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  insert into public.artists (name) values (trim(p_name)) on conflict (name) do nothing;
  select id into v_id from public.artists where name = trim(p_name);
  return v_id;
end;
$$;
revoke execute on function public.ensure_artist from public, anon;
grant execute on function public.ensure_artist to authenticated;

insert into public.genre_groups (key, label, label_en, colors, pattern, sort_order) values
  ('all', 'Tất cả', 'All', array['#8E8E93', '#3A3A3C'], null, 0),
  ('chill', 'Chill', 'Chill', array['#5AC8FA', '#5856D6'], 'lo.?fi|ambient|chill|downtempo|jazz|instrumental', 1),
  ('electronic', 'Điện tử', 'Electronic', array['#BF5AF2', '#FF2D55'], 'electro|techno|house|trance|idm|dance|club|industrial', 2),
  ('pop', 'Pop', 'Pop', array['#FF9F0A', '#FF375F'], 'pop', 3),
  ('rock', 'Rock & Metal', 'Rock & Metal', array['#FF453A', '#1C1C1E'], 'rock|metal|punk|grind|noise', 4),
  ('hiphop', 'Hip hop', 'Hip hop', array['#FFD60A', '#FF9500'], 'hip.?hop|rap|grime', 5),
  ('folk', 'Folk & Acoustic', 'Folk & Acoustic', array['#34C759', '#0A84FF'], 'folk|acoustic|singer|country|blues', 6),
  ('classical', 'Cổ điển', 'Classical', array['#AC8E68', '#3A3A3C'], 'classical|orchestral|opera|waltz|ballet', 7);

insert into public.licenses (key, label, no_derivatives) values
  ('public-domain', 'Public Domain', false),
  ('cc0', 'CC0', false),
  ('cc-by', 'CC BY', false),
  ('cc-by-sa', 'CC BY-SA', false),
  ('cc-by-nc', 'CC BY-NC', false),
  ('cc-by-nc-sa', 'CC BY-NC-SA', false),
  ('cc-by-nd', 'CC BY-ND', true),
  ('cc-by-nc-nd', 'CC BY-NC-ND', true);
