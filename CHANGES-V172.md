# V172 — Từ mới trong câu ví dụ (xuất file → AI ngoài → nhập lại)
Mới: js/sentence-words-file.js, js/admin-sentence-words.js, test/v172-sentence-words.test.js.
Sửa: lib/db.js (bảng sentence_words, xuất/nhập, gắn words vào ví dụ màn học), api/index.js (2 route admin), js/admin.js (khối UI), js/review.js (hiển thị ở màn đáp án + CSS), index.html, scripts/verify.js, package.json (test:v172), docs/HANDOFF.md.
Không cần migration thủ công (bảng tự tạo).
