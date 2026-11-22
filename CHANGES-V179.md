# V179 — Audit "tiếp tục phiên học bị bỏ dở": sửa 3 lỗi
Đường GHI kết quả lên Neon KHÔNG đổi (submitFsrsReview / outbox / POST /api/study/review giữ nguyên). Chỉ thêm ghi localStorage và 1 lệnh ĐỌC.
1. **Cờ practiceOnly (lỗi chắc chắn, đã tái hiện):** sau buổi luyện tập độc lập (Chỉ luyện từ hay sai, luyện lại câu sai…) rồi "Học tiếp", phiên THẬT được nạp vào hàng đợi còn cờ practiceOnly=true →
   không lưu tiến trình sau mỗi câu (tải lại là thẻ đã sai bị hỏi & chấm FSRS lần 2) và không dọn bản lưu khi xong (hộp "phiên dở dang" hiện lại).
   Sửa: khôi phục luôn dựng hàng đợi MỚI (sqCreate) rồi mới gán dữ liệu (kèm doneHz); "Học mới" sau luyện tập độc lập đóng sổ đúng phiên THẬT từ bản lưu.
2. **Thẻ đã chấm nhưng chưa "sang câu kế" lúc thoát:** bản lưu còn thẻ đó ở đầu hàng → mở lại bị hỏi và chấm lần 2 (server chỉ chặn gửi trùng cùng idempotencyKey).
   Sửa: `rvMarkGraded` ghi dấu `graded` vào bản lưu (localStorage) NGAY sau khi gửi kết quả (payload đã nằm trong outbox) và cập nhật khi server xác nhận đúng/sai; `rvAdvanceQueue` xoá dấu khi sang câu kế;
   `rvApplyGradedMarker` khi khôi phục bỏ thẻ đó (+1 tiến độ; đúng → vào sessionKnownHz và bị loại khỏi hàng đợi các tab khác). Chỉ áp dụng khi hz + dạng + sessionId khớp thẻ đầu hàng và là thẻ chính thức.
3. **Bản lưu chỉ trên máy:** khi khôi phục hỏi server `GET /api/study/session/reviewed-since` (lib/db.js `getCardsReviewedSince`: SELECT hz FROM fsrs_cards WHERE user_id, hz = ANY(..), last_review > mốc; chỉ đọc, dùng chỉ mục (user_id, hz, l)),
   bỏ các thẻ chính thức đã được ôn kể từ lúc phiên bắt đầu (lùi 60 giây phòng lệch đồng hồ). Chờ tối đa 1,5 giây; lỗi/quá thời gian/phản hồi hỏng → bỏ qua và mở phiên như cũ (fail-open). Không bao giờ đụng câu luyện bổ sung.
   Mọi thẻ chính thức bị bỏ hết → rơi xuống nạp phiên mới từ server.
Sửa/thêm: js/review.js, js/study-queue.js (sqPersist lưu `graded`), lib/db.js, api/index.js, test/v179-resume-session.test.js (18 test).
Chưa làm (điểm nhỏ trong audit): phiên bỏ dở > 45 phút bị bỏ im lặng; hộp "còn N từ" đếm cả câu luyện bổ sung; "ngày học" của app theo giờ máy còn server theo giờ Việt Nam; 4 tab luyện tập (flash/quiz/type/listen) có cùng khoảng trống "đã chấm chưa sang câu kế".
