# V171 — Cấu hình tất cả AI ở màn Quản trị
Mới: lib/ai-config.js, js/admin-ai.js, test/v171-ai-config.test.js, test/v171-ai-config-db.test.js.
Sửa: api/index.js (đọc cấu hình từ DB cho AI văn bản / chấm phát âm / ảnh; route /api/admin/ai-config[/test]), lib/db.js (bảng ai_config), js/admin.js (panel), index.html (nạp admin-ai.js), test/v160-openrouter.test.js, scripts/verify.js, package.json (test:v171), docs/HANDOFF.md.
Không cần migration thủ công (bảng tự tạo). Chưa lưu gì thì hệ thống chạy y như cũ bằng biến môi trường.
