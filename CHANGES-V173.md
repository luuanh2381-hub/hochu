# V173 — Màn đáp án "Hôm nay học": bỏ lặp, "Từ mới trong câu" ngay dưới câu
Sửa: js/review.js (rvSentenceBlockHtml, rvExplainHtml, 2 khối .rv-ex, hàm mới rvSentenceWords), scripts/verify.js, package.json (test:v173), docs/HANDOFF.md.
Mới: test/v173-answer-dedupe.test.js. Không đụng js/question-engine.js (q.explanation vẫn đủ dòng cho màn Kỹ năng).

Trước: câu Hán + nghĩa cả câu hiện 3 lần (khối câu, khung giải thích, khối ví dụ); dòng "打印 (dǎyìn) = in · Hán Việt: …" lặp lại chữ/pinyin/nghĩa/Hán Việt ngay phía trên; "Từ mới trong câu" nằm tận cuối.
Nay: câu Hán + pinyin + nghĩa hiện 1 lần ở khối câu, "📚 Từ mới trong câu" nằm ngay dưới câu. Khung giải thích chỉ còn phần KHÁC (mẹo, thanh điệu, bạn gõ gì…). Khối ví dụ riêng chỉ hiện khi câu hỏi không có câu thật (vd hỏi nghĩa từ đơn).
Lưu ý: pinyin cả câu luôn hiện ở màn kết quả (trước đây dòng "Pinyin cả câu" trong khung giải thích luôn hiện, không phụ thuộc "Hiện Pinyin").
