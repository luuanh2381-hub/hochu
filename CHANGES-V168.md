# V168 — Chế độ học ở "Hôm nay học"
Mới:
- js/study-modes.js — module thuần `SMODE`: 6 chế độ (Tổng hợp · Cơ bản · Nghe nhiều · Dịch nghe · Dịch đọc · Nhớ chữ Hán). Mọi dạng đề đều là thẻ CHÍNH THỨC (FSRS), không có câu gõ bàn phím.
- test/v168-study-modes.test.js — 26 test (gồm guard chống trùng tên toàn cục giữa các script).
Sửa:
- index.html — nạp js/study-modes.js (sau question-selector, trước review.js / study-workspace.js).
- js/review.js — bộ chọn chế độ ở màn bắt đầu; rvBuildQuestionFor hỏi theo chế độ (thẻ chính thức + luyện thêm); chế độ nghe tự khoá khi máy không có giọng đọc.
- js/study-workspace.js — tuỳ chọn `mode` + hàng "Chế độ học" trong cài đặt.
- test/adaptive-session.test.js — thêm rvAudioOk, rvStudyMode vào danh sách hàm trích.
- scripts/verify.js, package.json (test:v168), docs/HANDOFF.md.
Không đổi: api/index.js, lib/* (không migration; server chấm theo nhãn exerciseFsrs như trước).
Lưu ý: tên global là `SMODE` vì `SM` đã thuộc js/session-summary.js.
