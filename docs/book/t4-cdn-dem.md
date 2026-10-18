## Truyền phát 4. Độ trễ, CDN và bộ đệm

### Chương này làm gì

Giải thích vì sao file nhạc phải nằm gần người nghe, CDN cache cái gì, cạm bẫy khi cache kết hợp với Range, và vì sao server phát nhạc nên không giữ trạng thái.

### Để làm gì

Thời gian từ lúc bấm phát tới lúc nghe được tiếng phụ thuộc nhiều vào khoảng cách tới server hơn là vào code.

### Độ trễ là vật lý

Ánh sáng trong cáp quang đi khoảng 200 000 km/giây. TP.HCM tới Singapore khoảng 1 100 km theo đường thẳng, nhưng cáp đi vòng và qua nhiều thiết bị; thực tế một vòng đi về (RTT) khoảng 30–40 ms. Tới Mỹ là 180–250 ms.

Bấm phát lần đầu cần nhiều vòng đi về: tra DNS, bắt tay TCP, bắt tay TLS, xin vé, tải master, tải playlist mức, tải phần khởi tạo, tải đoạn đầu. Tám vòng × 200 ms là gần hai giây chỉ để chờ; tám vòng × 35 ms là dưới 0,3 giây. Vì vậy project Supabase của sách đặt ở Singapore, gần người nghe Việt Nam.

### CDN: bản sao gần người nghe

CDN (mạng phân phối nội dung) giữ bản sao file ở nhiều điểm trên thế giới. Request tới điểm gần nhất; điểm đó chưa có thì lấy từ gốc một lần rồi giữ lại cho người sau.

| Thứ | Cache được? | Vì sao |
|---|---|---|
| Ảnh bìa (bucket công khai) | Có, lâu | Không đổi, không cần quyền |
| File `.mp4` các mức | Có, theo URL có chữ ký | Không đổi sau khi tạo |
| Playlist có vé | Không | Mỗi người một vé, chứa link ký riêng |
| API danh sách bài | Ngắn hoặc không | Đổi theo RLS của từng người |

Supabase Storage đi qua CDN sẵn. Playlist nhỏ (vài KB) nên dù không cache, chi phí chính vẫn nằm ở file âm thanh đã được cache.

### Cạm bẫy: cache và Range

Nếu khóa cache chỉ là URL mà không tính tiêu đề `Range`, request đầu tiên xin 1 KB sẽ được cache như thể đó là cả file, và mọi người sau nhận đúng 1 KB đó. CDN đúng chuẩn cache cả file rồi cắt theo Range cho từng request; khi tự dựng proxy hay cache ở tầng ứng dụng, phải tự đảm bảo điều này.

Cạm bẫy thứ hai: URL có chữ ký chứa `token` khác nhau cho mỗi lần ký, nên cùng một file với hai token là hai khóa cache. Hugo Music chấp nhận điều này vì Storage của Supabase xử lý ký và cache cùng nhau; ở CDN tự cấu hình thì bỏ tham số token khỏi khóa cache sau khi đã kiểm chữ ký ở điểm biên.

### Bộ đệm của trình phát

Trình phát giữ sẵn vài chục giây nhạc chưa phát (buffer). Mạng tụt thì phát tiếp từ buffer trong khi chọn mức thấp hơn (Truyền phát 5). Buffer cạn là ngắt tiếng (rebuffer), thứ người nghe ghét nhất.

| Chỉ số | Nghĩa | Hugo Music ghi ở đâu |
|---|---|---|
| Startup time | Từ lúc bấm tới lúc có tiếng | `plays.startup_ms` |
| Rebuffer count | Số lần ngắt | `plays.rebuffer_count` |
| Tier | Mức đang phát | `plays.tier_kbps` |

### Không giữ trạng thái

Edge Function `playback` không nhớ gì giữa hai request: mọi thứ cần biết nằm trong vé (ký HMAC, chương 11) hoặc trong database. Nhờ vậy chạy bao nhiêu bản cũng được, ở bất kỳ vùng nào, khởi động lại không mất gì. Trạng thái thật sự cần nhớ (đài đang phát bài nào, nhóm đang nghe tới giây nào) nằm trong Postgres.

### Kiểm tra

```bash
curl -sI "<link ảnh bìa công khai>" | grep -i -E "cache-control|cf-cache-status|age"
```

Lần thứ hai gọi, `cf-cache-status: HIT` cho biết file được phục vụ từ điểm biên.

### Khi nào đổi

- Người nghe ở nhiều châu lục: thêm bản sao Storage ở vùng khác, hoặc đặt CDN riêng trước Storage với khóa cache đã bỏ token.
- Chi phí băng thông Storage chiếm phần lớn hóa đơn: đưa file âm thanh sang kho có băng thông ra miễn phí (ví dụ Cloudflare R2), giữ Supabase cho database và playlist.
