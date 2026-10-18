-- Lịch chạy mỗi giây ghi 86.400 dòng nhật ký mỗi ngày vào cron.job_run_details.
-- Mỗi giờ xóa nhật ký cũ hơn một ngày để bảng không phình mãi.
select cron.schedule('cron-log-cleanup', '17 * * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '1 day' $$);
