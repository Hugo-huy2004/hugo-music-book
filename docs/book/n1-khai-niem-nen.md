## Nền tảng 1. Terminal, client–server, HTTP, API và JSON

### Chương này làm gì

Giải thích sáu khái niệm mà mọi chương sau đều dùng: terminal, client và server, HTTP, API, JSON, và chỗ của Node.js trong bức tranh. Mỗi khái niệm có một so sánh đời thường, một ví dụ chạy được trên chính project Hugo Music, và một bài thực hành nhỏ.

### Để làm gì

Sách nói "app gọi API", "worker đọc hàng đợi", "Edge Function trả playlist". Mỗi câu như vậy dựa trên mấy khái niệm này. Nắm chắc chúng thì khi một thứ hỏng, bạn biết nó hỏng ở tầng nào: lệnh gõ sai, request sai, quyền sai hay dữ liệu sai.

### 1. Terminal: ra lệnh cho máy bằng chữ

**So sánh:** giao diện đồ họa giống bấm nút trên điều khiển; terminal giống nói thẳng với máy một câu chính xác. Chậm hơn lúc đầu, nhưng lặp lại được, ghi lại được, và tự động hóa được: mọi lệnh trong sách đều chạy được trong CI (chương 20) chính vì là chữ.

Trên macOS mở ứng dụng Terminal, trên Windows dùng Windows Terminal với WSL (Ubuntu), trên Linux mở Terminal có sẵn. Một dòng lệnh gồm **tên lệnh**, **tham số** và **tùy chọn**:

```bash
ls -la docs/book
#  │  │   └─ tham số: thư mục muốn xem
#  │  └─ tùy chọn: -l (chi tiết), -a (cả file ẩn)
#  └─ lệnh: liệt kê
```

Mười lệnh dùng suốt sách:

| Lệnh | Làm gì | Ví dụ |
|---|---|---|
| `pwd` | In thư mục đang đứng | `pwd` |
| `ls` | Liệt kê | `ls supabase/migrations` |
| `cd` | Đi vào thư mục | `cd hugo-music-book`, `cd ..` (lên một cấp) |
| `mkdir -p` | Tạo thư mục (cả cấp cha nếu chưa có) | `mkdir -p demo` |
| `cat` | In nội dung file | `cat .nvmrc` |
| `cp`, `mv`, `rm` | Chép, đổi tên, xóa | `cp app/.env.example app/.env` |
| `grep` | Tìm chữ trong file | `grep -rn "claim_playback" supabase` |
| `curl` | Gửi request HTTP | Mục 3 |
| `node`, `pnpm` | Chạy Node.js, quản lý thư viện | Nền tảng 4 |
| `git` | Lưu lịch sử code | Nền tảng 5 |

**Biến môi trường** là giá trị đặt cho một lệnh mà không ghi vào code, ví dụ URL và khóa của Supabase:

```bash
export SUPABASE_URL=https://abcd.supabase.co   # đặt cho phiên terminal này
echo $SUPABASE_URL                              # đọc lại
node --env-file=worker/.env src/main.ts         # hoặc nạp từ file .env khi chạy
```

**Đường dẫn tương đối và tuyệt đối:** `docs/book` là tương đối (tính từ thư mục đang đứng), `/home/an/hugo-music-book/docs/book` là tuyệt đối. Lệnh báo "No such file or directory" thì việc đầu tiên là `pwd` để biết mình đang đứng ở đâu.

Ba thói quen tiết kiệm thời gian: **Tab** tự điền tên file, **mũi tên lên** gọi lại lệnh trước, **Ctrl+C** dừng lệnh đang chạy.

### 2. Client và server: khách và nhà bếp

**So sánh:** nhà hàng. Khách (client) gọi món, nhà bếp (server) nấu và mang ra. Khách không vào bếp tự lấy đồ; bếp quyết định món nào có, món nào hết, ai được phục vụ.

