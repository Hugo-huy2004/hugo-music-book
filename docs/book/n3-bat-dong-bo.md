## Nền tảng 3. Bất đồng bộ và event loop

### Chương này làm gì

Giải thích vì sao gần như mọi lời gọi trong sách có `await`, chạy nhiều việc cùng lúc bằng `Promise.all`, và thứ tự Node.js thực hiện các việc (event loop).

### Để làm gì

Gọi database, tải file, chạy ffmpeg đều mất thời gian. Nếu chương trình đứng chờ từng việc, worker xử lý một bài mất gấp mấy lần, app đơ khi mạng chậm.

### Đồng bộ và bất đồng bộ

Đồng bộ: làm xong việc này mới sang việc kia. Bất đồng bộ: giao việc rồi làm tiếp, khi việc xong thì quay lại xử lý kết quả.

```ts
// Promise: "lời hứa" sẽ có kết quả sau
const promise = fetch('https://example.com');   // trả ngay, chưa có dữ liệu
const res = await promise;                       // chờ tới khi có (chỉ dùng trong hàm async)
```

### Ba cách viết, một cách nên dùng

| Cách | Ghi chú |
|---|---|
| Callback `fs.readFile(p, (err, data) => ...)` | Lồng nhau nhiều tầng, khó đọc |
| `.then().catch()` | Đỡ hơn, vẫn dài |
| **`async`/`await` + `try/catch`** | Đọc như code tuần tự; sách dùng cách này |

```ts
async function loadSong(id: string) {
  try {
    const { data, error } = await supabase.from('songs').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('không tải được bài', e);
    return null;
  }
}
```

### Chạy song song khi các việc không phụ thuộc nhau

```ts
// Tuần tự: tổng thời gian = cộng dồn
const songs = await api.getSongs();
const stations = await api.getStations();

// Song song: tổng thời gian = việc lâu nhất
const [songs2, stations2] = await Promise.all([api.getSongs(), api.getStations()]);
```

`Promise.allSettled` dùng khi một việc hỏng không được kéo theo cả nhóm, ví dụ duyệt hàng loạt bài ở trang quản trị (chương 18): bài nào hỏng thì báo bài đó.

### Event loop chạy theo thứ tự nào

Node.js chạy JavaScript trên **một luồng**. Việc chờ (mạng, ổ đĩa, hẹn giờ) được giao cho hệ điều hành; khi xong, hàm xử lý được xếp hàng chờ luồng rảnh.

```ts
console.log('1');
setTimeout(() => console.log('4: hẹn giờ'), 0);
Promise.resolve().then(() => console.log('3: microtask'));
console.log('2');
// In: 1, 2, 3, 4
```

Hai hàng đợi cần nhớ: **microtask** (Promise) chạy ngay khi đoạn code hiện tại xong; **macrotask** (hẹn giờ, I/O) chạy ở vòng kế tiếp.

### Hệ quả thực tế

- Một vòng lặp tính toán nặng chặn mọi request khác. Việc nặng như mã hóa âm thanh giao cho tiến trình riêng: worker gọi ffmpeg và Python (ViSQOL) qua `child_process`, không tính trong luồng JavaScript.
- `await` trong vòng lặp `for` chạy tuần tự. Muốn song song nhưng có giới hạn (ví dụ tối đa 2 bài một lúc), xử lý theo lô bằng `Promise.all` trên từng nhóm nhỏ.

### Kiểm tra

```bash
node -e "console.log(1); setTimeout(()=>console.log(4)); Promise.resolve().then(()=>console.log(3)); console.log(2)"
```

### Khi nào đổi

- Cần giới hạn số việc chạy cùng lúc ở nhiều chỗ: dùng một hàm hàng đợi nhỏ (vài chục dòng) hoặc thư viện `p-limit`.
- Tính toán nặng bằng JavaScript thuần (không phải gọi chương trình ngoài): chuyển sang `worker_threads`.
