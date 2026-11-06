# V129 — Sửa phát âm cho chữ Hán đa âm

## Làm gì
- Mỗi từ có thể có **"chữ đọc"** (từ gốc + vài chữ ngữ cảnh, vd 行 → 两行). Bấm 🔊 thì web đọc "chữ đọc" thay cho chữ gốc; thẻ vẫn hiện chữ gốc.
- Tab mới **Thêm → 🔧 Sửa phát âm** (chỉ quản trị viên): liệt kê từ đáng nghe thử (có chữ đa âm mà pinyin đang dùng cách đọc phụ), nút **🤖 AI đề xuất 8 từ tiếp theo** hoặc 🤖 AI từng từ, **✏️ Tự nhập**, nghe thử (🔊 Gốc / 🔊 Thử), **✓ Lưu / ✗ Bỏ / Xoá sửa**.
- AI chỉ đề xuất, **không tự lưu**. Không nghe được giọng của trình duyệt nên phải nghe thử bằng tai.

## File thay đổi
- Mới: `lib/tts-hints.js`, `js/tts-fix.js`, `test/v129-tts-hints.test.js`, `migrations/V129_tts_hints.sql`
- Sửa: `api/index.js` (4 đường dẫn /api/tts/*), `js/audio.js` (speak đọc chữ đọc), `js/auth.js`, `js/nav.js`, `js/navigation.js`, `index.html`, `package.json`
- Bảng mới `tts_hints` tự tạo ở lần dùng đầu (cùng kiểu word_notes). Không đụng FSRS, tiến độ học, bảng cũ.

## Đã kiểm tra (chạy thật)
- `node --check` các file JS đã sửa; test mới 11/11 đạt (lọc từ, kiểm tra chữ đọc, đọc kết quả AI, speak() đổi đúng chữ đọc / giữ nguyên khi raw, nối đủ vào web).
- Test cũ liên quan vẫn đạt: v116-menu, v117-workspace, v119-ai-explain, v128-training-plan, v128-phase3-adapt, xss-escaping.

## Chưa kiểm tra được
- Giọng đọc thật trên trình duyệt/điện thoại (phải nghe thử).
- Gọi Gemini thật, ghi/đọc Neon thật, và giao diện tab trên màn hình thật (không có mạng/DB trong môi trường làm việc).
- Danh sách "từ đáng nghe thử" dựa trên pinyin có dấu thanh trong từ vựng; nếu pinyin lưu dạng số (hang2) thì danh sách rộng hơn.
