# V167 — Dạng mới "Nghe câu → Chọn câu" (FSRS chính thức)
Sửa:
- js/question-engine.js — dạng `listenSent2zh` + bộ dựng; thêm vào SENTENCE_ORDER.
- js/question-selector.js — trọng số cho dạng mới.
- lib/skills.js — nhãn `review-listen-sent-zh` (chính thức) và `practice-listen-sent-zh` (luyện thêm).
- package.json (test:v167), docs/HANDOFF.md.
Test:
- test/v167-listen-sent-zh.test.js (mới, 6 test); cập nhật test/v138-sentence.test.js, test/adaptive-session.test.js.
Không đổi: api/index.js, lib/db.js (server chấm câu theo nhãn trong lib/skills.js; không cần migration).