| Vai | Trong Hugo Music | Chạy ở đâu |
|---|---|---|
| Client | App Expo trên web, iPhone, Android | Máy người dùng |
| Server | Supabase: database, đăng nhập, lưu file, realtime | Cloud của Supabase |
| Server | Edge Function `playback`, `delete-account`, `admin-users` | Cloud của Supabase |
| Server | Worker xử lý âm thanh | Máy chủ riêng (Fly.io) |

Một nguyên tắc chi phối cả cuốn sách: **không tin client.** Người dùng có thể sửa app, mở công cụ của trình duyệt, gọi thẳng API bằng `curl`. Vì vậy mọi luật như "khách nghe tối đa 3 bài mỗi ngày" hay "chỉ admin được duyệt bài" phải nằm ở server. Nút "Duyệt" bị ẩn trong app không bảo vệ được gì; hàm `review_song()` tự kiểm `is_admin()` mới bảo vệ.

### 3. HTTP: tờ phiếu gọi món

Client và server nói chuyện bằng HTTP. Mỗi lần hỏi là một **request**, mỗi lần trả lời là một **response**. Cả hai đều là chữ có cấu trúc:

```http
GET /rest/v1/songs?select=title&limit=2 HTTP/1.1     ← dòng đầu: phương thức + đường dẫn
Host: abcd.supabase.co                               ← các header: thông tin kèm theo
apikey: sb_publishable_...
                                                     ← dòng trống: hết header
                                                     ← thân: rỗng với GET

HTTP/1.1 200 OK                                      ← dòng đầu: mã trạng thái
Content-Type: application/json                       ← header
                                                     ← dòng trống
[{"title":"After Party"},{"title":"Bến Xưa"}]        ← thân: dữ liệu
```

**Đường dẫn** có thể kèm **query string** sau dấu `?`: các cặp `khóa=giá trị` nối bằng `&`. Ở trên, `select=title` là "chỉ lấy cột title", `limit=2` là "tối đa 2 dòng".

**Phương thức** nói muốn làm gì:

| Phương thức | Nghĩa | Ví dụ trong Hugo Music |
|---|---|---|
| `GET` | Đọc, không thay đổi gì | Lấy danh sách bài, tải playlist |
| `POST` | Tạo mới hoặc thực hiện một việc | Thích một bài, xin vé nghe |
| `PATCH` | Sửa một phần | Đổi biệt danh |
| `DELETE` | Xóa | Bỏ thích, xóa danh sách phát |

**Mã trạng thái** là thứ đầu tiên cần đọc khi gỡ lỗi:

| Mã | Nghĩa | Gặp khi |
|---|---|---|
| 200 | Thành công | Đọc dữ liệu |
| 201 | Đã tạo | Thêm danh sách phát |
| 206 | Trả một phần | Tải nhạc theo Range (Truyền phát 2) |
| 400 | Request sai | Thiếu tham số, vé hỏng |
| 401 | Chưa đăng nhập | Thiếu hoặc hết hạn token |
| 403 | Không có quyền | Khách hết lượt nghe |
| 404 | Không có | Sai đường dẫn |
| 500 | Server lỗi | Lỗi trong Edge Function |

**Header** hay gặp: `Content-Type` (thân là gì: JSON, âm thanh), `Authorization: Bearer <token>` (tôi là ai), `apikey` (khóa của project Supabase), `Range` (chỉ lấy một khoảng byte).

### 4. API: thực đơn của nhà hàng

**So sánh:** thực đơn liệt kê món nào gọi được, gọi thế nào, nhận được gì. API của một server liệt kê request nào nó nhận và trả gì.

Trước đây mỗi đường phải tự viết: route `GET /songs`, controller đọc database, kiểm quyền, trả JSON. Mười bảng là vài chục route. Với Supabase, **mỗi bảng tự có API** (chương 5): tạo bảng `songs` là có ngay đọc, lọc, sắp xếp, phân trang, lấy kèm bảng liên quan:

```text
GET /rest/v1/songs?select=title,artist:artists(name)&status=eq.published&order=title&limit=3
```

Việc nhiều bước hoặc cần kiểm tra đặc biệt viết thành hàm SQL và gọi qua `/rest/v1/rpc/<tên hàm>` (ví dụ `claim_playback`, `review_song`). Trong app không ai gõ URL tay: thư viện `supabase-js` dựng request giúp.

