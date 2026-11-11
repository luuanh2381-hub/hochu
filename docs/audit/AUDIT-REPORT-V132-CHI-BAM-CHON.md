# V132 — Phương pháp luyện CHỈ CHẠM CHỌN trên màn "Hôm nay học" (không gõ phím, không ghi âm)

## Làm gì
Ở **Hôm nay học → 🎛 Chế độ học khác** có thêm nhóm **"🖐 Chỉ chạm chọn — không gõ phím, không ghi âm"** gồm 3 chế độ:
1. **🔗 Ghép cặp nhanh** — tối đa 5 bài, mỗi bài ghép 4 chữ Hán với nghĩa / pinyin / **Hán Việt** (xoay vòng). Dùng lại bộ ghép cặp sẵn có.
2. **📜 Hán Việt** — 3 dạng câu trắc nghiệm: Hán Việt → Nghĩa, Hán Việt → Chữ Hán, Nghĩa → Hán Việt.
3. **👁 Thanh điệu bằng mắt** — nhìn chữ Hán, chọn cách đọc đúng thanh điệu (nhiễu = cùng chữ, đổi thanh 1 âm tiết). Không cần loa.
Hai chế độ 2–3 cũng có nút trong tab Phân tích năng lực ("Luyện theo kỹ năng").

## Nguyên tắc dữ liệu (giữ như các dạng cũ)
- Chỉ luyện bổ sung: **không đổi lịch FSRS**, chỉ ghi hồ sơ kỹ năng. Không tự chèn vào bộ chọn tự động của "Bắt đầu học" (chỉ chạy khi người học chọn).
- Đề Hán Việt chỉ dựng khi từ có **đúng 1 âm Hán Việt và không từ nào khác trong kho trùng âm đó** (vd 公/工 cùng "công" → bỏ qua) → luôn đúng 1 đáp án. Từ thiếu Hán Việt / nhiều âm: bỏ qua, không tạo câu giả.
- Thanh điệu: chỉ từ có đúng 1 cách đọc viết bằng dấu thanh (như câu "nghe → chọn thanh" V115).
- Server tự chấm theo chiều câu hỏi (hz2vi / vi2hz / hz2hv / hz2py): thêm 5 nhãn bài vào `lib/skills.js` (`practice-hv2vi`, `practice-hv2hz`, `practice-vi2hv`, `practice-hz2tone`, `practice-match-hv`). Không đổi database, không cần migration.

## File
- Mới: `test/v132-tap-only.test.js` (8 test, `npm run test:v132`)
- Sửa: `js/question-engine.js`, `lib/skills.js`, `js/skills-ui.js`, `js/lesson.js`, `js/review.js`, `js/skills-analysis.js` (nhãn), `package.json`

## Đã kiểm tra (chạy thật)
- Test V132 8/8: 4 dạng mới hợp lệ trên 40 hạt ngẫu nhiên × toàn bộ kho thử; loại từ đồng âm/nhiều âm/thiếu Hán Việt; đề không lộ đáp án; ghép cặp Hán Việt; nhãn server khớp kỹ năng + chiều câu hỏi; giao diện nối đúng hàm.
- Bộ chọn (QS.choose) với `forced` dựng đúng cả 3 dạng Hán Việt và dạng thanh điệu.
- Toàn bộ test cũ: kết quả y hệt bản V131c gốc (4 test lỗi sẵn: 3 test FSRS thiếu `ts-fsrs`, `skills.test.js` cần `/tmp/orig`).

## CHƯA kiểm tra được
- Giao diện thật trên trình duyệt/điện thoại (bố cục nhóm nút mới, màn ghép cặp có nhãn "âm Hán Việt").
- Chạy với server + Neon thật: cần deploy rồi thử 1 buổi mỗi chế độ.
- Số từ dùng được cho chế độ Hán Việt phụ thuộc cột `hanviet` trong dữ liệu thật của bạn (nếu ít từ có Hán Việt duy nhất thì app báo "Chưa có từ nào đủ dữ liệu").
- "Ghép cặp nhanh" thay hàng đợi trong bộ nhớ của tab học (giống nút "Chỉ luyện từ hay sai"); phiên học chính đã lưu vẫn còn, "Bắt đầu học" sẽ khôi phục.
