# V163 — màn "Hôm nay học" (flashcard/review) hiện pinyin của câu ví dụ
- js/review.js: khối câu ví dụ `.rv-ex` ở màn đáp án (cả 3 chỗ) giờ in dòng pinyin từ cột py; rvFindExample ưu tiên câu có pinyin.
- (kèm V162: js/quiz.js, js/admin.js)
- js/question-engine.js: ô giải thích ở màn đáp án in "Pinyin cả câu: …" khi câu có py; chỉ còn báo "chưa có trong dữ liệu" khi thật sự không có (trước đây LUÔN báo như vậy, kể cả khi có py).
