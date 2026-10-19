## Truyền phát 1. Tệp nhạc: định dạng, thẻ và cách đặt tên

### Chương này làm gì

Trước khi nói chuyện phát nhạc qua mạng, phải biết chính xác thứ được truyền đi là gì: định dạng chứa và bộ mã hóa khác nhau thế nào, thông tin bài nằm ở đâu trong tệp, và vì sao tên tệp trên kho không lấy từ tên người dùng đặt.

### Để làm gì

Ba quyết định của Hugo Music dựa trên chương này: lưu bản gốc ở định dạng không mất dữ liệu, phát cho người nghe bằng AAC trong hộp MP4, và đặt tên file trong Storage bằng mã ngẫu nhiên.

### Định dạng chứa và bộ mã hóa: hai thứ hay bị gộp

**Định dạng chứa** (container) là cái hộp: sắp xếp dữ liệu, chỗ để thẻ thông tin, bảng chỉ mục để tua. **Bộ mã hóa** (codec) là cách nén chính âm thanh. Đuôi `.m4a` chỉ nói "hộp MP4 chứa âm thanh"; bên trong có thể là AAC (mất dữ liệu) hoặc ALAC (không mất). Muốn biết chắc thì phải mở tệp ra đọc: worker dùng `ffprobe` (chương 10), không tin đuôi tệp hay thông tin client gửi.

| Đuôi | Hộp | Codec thường gặp | Mất dữ liệu | Ghi chú |
|---|---|---|---|---|
| `.mp3` | MP3 | MPEG-1 Layer III | Có | Phát ở mọi nơi; kém ở bitrate thấp |
| `.m4a` / `.mp4` | MP4 (ISO BMFF; ISO/IEC, 2022) | AAC, ALAC | Tùy | AAC là chuẩn của HLS |
| `.flac` | FLAC | FLAC | **Không** | Nhẹ hơn WAV khoảng 40 % |
| `.wav` | RIFF | PCM | **Không** | Không nén, thẻ yếu |
| `.ogg` / `.opus` | Ogg | Vorbis, Opus | Có | Opus tốt nhất ở bitrate thấp, nhưng không thuộc HLS của Apple |

### Quy tắc chọn

| Việc | Chọn | Vì sao |
|---|---|---|
| Lưu bản gốc | FLAC (hoặc tệp người gửi lên, giữ nguyên) | Không mất dữ liệu: luôn mã hóa lại được |
| Phát cho người nghe | AAC-LC trong fMP4 | Chạy trên web, iOS, Android qua HLS |
| Không bao giờ | Mã hóa từ một bản đã nén mất dữ liệu ra một bản khác | Mỗi lần nén mất thêm; không phục hồi được |

Bài mẫu "Sóng Xa" có nguồn chỉ 277 kbps: PSL (chương 10) đo được mọi mức trên 64 kbps không hơn đáng kể, nên chỉ giữ một mức.

### Thẻ thông tin: ba chuẩn không tương thích

| Chuẩn | Dùng cho | Cạm bẫy |
|---|---|---|
| ID3v2 | MP3 | v2.3 mặc định Latin-1, v2.4 dùng UTF-8: ghi lẫn là tên tiếng Việt vỡ thành ký tự lạ |
| Vorbis Comment | FLAC, Ogg, Opus | Luôn UTF-8; tên khóa không thống nhất (`ALBUMARTIST` / `ALBUM ARTIST`) |
| Nguyên tử MP4 | M4A, MP4 | Cấu trúc nhị phân, cần thư viện để sửa |

Hugo Music không dựa vào thẻ trong tệp: tên bài, nghệ sĩ, giấy phép do admin nhập và nằm trong bảng `songs`. Thẻ trong tệp chỉ là gợi ý khi điền form.

### Mã định danh trong ngành nhạc

| Mã | Định danh cho | Ghi chú |
|---|---|---|
| ISRC | Một **bản thu** cụ thể | Mười người hát lại một bài: mười ISRC |
| ISWC | Một **tác phẩm** | Mười bản thu ấy chung một ISWC |
| UPC/EAN | Một sản phẩm phát hành (album, đĩa đơn) | |
| MBID | Bản ghi trong MusicBrainz | Cơ sở dữ liệu mở, tiện tra cứu |

