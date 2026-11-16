# V164 — pinyin vẫn không hiện dù trang quản trị có đủ
Nguyên nhân: cùng 1 câu có thể có 2 bản ghi (1 có py, 1 không — vd bản AI sinh trước đó); app bốc ngẫu nhiên nên trúng bản không có pinyin, và nhập lại file bị bỏ qua vì "câu đã có pinyin".
- lib/db.js: `getWordExamplesForLessons` trả 1 dòng cho mỗi (hz, zh), ưu tiên dòng có py; `importWordExamples` bổ sung py cho mọi bản ghi còn thiếu (trước đây bỏ qua nếu 1 bản khác đã có py).
- js/question-engine.js: gộp câu trùng, giữ bản có py (client).
- test/v164-py-duplicates.test.js (+ script test:v164 trong package.json).

## V165 (cộng dồn vào gói này) — 1 chữ = 1 câu ví dụ
- lib/db.js `getWordExamplesForLessons`: trả ĐÚNG 1 câu cho mỗi chữ Hán (ưu tiên câu có pinyin, rồi câu mới nhập nhất). Câu AI sinh thêm / câu cũ không pinyin không còn lấn át câu trong file. Chỉ ảnh hưởng việc ĐỌC, không xoá dữ liệu.
- js/question-engine.js: khi câu chưa có pinyin, ô giải thích nói rõ nguồn: "lấy từ giáo trình" hay "trong kho ví dụ nhưng cột py trống".
- test/v164-py-duplicates.test.js: thêm kiểm tra 1 chữ = 1 ví dụ.
