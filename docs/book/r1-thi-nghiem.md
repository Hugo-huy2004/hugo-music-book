## Nghiên cứu 1. Câu hỏi nghiên cứu và thiết kế thí nghiệm

### Chương này làm gì

Biến Hugo Music từ một app chạy được thành một đề tài có kết quả đo được: đặt câu hỏi nghiên cứu, dựng thí nghiệm có đối chứng, chọn chỉ số, và liệt kê những gì có thể làm kết quả sai.

### Để làm gì

"App chạy tốt" không phải kết luận khoa học. "Với thang PSL, dung lượng giảm X % mà tỉ lệ người nghe phân biệt được không đổi, đo trên N bài và M lượt blind test" thì là.

### Ba câu hỏi nghiên cứu

| | Câu hỏi | Đo bằng |
|---|---|---|
| RQ1 | Thang PSL tiết kiệm bao nhiêu dung lượng và băng thông so với thang cố định 64/96/128/160/192/256/320? | Tổng byte trong bucket `audio`, byte tải trong mô phỏng mạng |
| RQ2 | Người nghe có phân biệt được các mức PSL đã bỏ không? | Blind test (chương 14), view `blind_results` |
| RQ3 | Chi phí của kiểm soát truy cập (vé + signed URL) với thời gian bắt đầu phát là bao nhiêu? | Thời gian từ bấm tới có tiếng, có và không có bước xin vé |

Mỗi câu một giả thuyết có thể bác bỏ. Ví dụ RQ2: *"Ở các cặp mức mà PSL bỏ, tỉ lệ đoán đúng không khác 50 % có ý nghĩa thống kê."*

### Hạ tầng đo

| Thành phần | Dùng |
|---|---|
| Danh mục | Bài mẫu CC0 sinh bằng `make_demo_music.py`, cộng bài thật có giấy phép mở để đa dạng thể loại |
| Mô phỏng mạng | Playwright + giả lập mạng của Chromium (hoặc `tc netem` trên Linux) |
| Ghi số liệu | Bảng `plays` (startup, rebuffer, mức), `pipeline_runs`, `blind_votes` |
| Phân tích | Truy vấn SQL xuất CSV, tính thống kê bằng Python |

### Bốn hồ sơ mạng

| Hồ sơ | Băng thông | RTT | Đặc điểm |
|---|---|---|---|
| Wi-Fi tốt | 20 Mbps | 20 ms | Ổn định |
| 4G | 5 Mbps | 50 ms | Dao động vừa |
| 3G yếu | 400 kbps | 200 ms | Dao động mạnh |
| Vào hầm | 400 kbps rồi 0 trong 15 giây | 200 ms | Mất mạng giữa bài |

### Chỉ số

| Chỉ số | Hướng tốt |
|---|---|
| Thời gian bắt đầu phát | Thấp |
| Số lần và tổng thời gian ngắt tiếng | Thấp |
| Bitrate trung bình | Cao, nhưng chỉ có giá trị khi tai người nghe ra |
| Số lần đổi mức | Thấp |
| Dung lượng lưu trữ và byte tải | Thấp |

Gộp thành một điểm QoE theo kiểu của các bài báo ABR: chất lượng trừ phạt ngắt tiếng trừ phạt đổi mức, với trọng số ghi rõ. Báo cáo cả từng chỉ số riêng, không chỉ điểm gộp.

### Ba thí nghiệm

**Thí nghiệm 1 (RQ1).** Mỗi bài mã hóa hai lần: thang cố định và thang PSL. Chạy cùng kịch bản trên bốn hồ sơ mạng, mỗi tổ hợp lặp ít nhất 10 lần. So dung lượng, byte tải và các chỉ số QoE.

**Thí nghiệm 2 (RQ2).** Blind test với lượt kiểm tra (A và B giống hệt, chương 14) để loại người chọn bừa. Với mỗi cặp mức, kiểm định nhị thức tỉ lệ đoán đúng so với 50 %. Số người nghe đủ lớn để phát hiện chênh lệch 10 điểm phần trăm (khoảng 200 phiếu mỗi cặp).

**Thí nghiệm 3 (RQ3).** Đo thời gian bắt đầu phát 100 lần mỗi hồ sơ mạng, có bước xin vé và không có (link công khai làm đối chứng). Đo thêm thời gian xử lý của `claim_playback()` trong database.

### Những gì có thể làm kết quả sai

| Rủi ro | Cách giảm |
|---|---|
| Bài mẫu tổng hợp đơn giản hơn nhạc thật | Thêm bài thật đủ thể loại; báo cáo riêng hai nhóm |
| ViSQOL không phải tai người | Đối chiếu bằng blind test (RQ2) |
| Người làm blind test là bạn bè, thiết bị nghe khác nhau | Ghi loại tai nghe; lượt kiểm tra lọc người chọn bừa |
| Mô phỏng mạng khác mạng thật | Bổ sung số liệu `plays` từ người dùng thật |
| Một server, một vùng | Ghi rõ phạm vi; không suy rộng cho người nghe ở châu lục khác |

### Kiểm tra

```sql
select low_kbps, high_kbps, votes, hit_rate, same_rate from public.blind_results order by low_kbps, high_kbps;
select tier_kbps, count(*), avg(startup_ms), sum(rebuffer_count) from public.plays group by 1 order by 1;
```

### Khi nào đổi

- Kết quả RQ2 cho thấy người nghe phân biệt được ở một thể loại: chỉnh τ riêng cho thể loại đó và chạy lại thí nghiệm 1.
- Có người dùng thật: thay mô phỏng bằng thử nghiệm A/B (một nửa người dùng nghe thang PSL, nửa kia thang cố định).
