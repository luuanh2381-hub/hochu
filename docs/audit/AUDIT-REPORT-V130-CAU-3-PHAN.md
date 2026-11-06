# V130 — Giai đoạn 1: "Câu 3 phần" cho Hôm nay học

## Làm gì
- Câu **luyện thêm** ("🎯 Luyện thích ứng") giờ gồm **3 phần** trên cùng một màn: ① Pinyin ② Nghĩa ③ Hán Việt (4 đáp án mỗi phần). Bấm **Kiểm tra** một lần. **Đúng từ 2/3 phần trở lên mới tính là câu đúng.** Nút **Không nhớ** nộp luôn (phần chưa chọn tính sai).
- Màn đáp án hiện "✅ Đúng 2/3 phần" (hoặc "❌ Mới đúng 1/3 phần"), kèm ✅/❌ từng phần và đáp án đúng của phần sai.
- Từ không có Hán Việt, hoặc kho từ quá ít để dựng đủ 3 phần → vẫn là câu 1 phần như cũ (không tạo câu giả).
- Bật/tắt: Hôm nay học → Chi tiết → "Câu luyện thêm gồm 3 phần…" (mặc định BẬT, lưu theo thiết bị).

## Không đổi
- **Thẻ FSRS chính thức, lịch ôn, rating Again/Hard/Good/Easy: không đổi.** Câu 3 phần chỉ áp dụng cho câu luyện thêm (luyện bổ sung); không gọi /api/study/review.
- Mỗi phần đã trả lời được gửi lên server như 1 bài luyện bổ sung riêng (server tự chấm lại từng phần). Phần bỏ trống tính sai trong câu nhưng không gửi server.
- Không đổi database, không thêm bảng.

## File
- Mới: `js/review-multi.js`, `test/v130-multi3.test.js`
- Sửa: `js/review.js` (4 chỗ nối), `js/lesson.js` (công tắc), `index.html` (script), `package.json` (script test)

## Đã kiểm tra (chạy thật)
- `node --check` các file JS đã sửa; test mới 10/10 (dựng 3 phần, ngưỡng 2/3, gửi đúng 3 bài luyện bổ sung, không gửi phần bỏ trống, không nộp trùng, không nối vào đường FSRS chính thức).
- Chạy toàn bộ thư mục test: 41 đạt. 3 test không chạy được vì thiếu module `ts-fsrs` (môi trường không có mạng để cài) — cũng không chạy được trên bản V128 gốc. `skills.test.js` có đường dẫn cố định `/tmp/orig/...` của môi trường cũ; khi trỏ đúng đường dẫn thì 50/50 đạt.

## Chưa kiểm tra được
- Giao diện thật trên điện thoại/trình duyệt (bố cục 3 phần × 4 đáp án, cuộn trang) — cần bạn xem thử.
- Test FSRS trước/sau (không cần cho giai đoạn này vì không đổi FSRS; sẽ bắt buộc ở giai đoạn 2).
- Số câu trong màn Tổng kết tính theo từng phần (1 câu 3 phần = 3 lượt ghi), nên con số "tổng số câu" có thể lớn hơn trước.
