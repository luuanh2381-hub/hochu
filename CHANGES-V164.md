# V164 — pinyin vẫn không hiện dù trang quản trị có đủ
Nguyên nhân: cùng 1 câu có thể có 2 bản ghi (1 có py, 1 không — vd bản AI sinh trước đó); app bốc ngẫu nhiên nên trúng bản không có pinyin, và nhập lại file bị bỏ qua vì "câu đã có pinyin".
- lib/db.js: `getWordExamplesForLessons` trả 1 dòng cho mỗi (hz, zh), ưu tiên dòng có py; `importWordExamples` bổ sung py cho mọi bản ghi còn thiếu (trước đây bỏ qua nếu 1 bản khác đã có py).
- js/question-engine.js: gộp câu trùng, giữ bản có py (client).
- test/v164-py-duplicates.test.js (+ script test:v164 trong package.json).
