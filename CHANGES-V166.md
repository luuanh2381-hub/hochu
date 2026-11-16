# V166 — Nhập hội thoại từ file ngoài (.xlsx / .csv)
Mới:
- lib/conversation-import.js — đọc/kiểm tra file (thuần) + dữ liệu file mẫu.
Sửa:
- lib/db.js — `importConversationsFromFile` (1 transaction, nhập theo lô; bỏ qua / ghi đè; xem trước).
- api/index.js — `POST /api/admin/conversations/import-file`, `GET /api/admin/conversations/import-template` (chỉ admin).
- js/conversation.js — nút + khung "Nhập hội thoại từ file" ở màn Duyệt: chọn file, tải mẫu, Kiểm tra trước, Nhập, tuỳ chọn Đăng ngay / Ghi đè.
- package.json (script test:v166), docs/HANDOFF.md.
Test:
- test/v166-conversation-import.test.js (7 test, gồm Postgres thật).