Quyền tác giả gắn với ISWC, quyền người biểu diễn và nhà sản xuất gắn với ISRC. Danh mục mở rộng sang nhạc có hợp đồng thì cần thêm hai cột này.

### Tên tệp trên kho: do máy sinh

Tên tệp trở thành một phần URL. Khoảng trắng thành `%20`, dấu tiếng Việt thành chuỗi phần trăm dài, `#` và `?` cắt đứt URL, Linux phân biệt hoa thường còn macOS thì không. Hai nghệ sĩ cùng đặt tên "Mùa Hè" thì tệp sau ghi đè tệp trước; một tên chứa `../` có thể thoát khỏi thư mục.

Vì vậy Hugo Music **không lấy một ký tự nào từ tên người dùng** cho đường dẫn trong Storage:

```ts
// app/src/api/api.ts (trích, uploadSong)
const id = crypto.randomUUID();
const path = `${id}/original.${ext}`;   // originals/7f3a9c21-.../original.flac
```

Tên hiển thị nằm trong database; tên tệp chỉ cần máy đọc được. Một nguồn sự thật, không có hai bản có thể lệch nhau.

### Ví dụ tính tay

**1. Dung lượng bản gốc và bản phát.** Bài 4 phút (240 giây).

```text
WAV (PCM 44,1 kHz, 16 bit, stereo): 44 100 × 16 × 2 = 1 411 200 bit/giây
  × 240 ÷ 8 = 42 336 000 byte ≈ 42,3 MB
FLAC (nhẹ hơn khoảng 40 %):          ≈ 25 MB
AAC 128 kbps:  128 000 × 240 ÷ 8   = 3 840 000 byte ≈ 3,84 MB
AAC 256 kbps:                        ≈ 7,68 MB
```

Lưu FLAC tốn gấp 6,5 lần bản 128 kbps, nhưng chỉ lưu một lần; người nghe chỉ tải bản AAC.

**2. Chuẩn hóa một tên bài thành tên tệp (nếu phải dùng tên).** "Chiều Sông Hàn (Bản Acoustic).mp3":

```text
bỏ dấu           → "Chieu Song Han (Ban Acoustic)"
ký tự lạ → "-"   → "Chieu-Song-Han--Ban-Acoustic-"
gộp "-", bỏ hai đầu, chữ thường → "chieu-song-han-ban-acoustic.mp3"
```

Hugo Music không cần bước này vì tên tệp là UUID; nhưng đây là cách làm khi cần đường dẫn dễ đọc (ví dụ link chia sẻ `/bai/chieu-song-han`).

### Kiểm tra

```bash
ffprobe -v error -show_entries format=format_name:stream=codec_name,bit_rate -of default=nw=1 demo/00.flac
```

Kết quả cho biết hộp (`flac`), codec (`flac`) và bitrate thật của tệp, không phụ thuộc đuôi tệp.

### Tự kiểm

1. Một tệp `.m4a`: bạn biết chắc điều gì và chưa biết điều gì về nội dung của nó?
2. Vì sao tên bài tiếng Việt hay vỡ thành ký tự lạ trong thẻ ID3, và cách tránh?
3. Một bài được năm ca sĩ hát lại thì có mấy ISWC và mấy ISRC?
4. Tính dung lượng bài 3 phút 30 giây ở AAC 160 kbps.
5. Vì sao Storage dùng tên tệp không mang thông tin gì, còn thư viện nhạc cá nhân thì đặt tên theo nghệ sĩ và bài?

### Khi nào đổi

- Nhận nhạc thương mại: thêm cột ISRC, ISWC và kiểm tra trùng trước khi nhận bài.
- Muốn tiết kiệm băng thông hơn nữa ở mạng rất yếu: thêm mức Opus cho Android và web (Safari đã hỗ trợ Opus trong MP4), giữ AAC cho iOS.
