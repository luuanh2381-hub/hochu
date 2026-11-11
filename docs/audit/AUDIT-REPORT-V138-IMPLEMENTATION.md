# AUDIT-REPORT-V138-IMPLEMENTATION — Câu hỏi theo câu trong "Hôm nay học"

Ngày: 2026-11-09 · Trạng thái: đã triển khai + test tự động xanh (không có DB thật trong môi trường này).

## 1. Tổng quan

Mọi trắc nghiệm TỪ ĐƠN LẺ trong tab "Hôm nay học" được thay bằng câu hỏi THEO CÂU. Mỗi câu hỏi gắn với
đúng MỘT từ mục tiêu và đúng MỘT thẻ FSRS có sẵn. Không tạo thẻ mới, không đổi thuật toán FSRS, không
đụng dữ liệu cũ. Sau khi trả lời, màn đáp án hiện câu chữ Hán đầy đủ (tô đậm từ mục tiêu), nghĩa cả câu,
nút "Nghe lại câu", và tự đọc cả câu đúng một lần.

## 2. File thay đổi / tạo mới

| File | Thay đổi |
|---|---|
| `js/question-engine.js` | +4 dạng câu (`sent2vi`, `vi2sent`, `listenSent2vi`, `sentPick`), `SENTENCE_ORDER`, `validateSentence`, builder lấy câu thật |
| `js/question-selector.js` | trọng số 4 dạng mới |
| `js/review.js` | ép `SENTENCE_ORDER`; trần 0–15 câu; `rvAnswerSentence`/`rvReplaySentence`/`rvSentenceBlockHtml`; bỏ câu 3 phần; bỏ chèn lại thẻ sai |
| `api/index.js` | `resolveSentenceAnswer`; preview/commit/practice chấm câu bằng dữ liệu thật |
| `lib/skills.js` | 8 nhãn `review-*/practice-*` với `quizType: 'sentence'`, `sentField` |
| `js/study-queue.js` | gửi kèm `sentence` |
| `js/lesson.js` | "Số câu luyện theo câu mỗi buổi" (0/2/6/10/15, mặc định 6); bỏ 2 công tắc câu 3 phần |
| `package.json`, `scripts/verify.js` | thêm `test:v138`, đưa test vào verify ui/core |
| `test/v138-sentence.test.js` | **mới** — 14 test |
| 12 file test cũ | cập nhật fixture câu + kỳ vọng V138 |

Không xoá file nào. `js/review-multi.js` vẫn còn trong repo nhưng không còn được nối vào buổi học.

## 3. Các dạng câu đã triển khai

| # | Dạng | typeId | Kỹ năng | Đáp án |
|---|---|---|---|---|
| 1 | Câu Hán → chọn nghĩa | `sent2vi` | context | nghĩa cả câu |
| 2 | Nghĩa câu → chọn câu Hán | `vi2sent` | context | câu Hán |
| 3 | Nghe câu → chọn nghĩa | `listenSent2vi` | listening | nghĩa cả câu |
| 4 | Điền từ vào câu (cloze) | `cloze` | context | từ mục tiêu |
| 5 | Chọn câu có dùng từ | `sentPick` | context | câu Hán |
| 8 | Sắp xếp câu (đã có từ V135) | `orderSentence` | context | cả câu |

**Chưa triển khai (trung thực):** 6 (chọn từ hợp ngữ cảnh — đã có `cloze` tương đương), 7 (hội thoại),
9 (tìm câu sai), 10 (chọn câu trả lời). Dữ liệu hiện có không đủ để dựng các dạng này mà không bịa câu.

## 4. Cách thay trắc nghiệm từ đơn lẻ

- `rvBuildQuestionFor` chỉ truyền `only: QE.SENTENCE_ORDER` cho thẻ chính thức, `check`, `drill`, `extra`, `redo`.
- `QS.choose` không còn đường rơi về `hz2vi`/`vi2hz` trong buổi học.
- Thẻ không dựng được câu nào (từ chưa có câu ví dụ) bị **bỏ khỏi buổi này** (`rvPrepareCurrentCard`), không hỏi từ đơn lẻ.
- Câu 3 phần (`rvmBuild`) không còn được gọi; 2 công tắc trong Cài đặt đã bỏ.

