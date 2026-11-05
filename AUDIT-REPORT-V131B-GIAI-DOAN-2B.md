# V131 — Giai đoạn 2b: thẻ ÔN CHÍNH THỨC dạng "câu 3 phần" (thử nghiệm, mặc định TẮT)

## Làm gì
- Công tắc mới ở **Hôm nay học → Chi tiết**: "🧪 Thử nghiệm: thẻ ÔN NHANH (chính thức) cũng gồm 3 phần…". **Mặc định TẮT** (lưu theo thiết bị). Khi tắt, mọi thẻ chạy y như V131-2a.
- Khi bật: thẻ **🔁 Ôn nhanh** hiện 3 phần (Pinyin · Nghĩa · Hán Việt) trên một màn. **Đúng từ 2/3 mới tính là đúng.** Từ mới (🆕), câu kiểm tra, luyện lại: không áp dụng.
- Bấm **Kiểm tra** → trình duyệt hỏi server (`/api/study/review/preview`, chỉ đọc) bằng `parts`; server tự chấm lại, trả về kết quả + gợi ý rating (đã chặn Easy khi đúng 2/3). Sau đó đi đúng đường cũ: đếm ngược / "Tiếp tục" / "Đổi đánh giá" → ghi FSRS qua `submitFsrsReview` + outbox (idempotencyKey, ghi trước khi gửi).
- **Đúng 2/3: nút Easy bị khoá (🔒)**; server cũng chặn Easy. **≤1/3: tính là sai** (Again như mọi câu sai).
- Màn đáp án hiện "✅ Đúng 2/3 phần" / "❌ Mới đúng 1/3 phần", ✅/❌ từng phần và đáp án đúng của phần sai.

## An toàn dữ liệu
- Payload gửi lượt chính thức kèm **cả** `parts` và `quizType + selectedAnswer` của 1 phần → nếu server chưa có V131, lượt vẫn được chấm như câu 1 phần (không bị từ chối & mất khỏi outbox). Vẫn nên deploy server (V131-2a) trước.
- Mất mạng/lỗi khi xem trước rating: mặc định bảo thủ (đúng → Good, sai → Again), **không bao giờ Easy**.
- Mỗi phần đã trả lời cũng gửi như bài luyện bổ sung (source `extra`) để hồ sơ kỹ năng nhận đúng kết quả từng phần; lượt FSRS chính thức ở chế độ này không ghi kỹ năng (tránh ghi trùng/lệch).
- Nhật ký phiên: mỗi thẻ có đúng 1 dòng `official` (phần Nghĩa, mang kết quả CẢ thẻ) → đếm thẻ / từ cứng đầu đúng; các phần còn lại không-official.
- Không sửa thuật toán FSRS, auto-rating, db.js, reviewService; không đổi database.

## File
- Mới: `test/v131b-multi3-official.test.js`
- Sửa: `js/review-multi.js`, `js/review.js` (7 chỗ nối), `js/study-queue.js` (+`parts` trong payload), `js/lesson.js` (công tắc), `package.json`

## Đã kiểm tra (chạy thật)
- Test mới 15/15: mặc định tắt; chỉ thẻ `review`; hỏi server bằng `parts` đúng thứ tự/thời gian; khoá Easy; server là nguồn sự thật; mất mạng/server cũ → không Easy; "Không nhớ"; không ghi đè khi người học đã chọn rating; không nộp trùng; payload thật của `study-queue.js` có `parts` + tương thích ngược, câu 1 phần y như cũ.
- Cả thư mục test: 44 đạt (test V113/V104/V117… vẫn đạt). Còn 3 test FSRS không chạy được vì thiếu `ts-fsrs` (không có mạng để cài) — bản V128 gốc cũng vậy. `skills.test.js` cần đường dẫn cố định `/tmp/orig/...` của môi trường cũ.

## CHƯA kiểm tra được (quan trọng)
- Giao diện thật trên điện thoại (3 phần × 4 đáp án, nút Easy bị khoá, cuộn trang).
- Đường FSRS thật đầu-cuối (ts-fsrs + Neon + Express). **Bắt buộc chạy `npm test` ở nơi có đủ module trước khi bật công tắc cho việc học thật.**
- Lượng dữ liệu học thật: 1 thẻ 3 phần ghi 3 bài luyện bổ sung + 1 lượt FSRS; số "câu" trong Tổng kết sẽ cao hơn.

## Gợi ý triển khai dần
1. Deploy V131 (server) → chạy `npm test` có đủ module.
2. Bật công tắc thử nghiệm trên 1 thiết bị, học vài thẻ, kiểm tra lịch ôn/Tổng kết.
3. Ổn định rồi mới cân nhắc đổi mặc định (bước 2c).
