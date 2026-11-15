# V131 — Giai đoạn 2a: server sẵn sàng chấm "câu 3 phần" cho thẻ FSRS chính thức

## Làm gì
- Hai route `/api/study/review/preview` và `/api/study/review` nhận thêm trường tuỳ chọn `parts` (3 phần: hz2py · hz2vi · hz2hv, mỗi phần có `selectedAnswer`).
- **Không gửi `parts` → mọi thứ chạy y nguyên như V130** (không đi qua code mới).
- Có `parts`: server tự chấm từng phần từ DB (không tin trình duyệt); **đúng ≥2/3 mới là đúng**; ≤1/3 là sai (Again như mọi câu sai).
- Đúng 2/3: vẫn là đúng nhưng **không được Easy** (tối đa Good), kể cả khi người dùng bấm tay Easy; nếu không chọn tay mà hệ thống gợi ý Easy → hạ xuống Good; không xem trước được → mặc định Good.
- Thời gian: tổng thời gian cả câu chia cho 3 trước khi đưa vào FSRS (để baseline tốc độ cá nhân của thẻ không bị méo). `answerChanges` = 0.
- Lượt FSRS này **không ghi hồ sơ kỹ năng** (kết quả cả câu ≠ kết quả từng phần); ở bước 2b trình duyệt sẽ gửi từng phần như bài luyện bổ sung riêng.
- Chưa có thay đổi giao diện: bước này người dùng chưa thấy gì khác.

## FSRS
- Không sửa `lib/fsrs/*`, `lib/db.js`, `lib/fsrs-auto-rating.js`, `reviewService`. Module mới chỉ quy 3 đáp án về đúng những giá trị đường FSRS đã nhận: `answerCorrect`, `responseTimeMs`, `answerChanges`, `ratingOverride`.
- Không đổi database, không thêm bảng.

## File
- Mới: `lib/multi-grade.js`, `test/v131-multi-grade.test.js`
- Sửa: `api/index.js` (2 route + 1 dòng require), `package.json` (script test)

## Đã kiểm tra (chạy thật)
- `node --check`; test mới 17/17 (đọc/kiểm tra `parts`, chấm 3/3·2/3·1/3·0/3 bằng đúng hàm chấm lấy từ api/index.js, phần bỏ trống = sai, cap Easy, chia thời gian, đường cũ không đổi).
- Chạy cả thư mục test: 43 đạt. 3 test FSRS không chạy được vì thiếu module `ts-fsrs` (không có mạng để cài) — bản V128 gốc cũng vậy.

## CHƯA kiểm tra được (quan trọng)
- Đường FSRS thật đầu-cuối (ts-fsrs + Neon + Express): **chưa chạy**. Cần chạy `npm test` ở máy/Vercel có đủ module trước khi bật tính năng cho thẻ chính thức.
- Vì chưa có giao diện (bước 2b), route mới chưa được gọi bởi trình duyệt nào.