## 5. Câu hỏi → thẻ FSRS

- Mỗi item hàng đợi có `word` = từ mục tiêu; câu hỏi mang `q.word` và `q.sentence`.
- `rvPick` gửi `word`, `quizType: 'sentence'`, `selectedAnswer`, `sentence`, `exerciseType` (`review-sent2vi`…).
- Server `resolveSentenceAnswer(word, sentField, sentence)` tra câu trong `word_examples` + `SENTENCES`,
  khớp sau chuẩn hoá mới lấy đáp án; không khớp → từ chối lượt.
- Chỉ `reviewService.reviewCard` cho đúng `word` đó được gọi → một câu = một thẻ.

## 6. Rating

Không đổi ánh xạ đúng/sai → rating. Đúng → `good` (hoặc người học chọn), sai → `again`; câu 3 phần đã bỏ
nên không còn nhánh "đúng 2/3 tối đa Good".

## 7. Chống review trùng

- `idempotencyKey` + outbox + write-ahead (`js/study-queue.js`).
- `rvSubmitting` chặn bấm nộp nhiều lần.
- V138 bỏ chèn lại thẻ chính thức trả lời sai; chỉ chèn `redo` luyện bổ sung (không đổi FSRS).
- `sessionKnownHz` + `completedCards` chặn hỏi lại thẻ đã đánh giá trong buổi.

## 8. Âm thanh cả câu

- `rvAnswerSentence(q)` trả câu thật (`q.sentence.zh`), dùng cho tự đọc sau khi chấm và nút "Nghe lại câu".
- `rvSentenceBlockHtml()` hiện câu + tô đậm từ + nghĩa + nút nghe lại.
- Tự đọc đúng một lần ở chỗ chấm (`swSpeakAfterAnswer`); mở pinyin/giải thích không đọc lại.
- Dùng Web Speech API sẵn có (`speak`, `swPlayTracked`). Lỗi TTS không ảnh hưởng FSRS.

## 9. TTS / biến môi trường

**Chưa triển khai Azure Neural TTS.** Không có `POST /api/tts/sentence`, không có `AZURE_SPEECH_KEY`/
`AZURE_SPEECH_REGION`. Không có API key nào ở frontend/localStorage/repo. Hệ thống vẫn chạy khi không có
giọng đọc (câu nghe bị bỏ khỏi buổi, không chặn trả lời).

## 10. Kết quả test

| Lệnh | Kết quả |
|---|---|
| `npm run verify:core` | 6/6 file qua |
| `npm run verify:ui` | 9/9 file qua |
| `npm run verify:server` | 5/5 file qua |
| `npm run verify:fsrs` | 4/4 file qua |
| Toàn bộ test không cần DB (50 file) | PASS |

Test V138 mới: dựng câu từ dữ liệu thật, không lộ đáp án, nhiễu không trùng nghĩa/không chứa từ mục tiêu,
`SENTENCE_ORDER`, `QS.choose` không trả từ đơn lẻ, server `resolveSentenceAnswer`, trần 0–15, chống trùng.

## 11. Lỗi còn tồn / giới hạn

- Chưa chạy end-to-end với Express + Postgres thật (môi trường không có `DATABASE_URL`).
- Chưa thử trên trình duyệt/điện thoại thật (bố cục câu dài, giọng đọc sau khi trả lời).
- Câu không có pinyin trong dữ liệu → màn đáp án không hiện pinyin cả câu.
- Từ chưa có câu ví dụ bị bỏ khỏi buổi học (không có câu hỏi thay thế).
- Dạng 7/9/10 chưa làm (thiếu dữ liệu hội thoại/câu sai/câu trả lời).

## 12. Việc tiếp theo

1. Bổ sung pinyin cho `word_examples`/`SENTENCES` nếu muốn hiện pinyin cả câu.
2. Cân nhắc Azure Neural TTS sau khi có key + endpoint có xác thực/rate limit/cache.
3. Thử thật trên trình duyệt và DB; đo tỷ lệ từ có câu ví dụ để đánh giá độ phủ.
