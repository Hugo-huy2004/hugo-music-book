## Nghiên cứu 2. Đọc tài liệu và số liệu cần nhớ

### Chương này làm gì

Cách đọc một bài báo khoa học trong thời gian ngắn, danh sách bài nền của lĩnh vực, và các con số nên thuộc khi trình bày đề tài.

### Để làm gì

Phần tổng quan tài liệu của luận văn phải chỉ ra đề tài đứng ở đâu so với các nghiên cứu trước. Đọc đúng cách thì một bài mất 30 phút thay vì một buổi.

### Đọc một bài báo trong ba lượt

| Lượt | Đọc gì | Trả lời được |
|---|---|---|
| 1 (5 phút) | Tiêu đề, tóm tắt, hình, kết luận | Bài giải bài toán gì, kết quả chính là gì, có liên quan không |
| 2 (20 phút) | Phương pháp, thiết lập thí nghiệm, bảng kết quả | So với cái gì, đo trên dữ liệu nào, giả định gì |
| 3 (khi cần) | Chứng minh, phụ lục | Có thể làm lại được không, chỗ nào yếu |

Sau mỗi bài, ghi ngay mục tham khảo kiểu Harvard (tác giả, năm, tiêu đề, nơi đăng, trang, DOI) để không phải tìm lại lúc viết luận văn, rồi ghi một dòng vào bảng: bài toán, phương pháp, dữ liệu, kết quả, giới hạn, liên quan tới đề tài thế nào.

### Bài nền của lĩnh vực

| Chủ đề | Tài liệu |
|---|---|
| HLS | Pantos and May (2017); Apple Inc. (n.d.) |
| HTTP, Range | Fielding, Nottingham and Reschke (2022) |
| QUIC | Iyengar and Thomson (2021) |
| ABR theo thông lượng | Jiang, Sekar and Zhang (2012) |
| ABR theo bộ đệm | Huang et al. (2014); Spiteri, Urgaonkar and Sitaraman (2016) |
| ABR dự báo | Yin et al. (2015) |
| ABR học máy | Mao, Netravali and Alizadeh (2017) |
| Đo chất lượng âm thanh | Hines et al. (2015); Chinen et al. (2020) |
| Thang bitrate theo nội dung | Aaron et al. (2015) |
| Đo loudness | ITU-R (2023); EBU (2023) |
| Kiểm soát truy cập theo thuộc tính | Hu et al. (2014) |
| Đồng bộ đồng hồ | Cristian (1989) |

Thông tin đầy đủ của từng tài liệu nằm ở mục Tài liệu tham khảo cuối sách, theo chuẩn Harvard.

Netflix tối ưu thang theo từng phim cho video (Aaron et al., 2015); PSL làm điều tương tự cho nhạc với thước đo cảm nhận âm thanh. Đây là chỗ đề tài đứng.

### Số liệu nên thuộc

| Con số | Ý nghĩa |
|---|---|
| 8 bit = 1 byte | Băng thông tính bit, dung lượng tính byte |
| 128 kbps ≈ 0,96 MB/phút | Ước lượng nhanh dung lượng |
| 6 giây | Độ dài đoạn khuyến nghị cho HLS |
| 44,1 kHz / 16 bit / 2 kênh = 1 411 kbps | Bitrate PCM chất lượng CD |
| MOS 1–5 | Thang điểm ViSQOL; 4,7 gần như không phân biệt với gốc |
| τ = 0,10 | Ngưỡng PSL của sách |
| 64/96/128/160/192/256 | Thang PSL giữ được ở phần lớn bài mẫu |
| ~35 ms | RTT TP.HCM – Singapore |
| −14 LUFS | Mức loudness mục tiêu phổ biến của các dịch vụ nghe nhạc |

### Kiểm tra

Chọn một bài trong bảng, đọc hai lượt đầu, ghi đủ sáu cột của bảng ghi chú. Nếu không ghi được cột "giới hạn", đọc lại phần thiết lập thí nghiệm.

### Tự kiểm

1. Ba lượt đọc một bài báo khác nhau ở mục tiêu nào?
2. BOLA và MPC thuộc hai trường phái nào, khác nhau ở dữ liệu đầu vào ra sao?
3. Netflix Per-Title và PSL giống và khác nhau ở đâu?
4. 128 kbps trong 1 phút là khoảng bao nhiêu MB? Tính nhẩm.
5. Vì sao RFC 7233 không còn là tài liệu chính cho HTTP Range?
6. Viết mục tài liệu tham khảo kiểu Harvard cho một bài báo hội nghị có bốn tác giả. Trong bài trích dẫn nó thế nào?

### Khi nào đổi

- Tìm tài liệu mới: Google Scholar theo trích dẫn ngược (ai trích dẫn BOLA, Pensieve), và kỷ yếu ACM MMSys, SIGCOMM, NOSSDAV.
- Bài báo mới thay đổi kết luận (ví dụ thước đo chất lượng âm thanh tốt hơn ViSQOL): cập nhật bảng và chạy lại thí nghiệm 2.
