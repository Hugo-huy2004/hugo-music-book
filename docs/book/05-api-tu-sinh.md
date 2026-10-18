## Chương 5. API tự sinh: tạm biệt CRUD viết tay

### Chương này làm gì

App đọc danh sách bài hát, nghệ sĩ và dữ liệu tham chiếu (thể loại, giấy phép) **mà không viết một route API nào**. Trang chủ hiện bài thật từ database.

### Để làm gì

Một app thông thường có hàng chục route chỉ để đọc ghi bảng: `GET /songs`, `GET /songs/:id`, `POST /playlists`... Mỗi route là code phải viết, test, và nhớ kiểm quyền. Phần lớn chúng giống nhau.

### Phân tích kỹ thuật

| Cách | Mạnh | Yếu |
|---|---|---|
| Viết route REST bằng tay | Toàn quyền | Lặp lại, dễ quên kiểm quyền ở một route |
| GraphQL server tự viết | Client chọn trường cần lấy | Thêm server, resolver, vấn đề N+1 |
| **API tự sinh từ database** (PostgREST trong Supabase) | Mỗi bảng thành API ngay; lọc, sắp xếp, phân trang, lấy kèm bảng liên quan; quyền do RLS quyết định | Logic nhiều bước phải viết thành hàm SQL (RPC) |

### Chọn gì, vì sao

**Đọc ghi bảng đơn giản: gọi thẳng API tự sinh qua `supabase-js`. Việc nhiều bước hoặc cần luật riêng: viết hàm SQL, gọi bằng `supabase.rpc()`.** Kiểu TypeScript sinh tự động từ database, nên đổi cột là app báo lỗi ngay khi biên dịch.

### Làm từng bước

**Bước 1: một client Supabase cho cả app.** Publishable key nằm trong app được, vì nó chỉ làm được những gì RLS cho phép.

```ts
// app/src/api/supabase.ts
import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { storage: localStorage, persistSession: true, autoRefreshToken: true } },
);
```

Dòng `import 'expo-sqlite/localStorage/install'` cho iOS và Android một `localStorage` giống trình duyệt, để Supabase lưu phiên đăng nhập trên mọi nền tảng bằng cùng một code.

**Bước 2: sinh kiểu TypeScript từ database.**

```bash
supabase gen types typescript --linked > app/src/api/database.types.ts
```

**Bước 3: đọc bài hát kèm tên nghệ sĩ trong một lượt gọi.** `artist:artists(name)` lấy kèm dòng nghệ sĩ qua khóa ngoại; không cần viết câu `join`. RLS tự lọc chỉ còn bài đã phát hành.

```ts
// app/src/api/api.ts (trích)
const SONG_COLUMNS = '*, artist:artists(name)';

getSongs: async () =>
  must(await supabase.from('songs')
    .select(SONG_COLUMNS)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(500)
  ).map(toSong),
```

**Bước 4: chuyển dòng database sang kiểu app dùng.** Database đặt tên kiểu `snake_case`, app kiểu `camelCase`. Một hàm `toSong` làm việc này ở đúng một chỗ, nên màn hình không cần biết database trông thế nào.

```ts
export function toSong(r: any): Song {
  return {
    _id: r.id,
    title: r.title,
    artist: r.artist?.name ?? '',
    coverArt: r.cover_path ? supabase.storage.from('covers').getPublicUrl(r.cover_path).data.publicUrl : undefined,
    duration: Number(r.duration_sec) || 0,
    hlsTiers: (r.hls_tiers ?? []).map(String),
    // ...
  };
}
```

**Bước 5: dữ liệu tham chiếu bằng một hàm SQL.** Danh sách thể loại và giấy phép nằm trong bảng (thêm một thể loại là thêm một dòng, không phát hành lại app). Hàm `get_meta()` gói tất cả thành đúng hình dạng app cần, một lượt gọi.

```sql
-- supabase/migrations/20261018001400_meta_genres.sql (trích)
create or replace function public.get_meta()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'genreGroups',      (select jsonb_agg(jsonb_build_object('key', key, 'label', label, 'colors', colors) order by sort_order)
                           from public.genre_groups),
    'licenses',         (select jsonb_agg(jsonb_build_object('key', key, 'label', label)) from public.licenses),
    'preferenceGenres', (select jsonb_agg(name order by sort_order) from public.preference_genres)
  )
$$;
grant execute on function public.get_meta to anon, authenticated;
```

```ts
getMeta: async () => must(await supabase.rpc('get_meta')),
```

**Bước 6: một hàm nhỏ để lỗi rõ ràng.** Mọi lượt gọi Supabase trả `{ data, error }`. `must()` biến `error` thành exception để màn hình bắt bằng `try/catch` như thường.

```ts
function must<T>({ data, error }: { data: T; error: any }): T {
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
}
```

### Kết quả

> 📷 Ảnh: trang chủ hiện bài thật từ Supabase; tab Network của trình duyệt cho thấy một request `GET /rest/v1/songs?select=*,artist:artists(name)...`.

### Kiểm tra

```bash
# API tự sinh trả JSON ngay, chỉ cần publishable key
curl "$SUPABASE_URL/rest/v1/songs?select=title,artist:artists(name)&limit=3" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY"
```

Bài chưa phát hành không bao giờ xuất hiện trong kết quả, dù không có dòng code nào trong app lọc nó: RLS làm việc đó.

### Khi nào đổi

- **Một màn hình cần dữ liệu từ năm bảng, tính toán phức tạp:** viết một view hoặc hàm SQL trả đúng hình dạng màn hình cần, thay vì ghép ở client.
- **Cần cache ở rìa mạng cho dữ liệu công khai:** đặt một Edge Function đọc rồi trả kèm `Cache-Control`.
