## Truyền phát 2. Qua mạng: tải cả tệp, Range và cắt đoạn

### Chương này làm gì

Theo một bài nhạc từ server tới tai người nghe và trả lời ba câu: vì sao không gửi thẳng cả tệp, HTTP Range giải quyết được gì, và cắt bài thành đoạn ngắn đổi lại cái giá nào.

### Để làm gì

Đây là lý do Hugo Music phát bằng HLS thay vì đặt thẳng link file vào thẻ `<audio>`.

### Cách ngây thơ: tải cả tệp

Bài 4 phút 12 giây (252 giây), MP3 256 kbps:

```text
dung lượng = 256 000 bit/giây × 252 giây ÷ 8 = 8 064 000 byte ≈ 8,06 MB
mạng di động 380 kbps: thời gian tải = 8 064 000 × 8 ÷ 380 000 ≈ 170 giây
```

Ba vấn đề: chờ gần ba phút mới nghe được nốt đầu; bỏ bài sau 10 giây vẫn tốn đủ 8 MB; mạng tụt giữa chừng thì chỉ có vấp, vì tệp chỉ có một chất lượng. Hai vấn đề đầu đến từ việc tệp **quá lớn**, vấn đề thứ ba từ việc tệp **quá cứng**.

> Băng thông tính bằng **bit**, dung lượng bằng **byte**. Quên nhân hay chia 8 là lỗi tính phổ biến nhất trong lĩnh vực này.

### HTTP Range: lấy đúng phần cần

RFC 9110 cho phép client xin một khoảng byte. Server trả mã **206 Partial Content** kèm `Content-Range`:

```http
GET /audio/abc.mp4 HTTP/1.1
Range: bytes=0-1023

HTTP/1.1 206 Partial Content
Content-Range: bytes 0-1023/723654
Content-Type: audio/mp4
```

Đây chính là kết quả thật của `scripts/try-playback.mjs` ở chương 11: Storage của Supabase trả đúng 1 KB đầu của file 64 kbps.

| Range | Nghĩa | Dùng để |
|---|---|---|
| (không có) | Cả tệp | File nhỏ: playlist, ảnh bìa |
| `bytes=1048576-` | Từ byte đó tới hết | Tua |
| `bytes=-65536` | 64 KB cuối | Đọc thông tin nằm cuối tệp |
| `bytes=0-262143` | 256 KB đầu | Tải trước bài kế |

Range giải được chờ lâu và lãng phí, nhưng tua theo byte chỉ đúng với bitrate cố định, và vẫn chỉ có một chất lượng.

### Cắt đoạn: giải pháp cho cả ba vấn đề

Chia bài thành nhiều đoạn vài giây, kèm một danh mục (playlist) liệt kê các đoạn. Có nhiều **mức chất lượng**, mỗi mức một bộ đoạn cùng ranh giới thời gian, nên trình phát đổi mức ở bất kỳ ranh giới nào.

```text
252 giây ÷ 6 giây/đoạn = 42 đoạn
đoạn đầu ở 64 kbps = 64 000 × 6 ÷ 8 = 48 000 byte  → tải trong ~1 giây ở 380 kbps
```

| Độ dài đoạn | Được | Mất |
|---|---|---|
| Ngắn (2 giây) | Bắt đầu nhanh, đổi mức nhanh | Nhiều request, tiêu đề chiếm tỉ lệ lớn |
| Dài (10 giây) | Ít request | Bắt đầu chậm, phản ứng chậm khi mạng tụt |
| **6 giây** (Hugo Music) | Khuyến nghị của Apple cho HLS | |

### Hugo Music cắt đoạn mà không sinh hàng nghìn file

Kiểu cũ: mỗi đoạn một file, 42 đoạn × 6 mức = 252 file mỗi bài. Hugo Music dùng **fMP4 một file mỗi mức**; playlist trỏ vào các khoảng byte trong file đó (`#EXT-X-BYTERANGE`). Mỗi đoạn vẫn là một request riêng, nhưng là một Range request vào cùng một file:

```text
#EXT-X-MAP:URI="…/64.mp4?token=…",BYTERANGE="839@0"     ← phần khởi tạo: 839 byte đầu
#EXTINF:6.013968,
#EXT-X-BYTERANGE:49433@839                                 ← đoạn 1: 49 433 byte từ byte 839
https://…/64.mp4?token=…
```

Được ba thứ: Storage chỉ giữ 6 file `.mp4` và 6 playlist mỗi bài; ký URL theo file, không theo đoạn; và **một file mức là một bản nghe offline hoàn chỉnh**, tải về là phát được.

### Ví dụ tính tay

**1. Tua bằng Range với bitrate cố định.** Tệp 7 516 192 byte, dài 329 giây. Muốn tua tới giây 60:

```text
tỉ lệ vị trí    = 60 ÷ 329 = 0,1824
byte tương ứng  = 0,1824 × 7 516 192 ≈ 1 370 953
→ Range: bytes=1370953-
kiểm lại: bitrate = 7 516 192 × 8 ÷ 329 ≈ 182 764 bit/giây → 22 846 byte/giây × 60 = 1 370 760 ✓
```

Với bitrate thay đổi (VBR), đoạn phức tạp chiếm nhiều byte hơn, nên phép tính này lệch: lý do cần bảng chỉ mục hoặc cắt đoạn.

**2. Tiết kiệm khi người nghe bỏ bài.** Nghe 10 giây rồi chuyển, mạng 380 kbps, mức 64 kbps, đoạn 6 giây:

```text
tải cả tệp 256 kbps: 8,06 MB
cắt đoạn: 2 đoạn × 48 000 byte + playlist ~3 KB ≈ 99 KB   → tiết kiệm khoảng 99 %
```

**3. Đọc một phản hồi 206.** `Content-Range: bytes 0-262143/7516192`:

```text
số byte trả = 262 143 − 0 + 1 = 262 144 (256 KB)
tỉ lệ đã nhận = 262 144 ÷ 7 516 192 ≈ 3,5 %
```

### Kiểm tra

```bash
node --env-file=worker/.env scripts/try-playback.mjs <email> <mật khẩu>
# dòng cuối: GET đoạn âm thanh (Range: bytes=0-1023) → 206 audio/mp4, bytes 0-1023/<tổng>
```

### Tự kiểm

1. Một tệp 12 MB trên đường truyền 1 Mbps mất bao lâu để tải xong? Tính từng bước.
2. `bytes=-65536` khác `bytes=65536-` thế nào?
3. Trong ba vấn đề của cách tải cả tệp, vấn đề nào Range không giải được?
4. Vì sao Hugo Music dùng một file fMP4 mỗi mức thay vì mỗi đoạn một file?
5. Đoạn 2 giây và đoạn 10 giây: mỗi loại được gì, mất gì?

### Khi nào đổi

- Phát trực tiếp (live): cần đoạn ngắn hơn và playlist cập nhật liên tục (LL-HLS), không còn là bài có sẵn.
- CDN tính tiền theo số request: cân nhắc đoạn 10 giây cho mức cao, vẫn giữ 6 giây cho mức thấp nhất để bắt đầu nhanh.
