## Truyền phát 5. Thuật toán chọn chất lượng theo mạng

### Chương này làm gì

Trình bày bốn trường phái thuật toán ABR (adaptive bitrate), cái nào hợp với nhạc, và điểm mù chung của cả bốn mà PSL của Hugo Music lấp vào.

### Để làm gì

HLS cho trình phát nhiều mức; còn chọn mức nào, lúc nào thì là việc của thuật toán ABR trong trình phát (hls.js, AVPlayer, ExoPlayer). Hiểu chúng để biết khi nào nên để mặc định và khi nào phải can thiệp.

### Vòng lặp quyết định

Trước mỗi đoạn, trình phát quyết định tải đoạn kế ở mức nào, dựa trên những gì nó đo được: tốc độ tải các đoạn trước và lượng nhạc còn trong buffer. Mục tiêu đánh đổi nhau: chất lượng cao, ít ngắt tiếng, ít đổi mức qua lại.

### Bốn trường phái

| Trường phái | Quyết định dựa trên | Đại diện | Điểm mạnh | Điểm yếu |
|---|---|---|---|---|
| Thông lượng | Tốc độ tải ước lượng (trung bình trượt) | FESTIVE (Jiang, Sekar and Zhang, 2012), mặc định của nhiều trình phát | Đơn giản, phản ứng nhanh | Ước lượng sai khi mạng dao động mạnh |
| Bộ đệm | Lượng nhạc trong buffer | BBA (Huang et al., 2014), BOLA (Spiteri, Urgaonkar and Sitaraman, 2016) | Ít ngắt tiếng, có chứng minh toán học (BOLA) | Lúc mới bắt đầu buffer rỗng nên chọn thấp lâu |
| Dự báo | Tối ưu vài đoạn tới theo dự báo thông lượng | MPC (Yin et al., 2015) | Cân bằng tốt khi dự báo đúng | Tính nặng hơn, phụ thuộc dự báo |
| Học tăng cường | Mạng nơ-ron học từ dữ liệu mạng thật | Pensieve (Mao, Netravali and Alizadeh, 2017) | Tốt nhất trên tập dữ liệu nó học | Khó giải thích, khó chuyển sang môi trường khác |

Hầu hết trình phát hiện đại dùng lai: thông lượng lúc đầu, bộ đệm khi đã có buffer. hls.js là kiểu này.

### Nhạc khác video thế nào

| Điểm | Video | Nhạc |
|---|---|---|
| Bitrate | Vài Mbps | 64–256 kbps: mạng 3G yếu cũng đủ mức giữa |
| Người dùng nhận ra chất lượng | Rõ (mờ, vỡ hình) | Khó: nhiều người không phân biệt 192 với 256 |
| Ngắt tiếng | Khó chịu | Rất khó chịu: nhạc mất nhịp |
| Hành vi | Xem liền | Nghe trên đường, vào hầm, ra khỏi Wi-Fi |

Hệ quả: với nhạc, **tránh ngắt tiếng quan trọng hơn leo mức cao**, và mức cao chỉ đáng giá nếu tai người nghe ra.

### Điểm mù chung của cả bốn

Cả bốn trường phái coi thang mức là **cho sẵn**: chọn tốt nhất trong các mức đang có. Không thuật toán nào hỏi các mức đó có đáng tồn tại không. Nếu 256 và 320 kbps nghe như nhau, thuật toán vẫn cố leo lên 320, tốn băng thông mà người nghe không được gì.

Đó là chỗ của **PSL** (Perceptual Stepped Ladder, chương 10): đo từng bài bằng ViSQOL (Hines et al., 2015; Chinen et al., 2020), chỉ giữ mức hơn mức đã giữ ít nhất τ = 0,10 điểm. Thuật toán ABR nào cũng hưởng lợi, vì nó chỉ còn chọn giữa những mức khác nhau thật. Số đo thật trên 10 bài mẫu: mức 320 bị bỏ ở mọi bài; "Sóng Xa" chỉ còn một mức.

### Chọn gì, vì sao

**Để ABR mặc định của từng nền tảng (hls.js, AVPlayer, ExoPlayer) làm việc, và cải thiện từ phía server bằng thang mức tốt hơn (PSL).** Viết ABR riêng cho ba nền tảng tốn công mà lợi ít; còn thang mức tốt thì mọi trình phát đều dùng được.

### Ví dụ tính tay

**1. ABR theo thông lượng.** Ba đoạn gần nhất tải ở 420, 380, 150 kbps (vừa vào hầm). Trung bình trượt × hệ số an toàn 0,8:

```text
trung bình = (420 + 380 + 150) ÷ 3 ≈ 317 kbps
× 0,8 ≈ 253 kbps → chọn mức cao nhất ≤ 253: 192 kbps
```

Thông lượng thật lúc này chỉ 150 kbps: tải đoạn 6 giây ở 192 kbps mất 192 × 6 ÷ 150 ≈ 7,7 giây, lâu hơn thời lượng đoạn. Trung bình trượt phản ứng chậm.

**2. ABR theo bộ đệm (dạng đơn giản kiểu BBA).** Buffer dưới 10 giây chọn mức thấp nhất, trên 30 giây chọn mức cao nhất, ở giữa chia đều:

```text
thang 64/96/128/160/192/256 (6 mức), buffer 18 giây
vị trí = (18 − 10) ÷ (30 − 10) = 0,4 → mức thứ ⌊0,4 × 5⌋ + 1 = 3 → 128 kbps
```

**3. Lợi ích của PSL cho ABR.** Bài có 256 và 320 nghe như nhau. Mạng tốt, ABR luôn chọn mức cao nhất, bài 4 phút:

```text
thang cố định (có 320): 320 000 × 240 ÷ 8 = 9,6 MB
thang PSL (cao nhất 256):                   7,68 MB → tiết kiệm 20 % mà tai người không nhận ra
```

### Kiểm tra

Mở app trên trình duyệt, DevTools → Network → giả lập "Slow 3G": request chuyển từ `kbps=256` xuống mức thấp; tắt giả lập thì leo lại. Bảng `plays` ghi `tier_kbps` của từng lượt nghe.

### Tự kiểm

1. Bốn trường phái ABR khác nhau ở dữ liệu đầu vào nào?
2. Vì sao ABR theo bộ đệm chọn mức thấp lâu lúc mới bắt đầu?
3. Với nhạc, vì sao tránh ngắt tiếng quan trọng hơn leo mức cao?
4. "Điểm mù chung" của cả bốn trường phái là gì, và PSL lấp nó thế nào?
5. Ba đoạn gần nhất tải ở 600, 500, 400 kbps, hệ số 0,8. ABR theo thông lượng chọn mức nào trong thang PSL của sách?

### Khi nào đổi

- Dữ liệu `plays` cho thấy rebuffer nhiều ở một nhóm mạng: chỉnh tham số ABR của hls.js (ví dụ ước lượng băng thông thận trọng hơn) cho nhóm đó.
- Có đủ dữ liệu thật và đội ngũ: thử ABR học máy, nhưng đo bằng thí nghiệm có đối chứng (Nghiên cứu 1).
