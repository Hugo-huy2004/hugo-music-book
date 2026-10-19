## Nền tảng 3. Bất đồng bộ và event loop

### Chương này làm gì

Giải thích vì sao gần như mọi lời gọi trong sách có `await`, Promise là gì, xử lý lỗi thế nào, chạy nhiều việc cùng lúc bằng `Promise.all`, và Node.js sắp thứ tự các việc ra sao (event loop). Cuối chương là các lỗi bất đồng bộ hay gặp và cách nhận ra.

### Để làm gì

Gọi database, tải file, chạy ffmpeg đều mất từ vài chục mili giây tới vài phút. Nếu chương trình đứng chờ từng việc, app đơ khi mạng chậm và worker xử lý một bài mất gấp mấy lần cần thiết.

### Đồng bộ và bất đồng bộ

**So sánh:** gọi phở. Kiểu đồng bộ: đứng ở quầy chờ tới khi có tô phở mới làm việc khác. Kiểu bất đồng bộ: nhận số thứ tự, về bàn làm việc khác, khi được gọi số thì ra lấy. Số thứ tự đó chính là **Promise**.

```ts
const promise = fetch('https://example.com');   // trả ngay một Promise, chưa có dữ liệu
console.log(promise);                            // Promise { <pending> }
const res = await promise;                       // chờ tới khi có kết quả
```

Một Promise ở một trong ba trạng thái: **đang chờ** (pending), **xong** (fulfilled, có giá trị), **hỏng** (rejected, có lỗi). Đã xong hay hỏng thì không đổi nữa.

### Ba cách viết, một cách nên dùng

```ts
// 1. Callback: lồng nhau nhiều tầng ("callback hell")
fs.readFile('a.json', (err, a) => {
  if (err) return console.error(err);
  fs.readFile('b.json', (err, b) => { /* ... */ });
});

// 2. .then().catch(): phẳng hơn, vẫn dài
fetch(url).then((r) => r.json()).then((data) => show(data)).catch(console.error);

// 3. async/await: đọc như code tuần tự (sách dùng cách này)
async function load() {
  const r = await fetch(url);
  return await r.json();
}
```

`await` chỉ dùng được trong hàm có `async` (và ở cấp cao nhất của một module ES, như `worker/src/main.ts`). Hàm `async` luôn trả về một Promise, kể cả khi bên trong `return 5`.

### Xử lý lỗi

Lỗi trong code bất đồng bộ bắt bằng `try/catch` như code thường:

```ts
async function loadSong(id: string) {
  try {
    const { data, error } = await supabase.from('songs').select('*').eq('id', id).single();
    if (error) throw error;          // supabase-js không tự ném lỗi: trả { error }
    return data;
  } catch (e) {
    console.error('không tải được bài', e);
    return null;
  } finally {
    setLoading(false);               // luôn chạy, dù thành công hay lỗi
  }
}
```

Thư viện `supabase-js` trả `{ data, error }` thay vì ném lỗi. Hàm `must()` trong `api.ts` (chương 5) biến `error` thành lỗi ném ra, để màn hình bắt bằng một `try/catch` duy nhất.

**Lỗi không ai bắt** (unhandled rejection) làm Node.js dừng chương trình. Worker của sách bọc mỗi việc trong `try/catch`: một bài hỏng không làm chết cả worker, việc được trả lại hàng đợi để thử lại.

### Chạy song song khi các việc không phụ thuộc nhau

```ts
// Tuần tự: tổng thời gian = cộng dồn (ví dụ 300 + 200 = 500 ms)
const songs = await api.getSongs();
const stations = await api.getStations();

// Song song: tổng thời gian = việc lâu nhất (300 ms)
const [songs2, stations2] = await Promise.all([api.getSongs(), api.getStations()]);
```

| Hàm | Khi một việc hỏng | Dùng khi |
|---|---|---|
| `Promise.all` | Cả nhóm hỏng ngay | Cần đủ mọi kết quả (trang chủ cần cả bài lẫn đài) |
| `Promise.allSettled` | Vẫn chờ hết, báo từng việc thành công hay hỏng | Duyệt hàng loạt bài (chương 18): bài nào hỏng báo bài đó |
| `Promise.race` | Lấy việc xong đầu tiên | Đặt giới hạn thời gian |
| `Promise.any` | Lấy việc thành công đầu tiên | Thử nhiều nguồn, nguồn nào trả trước dùng trước |

Ví dụ thật trong `api.ts`: đếm số bài ở ba trạng thái cùng lúc.

