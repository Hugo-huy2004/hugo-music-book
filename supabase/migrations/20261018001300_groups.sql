-- Chương 15: nhóm nghe chung. Một người tạo nhóm, nhận mã 6 ký tự, gửi cho bạn bè; ai nhập mã thì vào nhóm.
-- Chủ nhóm điều khiển (phát, dừng, tua, đổi bài), mọi máy trong nhóm phát theo đúng giây.
-- Trạng thái phát KHÔNG lưu database: đi thẳng giữa các máy qua kênh Realtime riêng tư `group:<id>`.

create table public.listening_groups (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  name       text not null check (length(name) between 1 and 40),
  host_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  ended_at   timestamptz
);

create table public.group_members (
  group_id  uuid not null references public.listening_groups (id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.listening_groups enable row level security;
alter table public.group_members enable row level security;

-- "Tôi có phải thành viên nhóm này không?" dùng ở nhiều chính sách: gói thành hàm security definer
-- để chính sách của group_members không phải tự hỏi lại chính nó (tránh đệ quy RLS).
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.group_members where group_id = p_group_id and user_id = auth.uid()) $$;

create policy "members see their groups" on public.listening_groups for select to authenticated
  using ((select public.is_group_member(id)));
create policy "members see each other" on public.group_members for select to authenticated
  using ((select public.is_group_member(group_id)));
create policy "host ends the group" on public.listening_groups for update to authenticated
  using ((select auth.uid()) = host_id) with check ((select auth.uid()) = host_id);
create policy "members leave" on public.group_members for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Tạo nhóm: sinh mã không dễ nhầm (bỏ 0/O, 1/I), chủ nhóm tự là thành viên đầu tiên.
create or replace function public.create_group(p_name text)
returns public.listening_groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.listening_groups;
  v_code text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null or public.is_guest() then
    raise exception 'sign in to create a group' using errcode = '42501';
  end if;
  loop
    select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '') into v_code
      from generate_series(1, 6);
    exit when not exists (select 1 from public.listening_groups where code = v_code);
  end loop;
  insert into public.listening_groups (code, name) values (v_code, coalesce(nullif(trim(p_name), ''), 'Nhóm nghe chung'))
  returning * into v_group;
  insert into public.group_members (group_id) values (v_group.id);
  return v_group;
end;
$$;

-- Vào nhóm bằng mã. Khách ẩn danh cũng vào được: chỉ cần nghe theo, không cần thư viện.
create or replace function public.join_group(p_code text)
returns public.listening_groups
language plpgsql
security definer
set search_path = ''
as $$
declare v_group public.listening_groups;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '28000'; end if;
  select * into v_group from public.listening_groups
   where code = upper(trim(p_code)) and ended_at is null and created_at > now() - interval '24 hours';
  if v_group.id is null then raise exception 'group not found or expired' using errcode = 'P0002'; end if;
  insert into public.group_members (group_id) values (v_group.id) on conflict do nothing;
  return v_group;
end;
$$;

revoke execute on function public.create_group, public.join_group from public, anon;
grant execute on function public.create_group, public.join_group to authenticated;

-- Kênh Realtime riêng tư của nhóm: chỉ thành viên đọc và gửi được.
create policy "members join their group channel"
  on realtime.messages for select to authenticated
  using ((select realtime.topic()) like 'group:%'
         and (select public.is_group_member(substr((select realtime.topic()), 7)::uuid)));

create policy "members broadcast on their group channel"
  on realtime.messages for insert to authenticated
  with check ((select realtime.topic()) like 'group:%'
              and (select public.is_group_member(substr((select realtime.topic()), 7)::uuid)));
