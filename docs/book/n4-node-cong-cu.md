## Nền tảng 4. Node.js 26 và công cụ đi kèm

### Chương này làm gì

Những thứ có sẵn trong Node.js 26 mà sách dùng thay cho thư viện ngoài, và cách pnpm quản lý thư viện cho cả repo.

### Để làm gì

Mỗi thư viện thêm vào là một thứ phải cập nhật, có thể có lỗ hổng. Node.js 26 đã có sẵn những việc trước đây cần năm, sáu thư viện.

### Phân tích kỹ thuật

| Việc | Trước đây | Node.js 26 |
|---|---|---|
| Chạy TypeScript | `ts-node`, `tsx`, hoặc build bằng `tsc` | `node file.ts` (type stripping) |
| Đọc file `.env` | `dotenv` | `node --env-file-if-exists=.env` |
| Viết test | Jest, Vitest | `node --test` |
| Tự chạy lại khi sửa code | `nodemon` | `node --watch` |
| Gọi HTTP | `axios`, `node-fetch` | `fetch` có sẵn |
| Proxy theo biến môi trường | thư viện agent | `NODE_USE_ENV_PROXY=1` |

### Chọn gì, vì sao

**Dùng tính năng có sẵn trước; chỉ thêm thư viện khi Node.js không làm được** (ví dụ `@supabase/supabase-js`). Worker của sách chỉ có đúng một thư viện ngoài.

### Làm từng bước

**Bước 1: chạy và theo dõi.**

```json
// worker/package.json (trích)
"scripts": {
  "start": "node --env-file-if-exists=.env src/main.ts",
  "dev":   "node --watch --env-file-if-exists=.env src/main.ts",
  "test":  "node --test test/"
}
```

**Bước 2: test có sẵn.**

```ts
// worker/test/psl.test.ts (trích)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTau } from '../src/psl.ts';

test('drops tiers below the perceptual gain threshold', () => {
  assert.deepEqual(applyTau({ 64: 3.0, 96: 3.05, 128: 3.6 }, 0.1), [64, 128]);
});
```

**Bước 3: module có sẵn hay dùng.**

| Module | Dùng để |
|---|---|
| `node:fs/promises` | Đọc ghi file (`readFile`, `mkdtemp`) |
| `node:path` | Ghép đường dẫn đúng trên mọi hệ điều hành |
| `node:child_process` | Chạy ffmpeg, Python |
| `node:crypto` | Sinh số ngẫu nhiên, băm |
| `node:test`, `node:assert` | Test |

**Bước 4: pnpm cho monorepo.** Repo có ba phần chạy riêng (`app`, `worker`, `packages/*`). pnpm cài thư viện một lần cho tất cả, mỗi phần tự khai báo thứ mình cần.

```bash
pnpm install                         # cài cho cả repo
pnpm --filter @hugo/app web          # chạy lệnh trong một phần
pnpm --filter worker test
pnpm add -D --filter @hugo/app @playwright/test@1.64.1   # thêm thư viện cho một phần, ghi đúng phiên bản
```

`nodeLinker: hoisted` trong `pnpm-workspace.yaml` đặt thư viện phẳng như npm, vì Metro (bộ đóng gói của React Native) cần tìm thấy module native theo cách đó.

### Kiểm tra

```bash
node --version           # v26.x
pnpm --filter worker test
```

### Khi nào đổi

- Cần chụp ảnh, đo độ phủ code, chạy test trình duyệt: thêm công cụ chuyên dụng (sách dùng Playwright cho test đầu cuối, chương 19).
- Một tính năng còn đánh dấu *experimental* trong Node.js: chờ ổn định, hoặc khóa phiên bản Node trong `.nvmrc` và `engines`.
