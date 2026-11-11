# AUDIT-REPORT-V138 — Kiểm toán trước khi nâng cấp "Hôm nay học" sang câu hỏi theo câu

Ngày: 2026-11-09 · Phạm vi: thay trắc nghiệm TỪ ĐƠN LẺ trong tab "Hôm nay học" bằng câu hỏi THEO CÂU,
giữ nguyên FSRS và mọi chức năng từ vựng ngoài phạm vi.

## 1. Kiến trúc hiện tại (trước V138)

| Tầng | File | Vai trò |
|---|---|---|
| Dựng câu | `js/question-engine.js` (QE) | `TYPES` + builder cho từng dạng; `validate()` chặn câu hỏng |
| Chọn dạng | `js/question-selector.js` (QS) | Chấm điểm dạng theo hồ sơ kỹ năng, chọn dạng hợp lệ |
| Luồng buổi học | `js/review.js` | `rvBuildQuestionFor`, `rvPrepareCurrentCard`, `rvAdvanceQueue`, render/answer |
| Chấm server | `api/index.js` | `/api/study/review`, `/api/study/review/preview`, `/api/skills/practice` |
| Nhãn kỹ năng | `lib/skills.js` | `EXERCISES` (exerciseType → skill/quizType/fsrs), `gradeAnswer` |
| Gửi lượt | `js/study-queue.js` | outbox + idempotencyKey + write-ahead |
| Dữ liệu câu | `word_examples` (DB), `js/sentences-data.js` | `{hz, zh, vi}` / `{hz, vi, hint}` — KHÔNG có pinyin |

Trước V138, thẻ FSRS chính thức được hỏi bằng `hz2vi`/`vi2hz`/`listen2hz`… (trắc nghiệm một từ).
`cloze` và `orderSentence` đã là câu hỏi theo câu nhưng chỉ dùng cho luyện bổ sung.

## 2. File phải sửa

- `js/question-engine.js`: thêm 4 dạng câu (`sent2vi`, `vi2sent`, `listenSent2vi`, `sentPick`), `SENTENCE_ORDER`, `validateSentence`.
- `js/question-selector.js`: trọng số cho 4 dạng mới.
- `js/review.js`: chỉ chọn `SENTENCE_ORDER` cho thẻ chính thức/check/extra/redo; trần 0–15 câu; hiển thị câu đầy đủ + tự đọc cả câu; bỏ câu 3 phần.
- `api/index.js`: `resolveSentenceAnswer` — server tra lại câu thật rồi chấm, không tin client.
- `lib/skills.js`: 8 nhãn `review-*/practice-*` với `quizType: 'sentence'`, `sentField`.
- `js/study-queue.js`: gửi kèm `sentence`.
- `js/lesson.js`: thay "độ dài phiên" bằng "số câu luyện theo câu" (0–15, mặc định 6); bỏ 2 công tắc câu 3 phần.

## 3. Hàm dùng lại (không viết lại)

- `js/order-sentence.js`: `sentenceUsable`, `normalize`, `fromSentences`, `fromExamples` — dùng chung client/server.
- `QE.findSentences`, `QE.placeCorrect`, `QE.meaningsOverlap`, `QE.normText`.
- `rvExamplePool` (word_examples tải sẵn) + `SENTENCES` (câu mẫu giáo trình).
- `speak()` / `swPlayTracked()` trong `js/audio.js` + `js/study-workspace.js`.
- `reviewService.reviewCard` — KHÔNG đổi thuật toán FSRS.

## 4. Rủi ro FSRS và cách chặn

| Rủi ro | Cách chặn |
|---|---|
| Tạo thẻ mới cho câu | Không có bảng/thẻ mới; mỗi câu gắn `word` của thẻ FSRS có sẵn |
| Một câu cập nhật nhiều thẻ | Mỗi câu chỉ có 1 `word` mục tiêu; server chỉ gọi `reviewCard` cho từ đó |
| Review trùng khi bấm nhiều lần | `idempotencyKey` + outbox + `rvSubmitting`; server chấm lại |
| Thẻ sai quay lại → 2 lần đánh giá | V138 bỏ chèn lại thẻ chính thức sai; chỉ chèn `redo` luyện bổ sung |
| Mất lịch sử/due | Không UPDATE/DELETE `fsrs_cards` ngoài `reviewCard` hiện có |
| Câu không có trong dữ liệu | `resolveSentenceAnswer` trả null → server từ chối lượt, không ghi |

## 5. Kế hoạch thay đổi tối thiểu

1. Thêm dạng câu + validate (QE) và trọng số (QS).
2. Ép mọi đường trong "Hôm nay học" dùng `SENTENCE_ORDER`; thẻ không dựng được câu bị bỏ khỏi buổi (không rơi về từ đơn lẻ).
3. Server tra lại câu thật để chấm; client gửi `sentence`.
4. Màn đáp án hiện câu đầy đủ + tô đậm từ + nghĩa + nút nghe lại; tự đọc cả câu đúng 1 lần.
5. Trần 0–15 câu/buổi, mặc định 6.
6. Test: dựng câu, chấm server, chống trùng, trần, hồi quy.

## 6. Giới hạn dữ liệu (ghi nhận trung thực)

- `word_examples` và `SENTENCES` **không có pinyin câu** → màn đáp án không hiện pinyin cả câu (chỉ hiện khi dữ liệu có).
- Không đủ dữ liệu để dựng dạng 7 (hội thoại), 9 (tìm câu sai), 10 (chọn câu trả lời) mà không bịa → không triển khai.
- Azure Neural TTS chưa triển khai; dùng Web Speech API sẵn có.
