## Truyền phát 6. Kiểm soát truy cập nội dung

### Chương này làm gì

Tách bài toán "ai được nghe bài nào" thành hai tầng: mô hình quyền (quyết định) và cơ chế thi hành ở nơi phát file (chặn). So các lựa chọn ở mỗi tầng và giải thích thiết kế của Hugo Music.

### Để làm gì

Chương 7 (RLS) và chương 11 (vé nghe) là hai nửa của cùng một thiết kế. Chương này cho thấy vì sao cần cả hai.

### Hai tầng, phân tích riêng

| Tầng | Câu hỏi | Ở Hugo Music |
|---|---|---|
| Mô hình quyền (PDP: nơi quyết định) | Người này có được nghe bài này lúc này không? | Hàm SQL `claim_playback()` + RLS |
| Thi hành (PEP: nơi chặn) | Làm sao chặn ở chỗ phát file, với hàng chục request mỗi bài? | Vé HMAC + signed URL của Storage |

Điểm đặc biệt: nơi quyết định (database) và nơi chặn (Storage/CDN) là hai hệ thống khác nhau. Không thể hỏi database cho từng đoạn 6 giây; quyết định phải được "đóng gói" thành thứ mà nơi chặn tự kiểm được.

### Tầng 1: mô hình quyền

| Mô hình | Quyền gắn với | Ví dụ | Hợp khi |
|---|---|---|---|
| ACL | Danh sách người cho từng tài nguyên | "Bài X: An, Bình" | Ít tài nguyên, chia sẻ thủ công |
| RBAC | Vai trò | "Admin được duyệt bài" | Quyền theo chức vụ |
| **ABAC** | Thuộc tính của người, tài nguyên, ngữ cảnh | "Bài đã phát hành, và người dùng là thành viên hoặc khách còn lượt hôm nay" | Luật có điều kiện |
| ReBAC | Quan hệ | "Thành viên nhóm nghe chung được nhận lệnh phát" | Mạng xã hội, chia sẻ theo nhóm |

Hugo Music dùng **ABAC cho phát nhạc**, **RBAC cho trang quản trị** (`app_metadata.role`), và **ReBAC cho nhóm nghe chung** (`is_group_member()` trong chính sách Realtime). Cả ba viết bằng SQL, nằm cùng một chỗ, test bằng pgTAP.

### Tầng 2: cơ chế thi hành

| Cơ chế | Cách làm | Được | Mất |
|---|---|---|---|
| Proxy mọi byte qua server | Server kiểm quyền rồi chuyển file | Kiểm từng request | Server gánh toàn bộ băng thông |
| Kiểm phiên ở điểm biên cho từng đoạn | CDN gọi về hỏi quyền | Thu hồi tức thì | Mỗi đoạn thêm một lần hỏi |
| **Signed URL** | Link chứa chữ ký và hạn dùng | CDN tự kiểm, không hỏi về | Link bị chia sẻ dùng được tới khi hết hạn |
| Signed cookie | Cookie có chữ ký cho cả thư mục | Một lần cho mọi đoạn | Khó dùng trên app native |
| Mã hóa HLS AES-128 | Đoạn mã hóa, khóa phát qua endpoint có kiểm quyền | File lộ ra cũng vô dụng | Khóa vẫn lấy được bằng client hợp lệ |
| DRM (FairPlay, Widevine) | Giải mã trong phần cứng an toàn | Chống sao chép mạnh nhất | Phức tạp, tốn phí, ràng buộc nền tảng |

### Thiết kế của Hugo Music

```text
1. App: POST /functions/v1/playback {song_id}   (kèm phiên đăng nhập)
2. Function gọi claim_playback() bằng phiên đó  → quyết định (ABAC, đếm lượt khách)
3. Đồng ý → trả vé: chữ ký HMAC(song_id, hạn 2 giờ)
4. Trình phát: GET ?t=<vé>                       → master playlist (không cần header đăng nhập)
5.           GET ?t=<vé>&kbps=128               → playlist có signed URL tới file trong bucket riêng tư
6.           GET <signed URL> (Range)            → Storage/CDN tự kiểm chữ ký
```

Vì sao tách vé (bước 3) khỏi signed URL (bước 5): trình phát gốc (`<audio>`, AVPlayer) không gửi được header đăng nhập, nên quyền phải nằm trong URL; vé chỉ mở đúng một bài, và mỗi lần trả playlist lại ký link mới.

| Đã hy sinh | Vì sao chấp nhận |
|---|---|
| Thu hồi không tức thì (vé sống tới 2 giờ) | Nhạc có giấy phép mở: lộ link không gây thiệt hại pháp lý |
| Không chống tải file | Cùng lý do; tải về nghe offline còn là tính năng |
| Không DRM | Chi phí và độ phức tạp không tương xứng với nhạc mở |

### Kiểm tra

```bash
# vé giả: Function từ chối
curl -s "https://<ref>.supabase.co/functions/v1/playback?t=gia" | head -c 120
# đọc thẳng file trong bucket riêng tư không có chữ ký: bị chặn
curl -s -o /dev/null -w "%{http_code}\n" "https://<ref>.supabase.co/storage/v1/object/audio/<id>/64.mp4"
```

### Khi nào đổi

- Nhạc thương mại: rút hạn vé xuống vài phút, thêm mã hóa AES-128 với endpoint cấp khóa, cân nhắc DRM theo yêu cầu hợp đồng.
- Cần gỡ bài tức thì (takedown): danh sách thu hồi kiểm ở bước 5 (Function đã kiểm vé mỗi lần trả playlist), và giảm hạn signed URL.
