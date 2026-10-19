## Truyền phát 3. HLS và các giao thức khác

### Chương này làm gì

Giải phẫu hai loại playlist của HLS bằng dữ liệu thật của Hugo Music, rồi so HLS với các cách phát khác để thấy vì sao chọn nó.

### Để làm gì

Chương 11 viết Edge Function trả playlist. Đọc được từng dòng playlist thì sửa được khi trình phát không chịu phát.

### Master playlist: danh sách các mức

```text
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=70400,CODECS="mp4a.40.2"
?t=<vé>&kbps=64
#EXT-X-STREAM-INF:BANDWIDTH=140800,CODECS="mp4a.40.2"
?t=<vé>&kbps=128
#EXT-X-STREAM-INF:BANDWIDTH=281600,CODECS="mp4a.40.2"
?t=<vé>&kbps=256
```

| Dòng | Nghĩa |
|---|---|
| `#EXT-X-VERSION:7` | Cần phiên bản đủ mới để dùng fMP4 và byte range |
| `BANDWIDTH` | Băng thông đỉnh tính bằng bit/giây; trình phát dùng để chọn mức. Hugo Music lấy bitrate × 1,1 cho phần tiêu đề |
| `CODECS="mp4a.40.2"` | AAC-LC; khai đúng để trình phát không tải nhầm mức nó không giải được |
| Dòng không có `#` | Địa chỉ playlist của mức đó (tương đối với địa chỉ master) |

Mức nào bị PSL bỏ (chương 10) thì không có trong master: trình phát không thể chọn nó.

### Media playlist: các đoạn của một mức

```text
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-MAP:URI="…/64.mp4?token=…",BYTERANGE="839@0"
#EXTINF:6.013968,
#EXT-X-BYTERANGE:49433@839
https://…/64.mp4?token=…
…
#EXT-X-ENDLIST
```

| Dòng | Nghĩa |
|---|---|
| `TARGETDURATION` | Độ dài đoạn tối đa (làm tròn lên) |
| `PLAYLIST-TYPE:VOD` + `ENDLIST` | Bài có sẵn, danh sách không đổi: trình phát biết tổng thời lượng, cho tua |
| `EXT-X-MAP` | Phần khởi tạo của fMP4 (mô tả codec), tải một lần |
| `EXTINF` + `BYTERANGE` | Mỗi đoạn: thời lượng và vị trí trong file |

Edge Function thay tên file bằng **signed URL** (link có chữ ký, hết hạn sau 2 giờ) ngay khi trả playlist, nên file trong bucket riêng tư vẫn phát được mà không mở công khai.

### Các họ giao thức

| Họ | Cách làm | Hợp với |
|---|---|---|
| Tải dần (progressive) | Một file, phát khi đang tải, tua bằng Range | Bản gốc, preview ngắn |
| **HLS** | Playlist + đoạn qua HTTP thường | Nhạc theo yêu cầu: chạy trên mọi trình duyệt (qua hls.js hoặc gốc trên Safari), iOS, Android |
| MPEG-DASH | Như HLS, manifest XML | Android, web; iOS không hỗ trợ gốc |
| WebRTC | Luồng thời gian thực, độ trễ dưới giây | Gọi thoại, phát trực tiếp tương tác |
| Media over QUIC (MoQ) | Đang được IETF chuẩn hóa, trên QUIC | Tương lai: độ trễ thấp mà vẫn mở rộng như CDN |

### Chọn gì, vì sao

**HLS với fMP4 và AAC.** Đây là định dạng duy nhất chạy gốc trên iOS (bắt buộc với app nghe nhạc trên App Store), chạy trên Android qua ExoPlayer/Media3, trên web qua hls.js. Đi qua HTTP thường nên mọi CDN đều cache được, không cần server phát chuyên dụng. Nghe chung "đúng giây" ở đài 24/7 (chương 13) không cần độ trễ dưới giây của WebRTC: mỗi máy tự tính vị trí theo giờ máy chủ.

### Ví dụ tính tay

**1. BANDWIDTH trong master playlist.** Hugo Music lấy bitrate × 1,1:

```text
64 kbps  → 64 × 1 100 = 70 400 bit/giây
256 kbps → 281 600 bit/giây
```

Mạng đo được 150 000 bit/giây: trình phát chọn mức cao nhất có BANDWIDTH dưới mức đó (thường kèm hệ số an toàn khoảng 0,8): 150 000 × 0,8 = 120 000 → mức 96 kbps (BANDWIDTH 105 600).

**2. Số đoạn và kích thước một đoạn.** Bài 91 giây, đoạn 6 giây, mức 128 kbps:

```text
số đoạn = ⌈91 ÷ 6⌉ = 16 (15 đoạn đủ 6 giây + 1 đoạn 1 giây)
một đoạn ≈ 128 000 × 6 ÷ 8 = 96 000 byte
cả file ≈ 128 000 × 91 ÷ 8 ≈ 1,46 MB   (file thật: 1 493 157 byte, gồm cả phần khởi tạo)
```

### Kiểm tra

Mở playlist một mức trong trình duyệt bằng link vé (chương 11), đếm số dòng `#EXTINF`: bằng thời lượng chia 6, làm tròn lên.

### Tự kiểm

1. Dòng `CODECS="mp4a.40.2"` dùng để làm gì? Khai sai thì có thể xảy ra gì?
2. `#EXT-X-PLAYLIST-TYPE:VOD` và `#EXT-X-ENDLIST` cho trình phát biết điều gì?
3. Vì sao playlist có vé không cache được ở CDN, còn file `.mp4` thì được?
4. Mạng đo được 300 000 bit/giây, hệ số an toàn 0,8. Trình phát chọn mức nào trong thang 64/96/128/160/192/256?
5. Vì sao app nghe nhạc trên iOS gần như phải dùng HLS?

### Khi nào đổi

- Cần chống sao chép mạnh (nhạc thương mại): thêm mã hóa đoạn và DRM (FairPlay, Widevine), Truyền phát 6 so sánh.
- QUIC/MoQ được CDN lớn hỗ trợ rộng: thử cho đài 24/7, nơi độ trễ thấp có giá trị.
