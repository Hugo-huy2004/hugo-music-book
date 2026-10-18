-- Chương 13: quyền trên kênh Realtime riêng tư. Kênh `workspace:<user id>` chỉ chủ tài khoản vào được
-- (đồng bộ giữa các máy của cùng một người). Các kênh đài và blind test là kênh công khai.

create policy "users join their own workspace channel"
  on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'workspace:' || (select auth.uid())::text);

create policy "users broadcast on their own workspace channel"
  on realtime.messages for insert to authenticated
  with check ((select realtime.topic()) = 'workspace:' || (select auth.uid())::text);
