## Phụ lục A. Nền âm thanh và thuật ngữ

### Nền âm thanh, rút gọn

| Khái niệm | Nghĩa | Con số thường gặp |
|---|---|---|
| Tần số lấy mẫu (sample rate) | Số lần đo sóng âm mỗi giây | 44,1 kHz (CD), 48 kHz (video, AAC thường dùng) |
| Độ sâu bit (bit depth) | Độ chính xác mỗi lần đo | 16 bit (CD), 24 bit (phòng thu) |
| Kênh | Số luồng âm thanh | 2 (stereo) |
| Bitrate | Số bit cho mỗi giây âm thanh | PCM CD: 44 100 × 16 × 2 = 1 411 200 bit/giây |
| Nén mất dữ liệu | Bỏ phần tai người khó nghe (AAC, MP3, Opus) | 128–256 kbps cho nhạc |
| Nén không mất dữ liệu | Nén như file zip, giải ra giống hệt (FLAC, ALAC) | 700–1 000 kbps |
| Loudness (LUFS) | Độ to cảm nhận, theo ITU-R BS.1770 (ITU-R, 2023; EBU, 2023) | −14 LUFS là mục tiêu phổ biến |
| MOS | Điểm chất lượng trung bình 1–5 | ViSQOL cho điểm theo thang này |

Dung lượng một bài:

```text
byte = bitrate (bit/giây) × thời lượng (giây) ÷ 8
128 kbps, 4 phút: 128 000 × 240 ÷ 8 = 3 840 000 byte ≈ 3,84 MB
```

Worker đo loudness của mỗi bài (cột `loudness_lufs`) để trình phát chỉnh âm lượng cho các bài nghe to đều nhau.

### Thuật ngữ Việt – Anh

| Tiếng Việt | Tiếng Anh | Chương |
|---|---|---|
| Phát theo yêu cầu | On-demand streaming | T2 |
| Đoạn | Segment | T2 |
| Danh mục phát | Playlist, manifest | T3 |
| Mức chất lượng | Rendition, tier, variant | T3 |
| Thang bitrate | Bitrate ladder | 10, T5 |
| Thích ứng theo mạng | Adaptive bitrate (ABR) | T5 |
| Ngắt tiếng chờ tải | Rebuffering, stall | T4 |
| Thời gian bắt đầu phát | Startup latency | T4 |
| Mạng phân phối nội dung | CDN | T4 |
| Vòng đi về | Round-trip time (RTT) | T4 |
| Link có chữ ký | Signed URL | T6, 11 |
| Chính sách bảo mật theo dòng | Row Level Security (RLS) | 7 |
| Hàng đợi | Queue (pgmq) | 9 |
| Lịch chạy | Cron (pg_cron) | 9, 13 |
| Phát sóng tin nhắn | Broadcast | 13 |
| Hiện diện | Presence | 13, 15 |
| Đo chất lượng cảm nhận | Perceptual quality, ViSQOL | 10 |
| Nghe mù | Blind listening test | 14 |
| Chất lượng trải nghiệm | Quality of Experience (QoE) | R1 |