```ts
const { data } = await supabase.from('songs').select('title, artist:artists(name)').eq('status', 'published').limit(3);
```

### 5. JSON: ngôn ngữ chung để gửi dữ liệu

JSON viết dữ liệu bằng chữ theo sáu kiểu:

| Kiểu | Ví dụ |
|---|---|
| Chuỗi | `"Neon Street"` (luôn ngoặc kép) |
| Số | `91.23`, `256` |
| Đúng/sai | `true`, `false` |
| Rỗng | `null` |
| Mảng | `[64, 96, 128]` |
| Đối tượng | `{ "title": "Drift", "likes_count": 3 }` |

Lồng nhau tùy ý:

```json
{
  "title": "Neon Street",
  "hls_tiers": [64, 96, 128, 160, 192, 256],
  "psl_mos": { "64": 2.754, "256": 4.72 },
  "artist": { "name": "Pulse Theory" }
}
```

Lỗi JSON hay gặp: dùng ngoặc đơn, dấu phẩy thừa sau phần tử cuối, quên ngoặc kép quanh tên khóa. Trong JavaScript, `JSON.parse(chuoi)` biến chữ thành đối tượng, `JSON.stringify(doiTuong)` làm ngược lại. Postgres cũng lưu JSON được (cột kiểu `jsonb`): cột `psl_mos` của bảng `songs` là ví dụ.

### 6. Node.js nằm ở đâu

JavaScript sinh ra để chạy trong trình duyệt. **Node.js** cho nó chạy ở bất cứ đâu: máy tính, server, CI. Trong sách, Node.js làm ba việc:

| Việc | Ở đâu | Chương |
|---|---|---|
| Chạy công cụ: cài thư viện, build app, chạy test | Máy bạn, CI | 3, 19, 20 |
| Worker xử lý âm thanh: đọc hàng đợi, gọi ffmpeg, đo PSL | Server riêng | 10 |
| Script: nạp nhạc mẫu, chụp ảnh, thử đường phát | `supabase/seed/`, `scripts/` | 10, 11 |

Edge Function chạy trên **Deno**, một runtime cùng họ: cùng JavaScript và TypeScript, cùng API web chuẩn (`fetch`, `Request`, `Response`, Web Crypto). Code viết theo chuẩn web chạy được ở cả hai.

### Tóm tắt

| Khái niệm | Một câu |
|---|---|
| Terminal | Ra lệnh bằng chữ: lặp lại được, tự động hóa được |
| Client / server | Client hỏi; server giữ luật và dữ liệu; không tin client |
| HTTP | Request (phương thức, đường dẫn, header, thân) và response (mã, header, thân) |
| API | Những request server nhận; Supabase tự sinh từ bảng |
| JSON | Định dạng dữ liệu chung, sáu kiểu |
| Node.js | JavaScript ngoài trình duyệt: công cụ, worker, script |

### Thực hành

1. Gọi API tự sinh của project bằng `curl` và đọc response:

```bash
curl -s "https://<project-ref>.supabase.co/rest/v1/songs?select=title,genre&limit=3" \
  -H "apikey: <publishable key>"
```

2. Thêm `-i` để thấy cả dòng trạng thái và header: `curl -si ...`. Tìm `Content-Type`.
3. Đổi `songs` thành `profiles`. Response báo `permission denied`: server từ chối dù bạn có khóa hợp lệ. Đó là "không tin client" đang làm việc (chương 7).

### Tự kiểm

1. `ls -la` gồm những phần nào của một dòng lệnh?
2. Vì sao ẩn nút "Duyệt" trong app không đủ để bảo vệ chức năng duyệt bài?
3. Trong request `GET /rest/v1/songs?select=title&limit=2`, phần nào là query string, nó nói gì với server?
4. Mã 401 và 403 khác nhau thế nào? Cho một tình huống của mỗi mã trong Hugo Music.
5. JSON sau sai ở đâu: `{'title': 'Drift', "tiers": [64, 128,]}`?
6. Edge Function và worker đều là code server. Vì sao worker không chạy trên Edge Function?
