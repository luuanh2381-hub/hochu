# V131 — Giai đoạn 2c: tinh chỉnh "câu 3 phần" thẻ chính thức (vẫn mặc định TẮT)

## Tinh chỉnh
1. **Thời gian đọc phản hồi ×2** cho câu 3 phần (thanh đánh giá tự chuyển sau 2× thời gian thường): màn đáp án có thêm ✅/❌ từng phần và đáp án phần sai, cần đọc lâu hơn câu 1 phần. Câu thường / điền từ giữ nguyên.
2. **Thanh đánh giá gọn** nói rõ "đúng 2/3 phần nên tối đa Good" khi Easy bị khoá (trước đó chỉ thấy ở bản 4 nút).
3. **Nhật ký phiên khớp server:** sau khi server chấm lại, dòng `official` của thẻ lấy kết quả CẢ thẻ theo server, các dòng từng phần lấy kết quả từng phần theo server (trước đó là kết quả tạm của trình duyệt). Vẫn đúng 1 dòng official / thẻ.

## KHÔNG đổi (cố ý)
- Công tắc thẻ chính thức dạng 3 phần **vẫn mặc định TẮT**. Chưa đổi mặc định vì: (a) chưa chạy `npm test` ở nơi có `ts-fsrs`; (b) chưa có phản hồi học thử thật; (c) mặc định ảnh hưởng mọi người học, không chỉ một thiết bị.
- Cách quy đổi thời gian (tổng ÷ 3 phần) giữ nguyên: chưa có dữ liệu thật để chỉnh. Nên xem lại sau vài buổi (so tỉ lệ Easy/Good của thẻ 3 phần với thẻ 1 phần); nếu thẻ 3 phần ra Easy nhiều bất thường thì đổi hệ số chia ở `lib/multi-grade.js` (`perPartMs`).
- Không đổi thuật toán FSRS, auto-rating, db.js, database.

## File
- Sửa: `js/review.js` (2 chỗ), `js/review-multi.js`, `test/v131b-multi3-official.test.js`

## Đã kiểm tra (chạy thật)
- Test V131b: 18/18 (thêm 3 test 2c: nhật ký khớp server, thời gian đọc ×2, dòng giải thích khoá Easy). Cả thư mục test: 44 đạt; 3 test FSRS không chạy được vì thiếu `ts-fsrs` (bản V128 gốc cũng vậy).

## CHƯA kiểm tra được
- Giao diện thật trên điện thoại; đường FSRS đầu-cuối (ts-fsrs + Neon + Express) — cần `npm test` ở nơi có đủ module trước khi bật công tắc để học thật.

## Bước tiếp (2d — chỉ khi bạn xác nhận)
Đổi mặc định sang BẬT (1 dòng) sau khi: đã deploy V131, `npm test` đạt, và học thử vài buổi thấy ổn.
