## Nền tảng 4. Node.js 26, npm và pnpm

### Chương này làm gì

Cài đặt Node.js 26 đúng cách, những tính năng có sẵn mà sách dùng thay cho thư viện ngoài, các module có sẵn hay dùng, `package.json` và cách pnpm quản lý thư viện cho cả repo nhiều phần.

### Để làm gì

Mỗi thư viện thêm vào là một thứ phải cập nhật, có thể có lỗ hổng, có thể ngừng phát triển. Node.js 26 đã có sẵn những việc trước đây cần năm, sáu thư viện. Worker của sách chỉ cần đúng một thư viện ngoài.

### Cài đặt và chọn phiên bản

Node.js ra bản mới hai lần mỗi năm; bản số chẵn được hỗ trợ dài hạn (LTS). Dùng trình quản lý phiên bản để mỗi dự án tự chọn bản của nó:

```bash
# cài fnm (Fast Node Manager), rồi:
fnm install 26
fnm use 26
node --version        # v26.x
```

Repo ghi phiên bản cần dùng ở hai chỗ: `.nvmrc` (ghi `26`, trình quản lý phiên bản tự đọc) và `engines` trong `package.json` (pnpm cảnh báo nếu sai bản).

### Phân tích kỹ thuật

| Việc | Trước đây | Node.js 26 |
|---|---|---|
| Chạy TypeScript | `ts-node`, `tsx`, hoặc build bằng `tsc` | `node file.ts` (type stripping) |
| Đọc file `.env` | `dotenv` | `node --env-file-if-exists=.env` |
| Viết test | Jest, Vitest | `node --test` |
| Tự chạy lại khi sửa code | `nodemon` | `node --watch` |
| Gọi HTTP | `axios`, `node-fetch` | `fetch` có sẵn |
| Proxy theo biến môi trường | thư viện agent | `NODE_USE_ENV_PROXY=1` |
| WebSocket client | `ws` | `WebSocket` có sẵn |

**Type stripping hoạt động thế nào:** Node.js thay phần chú thích kiểu bằng khoảng trắng rồi chạy như JavaScript. Không kiểm tra kiểu (việc đó để trình soạn thảo và `tsc --noEmit` trong CI), và không hỗ trợ vài cú pháp TypeScript có sinh code như `enum`. Sách dùng chuỗi hợp (`'pending' | 'published'`) thay cho `enum` vì vậy.

### Chọn gì, vì sao

**Dùng tính năng có sẵn trước; chỉ thêm thư viện khi Node.js không làm được** (ví dụ `@supabase/supabase-js` để nói chuyện với Supabase). Ít thư viện thì ít thứ phải theo dõi bảo mật, cài nhanh hơn, image Docker của worker nhỏ hơn.

### Làm từng bước

**Bước 1: `package.json` là bản khai của một dự án.**

```json
// worker/package.json (trích)
{
  "name": "@hugo/worker",
  "type": "module",
  "scripts": {
    "start": "node --env-file-if-exists=.env src/main.ts",
    "dev":   "node --watch --env-file-if-exists=.env src/main.ts",
    "test":  "node --test test/"
  },
  "dependencies": { "@supabase/supabase-js": "^2.118.0" }
}
```

| Trường | Nghĩa |
|---|---|
| `"type": "module"` | Dùng `import`/`export` (ES module) |
| `scripts` | Lệnh tắt: `pnpm start`, `pnpm test` |
| `dependencies` | Thư viện cần khi chạy |
| `devDependencies` | Thư viện chỉ cần khi phát triển (test, kiểm kiểu) |

**Phiên bản thư viện** theo dạng `lớn.nhỏ.vá`: `^2.118.0` nghĩa là nhận mọi bản 2.x từ 2.118.0 trở lên (không nhận 3.0 vì có thể phá vỡ). File `pnpm-lock.yaml` khóa bản chính xác đã cài, để máy bạn, máy đồng đội và CI cài giống hệt nhau: luôn commit file này.

**Bước 2: test có sẵn.**

