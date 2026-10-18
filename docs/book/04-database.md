## Chương 4. Database cho danh mục nhạc

### Chương này làm gì

Tạo hai bảng đầu tiên, `artists` và `songs`, bằng một file migration. Mọi bảng bật RLS ngay khi tạo.

### Để làm gì

Database là nền của mọi tính năng. Thiết kế sai từ đầu (thiếu khóa ngoại, kiểu dữ liệu tùy tiện, trạng thái là chữ tự do) sẽ khiến dữ liệu bẩn dần và mỗi tính năng sau phải viết code vá.

### Phân tích kỹ thuật

**Cách tạo bảng:**

| Cách | Mạnh | Yếu |
|---|---|---|
| Bấm trong dashboard | Nhanh khi thử | Không ghi lại, không tái tạo được trên project khác |
| ORM (Drizzle, Prisma) sinh SQL | Viết schema bằng TypeScript | Thêm một lớp; RLS, trigger, hàm SQL vẫn phải viết tay |
| **File migration SQL** | Ghi lại từng bước, chạy lại được ở mọi nơi, đi cùng code trong git | Phải biết SQL |

**Khóa chính:** số tăng dần (`identity`) cho bảng nhỏ ít khi lộ ra ngoài như `artists`; **UUID** cho `songs` vì id xuất hiện trong URL và đường dẫn file, không nên đoán được và cần sinh trước khi ghi (app tải file lên trước, tạo dòng sau).

**Trạng thái bài hát:** chuỗi tự do (`text`) cho phép gõ sai `"publised"`; **enum** chỉ nhận đúng các giá trị đã khai báo.

### Chọn gì, vì sao

**Migration SQL trong `supabase/migrations/`, chạy bằng `supabase db push`.** Supabase dùng PostgreSQL thật, nên SQL học ở đây dùng được ở mọi nơi. RLS, trigger, hàm SQL ở các chương sau cũng nằm trong migration, cùng một chỗ.

### Làm từng bước

**Bước 1: tạo file migration.**

```bash
supabase migration new catalog     # tạo supabase/migrations/<thời gian>_catalog.sql
```

**Bước 2: bảng nghệ sĩ.** Tên là duy nhất; `check` chặn tên rỗng ngay từ database.

```sql
-- supabase/migrations/20261018000100_catalog.sql (trích)
create table public.artists (
  id          bigint generated always as identity primary key,
  name        text not null unique check (length(name) between 1 and 120),
  photo_url   text,
  bio         text not null default '',
  created_at  timestamptz not null default now()
);
```

**Bước 3: trạng thái bài hát là enum.** Năm trạng thái ứng với vòng đời một bài: chờ duyệt → đang xử lý → đã phát hành (hoặc bị từ chối, xử lý lỗi).

```sql
create type public.song_status as enum ('pending', 'processing', 'published', 'rejected', 'failed');
```

**Bước 4: bảng bài hát.** Gom cột theo nhóm để đọc là hiểu: thông tin bài, giấy phép, file, kết quả xử lý, trạng thái.

```sql
create table public.songs (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(title) between 1 and 200),
  artist_id     bigint not null references public.artists (id),
  genre         text,
  duration_sec  numeric(8, 2) not null default 0,
  -- giấy phép: bắt buộc, vì Hugo Music chỉ phát nhạc có giấy phép mở
  license       text not null,
  source_url    text not null,
  -- file trong Storage: lưu đường dẫn trong bucket, không lưu URL (URL đổi theo môi trường)
  original_path text,
  cover_path    text,
  -- kết quả worker (chương 10)
  hls_tiers     integer[] not null default '{}',
  -- trạng thái
  status        public.song_status not null default 'pending',
  published_at  timestamptz,
  likes_count   integer not null default 0,
  created_at    timestamptz not null default now()
);
```

**Bước 5: index cho câu truy vấn hay dùng nhất.** Trang chủ luôn hỏi "bài đã phát hành, mới nhất trước". Index một phần (`where status = 'published'`) chỉ chứa đúng những dòng đó nên nhỏ và nhanh.

```sql
create index songs_published_idx on public.songs (published_at desc) where status = 'published';
```

**Bước 6: bật RLS, mở quyền đọc công khai.** Bật RLS mà chưa có chính sách nào thì không ai đọc được gì. Ta mở đúng một quyền: ai cũng đọc được bài *đã phát hành*. Chương 7 giải thích kỹ.

```sql
alter table public.artists enable row level security;
alter table public.songs enable row level security;

create policy "published songs are public"
  on public.songs for select to anon, authenticated
  using (status = 'published');

create policy "artists are public"
  on public.artists for select to anon, authenticated
  using (true);
```

**Bước 7: đẩy lên project.**

```bash
supabase db push
```

### Kết quả

> 📷 Ảnh: Table Editor hiện bảng `songs` với các cột, và sơ đồ quan hệ ở Database → Schema Visualizer.

### Kiểm tra

```bash
supabase db push --dry-run        # không còn migration nào chưa chạy
```

Thử trong SQL Editor: thêm một bài với `status = 'publised'` (gõ sai) phải báo lỗi `invalid input value for enum song_status`.

### Khi nào đổi

- **Một bài có nhiều nghệ sĩ** (feat.): thêm bảng nối `song_artists (song_id, artist_id, role)`.
- **Danh mục vài triệu bài:** chia `songs` thành bảng danh mục (ít đổi) và bảng số liệu (`likes_count`, lượt nghe; đổi liên tục) để cập nhật số liệu không khóa dòng danh mục.
