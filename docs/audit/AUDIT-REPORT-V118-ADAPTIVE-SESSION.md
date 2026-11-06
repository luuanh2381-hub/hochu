# V118 — Nâng cấp "Hôm nay học": đổi chiều truy xuất khi sai, trần luyện lại, tổng kết theo bằng chứng, phản hồi thanh điệu

## Phát hiện khi đọc mã V117
Phần lớn yêu cầu đã có từ V104–V117 (hồ sơ 5 kỹ năng + độ tin cậy + nhãn bằng chứng, bộ chọn thích ứng, "đúng nhưng chậm",
độ khó FSRS, kênh luyện bổ sung tách khỏi FSRS, outbox + idempotencyKey, vòng `redo`). V118 CHỈ vá các khoảng trống thật:

1. Tổng kết đếm cả câu `check`/`redo`/lượt đầu sau giới thiệu (vừa xem đáp án) vào kết luận kỹ năng — trong khi server đã loại chúng từ V113.
2. Đề xuất luyện tiếp chỉ dựa vào tỉ lệ từng kỹ năng, không đối chiếu nhận diện ↔ nhớ chủ động / nghe; không tách số câu và số từ duy nhất theo kỹ năng.
3. Mỗi lần thẻ chính thức sai lại sinh thêm 1 câu `redo`, không có trần theo từ trong phiên.
4. Bộ chọn chỉ tránh lặp đúng (từ, dạng); chưa chủ động đổi chiều truy xuất theo lịch sử sai của chính từ đó.
5. Chấm pinyin báo chung "sai thanh điệu", không nói âm tiết nào.

## Thay đổi
- `js/session-summary.js` (MỚI, thuần): `summarize(log)` + `canQueueRedo()`. Số câu/số từ duy nhất tách riêng; lượt chính thức vs luyện bổ sung;
  kết luận kỹ năng cần ≥3 câu hợp lệ từ ≥2 từ khác nhau; câu check/redo/intro không là bằng chứng; đề xuất chỉ khi dữ liệu hỗ trợ.
- `js/review.js`: nhật ký ghi thêm `intro`; trần `MAX_REDO_ANSWERS_PER_WORD = 4` khi chèn `redo`; tổng kết dùng SM (bảng kỹ năng, danh sách
  "nhận diện được nhưng chưa tự nhớ / nghe chưa tốt / pinyin chưa tốt", dòng lượt chính thức · bổ sung); màn đáp án pinyin tự nhập chỉ rõ âm tiết sai thanh.
- `js/question-selector.js`: `wordTrail()`; sai chính từ đó → cộng dạng thuộc KỸ NĂNG KHÁC (+1.2; sai ≥2 lần +2.0, trừ 0.5 dạng cùng kỹ năng); `why` giải thích.
- `js/answer-match.js`: `toneDiff()`/`toneFeedback()` (chỉ để giải thích; KHÔNG đổi kết quả chấm).
- `js/skills-ui.js`: hiện phản hồi thanh điệu ở bài luyện kỹ năng. `index.html`: nạp session-summary.js trước review.js.
- Test: `test/v118-adaptive.test.js` (34 test, nối vào `test:v110`). 6 harness cũ chỉ được thêm dòng nạp session-summary.js; không sửa assertion nào.

## FSRS & dữ liệu
- KHÔNG đổi thuật toán/lịch FSRS; KHÔNG đổi schema; KHÔNG migration; `api/`, `lib/`, `migrations/`, `scripts/` giữ nguyên byte-for-byte so với V117.
- Không ghi thêm dữ liệu nào lên server: `intro` chỉ nằm trong nhật ký phiên cục bộ (rvLog); nhật ký cũ không có trường này vẫn đọc được (coi là false).
- Rủi ro còn lại: hàng đợi phiên đã lưu ở localStorage từ V117 vẫn nạp được (không đổi cấu trúc); chưa thử trên trình duyệt thật.

## Chưa làm / giới hạn (nói thẳng)
- Chưa lưu trung vị thời gian phản hồi và chuỗi kết quả gần đây theo từng (từ, kỹ năng) trên server: cần đổi schema; để V119 nếu muốn. Hiện chỉ dùng nhịp trong phiên (V111).
- Chưa thêm dạng bài ngữ cảnh/phân biệt từ gần nghĩa mới: thiếu dữ liệu câu ví dụ đáng tin; không tạo hàng loạt câu tiếng Trung chưa kiểm chứng.
- Chất lượng file âm thanh thật (đúng từ, đúng thanh) không thể kiểm tự động ở đây; hệ thống vẫn chỉ ra câu nghe khi `skillAudioAvailable()` và bỏ qua từ đồng âm.
- Chưa kiểm trên trình duyệt thật (sandbox không có Chromium) — cần thử tay: màn tổng kết trên điện thoại, câu pinyin tự nhập sai thanh.
