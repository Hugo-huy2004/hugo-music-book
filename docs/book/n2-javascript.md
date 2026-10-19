## Nền tảng 2. JavaScript và TypeScript dùng trong sách

### Chương này làm gì

Đi qua phần JavaScript và TypeScript mà code trong sách dùng: biến và kiểu dữ liệu, hàm, đối tượng và mảng, năm cú pháp hiện đại xuất hiện ở hầu hết mọi file, module, và kiểu TypeScript. Mỗi mục có ví dụ bằng dữ liệu của Hugo Music và giải thích những chỗ hay vướng.

### Để làm gì

Code trong sách ngắn vì dùng nhiều cú pháp gọn: destructuring, `?.`, `??`, arrow function. Biết chúng thì một dòng đọc ra một ý; không biết thì một dòng là một câu đố.

### Biến: `const` và `let`

```ts
const songTitle = 'Drift';   // const: không gán lại được
let plays = 0;               // let: gán lại được
plays = plays + 1;           // hoặc plays += 1, plays++
```

Mặc định dùng `const`; chỉ dùng `let` khi thật sự cần gán lại. Không dùng `var` (cách cũ, phạm vi khó đoán).

Chỗ hay vướng: `const` cấm **gán lại biến**, không cấm sửa bên trong đối tượng:

```ts
const song = { title: 'Drift' };
song.title = 'Drift (Remix)';   // được
song = { title: 'Khác' };       // lỗi: gán lại const
```

### Kiểu dữ liệu

| Kiểu | Ví dụ | Ghi chú |
|---|---|---|
| `string` | `'Mưa Đêm Sài Gòn'`, `` `${kbps} kbps` `` | Ngoặc ngược cho phép chèn biến |
| `number` | `91.23`, `256` | Số nguyên và số thực chung một kiểu |
| `boolean` | `true`, `false` | |
| `null` | `null` | "Cố ý không có giá trị" |
| `undefined` | `undefined` | "Chưa được gán" |
| Đối tượng | `{ title: 'Drift' }` | |
| Mảng | `[64, 128, 256]` | Là một loại đối tượng |

So sánh dùng `===` (bằng cả giá trị lẫn kiểu), không dùng `==`: `'1' == 1` là `true`, `'1' === 1` là `false`.

**Giá trị "giả" (falsy):** `false`, `0`, `''`, `null`, `undefined`, `NaN`. Mọi thứ khác là "thật". Đây là nguồn lỗi hay gặp: `if (song.likes_count)` coi bài 0 lượt thích là "không có".

### Hàm

```ts
// Cách khai báo thường
function bitrateLabel(kbps: number): string {
  return `${kbps} kbps`;
}

// Arrow function: gọn, dùng nhiều nhất trong sách
const bitrateLabel2 = (kbps: number) => `${kbps} kbps`;   // một biểu thức thì không cần return

// Tham số mặc định
const topSongs = (days = 7, limit = 50) => api.getTopSongs(days, limit);
topSongs();        // days = 7, limit = 50
topSongs(30);      // days = 30, limit = 50
```

Hàm là giá trị: truyền được vào hàm khác. `songs.map((s) => s.title)` truyền một hàm nhỏ vào `map`.

### Đối tượng và mảng

```ts
const song = { id: 'a1', title: 'Drift', tiers: [64, 128, 256], artist: { name: 'Kim Ngân' } };

song.title;            // 'Drift'
song['title'];         // cách viết khác, dùng khi tên khóa nằm trong biến
song.artist.name;      // 'Kim Ngân'
song.tiers[0];         // 64 (mảng đếm từ 0)
song.tiers.length;     // 3
song.tiers.at(-1);     // 256 (phần tử cuối)
```

Các hàm mảng dùng nhiều nhất. Không hàm nào trong số này sửa mảng gốc:

| Hàm | Làm gì | Ví dụ |
|---|---|---|
| `map` | Biến mỗi phần tử thành một thứ khác | `rows.map(toSong)` |
| `filter` | Giữ phần tử thỏa điều kiện | `songs.filter((s) => s.status === 'published')` |
| `find` | Phần tử đầu tiên thỏa điều kiện | `songs.find((s) => s._id === id)` |
| `some` | Có phần tử nào thỏa không | `results.some((r) => r.line.startsWith('not ok'))` |
| `includes` | Có chứa giá trị không | `song.hlsTiers.includes('128')` |
| `reduce` | Gộp cả mảng thành một giá trị | Tổng thời lượng một danh sách phát |
| `sort` | Sắp xếp (**có** sửa mảng gốc) | `[...list].sort(newestFirst)` (chép trước khi sắp) |

### Năm cú pháp xuất hiện ở hầu hết mọi file

**1. Destructuring: lấy trường ra biến.**

```ts
const { data, error } = await supabase.from('songs').select('title');
// tương đương: const r = await ...; const data = r.data; const error = r.error;

const [first, second] = song.tiers;            // với mảng: theo vị trí
const { data: { user } } = await supabase.auth.getUser();   // lồng nhau
```

**2. Spread `...`: chép rồi ghi đè.**

