## Chương 18. Kiểm thử

### Chương này làm gì

Ba lớp test, mỗi lớp bắt một loại lỗi: test logic của worker (PSL), test bảo mật của database (RLS và hàm SQL) viết bằng pgTAP, và test đầu cuối (E2E) mở app thật trong trình duyệt.

### Để làm gì

Với kiến trúc này, phần lớn luật nằm trong database. Một chính sách RLS bị xóa nhầm không làm hỏng chức năng nào: app vẫn chạy, chỉ là chạy *cho cả người không được phép*. Không test nào của giao diện bắt được lỗi đó.

### Phân tích kỹ thuật

| Lớp | Công cụ | Bắt được |
|---|---|---|
| Logic thuần (TypeScript) | **`node:test`** có sẵn trong Node 26 (không cần Jest, Vitest) | Quy tắc PSL, hàm định dạng |
| Database | **pgTAP** (`supabase test db`) | RLS cho đúng người, hàm SQL kiểm quyền, giới hạn lượt nghe của khách |
| Đầu cuối | **Playwright** | Trang mở được, đăng nhập, phát nhạc, không lỗi giao diện |

### Chọn gì, vì sao

**Cả ba, chạy trong CI ở mỗi pull request.** Test database được viết *từ góc nhìn kẻ tấn công*: đóng vai người dùng A rồi thử đọc, sửa dữ liệu của B.

### Làm từng bước

**Bước 1: test logic bằng `node:test`.** Số liệu trong test là số đo thật.

```ts
// worker/test/psl.test.ts (trích)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTau, candidatesFor } from '../src/psl.ts';

test('drops tiers below the perceptual gain threshold', () => {
  const mos = { 64: 2.646, 96: 3.445, 128: 4.132, 160: 4.32, 192: 4.513, 256: 4.635, 320: 4.688 };
  assert.deepEqual(applyTau(mos), [64, 96, 128, 160, 192, 256]);   // 320k chỉ hơn 0,053
});

test('never encodes above the source bitrate', () => {
  assert.deepEqual(candidatesFor(158), [64, 96, 128]);
});
```

**Bước 2: test RLS bằng pgTAP.** Mỗi test chạy trong một giao dịch rồi hoàn tác, nên không để lại dữ liệu. `set local role` và `request.jwt.claims` đóng vai một người dùng cụ thể.

```sql
-- supabase/tests/rls.test.sql (trích)
begin;
select plan(4);

-- hai người dùng thử
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.dev');

-- đóng vai A
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

select throws_ok(
  $$ insert into public.song_likes (user_id, song_id) values ('00000000-0000-0000-0000-00000000000b', (select id from public.songs limit 1)) $$,
  '42501', null, 'A cannot like a song on behalf of B');

select throws_ok($$ select public.review_song((select id from public.songs limit 1), 'publish') $$,
  '42501', 'only admins can review songs', 'a normal user cannot publish songs');

select is((select count(*) from public.songs where status <> 'published'), 0::bigint,
  'unpublished songs are invisible to normal users');

select * from finish();
rollback;
```

```bash
supabase test db            # chạy mọi file trong supabase/tests/
```

**Bước 3: test đầu cuối bằng Playwright.** Mở bản build web, chờ trang chủ có bài thật, bấm phát, kiểm tra trình phát đã tải playlist HLS.

```ts
// app/e2e/smoke.spec.ts (trích)
test('guest can open home and play a song', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Trang chủ')).toBeVisible();
  const playlist = page.waitForResponse((r) => r.url().includes('/functions/v1/playback') && r.ok());
  await page.getByRole('button', { name: /Phát/ }).first().click();
  await playlist;
});
```

### Kết quả

> 📷 Ảnh: kết quả `node --test` và `supabase test db` đều xanh; báo cáo Playwright.

### Kiểm tra

```bash
pnpm test                   # node:test của worker và các package
supabase test db            # pgTAP
pnpm --filter @hugo/app e2e # Playwright (cần bản build web đang chạy)
```

Để chắc test bảo mật bắt được lỗi thật: xóa thử chính sách "members like songs" rồi chạy lại; test đầu tiên phải đỏ.

### Khi nào đổi

- **Test database chậm vì dữ liệu mẫu lớn:** tách dữ liệu mẫu ra `supabase/seed.sql`, chỉ tạo đúng dòng cần cho từng test.
- **App mobile cần test trên máy thật:** thêm Maestro chạy các luồng chính trên trình giả lập iOS/Android trong CI.
