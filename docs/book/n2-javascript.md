## Nền tảng 2. JavaScript và TypeScript cần biết

### Chương này làm gì

Đủ JavaScript để đọc mọi đoạn code trong sách, và đủ TypeScript để hiểu các chú thích kiểu. Mỗi mục là một đoạn code nhỏ dùng dữ liệu của Hugo Music.

### Để làm gì

Code trong sách ngắn vì dùng nhiều cú pháp hiện đại (destructuring, `?.`, `??`, arrow function). Biết chúng thì một dòng đọc ra một ý; không biết thì một dòng là một câu đố.

### Biến, hàm, đối tượng, mảng

```ts
const song = { id: 'a1', title: 'Drift', tiers: [64, 128, 256] }; // const: không gán lại
let plays = 0;                                                    // let: gán lại được
plays += 1;

const bitrateLabel = (kbps: number) => `${kbps} kbps`;            // arrow function + template string
bitrateLabel(song.tiers[0]);                                      // "64 kbps"
```

### Năm cú pháp xuất hiện nhiều nhất trong sách

```ts
// 1. Destructuring: lấy trường ra biến
const { data, error } = await supabase.from('songs').select('title');

// 2. Spread: chép rồi ghi đè
const updated = { ...song, title: 'Drift (Remix)' };

// 3. Optional chaining: không lỗi khi giữa chừng là null/undefined
const artistName = row.artist?.name;

// 4. Nullish coalescing: giá trị mặc định chỉ khi null/undefined (0 và '' vẫn giữ)
const year = row.album_year ?? undefined;

// 5. map / filter / find trên mảng
const titles = songs.filter((s) => s.status === 'published').map((s) => s.title);
```

### Module: import và export

Mỗi file là một module. Sách dùng chuẩn ES module:

```ts
// app/src/api/supabase.ts
export const supabase = createClient(url, key);

// file khác
import { supabase } from './supabase';
```

### TypeScript: JavaScript có kiểu

TypeScript thêm kiểu để trình soạn thảo báo lỗi trước khi chạy. Kiểu biến mất khi chạy: Node.js 26 tự bỏ phần kiểu rồi chạy thẳng file `.ts` (type stripping), không cần bước build.

```ts
type Song = { _id: string; title: string; hlsTiers?: string[] };  // ? = có thể không có

function topTier(song: Song): string | undefined {
  return song.hlsTiers?.at(-1);       // phần tử cuối, hoặc undefined
}
```

Kiểu của database không phải viết tay: chương 5 sinh `database.types.ts` từ chính các bảng, nên đổi cột là app báo lỗi ngay chỗ dùng sai.

| Cú pháp | Nghĩa |
|---|---|
| `x: string` | x là chuỗi |
| `a \| b` | a hoặc b |
| `T[]` | mảng các T |
| `Record<string, number>` | đối tượng khóa chuỗi, giá trị số |
| `as unknown as T` | ép kiểu (chỉ dùng khi chắc chắn hơn trình biên dịch) |

### Lớp và `this`: ít dùng

Code trong sách gần như không dùng class: hàm và đối tượng đủ rõ hơn. Bạn sẽ gặp class ở vài thư viện (ví dụ `OfflineManager` trong app). Đọc như một đối tượng có các hàm đi kèm là đủ.

### Kiểm tra

```bash
node -e "const s = { t: [64, 128] }; console.log(s.t?.at(-1) ?? 'none')"   # 128
node --test worker/test/                                                   # file .ts chạy thẳng
```

### Khi nào đổi

- Một hàm dài quá một màn hình, hoặc nhận quá ba tham số: tách hàm, hoặc gom tham số vào một đối tượng.
- Gõ `any` để hết lỗi: dừng lại, đó thường là chỗ code sai thật.