```ts
const updated = { ...song, title: 'Drift (Remix)' };   // chép song, đổi title
const all = [...oldSongs, ...newSongs];                 // nối mảng
```

Trong React và zustand (chương 16), trạng thái không được sửa trực tiếp; luôn tạo đối tượng mới bằng spread.

**3. Optional chaining `?.`: không lỗi khi giữa chừng là `null`/`undefined`.**

```ts
row.artist?.name           // undefined nếu row.artist là null, thay vì báo lỗi
song.hlsTiers?.at(-1)
user?.isGuest
```

**4. Nullish coalescing `??`: giá trị mặc định chỉ khi `null`/`undefined`.**

```ts
const year = row.album_year ?? undefined;
const count = r.count ?? 0;
```

Khác `||`: `0 || 10` là `10` (vì 0 là falsy), còn `0 ?? 10` là `0`. Với số lượng, luôn dùng `??`.

**5. Template string: chèn biến vào chuỗi.**

```ts
const topic = group ? `group:${group.id}` : `workspace:${user._id}`;
```

### Module: `import` và `export`

Mỗi file là một module, chỉ những gì được `export` mới dùng được từ file khác:

```ts
// app/src/api/supabase.ts
export const supabase = createClient(url, key);

// app/src/api/api.ts
import { supabase } from './supabase';                  // file trong repo: đường dẫn tương đối
import { createClient } from '@supabase/supabase-js';   // thư viện: tên package
import type { Database } from './database.types';       // chỉ lấy kiểu, mất khi chạy
```

`export default` cho phép import không cần ngoặc nhọn (`import AppNavigator from './AppNavigator'`). Sách ưu tiên export có tên để tìm kiếm dễ.

### TypeScript: JavaScript có kiểu

TypeScript thêm chú thích kiểu để trình soạn thảo báo lỗi **trước khi chạy**: gõ sai tên cột, truyền chuỗi vào chỗ cần số, quên trường hợp `null`. Kiểu biến mất khi chạy: Node.js 26 tự bỏ phần kiểu rồi chạy thẳng file `.ts`.

```ts
type Song = {
  _id: string;
  title: string;
  hlsTiers?: string[];      // ? : có thể không có
  status?: 'pending' | 'processing' | 'published' | 'rejected' | 'failed';
};

function topTier(song: Song): string | undefined {
  return song.hlsTiers?.at(-1);
}
```

| Cú pháp | Nghĩa |
|---|---|
| `x: string` | x là chuỗi |
| `x?: number` | x có thể không có |
| `a \| b` | a hoặc b |
| `'on' \| 'off'` | chỉ đúng một trong các chuỗi này |
| `T[]` | mảng các T |
| `Record<string, number>` | đối tượng: khóa chuỗi, giá trị số |
| `Promise<T>` | sẽ có một T trong tương lai (Nền tảng 3) |
| `as T` | ép kiểu: chỉ dùng khi chắc hơn trình biên dịch |

**Kiểu sinh từ database.** Không viết tay kiểu cho bảng: chương 5 sinh `database.types.ts` từ chính các bảng. Đổi tên cột trong migration rồi sinh lại kiểu, mọi chỗ dùng tên cũ báo lỗi đỏ. Lệnh `pnpm --filter @hugo/app typecheck` chạy trong CI để không gộp code sai kiểu.

**Chỗ hay vướng: `any`.** Gõ `any` làm hết lỗi đỏ, nhưng tắt luôn khả năng bắt lỗi. Khi chạy thật sách, mọi lỗi "màn hình trắng" ở trang quản trị đều nằm ở chỗ dữ liệu là `any`: hàm trả về một hình dạng, màn hình đọc một hình dạng khác.

### Lớp và `this`

Code trong sách gần như không dùng class: hàm và đối tượng rõ hơn. Bạn sẽ gặp class trong vài file (ví dụ `OfflineManager`). Đọc nó như một đối tượng có các hàm đi kèm; `this` trong đó chỉ chính đối tượng.

### Thực hành

1. Chạy trong terminal và đoán kết quả trước khi Enter:

```bash
node -e "const s = { t: [64, 128] }; console.log(s.t?.at(-1) ?? 'none', s.x?.y ?? 'none', 0 || 10, 0 ?? 10)"
```

2. Viết hàm `totalMinutes(songs)` nhận mảng `{ duration: number }` (giây), trả tổng số phút làm tròn, dùng `reduce`.
3. Mở `app/src/api/api.ts`, tìm hàm `toSong`. Chỉ ra một chỗ dùng `?.` và một chỗ dùng `??`, giải thích vì sao cần.

### Tự kiểm

1. `const song = {}; song.title = 'A'` có lỗi không? Vì sao?
2. `0 || 10` và `0 ?? 10` cho kết quả gì? Khi đếm lượt thích nên dùng cái nào?
3. Viết lại bằng destructuring: `const r = await q; const data = r.data; const error = r.error;`.
4. `songs.sort(...)` khác `songs.map(...)` ở điểm nào quan trọng với React?
5. Kiểu `'pending' | 'published'` bắt được lỗi gì mà kiểu `string` không bắt được?
6. Vì sao không viết tay kiểu cho các bảng database?
