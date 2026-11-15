# V133 — "A hay B?" từ lỗi nhầm thật + Ghép cặp nghe ↔ chữ Hán (vẫn chỉ chạm, không gõ, không ghi âm)

## Làm gì
1. **⚔️ A hay B?** (Hôm nay học → Chế độ học khác → nhóm "Chỉ chạm chọn"; cũng có ở tab Phân tích): câu **2 lựa chọn** giữa đáp án đúng và **đúng đáp án bạn hay chọn nhầm**.
   - Nguồn: các đáp án sai lặp lại ≥ 2 lần trong 180 ngày (ôn chính thức + luyện bổ sung gộp lại) — cùng điều kiện với V111.
   - Hỏi đúng **chiều bạn đã nhầm**: nhầm nghĩa → hỏi nghĩa; nhầm chữ Hán → hỏi chữ Hán; nhầm pinyin → hỏi pinyin.
   - Sau khi trả lời: nêu từ hay nhầm ("Bạn hay nhầm với 买 (mǎi) = mua") và chú giải của nhóm chữ dễ nhầm nếu cặp đó thuộc nhóm.
2. **Ghép cặp nghe ↔ chữ Hán**: thêm loại thứ 4 cho "Ghép cặp nhanh". Bên trái là các nút 🔊 (không lộ chữ Hán, chạm để nghe, chạm lại để nghe lại), bên phải là chữ Hán. **Chỉ bật khi máy có giọng đọc tiếng Trung.**

## Nguyên tắc dữ liệu
- Không tạo câu mơ hồ: bỏ cặp tự nhầm chính mình, trùng nghĩa (hỏi nghĩa), đồng âm (hỏi pinyin), từ nhiều cách đọc. Ghép cặp nghe không bao giờ có 2 từ đồng âm trong cùng bài.
- Luyện bổ sung: không đổi lịch FSRS; chỉ ghi hồ sơ kỹ năng. Không tự chèn vào bộ chọn tự động của "Bắt đầu học".
- Server tự chấm (4 nhãn mới trong `lib/skills.js`: `practice-duel-recognition|recall|pinyin`, `practice-match-listen`). Không migration, không đổi bảng.
- **API mới (chỉ đọc):** `GET /api/skills/confusion-pairs?limit=` — bắt buộc đăng nhập, chỉ trả dữ liệu của đúng user trong token (`skillStore.getConfusionPairs`).

## File
- Mới: `test/v133-duel-listen.test.js` (9 test, `npm run test:v133`)
- Sửa: `js/question-engine.js`, `lib/skills.js`, `lib/skill-store.js`, `api/index.js`, `js/skills-ui.js`, `js/lesson.js`, `js/review.js`, `js/skills-analysis.js` (nhãn), `package.json`

## Đã kiểm tra (chạy thật)
- Test V133 9/9 (tìm từ gây nhầm đúng trường; câu 2 lựa chọn đúng chiều/không lộ đáp án; ca mơ hồ bị loại; ghép cặp nghe; nhãn server; route chỉ đọc theo token; giao diện nối đúng hàm).
- **Câu SQL chạy trên PostgreSQL 16 thật** (cụm tạm trong máy kiểm thử, dữ liệu mẫu): gộp đúng 2 bảng (1 lần ôn chính thức + 1 lần luyện bổ sung = 2), loại đáp án chỉ sai 1 lần, loại dòng > 180 ngày, loại dòng đúng (NULL), tách theo user, `LIMIT` hoạt động.
- Toàn bộ test cũ: y hệt bản V131c gốc (4 test lỗi sẵn do thiếu `ts-fsrs` / đường dẫn `/tmp/orig`).

## CHƯA kiểm tra được
- Giao diện thật trên trình duyệt/điện thoại (chạm 🔊 phát âm, bố cục nút mới, màn "A hay B?").
- Route chạy với server Express + Neon thật (SQL đã kiểm, nhưng chưa gọi qua HTTP).
- Chế độ "A hay B?" cần bạn đã có đáp án sai lặp lại; người mới sẽ thấy thông báo "Chưa có cặp nào bạn hay nhầm". Đáp án sai do **tự gõ** linh tinh không khớp từ nào trong kho sẽ bị bỏ qua.
