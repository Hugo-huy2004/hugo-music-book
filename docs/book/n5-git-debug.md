## Nền tảng 5. Git, đọc code và gỡ lỗi

### Chương này làm gì

Ba kỹ năng dùng hằng ngày: lưu lịch sử code bằng Git, đọc một codebase lạ theo đường đi của dữ liệu, và tìm lỗi thay vì đoán.

### Để làm gì

Repo của sách có vài trăm file. Không ai đọc hết; người làm được việc là người biết đi đúng đường tới chỗ cần sửa, và biết quay lại khi sửa hỏng.

### Git trong năm lệnh

```bash
git clone https://github.com/Hugo-huy2004/hugo-music-book.git   # lấy repo về
git switch -c them-loi-bai-hat      # tạo nhánh cho một việc
git add -p                          # chọn từng đoạn thay đổi muốn lưu
git commit -m "Lời bài hát: tìm theo tên bài khi chưa có"
git push -u origin them-loi-bai-hat # đẩy lên, mở pull request trên GitHub
```

| Vùng | Là gì |
|---|---|
| Thư mục làm việc | File bạn đang sửa |
| Staging (`git add`) | Những thay đổi sẽ vào commit kế tiếp |
| Lịch sử (`git commit`) | Các bản đã lưu, quay lại được |

`.gitignore` phải có trước commit đầu tiên: `node_modules/`, `.env`, `dist/`, và file chứa khóa như `supabase/.env.deploy`. Lỡ commit khóa bí mật thì xóa khỏi commit chưa đủ: phải **đổi khóa** ngay, vì lịch sử Git đã giữ bản cũ.

### Đọc code theo đường đi của dữ liệu

Đừng đọc từ file đầu tới file cuối. Chọn một hành động của người dùng rồi đi theo nó:

```text
Bấm "Thích" (screens/.../SongActions.tsx)
  → store.toggleLike (store/useStore.ts)
    → api.toggleLike (api/api.ts) → POST /rest/v1/song_likes
      → chính sách RLS "users like for themselves" (migrations/0300_library.sql)
      → trigger cập nhật songs.likes_count
```

Công cụ: tìm theo tên hàm (Ctrl+Shift+F), "Go to definition" (F12), và `git log -p <file>` để xem một đoạn code thay đổi vì lý do gì.

### Đọc thông báo lỗi

Dòng quan trọng nhất thường là dòng **đầu** (lỗi gì) và dòng **đầu tiên thuộc code của bạn** trong stack trace (ở đâu).

```text
TypeError: Cannot read properties of undefined (reading 'quality')     ← lỗi gì
    at SongListItem (app/src/screens/Admin/components/SongListItem.tsx:33)  ← ở đâu
    at renderWithHooks (react-dom...)                                    ← thư viện, bỏ qua
```

Lỗi này có thật khi chạy sách: dữ liệu bài chưa có trường `review`. Sửa ở nơi tạo dữ liệu (`toReviewed` trong `api.ts`), không vá ở nơi hiện lỗi.

### Gỡ lỗi: dừng code và nhìn vào trong

```bash
node --inspect-brk --env-file=.env src/main.ts   # mở chrome://inspect, đặt breakpoint
```

Với app web: tab Network của trình duyệt cho biết request nào gửi đi, trả mã gì, thân ra sao. Phần lớn lỗi "app không hiện dữ liệu" trong sách được tìm ra ở đây: request bị CORS chặn, RLS trả mảng rỗng, hay cột bị từ chối quyền (`42501`).

### Quy trình khi gặp lỗi

1. Tái hiện được lỗi bằng một lệnh hoặc một chuỗi thao tác.
2. Thu hẹp: lỗi ở client, ở API, hay ở database? Gọi thẳng API bằng `curl` để biết.
3. Sửa nguyên nhân, không sửa triệu chứng.
4. Viết một test cho đúng lỗi đó (chương 19) để nó không quay lại.

### Kiểm tra

```bash
git log --oneline | head -5
git blame app/src/api/api.ts | head
```

### Khi nào đổi

- Làm cùng nhiều người: bật bảo vệ nhánh `main` trên GitHub, bắt buộc CI xanh trước khi gộp (chương 20).
- Lỗi chỉ xảy ra trên máy thật (iOS, Android): dùng công cụ gỡ lỗi của Expo và log từ thiết bị.
