## Nền tảng 5. Git, đọc code và gỡ lỗi

### Chương này làm gì

Ba kỹ năng dùng hằng ngày: lưu lịch sử code bằng Git và làm việc qua GitHub, đọc một codebase lạ theo đường đi của dữ liệu, và tìm lỗi bằng quy trình thay vì đoán. Ví dụ đều lấy từ những lỗi có thật khi chạy dự án của sách.

### Để làm gì

Repo của sách có vài trăm file. Không ai đọc hết; người làm được việc là người biết đi đúng đường tới chỗ cần sửa, biết quay lại khi sửa hỏng, và biết chứng minh lỗi đã hết.

### Git: ba vùng và vòng lặp hằng ngày

**So sánh:** Git là cuốn nhật ký của thư mục code. Mỗi commit là một trang: ghi lại toàn bộ trạng thái các file tại thời điểm đó, kèm một câu giải thích.

| Vùng | Là gì | Lệnh đưa vào |
|---|---|---|
| Thư mục làm việc | File bạn đang sửa | (tự động) |
| Staging | Những thay đổi sẽ vào commit kế tiếp | `git add` |
| Lịch sử | Các commit đã lưu | `git commit` |

Cấu hình một lần trên máy:

```bash
git config --global user.name "Lê Gia Huy"
git config --global user.email "ban@vidu.dev"
git config --global init.defaultBranch main
```

Vòng lặp hằng ngày:

```bash
git status                     # đang có gì thay đổi
git diff                       # thay đổi cụ thể từng dòng
git add -p                     # chọn từng đoạn muốn lưu (tránh lưu nhầm file rác)
git commit -m "Lời bài hát: tìm theo tên bài khi chưa có"
git log --oneline | head       # xem lịch sử gần đây
```

**Viết message commit:** một dòng nói thay đổi gì và vì sao, dạng mệnh lệnh ngắn. "Sửa CORS cho Edge Function playback" tốt hơn "fix bug".

### `.gitignore`: những thứ không bao giờ commit

```gitignore
node_modules/
dist/
.env
supabase/.env.deploy
docs/print/out/
```

Tạo trước commit đầu tiên. **Lỡ commit một khóa bí mật thì xóa file khỏi commit chưa đủ:** lịch sử Git vẫn giữ bản cũ, và repo công khai có thể đã bị quét. Việc đúng là **đổi khóa ngay** (tạo secret key mới trên Supabase, thu hồi token cũ), sau đó mới dọn lịch sử.

### Nhánh và pull request

Mỗi việc làm trên một nhánh riêng, xong mới gộp vào `main`:

```bash
git switch -c loi-bai-hat-lrclib           # tạo và chuyển sang nhánh mới
# ... sửa, commit nhiều lần ...
git push -u origin loi-bai-hat-lrclib      # đẩy nhánh lên GitHub
# mở Pull Request trên GitHub, CI chạy, xem lại, rồi gộp
git switch main && git pull                # cập nhật main sau khi gộp
```

| Lệnh | Khi nào |
|---|---|
| `git restore <file>` | Bỏ thay đổi chưa commit của một file |
| `git commit --amend` | Sửa commit vừa tạo (chưa push) |
| `git revert <commit>` | Tạo commit đảo ngược một commit cũ (an toàn với nhánh đã push) |
| `git stash` | Cất tạm thay đổi để chuyển nhánh |

**Lấy code của sách:**

```bash
git clone https://github.com/Hugo-huy2004/hugo-music-book.git
cd hugo-music-book
git log --oneline          # đọc lịch sử: mỗi commit kể một bước
```

### Đọc code theo đường đi của dữ liệu

Đừng đọc từ file đầu tới file cuối. Chọn **một hành động của người dùng** rồi đi theo dữ liệu của nó qua từng tầng:

```text
Bấm "Thích" trên một bài
  → SongActions.tsx          gọi store.toggleLike(song)
    → store/useStore.ts      cập nhật giao diện ngay, rồi gọi api.toggleLike
      → api/api.ts           supabase.from('song_likes').insert(...)
        → POST /rest/v1/song_likes
          → chính sách RLS   chỉ cho chèn dòng có user_id = chính mình (0300_library.sql)
          → trigger          tăng songs.likes_count
```

Bốn công cụ để đi đường này nhanh:

| Công cụ | Dùng để |
|---|---|
| Tìm trong cả repo (Ctrl+Shift+F, hoặc `grep -rn`) | Tìm nơi một tên hàm, tên bảng được dùng |
| Go to Definition (F12) | Nhảy tới nơi khai báo |
| Find All References (Shift+F12) | Ai gọi hàm này |
| `git log -p <file>`, `git blame <file>` | Dòng này do commit nào thêm, vì sao |

