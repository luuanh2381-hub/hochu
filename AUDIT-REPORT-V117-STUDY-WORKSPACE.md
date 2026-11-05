# V117 — Study Workspace + dạng bài bổ sung (màn "Hôm nay học")

Không đổi: FSRS, lịch ôn, schema DB, đường chấm chính thức. Mọi dạng bài mới là LUYỆN BỔ SUNG (không đổi lịch).

## Đã làm
- `js/study-workspace.js` (mới): 3 chế độ bố cục standard/focus/max-space (thuộc tính `data-sw-layout` trên body, không vẽ lại câu hỏi), bảng cài đặt (cỡ chữ Hán, cỡ/khoảng cách đáp án, pinyin/nghĩa/Hán Việt, tự phát âm, tốc độ tự chuyển câu, khôi phục mặc định), tạm dừng/tiếp tục, phím Esc, theo dõi bàn phím ảo. Không Fullscreen API / resize / zoom.
- `css/styles.css`: khối V117, mọi selector bắt đầu `body.sw-on` / `.sw-` / `.rv-`.
- `js/question-engine.js`, `question-selector.js`, `lib/skills.js`, `api/index.js`: 5 dạng mới — Pinyin→Chữ Hán, Pinyin→Nghĩa, Nghĩa→Pinyin, Chữ Hán→Hán Việt, Nghe→Gõ chữ Hán. Bỏ qua khi dữ liệu không đủ (đồng âm, nhiều cách đọc, thiếu hanviet, không có âm thanh).
- `js/review.js`: renderer theo dạng (`data-q`), câu nghe có trạng thái đã phát/bị chặn + nghe lại, không tự bật bàn phím ảo, chế độ "Kiểm tra trí nhớ thực sự", ghép cặp bỏ chọn + báo sai, tổng kết 3 mục, ẩn Hán Việt.
- `js/audio.js`: `speak(text, hooks)` (tuỳ chọn, tương thích cũ).
- Sửa lỗi cũ: câu Nghĩa→Gõ chữ Hán có "gợi ý pinyin" nhưng không hiển thị gợi ý.

## Chưa làm
Sắp xếp từ thành câu; phân biệt từ gần nghĩa/gần âm; hoàn thành hội thoại; phát hiện dùng từ sai; nghe-chọn-từ-hợp-câu (thiếu dữ liệu đáng tin hoặc cần module mới). Cá nhân hoá (Phần 8) dùng lại bộ chọn thích ứng V106–V115 sẵn có.

## Kiểm chứng
`npm run test:v117` (27 test), các test cũ giữ nguyên kết quả; Chromium headless (320/360/1280/800x420) không lỗi JS, không cuộn ngang. `skills.test.js` có 1 lỗi sẵn từ trước (cần thư mục /tmp/orig).