```ts
// worker/test/psl.test.ts (trích)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTau } from '../src/psl.ts';

test('compares with the last KEPT tier, not the neighbour', () => {
  assert.deepEqual(applyTau({ 64: 3.0, 96: 3.06, 128: 3.12 }), [64, 128]);
});
```

```bash
node --test test/            # chạy mọi file test
node --test --watch test/    # chạy lại khi sửa
```

**Bước 3: module có sẵn hay dùng.** Viết kèm tiền tố `node:` để phân biệt với thư viện ngoài.

| Module | Dùng để | Ví dụ trong sách |
|---|---|---|
| `node:fs/promises` | Đọc ghi file | Seed đọc file nhạc mẫu (`readFile`) |
| `node:path` | Ghép đường dẫn đúng trên mọi hệ điều hành | `join(dir, 'original')` |
| `node:os` | Thư mục tạm, số CPU | `tmpdir()` cho file đang xử lý |
| `node:child_process` | Chạy chương trình khác | Worker gọi `ffmpeg`, `ffprobe`, Python |
| `node:crypto` | Số ngẫu nhiên, băm, UUID | `randomUUID()` |
| `node:test`, `node:assert` | Test | `worker/test/` |
| `node:events` | Phát và nghe sự kiện | Nền của stream, server |
| `node:stream` | Xử lý dữ liệu theo dòng chảy | Đọc file lớn không nạp hết vào RAM |

**Stream** đáng nói thêm: đọc một file nhạc 300 MB bằng `readFile` nạp cả 300 MB vào bộ nhớ; đọc bằng stream thì xử lý từng khúc nhỏ. Worker để ffmpeg đọc thẳng file trên đĩa, nên không cần tự viết stream, nhưng đây là lý do Node.js xử lý được file lớn với ít RAM.

**Bước 4: pnpm cho repo nhiều phần.** Repo có ba phần chạy riêng (`app`, `worker`, `packages/*`). pnpm cài thư viện một lần cho tất cả, mỗi phần tự khai báo thứ nó cần.

```yaml
# pnpm-workspace.yaml
packages:
  - app
  - worker
  - packages/*
nodeLinker: hoisted
```

```bash
pnpm install                                   # cài cho cả repo
pnpm --filter @hugo/app web                    # chạy lệnh trong một phần
pnpm --filter @hugo/worker test
pnpm add --filter @hugo/worker some-lib              # thêm thư viện cho một phần
pnpm add -D --filter @hugo/app @playwright/test@1.64.1   # thư viện phát triển, ghi đúng phiên bản
pnpm -r test                                   # chạy "test" ở mọi phần có script này
```

`nodeLinker: hoisted` đặt thư viện phẳng trong `node_modules` như npm, vì Metro (bộ đóng gói của React Native) cần tìm module native theo cách đó.

**npm, pnpm, yarn khác gì:** cùng đọc `package.json`. pnpm nhanh hơn và tiết kiệm đĩa (một bản thư viện dùng chung cho mọi dự án trên máy), hỗ trợ workspace tốt. Lệnh `npx` (của npm) vẫn dùng để chạy công cụ một lần như `npx expo export`.

### Thực hành

1. `node --version` và `pnpm --version`. Sai bản thì dùng `fnm use 26`.
2. Tạo file `hello.ts` chứa `const n: number = 41; console.log(n + 1)`, chạy `node hello.ts`. Không cần cài gì thêm.
3. Chạy `pnpm --filter @hugo/worker test`, sau đó sửa một con số trong test cho sai và chạy lại: đọc thông báo `AssertionError` để thấy giá trị mong đợi và giá trị thật.

### Tự kiểm

1. Năm việc nào trước đây cần thư viện mà Node.js 26 làm sẵn?
2. Type stripping có kiểm tra lỗi kiểu không? Vậy lỗi kiểu được bắt ở đâu?
3. `^2.118.0` cho phép cài những phiên bản nào? Vì sao phải commit `pnpm-lock.yaml`?
4. `dependencies` và `devDependencies` khác nhau thế nào? Playwright thuộc loại nào?
5. Đọc một file 300 MB bằng `readFile` và bằng stream khác nhau ở đâu?
6. Lệnh nào chạy test chỉ cho phần worker trong repo?
