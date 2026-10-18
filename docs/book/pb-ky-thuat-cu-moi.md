## Phụ lục B. Từ kỹ thuật cũ sang kỹ thuật trong sách

Các tài liệu Hugo Music trước đây dựng backend bằng Node.js tự viết: Express, Prisma, Redis, Socket.IO, BullMQ, lưu file trên Cloudflare R2. Sách này thay phần lớn bằng dịch vụ có sẵn của Supabase. Bảng dưới giúp người đã đọc bản cũ biết mỗi thứ giờ nằm ở đâu.

| Việc | Bản cũ | Trong sách | Chương |
|---|---|---|---|
| Viết API | Express 5: route, controller, service | API tự sinh từ bảng (PostgREST) + hàm SQL qua `rpc()` | 5 |
| Kiểm dữ liệu đầu vào | Zod ở mỗi route | Ràng buộc trong bảng (`check`, `not null`, enum) + kiểu TypeScript sinh từ database | 4, 5 |
| Database và ORM | PostgreSQL + Prisma | PostgreSQL + migration SQL + `database.types.ts` sinh tự động | 4 |
| Đăng ký, đăng nhập | Tự băm mật khẩu, tự phát JWT | Supabase Auth: mã 6 số, Google, khách ẩn danh, mật khẩu tùy chọn | 6 |
| Phân quyền | Middleware kiểm vai trò | RLS + quyền theo cột + `app_metadata.role` | 7 |
| Upload file | Multer + R2 | Supabase Storage, file đi thẳng từ app lên bucket | 8 |
| Job nền | BullMQ + Redis | pgmq (hàng đợi trong Postgres) + worker Node.js 26 | 9, 10 |
| Lịch chạy | node-cron trong server | pg_cron (chạy cả khi không có server nào bật) | 9, 13 |
| Realtime | Socket.IO server | Supabase Realtime: Broadcast, Presence, Postgres Changes | 13, 15 |
| Giới hạn lượt, rate limit | Redis | Hàm SQL `claim_playback()` | 11 |
| Bảng xếp hạng | Redis sorted set | Hàm SQL `top_songs()` | 11 |
| Phát nhạc có tua | Stream và Range tự viết trong Express | HLS fMP4 + signed URL của Storage | 11, T2 |
| Cache | Redis | CDN của Storage; vé nghe giữ 30 phút trong app | T4 |
| Test API | Vitest + Supertest | pgTAP cho luật bảo mật, `node --test` cho worker, Playwright đầu cuối | 19 |
| Đóng gói, deploy | Docker cho cả hệ thống | Supabase (dịch vụ) + Docker chỉ cho worker | 20 |

### Kiến thức của bản cũ vẫn dùng được

- **Stream và Buffer của Node.js:** worker vẫn đọc file, gọi ffmpeg, đọc kết quả qua stream.
- **Đo hiệu năng trước khi tối ưu:** áp dụng cho truy vấn SQL (Performance Advisor, `explain analyze`) thay vì cho route Express.
- **Bảo mật API:** các nguyên tắc (không tin client, quyền tối thiểu, không để lộ khóa) giữ nguyên; chỗ áp dụng chuyển từ middleware sang RLS và hàm `security definer`.
- **Kiến trúc dễ sửa:** mỗi tính năng một migration, một nhóm hàm trong `api.ts`, một màn hình.

### Khi nào quay lại tự viết backend

- Logic nghiệp vụ phức tạp, nhiều bước gọi dịch vụ ngoài, khó diễn đạt bằng SQL: viết thành Edge Function hoặc một service Node.js riêng, vẫn dùng chung database và Auth của Supabase.
- Cần chạy trên hạ tầng riêng (yêu cầu dữ liệu nằm trong nước): Supabase tự host được bằng Docker; code của app không phải đổi.
