-- Chương 6: hồ sơ người dùng đi kèm tài khoản của Supabase Auth.
-- auth.users do Supabase quản lý (email, mật khẩu, Google...). Dữ liệu riêng của app nằm ở public.profiles.

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text unique check (username ~ '^[a-z0-9_]{3,24}$'),
  nickname      text check (length(nickname) <= 40),
  avatar_url    text,
  music_genres  text[] not null default '{}',
  country       text,
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Tạo hồ sơ ngay khi có tài khoản mới (đăng ký email, Google, hay khách ẩn danh).
-- security definer: hàm chạy với quyền của người tạo hàm, vì người dùng không có quyền ghi vào profiles của người khác.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Ai là admin: đọc từ app_metadata trong JWT. app_metadata chỉ server (secret key) mới sửa được,
-- người dùng tự sửa user_metadata của mình nhưng không đụng được app_metadata.
create or replace function public.is_admin()
returns boolean
language sql stable
set search_path = ''
as $$ select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false) $$;

-- Khách ẩn danh (signInAnonymously) có JWT với is_anonymous = true.
create or replace function public.is_guest()
returns boolean
language sql stable
set search_path = ''
as $$ select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) $$;

create policy "profiles are readable by signed-in users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
