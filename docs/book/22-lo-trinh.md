## Chương 22. Lộ trình theo chương và checklist ra mắt

### Chương này làm gì

Gom cả cuốn sách thành một lộ trình: mỗi chương làm ra tính năng gì, dùng kỹ thuật gì, và lệnh nào chứng minh là xong. Cuối chương là checklist trước ngày ra mắt.

### Để làm gì

Làm theo thứ tự mà không có mốc rất dễ sa đà vào phần thú vị và để phần đáng sợ nhất (deploy, bảo mật) tới cuối. Mỗi chương ở đây có một định nghĩa "xong" rõ ràng.

### Lộ trình

| Chương | Tính năng làm ra | Kỹ thuật chính | Xong khi |
|---|---|---|---|
| 1 | Đặc tả sản phẩm | | Mỗi tính năng thuộc một trong bốn luồng |
| 2 | Kiến trúc | Supabase + worker Node + Expo | Mọi tính năng có chỗ trên sơ đồ |
| 3 | Repo, project Supabase | Node 26, pnpm 12, Supabase CLI | `supabase migration list` khớp |
| 4 | Bảng danh mục | Migration SQL, enum, index một phần | Thêm bài trạng thái sai bị từ chối |
| 5 | Trang chủ có dữ liệu thật | API tự sinh, RPC, kiểu sinh tự động | `curl /rest/v1/songs` trả JSON |
| 6 | Đăng nhập 1 chạm | Supabase Auth: OTP email, Google, ẩn danh | Ba cách đăng nhập đều tạo dòng `profiles` |
| 7 | Thư viện cá nhân | RLS, trigger | Người A không ghi được dữ liệu của B |
| 8 | Tải bài lên | Storage, chính sách trên `storage.objects` | Tài khoản thường không tải được vào `originals` |
| 9 | Duyệt bài | Hàm SQL, Supabase Queues, Cron | Duyệt hai lần vẫn chỉ một việc trong hàng đợi |
| 10 | Xử lý âm thanh | Node 26 chạy thẳng TS, ffmpeg, HLS fMP4, PSL | Bài chuyển sang `published` với `hls_tiers` |
| 11 | Phát nhạc | Edge Function, vé HMAC, link ký | Khách bị chặn ở bài thứ tư |
| 12 | Tìm kiếm, lời bài hát | unaccent, pg_trgm, LRC | "mua deem" ra "Mưa Đêm" |
| 13 | Đài 24/7 | Cron theo giây, Broadcast từ database, Presence | Hai máy phát cùng một giây |
| 14 | Blind test | Game loop trong SQL, Broadcast | `blind_results` có dữ liệu |
| 15 | Nhóm nghe chung, đồng bộ nhiều máy | Kênh Realtime riêng tư, RLS trên `realtime.messages`, mã nhóm | Người ngoài nhóm không vào được kênh; hai tài khoản trong nhóm phát cùng giây |
| 16 | App ba nền tảng | Expo SDK 58, hugo-music | Bản web build chạy với dữ liệu thật |
| 17 | Chuẩn giao diện | Token, inset grouped, vùng chạm 44, chế độ tối, giảm chuyển động | Danh sách soát giao diện đạt cho mọi màn hình |
| 18 | Trang quản trị | Postgres Changes, RPC | Theo dõi xử lý cập nhật không cần tải lại |
| 19 | Kiểm thử | node:test, pgTAP, Playwright | Ba bộ test xanh trong CI |
| 20 | Deploy | GitHub Actions, Fly.io, Cloudflare Pages, EAS | Merge vào `main` là lên production |
| 21 | Vận hành | Advisors, nhịp tim worker, dump mã hóa | Đã khôi phục thử một bản sao lưu |

**Bốn mốc lớn**, mỗi mốc là một câu hỏi có hoặc không:

