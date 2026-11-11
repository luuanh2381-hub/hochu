# V134 — "Đúng hay sai?" + SỬA LỖI thống kê của câu 2 đáp án (V133)

## 1. Lỗi được sửa (quan trọng)
V133 thêm câu **"A hay B?"** (2 lựa chọn). Câu 2 đáp án đoán mò đúng ~50%, nhưng toàn bộ thống kê kỹ năng (lib/skill-pooled.js, `CHANCE_MCQ = 0.25`) trừ đoán mò theo trắc nghiệm 4 đáp án → điểm Nhận diện / Nhớ chủ động / Pinyin của người hay đoán sẽ bị **thổi phồng**.
**Cách sửa:** bài 2 đáp án (A hay B?, Đúng/Sai) khai báo `binary: true`; server **luôn** ghi nguồn `binary` (client không đổi được). Lượt binary vẫn được **lưu nhật ký** (xem lại, đếm "luyện thêm", phát hiện cặp hay nhầm) nhưng **không cộng điểm kỹ năng** (`word_skill_stats`) và bị loại khỏi: xu hướng theo ngày, thống kê theo dạng bài (nên cũng loại khỏi số liệu người học dùng cho kế hoạch năng lực), "tỉ lệ trả lời đúng hôm nay", phân tích trí nhớ theo khoảng nghỉ. Hành vi của check/redo và mọi bài 4 đáp án / tự gõ **giữ nguyên**.
Màn kết thúc luyện nói rõ: "câu 2 đáp án dễ đoán mò nên không cộng vào điểm kỹ năng".

## 2. ✅❌ Đúng hay sai? (mới)
Hôm nay học → Chế độ học khác → nhóm "Chỉ chạm chọn" (và tab Phân tích). Tối đa 12 câu, **xen kẽ khẳng định đúng/sai** (cân bằng 50/50, không đoán theo thói quen), 3 dạng: chữ Hán → nghĩa, nghĩa → chữ Hán, chữ Hán → pinyin.
- Khẳng định **sai** luôn là đáp án của một từ khác đã qua bộ lọc nhiễu (khác nghĩa / khác pinyin) → thật sự sai.
- Server tự chấm: client gửi khẳng định + `verdict` ('true'|'false'); server biết khẳng định đúng hay sai (`gradeBinaryVerdict`). "Đáp án sai" chỉ được lưu khi bạn **chấp nhận một khẳng định sai** (đó mới là điều bạn đang nhầm); bác bỏ nhầm khẳng định đúng thì không lưu — tránh làm bẩn dữ liệu cặp hay nhầm.
- Nhãn mới: `practice-tf-recognition|recall|pinyin`. Không migration, không đổi bảng.

## File
- Mới: `test/v134-binary-tf.test.js` (12 test, `npm run test:v134`)
- Sửa: `lib/skills.js`, `lib/skill-store.js`, `api/index.js`, `js/question-engine.js`, `js/skills-ui.js`, `js/lesson.js`, `js/study-queue.js` (gửi `verdict`), `package.json`
- Cập nhật 2 test cũ (v113, v114) cho khớp mã mới: chúng khoá nguyên văn dòng `const shown = SHOWN_ANSWER_SOURCES.includes(source)` và tham số `['check','redo']`; ý nghĩa giữ nguyên (check/redo vẫn không cộng điểm), chỉ thêm `binary`.

## Đã kiểm tra (chạy thật)
- Test V134 12/12, gồm chạy **thật** `recordPractice` với database giả: bài 2 đáp án ghi nguồn `binary` dù client gửi `mode` và không có lệnh `INSERT INTO word_skill_stats`; bài 4 đáp án thường vẫn cộng điểm; check/redo vẫn không cộng; `wrongAnswer` ghi đè đúng.
- 4 câu SQL thống kê đã sửa (xu hướng, trí nhớ, theo dạng bài, hôm nay) chạy trên **PostgreSQL 16 thật** với dữ liệu mẫu: lượt binary và check bị loại khỏi thống kê, lượt `mode`/chính thức vẫn được đếm; "luyện thêm" hôm nay vẫn đếm cả binary (cố ý, vì bạn đã làm).
- Toàn bộ test cũ: y hệt bản V131c gốc (4 test lỗi sẵn do thiếu `ts-fsrs` / đường dẫn `/tmp/orig`).

## CHƯA kiểm tra được
- Giao diện thật trên trình duyệt/điện thoại; chạy với server Express + Neon thật (SQL đã kiểm bằng Postgres thật, route chưa gọi qua HTTP).
- Tính cả các lượt binary đã ghi bằng bản V133 (nếu bạn đã dùng "A hay B?" trước khi cập nhật): các lượt đó đã vào điểm kỹ năng với nguồn `mode`. Muốn dọn: xoá/đánh lại các dòng `skill_practice_log` có `exercise_type LIKE 'practice-duel-%'` và tính lại `word_skill_stats` — mình chưa viết script này vì cần bạn xác nhận (thay đổi dữ liệu thật).

## Ý tưởng cố ý CHƯA làm
- "Chữ nào chứa bộ này?": dữ liệu chiết tự (`hanzi_parts`) do AI sinh, chưa được kiểm chứng; dựng câu hỏi có đáp án đúng/sai từ đó có thể dạy sai. Chỉ nên làm khi bạn xác nhận dữ liệu bộ thủ.
- "Chạm chắc / không chắc" sau mỗi câu: phải đổi luồng ôn chính thức và cách ghi điểm — rủi ro cao, nên làm riêng và có dữ liệu học thử.
