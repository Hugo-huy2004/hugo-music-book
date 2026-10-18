-- Hồ sơ đầy đủ như màn Tài khoản cần: ngày sinh, số điện thoại liên hệ, địa chỉ.
-- Đây là dữ liệu riêng: không cấp quyền đọc cột cho ai, chỉ chủ hồ sơ đọc qua my_profile().
alter table public.profiles
  add column date_of_birth  date check (date_of_birth > '1900-01-01' and date_of_birth < current_date),
  add column phone          text check (length(phone) <= 20),
  add column province       text check (length(province) <= 80),
  add column ward           text check (length(ward) <= 80),
  add column address_detail text check (length(address_detail) <= 200);