| Mốc | Sau chương | Câu hỏi |
|---|---|---|
| Nền vững | 7 | Đăng nhập được, dữ liệu mỗi người được RLS bảo vệ? |
| Nghe được | 12 | Admin tải bài lên, duyệt, worker xử lý, người nghe phát được và tìm thấy? |
| Đủ tính năng | 18 | Đài, blind test, nhóm nghe chung, đồng bộ, trang quản trị chạy trên web và điện thoại? |
| Ra mắt | 21 | Checklist bên dưới đã tích hết? |

Ở mốc *Nghe được*, mời vài người nghe thật dùng thử. Những gì họ nói lúc này còn đủ thời gian để sửa.

### Checklist trước ngày ra mắt

*Bảo mật*

- [ ] Security Advisor không còn lỗi; mọi bảng trong `public` bật RLS.
- [ ] Secret key chỉ nằm ở worker (Fly secrets) và Edge Function; tìm trong mã nguồn app không thấy `sb_secret_`.
- [ ] `PLAYBACK_SECRET` là chuỗi ngẫu nhiên dài, đặt bằng `supabase secrets set`.
- [ ] Bật CAPTCHA cho đăng nhập ẩn danh và đăng nhập bằng email.
- [ ] Đã xóa các khóa và token dùng trong lúc phát triển, tạo khóa mới cho production.
- [ ] Chỉ tài khoản cần thiết có `app_metadata.role = 'admin'`.

*Dữ liệu*

- [ ] Mọi thay đổi database nằm trong `supabase/migrations`, không sửa tay trên dashboard.
- [ ] Đã chạy và khôi phục thử bản dump; file gốc trong `originals` được sao lưu.
- [ ] Worker đang dọn khách ẩn danh cũ mỗi ngày (log `cleanup: removed ...`).

*Phát nhạc*

- [ ] Mỗi bài đã phát hành có `hls_tiers` không rỗng; không còn bài kẹt ở `processing`.
- [ ] Bài có giấy phép ND không bị chuyển mã.
- [ ] Mỗi bài hiện đủ giấy phép và nguồn (yêu cầu của Creative Commons).

*Ứng dụng*

- [ ] Auth: Site URL là tên miền thật; `hugomusic://auth` nằm trong Redirect URLs; Google OAuth trỏ đúng callback.
- [ ] Mẫu email gửi mã đăng nhập bằng tiếng Việt, có `{{ .Token }}`.
- [ ] Có chức năng xóa tài khoản trong app (App Store bắt buộc): Edge Function `delete-account`.
- [ ] Đã điền nhãn quyền riêng tư (App Store) và Data safety (Google Play); có trang chính sách quyền riêng tư.
- [ ] Đã thử trên máy thật: phát khi khóa màn hình, mạng yếu tự hạ chất lượng, đăng nhập Google trên iOS và Android.

*Vận hành*

- [ ] Cảnh báo nhịp tim worker gửi được tới kênh của bạn.
- [ ] Sentry nhận được lỗi thử từ app và worker.
- [ ] Biết cách quay lại bản trước: `fly deploy --image <bản trước>`, `eas update --republish`, migration sửa lỗi bằng một migration mới.

*Ngày ra mắt*

- [ ] Không deploy trong 24 giờ trước giờ ra mắt.
- [ ] Ra mắt vào buổi sáng đầu tuần theo giờ Việt Nam, còn cả ngày phía trước để sửa.
- [ ] Sau 1 giờ, 1 ngày, 1 tuần: xem Advisors, Logs, Usage.

### Khi nào đổi

- **Trễ hơn kế hoạch:** cắt phạm vi theo thứ tự: blind test (chương 14) ra sau, đồng bộ thiết bị của cùng một người (chương 15) ra sau; giữ nhóm nghe chung vì đó là điểm khác biệt. Không cắt RLS, kiểm thử bảo mật, sao lưu.
- **Sau ngày ra mắt:** lộ trình đổi thành chu kỳ hai tuần: một nửa tính năng mới, một nửa trả nợ (cảnh báo đã kêu, nâng phiên bản thư viện, chỉnh PSL theo dữ liệu blind test).
