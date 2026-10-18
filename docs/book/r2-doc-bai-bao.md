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

Sau mỗi bài, ghi một dòng vào bảng: bài toán, phương pháp, dữ liệu, kết quả, giới hạn, liên quan tới đề tài thế nào.

### Bài nền của lĩnh vực

| Chủ đề | Tài liệu |
|---|---|
| HLS | R. Pantos, W. May, *HTTP Live Streaming*, RFC 8216 (2017); Apple, *HLS Authoring Specification for Apple Devices* |
| HTTP, Range | R. Fielding và cộng sự, *HTTP Semantics*, RFC 9110 (2022) |
| QUIC | J. Iyengar, M. Thomson, RFC 9000 (2021) |
| ABR theo thông lượng | J. Jiang, V. Sekar, H. Zhang, *Improving Fairness, Efficiency, and Stability in HTTP-based Adaptive Video Streaming with FESTIVE*, CoNEXT 2012 |
| ABR theo bộ đệm | T.-Y. Huang và cộng sự, *A Buffer-Based Approach to Rate Adaptation*, SIGCOMM 2014; K. Spiteri, R. Urgaonkar, R. Sitaraman, *BOLA: Near-Optimal Bitrate Adaptation for Online Videos*, INFOCOM 2016 |
| ABR dự báo | X. Yin và cộng sự, *A Control-Theoretic Approach for Dynamic Adaptive Video Streaming over HTTP*, SIGCOMM 2015 |
| ABR học máy | H. Mao, R. Netravali, M. Alizadeh, *Neural Adaptive Video Streaming with Pensieve*, SIGCOMM 2017 |
| Đo chất lượng âm thanh | A. Hines và cộng sự, *ViSQOLAudio: An objective audio quality metric for low bitrate codecs*, JASA 2015; M. Chinen và cộng sự, *ViSQOL v3*, QoMEX 2020 |
| Thang bitrate theo nội dung | Netflix Technology Blog, *Per-Title Encode Optimization* (2015) |
| Đo loudness | ITU-R BS.1770; EBU R 128 |

Netflix tối ưu thang theo từng phim cho video; PSL làm điều tương tự cho nhạc với thước đo cảm nhận âm thanh. Đây là chỗ đề tài đứng.

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

### Khi nào đổi

- Tìm tài liệu mới: Google Scholar theo trích dẫn ngược (ai trích dẫn BOLA, Pensieve), và kỷ yếu ACM MMSys, SIGCOMM, NOSSDAV.
- Bài báo mới thay đổi kết luận (ví dụ thước đo chất lượng âm thanh tốt hơn ViSQOL): cập nhật bảng và chạy lại thí nghiệm 2.
