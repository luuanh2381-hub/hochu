# V175 — "Từ mới trong câu" (màn đáp án Hôm nay học): hiện pinyin, hiện đủ từ, chia 2 cột đều
Sửa: js/review.js (rvExWordsHtml + CSS .rv-words-*), test/v172-sentence-words.test.js, test/v173-answer-dedupe.test.js.
Trước: chỉ hiện pinyin khi dữ liệu có sẵn, ẩn từ đang học, mỗi từ 1 dòng dồn bên trái.
Nay: mỗi từ là 1 ô (chữ Hán + pinyin / nghĩa · ghi chú), hiện TẤT CẢ từ database có cho câu (kèm số lượng), lưới 2 cột đều nhau;
số từ lẻ → ô cuối trải ngang. Thiếu pinyin trong dữ liệu → lấy pinyin của đúng từ đó trong kho từ vựng (WORDS). Pinyin LUÔN hiện (kể cả tắt "Hiện Pinyin"); thiếu thì ghép từ kho từ vựng, thiếu hẳn hiện "—".

## V175 (phần 2) — Web hay lag / "tải lỗi data, phải F5"
Nguyên nhân chính: web ít người dùng nên database (Neon) và server (Vercel) hay "ngủ"; lần bấm đầu tiên sau lúc nghỉ chậm hoặc lỗi,
mà app không chờ/không thử lại, còn tự đánh dấu "đã tải" dù server báo lỗi. Thêm: trang mở nặng vì thư viện Excel (~900KB) chặn việc hiển thị.
- **js/resilience.js (MỚI, nạp đầu tiên):** mọi yêu cầu ĐỌC `GET /api/...` tự thử lại tối đa 2 lần (mạng chập chờn, server 500/502/503/504, quá 15 giây);
  lỗi 400/401/404 KHÔNG thử lại; POST/PUT KHÔNG BAO GIỜ tự gửi lại (khỏi ghi trùng — việc gửi kết quả học vẫn dùng outbox cũ).
  Có `friendlyNetError` (câu lỗi tiếng Việt), `showLoadError` (khung "Thử lại"), `showLoadBanner` (thanh báo nhỏ có nút Thử lại), `ensureXlsx` (tải Excel theo nhu cầu).
- **js/app.js — sửa lỗi gốc:** `ensureVocabLoaded` trước đây vẫn đánh dấu các bài là "đã tải" khi server trả lỗi → thiếu từ vựng mãi tới khi F5. Nay chỉ đánh dấu khi tải thật sự thành công, và hiện thanh "Thử lại".
- **js/lesson.js:** không còn nhớ (cache) phản hồi LỖI của bảng "Hôm nay" trong 10 giây; lỗi hiện nút Thử lại.
- **js/review.js, study-queue.js:** lỗi tải phiên học hiện khung "Thử lại" (trước: alert rồi bị đá về trang Hôm nay); thông báo lỗi tiếng Việt dễ hiểu.
- **js/flashcard.js, quiz.js, type.js, listen.js:** lỗi tải hàng đợi có nút "Thử lại".
- **index.html:** bỏ thẻ tải thư viện Excel trong `<head>` (chặn trang); `js/admin.js`, `conversation.js`, `admin-sentence-words.js` chỉ tải Excel khi bấm nhập/xuất file.
- Test mới: `test/v175-resilience.test.js` (20 test). Các test cũ khác không đổi so với V174.
- Chưa làm (cân nhắc sau): tách mã quản trị khỏi trang học viên; đổi sang địa chỉ "pooler" của Neon (thao tác trên Vercel/Neon, không phải code).
