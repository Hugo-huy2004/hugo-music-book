# Hugo Music: thực chiến với Supabase, Node.js 26 và Expo

## Cách dùng cuốn sách này

Cuốn sách dẫn bạn xây **Hugo Music** từ thư mục trống tới app chạy thật trên web, iOS và Android: nghe nhạc có giấy phép mở, chất lượng tự thích ứng theo mạng, đài 24/7 nghe chung, blind test, thư viện cá nhân và trang quản trị. Mỗi chương làm xong một tính năng chạy được, có ảnh chụp kết quả và lệnh để tự kiểm tra.

**Mỗi chương đi theo cùng một khuôn**, để đọc lướt cũng biết mình đang ở đâu:

| Mục | Trả lời câu hỏi |
|---|---|
| Chương này làm gì | Xong chương, app có thêm tính năng nào? |
| Để làm gì | Người dùng gặp vấn đề gì nếu thiếu nó? |
| Phân tích kỹ thuật | Hiện có những cách nào để làm? Mỗi cách mạnh, yếu ở đâu? |
| Chọn gì, vì sao | Cách nào hợp với Hugo Music, và ta chấp nhận đánh đổi gì? |
| Làm từng bước | Code ngắn, mỗi đoạn mở đầu bằng một câu nói nó làm gì |
| Kết quả | Ảnh chụp khi chạy thật |
| Kiểm tra | Lệnh để tự chứng minh là đã chạy đúng |
| Khi nào đổi | Dấu hiệu cho thấy lựa chọn này không còn hợp nữa |

**Cách đọc code trong sách.** Dòng đầu mỗi khối code là đường dẫn file trong repo. Sách chỉ in phần cần hiểu; chữ `(trích)` nghĩa là file đầy đủ nằm trong repo. Lệnh trong khối `bash` chạy từ thư mục gốc của repo.

### Lấy code về máy

Toàn bộ code của sách nằm trong một repo, ở trạng thái hoàn chỉnh: chương nào cũng chạy được ngay trên bản này. Cuối mỗi chương có mục *Code của chương* liệt kê đúng các file chương đó viết, để bạn mở ra đối chiếu.

```bash
git clone https://github.com/Hugo-huy2004/hugo-music-book.git
cd hugo-music-book
pnpm install
cp app/.env.example app/.env          # URL + publishable key của project Supabase
cp worker/.env.example worker/.env    # URL + secret key (chỉ dùng ở server)
```

Chạy toàn bộ trên project Supabase của bạn (mỗi lệnh được giải thích ở chương tương ứng):

```bash
supabase link --project-ref <project-ref>
supabase db push                                        # bảng, hàm, lịch chạy (chương 4–15)
supabase secrets set PLAYBACK_SECRET=$(openssl rand -hex 32)
supabase functions deploy playback delete-account       # chương 11, 6
python3 supabase/seed/make_demo_music.py demo           # 10 bài nhạc mẫu CC0 (chương 10)
node --env-file=worker/.env supabase/seed/seed.ts demo admin@vidu.dev <mật-khẩu>
pnpm worker                                             # xử lý hàng đợi, tạo HLS (chương 10)
pnpm web                                                # mở http://localhost:8081
```

### Máy cần có

| Công cụ | Phiên bản | Dùng để |
|---|---|---|
| Node.js | 26 | chạy worker xử lý âm thanh, công cụ build |
| pnpm | 12 | quản lý thư viện cho cả monorepo |
| Supabase CLI | 2.12x | tạo bảng, đẩy migration, deploy Edge Function |
| ffmpeg | 7 trở lên | worker mã hóa âm thanh |
| Python | 3.12 trở lên | đo chất lượng cảm nhận (ViSQOL) |
| Một tài khoản Supabase | gói miễn phí là đủ | database, đăng nhập, lưu file, realtime |

### Lộ trình đọc

Một cuốn, tám phần. Ai đã biết lập trình web có thể bỏ qua phần Nền tảng; ai chỉ cần dựng app có thể đọc phần Truyền phát sau.

1. **Nền tảng** (Nền tảng 1 tới 5): terminal, HTTP, API và JSON; JavaScript và TypeScript; bất đồng bộ; Node.js 26 và pnpm; Git và gỡ lỗi.
2. **Hiểu truyền phát nhạc** (Truyền phát 1 tới 6): tệp nhạc, Range và cắt đoạn, HLS, CDN và bộ đệm, thuật toán chọn chất lượng, kiểm soát truy cập.
3. **Nền móng dự án** (chương 1 tới 3): sản phẩm là gì, kiến trúc, môi trường.
4. **Backend trên Supabase** (chương 4 tới 12): database, API tự sinh, đăng nhập, RLS, lưu file, hàng đợi, worker, phát nhạc, tìm kiếm.
5. **Nghe cùng nhau** (chương 13 tới 15): đài 24/7, blind test, nhóm nghe chung và đồng bộ nhiều thiết bị.
6. **Giao diện** (chương 16 tới 18): một app cho ba nền tảng, chuẩn giao diện và trải nghiệm, trang quản trị.
7. **Ra production** (chương 19 tới 22): kiểm thử, deploy, vận hành, checklist ra mắt.
8. **Nghiên cứu và phụ lục** (Nghiên cứu 1, 2; Phụ lục A, B): thiết kế thí nghiệm cho đề tài, đọc tài liệu, nền âm thanh, thuật ngữ, và bảng đối chiếu cho người đã đọc các bản Hugo Music trước.
