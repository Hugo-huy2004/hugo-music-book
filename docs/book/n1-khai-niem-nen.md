## Nền tảng 1. Khái niệm nền cho người mới

### Chương này làm gì

Giải thích sáu khái niệm mà mọi chương sau đều dùng: terminal, client và server, HTTP, API, JSON, và Node.js nằm ở đâu. Ai đã viết web rồi có thể đọc lướt bảng tóm tắt cuối chương rồi sang phần sau.

### Để làm gì

Sách nói "app gọi API", "worker đọc hàng đợi", "Edge Function trả playlist". Không nắm sáu khái niệm này thì câu nào cũng là đoán.

### 1. Terminal: ra lệnh cho máy bằng chữ

Terminal là cửa sổ gõ lệnh. Mỗi dòng là một lệnh, Enter để chạy, máy in kết quả ngay dưới.

```bash
pwd                 # đang đứng ở thư mục nào
ls                  # trong thư mục có gì
cd hugo-music-book  # đi vào thư mục
node --version      # hỏi Node.js phiên bản mấy
```

Ba thói quen giúp đỡ mất thời gian: phím Tab tự điền tên file, phím mũi tên lên gọi lại lệnh trước, và **đọc dòng lỗi cuối cùng** khi lệnh hỏng (Nền tảng 5 nói kỹ).

### 2. Client và server: khách và nhà bếp

**Client** là bên hỏi: trình duyệt, app trên điện thoại. **Server** là bên trả lời: máy tính ở đâu đó luôn bật, giữ dữ liệu. Trong Hugo Music:

| Vai | Là gì |
|---|---|
| Client | App Expo (web, iOS, Android) |
| Server | Supabase (database, đăng nhập, lưu file, realtime), Edge Function, worker xử lý âm thanh |

Client không bao giờ được tin: người dùng có thể sửa app, gọi thẳng API. Mọi luật (ai được xem gì, khách nghe mấy bài) phải nằm ở server. Chương 7 làm điều đó bằng RLS.

### 3. HTTP: tờ phiếu gọi món

Client và server nói với nhau bằng HTTP. Một lần hỏi là một **request**, một lần trả là một **response**.

```http
GET /rest/v1/songs?select=title HTTP/1.1      ← phương thức + đường dẫn
apikey: sb_publishable_...                    ← tiêu đề (header)

HTTP/1.1 200 OK                               ← mã trạng thái
Content-Type: application/json

[{"title":"Mưa Đêm Sài Gòn"}]                 ← thân (body)
```

| Phương thức | Nghĩa | Ví dụ |
|---|---|---|
| `GET` | Đọc | Lấy danh sách bài |
| `POST` | Tạo | Thích một bài, xin vé nghe |
| `PATCH` | Sửa một phần | Đổi biệt danh |
| `DELETE` | Xóa | Bỏ thích |

| Mã | Nghĩa |
|---|---|
| 200 | Thành công |
| 206 | Trả một phần (phát nhạc dùng nhiều nhất, Truyền phát 2) |
| 401 | Chưa đăng nhập |
| 403 | Đăng nhập rồi nhưng không có quyền |
| 404 | Không có |
| 500 | Server lỗi |

### 4. API: thực đơn của nhà hàng

API là danh sách những request server nhận và nó trả gì. Ngày trước phải tự viết từng đường (`GET /songs`, `POST /likes`...). Với Supabase, mỗi bảng tự có API (chương 5): tạo bảng `songs` là có ngay `GET /rest/v1/songs`.

### 5. JSON: ngôn ngữ chung để gửi dữ liệu

JSON là cách viết dữ liệu bằng chữ mà mọi ngôn ngữ đều đọc được: chuỗi trong ngoặc kép, số, `true`/`false`, `null`, mảng `[...]`, đối tượng `{...}`.

```json
{ "title": "Neon Street", "hls_tiers": [64, 96, 128], "artist": { "name": "Pulse Theory" } }
```

### 6. Node.js nằm ở đâu

Node.js chạy JavaScript (và TypeScript) **ngoài trình duyệt**, trên máy tính hay server. Trong sách, Node.js làm ba việc:

| Việc | Ở đâu |
|---|---|
| Chạy công cụ: cài thư viện, build app, chạy test | Máy của bạn, CI |
| Worker xử lý âm thanh: đọc hàng đợi, gọi ffmpeg, đo PSL | Server riêng (chương 10) |
| Script: nạp nhạc mẫu, chụp ảnh, thử đường phát | `supabase/seed/`, `scripts/` |

Edge Function chạy trên Deno, một runtime cùng họ: cùng JavaScript, cùng API web chuẩn (`fetch`, `Request`, `Response`, Web Crypto).

### Tóm tắt

| Khái niệm | Một câu |
|---|---|
| Terminal | Gõ lệnh, đọc dòng lỗi cuối |
| Client / server | Client hỏi, server giữ luật và dữ liệu; không tin client |
| HTTP | Request (phương thức, đường dẫn, header, body) và response (mã, header, body) |
| API | Những request server nhận; Supabase tự sinh từ bảng |
| JSON | Định dạng dữ liệu chung |
| Node.js | JavaScript ngoài trình duyệt: công cụ, worker, script |

### Kiểm tra

```bash
curl -s "https://<project-ref>.supabase.co/rest/v1/songs?select=title&limit=1" -H "apikey: <publishable key>"
```

Đọc được câu trả lời: đó là một response HTTP, thân là JSON, do API tự sinh trả về.
