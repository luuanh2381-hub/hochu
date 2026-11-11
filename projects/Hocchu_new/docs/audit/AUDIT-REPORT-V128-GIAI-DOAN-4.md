# AUDIT-REPORT-V128 — Giai đoạn 4: luyện thêm cho kỹ năng Nhận diện

> **Cập nhật:** giai đoạn 3 (thích ứng giữa buổi) đã làm — xem `AUDIT-REPORT-V128-GIAI-DOAN-3.md`. Mục "Chưa làm (giai đoạn 3)" dưới đây đúng ở thời điểm hết giai đoạn 4, không còn đúng ở trạng thái mới nhất.

Phạm vi: **Nhận diện** trở thành kỹ năng luyện thêm được như 4 kỹ năng còn lại (Nhớ chủ động, Nghe, Pinyin, Từ trong câu).
Trước đây máy chủ loại Nhận diện khỏi đường lấy từ, nên dù Nhận diện tụt lại, buổi học chỉ "nghiêng" dạng câu chứ không thêm câu luyện.
**Thẻ FSRS và lịch ôn không bị đụng tới.** Không đổi database, không thêm migration.

## 1. Thay đổi
| File | Thay đổi |
|---|---|
| `api/index.js` | Route `GET /api/skills/practice-words`: nhận `skill=recognition` **chỉ khi được yêu cầu riêng**. Nhận diện **không** nằm trong `mixed` → "từ hay sai", các chế độ luyện của tab Phân tích và mọi nơi gọi cũ nhận đúng danh sách như V127. Vẫn chỉ đọc. |
| `js/training-plan.js` | Bỏ cơ chế "kỹ năng chưa hỗ trợ" và câu mô tả "Nhận diện chưa có câu luyện thêm riêng" (không còn kỹ năng nào bị loại sẵn; không để lại mã chết). |
| `test/v128-phase4-recognition.test.js` (mới) | 20 test. |
| `test/v128-phase2-extras.test.js` | Cập nhật 4 test từng ghi nhận "Nhận diện chưa luyện thêm được" sang hành vi mới; bỏ 1 test ràng buộc cũ (thay bằng test route thật ở file mới); test còn lại 25. |
| `package.json` | Script `test:v128-p4`, nối vào `test:v110`. |

`js/review.js` **không đổi** ở giai đoạn này: phần luyện thêm của giai đoạn 2 đã sẵn sàng nhận Nhận diện, chỉ cần máy chủ trả từ. `lib/**` (kể cả `skill-store.js`, câu SQL `getPracticeWords`), FSRS, bộ chọn câu hỏi, `migrations/` giống hệt V127 từng byte (sha256).

## 2. Hành vi
- Nhận diện tụt lại đáng tin → buổi học nâng trần như các kỹ năng khác (40% số thẻ, ≤ 10 câu) và thêm câu Nhận diện (dạng `hz2vi`, `py2vi`, `hz2hv`), từ chọn là từ đã ôn mà Nhận diện yếu, rồi đến từ chưa đủ dữ liệu Nhận diện.
- **Không cần giọng đọc** (khác Nghe): máy không có âm thanh vẫn luyện được Nhận diện.
- Màn bắt đầu: *"Luyện thêm theo kế hoạch: Nhận diện 5 câu"*. Câu hỏi ghi lý do nêu đúng kỹ năng. Màn Phân tích bỏ dòng "chưa có câu luyện thêm riêng".

## 3. Kiểm thử đã chạy (Node v22, không có database / ts-fsrs)
- **Test mới `v128-phase4-recognition`: 20/20 đạt.** Điểm quan trọng: test nạp **nguyên đoạn mã thật** của route trong `api/index.js` vào hàm giả (không cần express/Postgres), rồi kiểm: Nhận diện chỉ được truy vấn đúng kỹ năng của nó; không lọt vào `mixed` ở bất kỳ tổ hợp nào; Nghe vẫn cần có giọng đọc; chưa đăng nhập thì không truy vấn; lỗi kho dữ liệu đi qua `fail()`; route chỉ đọc. Phía người học chạy qua **chính route đó**.
- **So sánh route thật V127 và V128 (A/B):** 504 tổ hợp tham số (14 giá trị `skill` × `allowListening` × `weakOnly` × `limit`). **468/468 tổ hợp không liên quan Nhận diện cho kết quả giống hệt** (kể cả các trường hợp bị từ chối); 36 tổ hợp `skill=recognition` đổi từ "từ chối" sang "chấp nhận" đúng như thiết kế.
- **So sánh `rvAddExtras` V127 và V128 khi không có kỹ năng cần luyện thêm:** 203/203 giống hệt. (397 ca còn lại có kỹ năng ưu tiên, nay gồm cả Nhận diện — phần được phép khác.)
- **Hồi quy:** 39 file test cũ cho kết quả **giống hệt V127**. Tổng test đạt: 706 → 784, lỗi 0.
- **Kiểm tra đột biến:** phá cố ý 12 chỗ (cho Nhận diện lọt vào `mixed`; cấp cho Nhận diện mọi kỹ năng; hoàn lại như V127; bỏ kiểm tra giọng đọc của Nghe; thêm lệnh ghi vào route; bỏ từ chối kỹ năng lạ; bắt Nhận diện phải có giọng đọc; nhận mọi tên kỹ năng; phía người học vẫn loại Nhận diện; tab Phân tích gọi `recognition`; để lại cổng "chưa hỗ trợ"; biến câu Nhận diện thành thẻ chính thức) → **bắt được cả 12**.

## 4. Chưa thể xác minh / lưu ý
1. **Chưa chạy trên Postgres thật.** Câu SQL của `getPracticeWords` không đổi và dùng chung ngưỡng "yếu" / "thiếu dữ liệu" cho mọi kỹ năng, nhưng chưa chạy với dữ liệu Nhận diện thật của bạn. Chưa thử trên trình duyệt/điện thoại thật.
2. Nhận diện được đo nhiều nhất qua thẻ chính thức nên thường **đủ lượt**; việc Nhận diện *tụt lại* so với các kỹ năng khác là hiếm. Giai đoạn này chủ yếu để hệ thống không bỏ sót khi nó xảy ra.
3. Ứng viên "chưa đủ dữ liệu Nhận diện" có thể gồm từ mới học gần đây; từ đã nằm trong buổi hoặc đã trả lời đúng hôm nay bị loại (như các kỹ năng khác).
4. Triển khai máy chủ và giao diện **cùng lúc** (Vercel làm vậy). Nếu giao diện mới chạy với máy chủ cũ, máy chủ cũ từ chối Nhận diện: giao diện không lỗi và nhường chỗ cho "từ hay sai" (có test), nhưng trần vẫn được nâng.
5. **Chưa làm (giai đoạn 3):** số liệu năng lực vẫn lấy một lần đầu buổi, chưa tự giảm câu khi bạn làm tốt giữa buổi hoặc dừng dồn khi sai liên tục.
6. 3 test FSRS không chạy được trong môi trường này (giống V127); các test `*.integration` cần database tự bỏ qua. Báo cáo **không** khẳng định "FSRS chạy đúng", chỉ khẳng định các file FSRS giống hệt V127.

## 5. Hoàn tác
Dùng lại gói giai đoạn 2 (`hoc-tu-vung-v128-giai-doan-2.zip`). Không đổi dữ liệu nào.