```ts
const counts = Object.fromEntries(await Promise.all(
  ['pending', 'published', 'rejected'].map(async (st) =>
    [st, (await supabase.from('songs').select('id', { count: 'exact', head: true }).eq('status', st)).count ?? 0]),
));
```

### Event loop chạy theo thứ tự nào

Node.js chạy JavaScript trên **một luồng**: tại một thời điểm chỉ một đoạn code JavaScript chạy. Việc chờ (mạng, ổ đĩa, hẹn giờ) được giao cho hệ điều hành; khi xong, hàm xử lý được xếp hàng chờ luồng rảnh. Vòng lặp lấy việc từ hàng đợi ra chạy gọi là **event loop**.

```ts
console.log('1');
setTimeout(() => console.log('4: hẹn giờ'), 0);
Promise.resolve().then(() => console.log('3: microtask'));
console.log('2');
// In ra: 1, 2, 3, 4
```

Giải thích từng bước:

1. `console.log('1')` chạy ngay.
2. `setTimeout(..., 0)` đăng ký một việc vào hàng **macrotask**, chưa chạy.
3. `Promise.resolve().then(...)` đăng ký một việc vào hàng **microtask**, chưa chạy.
4. `console.log('2')` chạy ngay. Đoạn code hiện tại hết.
5. Trước khi sang vòng mới, event loop chạy **hết** hàng microtask: in `3`.
6. Vòng mới: lấy một macrotask: in `4`.

Quy tắc nhớ: **microtask** (Promise, `await`) chạy ngay khi đoạn code hiện tại xong; **macrotask** (hẹn giờ, I/O) chạy ở vòng kế tiếp.

### Hệ quả thực tế

- **Một vòng lặp tính toán nặng chặn mọi thứ khác.** Trong lúc nó chạy, không request nào được xử lý, không hẹn giờ nào kích hoạt. Việc nặng như mã hóa âm thanh giao cho tiến trình riêng: worker gọi `ffmpeg` và Python (ViSQOL) qua `node:child_process`, không tính trong luồng JavaScript.
- **`await` trong vòng `for` chạy tuần tự.** Đúng khi các bước phụ thuộc nhau (mã hóa từng mức rồi mới đo), sai khi chúng độc lập.
- **Song song có giới hạn.** Upload 50 file cùng lúc làm nghẽn mạng; xử lý theo lô, ví dụ mỗi lần 5 file.

```ts
for (let i = 0; i < files.length; i += 5) {
  await Promise.all(files.slice(i, i + 5).map(upload));   // 5 file một lô
}
```

### Lỗi bất đồng bộ hay gặp

| Triệu chứng | Nguyên nhân | Sửa |
|---|---|---|
| Biến là `Promise { <pending> }` | Quên `await` | Thêm `await` |
| Màn hình hiện dữ liệu cũ sau khi đổi trang nhanh | Request cũ trả về sau request mới | Bỏ qua kết quả khi màn hình đã đổi (biến `alive` trong `useTopSongs`) |
| Lỗi mất tăm, không log | `.then()` không có `.catch()`, hoặc hàm async không được `await` | Luôn `await` hoặc gắn `.catch` |
| Chạy chậm bất thường | `await` tuần tự cho việc độc lập | `Promise.all` |

### Thực hành

1. Chạy và giải thích thứ tự in ra:

```bash
node -e "console.log(1); setTimeout(()=>console.log(5)); (async()=>{ console.log(2); await null; console.log(4) })(); console.log(3)"
```

2. Viết hàm `withTimeout(promise, ms)` dùng `Promise.race` để báo lỗi nếu `promise` chưa xong sau `ms` mili giây.
3. Trong `worker/src/main.ts`, tìm chỗ worker chờ khi hàng đợi trống. Vì sao nó dùng `await sleep(...)` mà không dùng vòng lặp rỗng?

### Tự kiểm

1. Ba trạng thái của một Promise là gì?
2. `supabase-js` báo lỗi bằng cách nào? Vì sao sách cần hàm `must()`?
3. Hai request mất 300 ms và 200 ms, độc lập nhau. Tổng thời gian khi `await` tuần tự và khi dùng `Promise.all`?
4. Duyệt 20 bài cùng lúc, 2 bài lỗi. Dùng `Promise.all` hay `Promise.allSettled`? Vì sao?
5. Trong ví dụ event loop, vì sao `3` in trước `4` dù `setTimeout` được gọi trước?
6. Vì sao worker gọi ffmpeg qua tiến trình riêng chứ không viết bộ mã hóa bằng JavaScript?
