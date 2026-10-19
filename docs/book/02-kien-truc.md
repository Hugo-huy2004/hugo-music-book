## Chương 2. Kiến trúc: để Supabase làm backend

### Chương này làm gì

Chọn kiến trúc cho cả hệ thống: phần nào tự viết, phần nào dùng dịch vụ có sẵn. Kết quả là một sơ đồ ba khối mà mọi chương sau sẽ lần lượt lấp đầy.

### Để làm gì

Một app nghe nhạc cần rất nhiều thứ "nền": đăng nhập, phân quyền, API đọc ghi dữ liệu, lưu file, đẩy cập nhật thời gian thực, chạy việc ngầm. Tự viết từng thứ một tốn hàng tháng, và mỗi thứ tự viết là một chỗ có thể sai về bảo mật. Câu hỏi của chương: **phần nào thật sự cần tự viết?**

### Phân tích kỹ thuật

Ba hướng phổ biến hiện nay:

| Hướng | Ví dụ | Mạnh | Yếu |
|---|---|---|---|
| Tự viết API | Node.js (Fastify, Express, Hono) + PostgreSQL | Toàn quyền kiểm soát | Tự làm đăng nhập, phân quyền, CRUD, WebSocket, upload; nhiều code để bảo trì |
| BaaS trên database NoSQL | Firebase | Realtime tốt, SDK mobile mạnh | Dữ liệu dạng document khó truy vấn quan hệ (bài hát, nghệ sĩ, danh sách phát); phụ thuộc chặt vào Google |
| BaaS trên PostgreSQL | Supabase, (nhỏ hơn: PocketBase, Appwrite) | SQL thật, API tự sinh, đăng nhập, lưu file, realtime, phân quyền ngay trong database; mã nguồn mở, tự host được | Logic phức tạp phải viết bằng SQL hoặc Edge Function; tác vụ nặng (ffmpeg) vẫn cần server riêng |

Dữ liệu của Hugo Music có quan hệ rõ ràng: bài hát thuộc nghệ sĩ, nằm trong danh sách phát, được thích bởi người dùng, được phát ở đài. Đó là bài toán của database quan hệ. Supabase cho đúng PostgreSQL, cộng thêm sáu thứ ta cần:

| Thứ cần | Supabase cho | Thay cho việc tự viết |
|---|---|---|
| API đọc ghi dữ liệu | **API tự sinh** (PostgREST) từ bảng | route CRUD, controller, validate |
| Đăng nhập | **Supabase Auth**: mã qua email, Google, khách ẩn danh | mã hóa mật khẩu, JWT, server gửi mail |
| Phân quyền | **Row Level Security** ngay trong database | middleware kiểm quyền rải rác |
| Lưu file | **Storage** + CDN | server nhận upload, cấu hình S3 |
| Thời gian thực | **Realtime**: Broadcast, Presence, Postgres Changes | server WebSocket, adapter Redis |
| Việc ngầm | **Queues** (pgmq), **Cron** (pg_cron), **Edge Functions** | hàng đợi Redis, server cron |

### Chọn gì, vì sao

**Supabase làm toàn bộ backend; chỉ tự viết đúng một tiến trình Node.js 26 cho việc Supabase không làm được: xử lý âm thanh bằng ffmpeg.** Client là một app Expo duy nhất chạy trên web, iOS và Android.

Đánh đổi ta chấp nhận: một phần logic nằm trong SQL (hàm, trigger, chính sách RLS). Đổi lại, luật nằm ngay cạnh dữ liệu: không có đường nào vòng qua được, kể cả khi sau này thêm một client mới.

### Sơ đồ

```text
┌────────────────────────────┐        ┌──────────────────────────────────────────────┐
│  App Expo (web, iOS, Android)│ ─────▶ │ Supabase                                       │
│  supabase-js                 │ ◀───── │  Auth · API tự sinh · Realtime · Storage + CDN │
└────────────────────────────┘        │  Edge Function "playback"                      │
                                       │  PostgreSQL: bảng · RLS · hàm SQL · Queues · Cron│
                                       └──────────────────────────┬───────────────────┘
                                                                  │ hàng đợi "media"
                                                     ┌────────────▼────────────┐
                                                     │ Worker Node.js 26        │
                                                     │ ffmpeg · PSL · HLS       │
                                                     └─────────────────────────┘
```

Ba nguyên tắc giữ sơ đồ này gọn:

1. **App nói chuyện trực tiếp với Supabase.** Không có server trung gian chỉ để chuyển tiếp request.
2. **Luật nằm trong database.** "Ai được đọc gì" là chính sách RLS; "duyệt bài thì làm gì" là một hàm SQL. App chỉ gọi.
3. **Việc nặng đi qua hàng đợi.** Admin bấm duyệt chỉ mất vài mili giây; xử lý âm thanh vài phút diễn ra ở worker, không ai phải chờ.

### Kiểm tra

Với mỗi tính năng ở chương 1, chỉ được nó nằm ở khối nào trên sơ đồ. Nếu một tính năng cần thêm khối mới, đó là lúc xem lại kiến trúc.

### Thực hành

1. Vẽ lại sơ đồ kiến trúc trên giấy, đánh số theo thứ tự các bước khi người nghe bấm phát một bài.
2. Chọn một việc của Hugo Music (ví dụ "gửi email khi bài được duyệt") và quyết định nó nên là chính sách RLS, hàm SQL, Edge Function hay việc của worker. Viết một câu giải thích.

### Tự kiểm

1. Liệt kê ba việc trước đây phải tự viết server mà nay Supabase làm sẵn.
2. Vì sao worker xử lý âm thanh vẫn phải là một chương trình Node.js riêng, không viết được bằng hàm SQL hay Edge Function?
3. Nếu một ngày phải rời Supabase, phần nào mang đi nguyên vẹn, phần nào phải thay?

### Khi nào đổi

- **Cần logic phức tạp gọi nhiều dịch vụ ngoài** (thanh toán, gửi email theo kịch bản): viết Edge Function; khi Edge Function phình to, tách thành một service Node.js riêng nói chuyện với Supabase bằng secret key.
- **Lượng ghi rất lớn** (hàng nghìn lượt ghi mỗi giây vào một bảng): cân nhắc gom ghi theo lô ở worker trước khi vào database.
- **Không muốn phụ thuộc nhà cung cấp:** Supabase là mã nguồn mở, có thể tự host bằng Docker; migration SQL dùng nguyên được.
