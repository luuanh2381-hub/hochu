# V177 — Giảm lượt hỏi Neon khi tải dữ liệu (YÊU CẦU GIỮ NGUYÊN: mỗi câu trả lời vẫn được ghi NGAY lên Neon)
Không sửa bất kỳ đoạn nào ghi kết quả học (api/index.js không đổi dòng nào; reviewService.js chỉ đổi tên + bọc hàm tạo bảng user_settings).
1. **Cùng vùng:** `vercel.json` thêm `"regions": ["syd1"]` (Neon ở AWS Sydney; trước đó Vercel mặc định Washington D.C. nên mỗi truy vấn đi xa).
2. **Chẩn đoán + độ bền kết nối (lib/db-target.js, lib/db.js):** khi mở kết nối ghi 1 dòng log `[db] Neon <vùng> · kết nối POOLER/TRỰC TIẾP · server Vercel <vùng>` (cảnh báo nếu khác vùng hoặc không dùng -pooler; không in mật khẩu);
   thêm `pool.on('error')` để kết nối rảnh bị đóng không thành lỗi chưa bắt. Chuyển sang địa chỉ pooler là thao tác trên Vercel/Neon (xem HUONG-DAN-VERCEL.md, mục V177). Code chỉ dùng khoá/`SET LOCAL` theo giao dịch → hợp với pooler.
3. **Bỏ lệnh tạo bảng lặp lại (lib/schema-state.js):** 15 hàm ensure* (db.js ×8, skill-store, analytics, optimizer, user_settings, word-notes, ai-explain, tts-hints) được bọc `withSchemaFastPath`.
   Bảng nhỏ `schema_state(name, fingerprint)` nhớ "hàm này đã chạy xong ở phiên bản code có dấu vân tay F" (F = băm mã nguồn của hàm). Lần thức dậy sau: 1 lệnh SELECT thay cho ~50+ lệnh CREATE/ALTER.
   Mô phỏng 2 lần thức dậy với ensureFsrsTables+ensureSkillTables: **54 lệnh → 1 lệnh**. Sửa lược đồ → dấu vân tay đổi → tự chạy lại 1 lần. Không đọc được schema_state / lỗi bất kỳ → chạy đầy đủ như cũ. `SCHEMA_FORCE_INIT=1` ép chạy lại.
   KHÔNG bọc `ensureTable` (gieo dòng app_store id=1) và `ensureGeminiRateTable` (gieo dòng gemini_rate_limit) — tiết kiệm ít, giữ nguyên hành vi.
- Test: test/v177-neon-load.test.js (16 test, gồm chạy hàm khởi tạo THẬT qua 2 lần thức dậy); test/v127-fsrs-isolation.test.js thêm ngoại lệ cho lệnh ghi `schema_state` (sổ sách lược đồ, cùng loại với DDL) — bảng dữ liệu FSRS và phép so sánh hash vẫn nguyên.
- Chưa làm: nhớ từ vựng ở máy người học (ý 4), gộp yêu cầu lúc mở app (ý 5).