Mẹo đọc một file lạ: đọc phần `import` (nó phụ thuộc gì), phần `export` (nó cung cấp gì), rồi mới đọc thân hàm.

### Đọc thông báo lỗi

Thông báo lỗi có hai phần quan trọng: **dòng đầu** (lỗi gì) và **dòng đầu tiên thuộc code của bạn** trong stack trace (ở đâu). Các dòng thuộc thư viện thường bỏ qua được.

```text
TypeError: Cannot read properties of undefined (reading 'quality')        ← lỗi gì
    at SongListItem (app/src/screens/Admin/components/SongListItem.tsx:33) ← ở đâu: code của mình
    at renderWithHooks (node_modules/react-dom/...)                       ← thư viện: bỏ qua
```

Đây là lỗi có thật khi chạy sách: trang Trạng thái đăng tải trắng màn hình. Dòng 33 đọc `song.review.quality`, nhưng dữ liệu bài chưa có trường `review`. Sửa ở nơi **tạo** dữ liệu (thêm hàm `toReviewed` trong `api.ts`), không vá bằng `song.review?.quality` ở nơi hiện lỗi: vá triệu chứng thì màn hình hết trắng nhưng phần kiểm tra bản quyền vẫn sai.

| Lỗi hay gặp | Thường do |
|---|---|
| `Cannot read properties of undefined (reading 'x')` | Đối tượng chưa có, hoặc dữ liệu khác hình dạng mong đợi |
| `x is not a function` | Gọi hàm không tồn tại (tên sai, hoặc thư viện đổi API) |
| `x is not iterable` | Dùng `for...of` hay destructuring mảng trên thứ không phải mảng |
| `permission denied for table x` (mã `42501`) | Thiếu quyền ở database: RLS hoặc quyền theo cột |
| `Failed to fetch` / CORS | Server không cho trang web gọi tới, hoặc mạng hỏng |

### Gỡ lỗi: dừng code lại và nhìn vào trong

**`console.log` có chủ đích:** in giá trị ở ranh giới giữa các tầng (trước khi gọi API, ngay sau khi nhận kết quả), không rải khắp nơi.

**Debugger:** dừng chương trình ở một dòng và xem mọi biến lúc đó.

```bash
node --inspect-brk --env-file=.env src/main.ts   # mở chrome://inspect, bấm "inspect", đặt breakpoint
```

Trong VS Code: bấm vào lề trái để đặt breakpoint, chạy bằng "JavaScript Debug Terminal".

**Tab Network của trình duyệt** là công cụ mạnh nhất cho app web: thấy từng request đi ra, mã trả về, thân response. Phần lớn lỗi "app không hiện dữ liệu" khi chạy sách được tìm ra ở đây:

| Thấy trong Network | Nghĩa |
|---|---|
| Request đỏ, lỗi CORS | Server không cho phép header client gửi (lỗi thật: Edge Function thiếu `x-client-info` trong danh sách cho phép) |
| 200 nhưng thân là `[]` | RLS lọc hết dòng: người này không được xem |
| 401 / 403 | Chưa đăng nhập / không có quyền |
| `42501` trong thân | Bị từ chối quyền theo cột |

### Quy trình khi gặp lỗi

1. **Tái hiện:** một lệnh hoặc chuỗi thao tác làm lỗi xảy ra mỗi lần.
2. **Thu hẹp:** lỗi ở client, ở API hay ở database? Gọi thẳng API bằng `curl`: đúng thì lỗi ở app, sai thì lỗi ở server.
3. **Tìm nguyên nhân, sửa nguyên nhân:** không sửa triệu chứng.
4. **Viết test cho đúng lỗi đó** (chương 19) để nó không quay lại.
5. **Commit với message nói rõ lỗi gì và vì sao.**

### Thực hành

1. Clone repo, chạy `git log --oneline` và `git show --stat HEAD`: commit mới nhất sửa những file nào?
2. Đi theo đường dữ liệu của nút "Tạo nhóm mới" (chương 15): từ `GroupPanel.tsx` tới hàm SQL `create_group`. Ghi lại từng file đi qua.
3. Mở app web, DevTools → Network, tìm request tới `/rest/v1/rpc/get_meta`. Đọc thân response.

### Tự kiểm

1. Ba vùng của Git là gì? `git add` chuyển thay đổi từ vùng nào sang vùng nào?
2. Lỡ commit secret key của Supabase lên GitHub: việc đầu tiên phải làm là gì?
3. `git revert` và `git commit --amend` khác nhau thế nào? Khi nào không được dùng `--amend`?
4. Trong một stack trace dài, dòng nào bạn đọc đầu tiên?
5. Response 200 với thân `[]` cho bảng `songs` khi đăng nhập bằng tài khoản thường. Nghi ngờ đầu tiên là gì?
6. Vì sao sửa lỗi `review.quality` bằng `?.` là sửa sai chỗ?
