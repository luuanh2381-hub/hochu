# AUDIT-REPORT-V128 — Giai đoạn 2: câu luyện thêm theo kỹ năng tụt lại

> **Cập nhật:** giai đoạn 4 đã mở luyện thêm cho **Nhận diện** (xem `AUDIT-REPORT-V128-GIAI-DOAN-4.md`) và giai đoạn 3 đã thêm thích ứng giữa buổi (xem `AUDIT-REPORT-V128-GIAI-DOAN-3.md`). Các câu dưới đây nói "Nhận diện chưa có câu luyện thêm riêng" đúng ở thời điểm hết giai đoạn 2, không còn đúng ở trạng thái mới nhất.

Phạm vi: "Hôm nay học" dùng **Kế hoạch ưu tiên theo năng lực** (giai đoạn 1) để quyết định **số câu** và **từ** của phần **luyện thêm**,
và **nâng trần** câu luyện thêm lên **40% số thẻ, tối đa 10 câu** (mức do chủ dự án chốt; trước đây 25%, tối đa 6).
**Thẻ FSRS chính thức không bị đụng tới.** Câu luyện thêm vẫn là luyện bổ sung (không đổi lịch ôn). Không đổi database, không thêm migration.

## 1. Quy tắc mới
1. **Chỉ nâng trần khi có bằng chứng.** Phải có ít nhất 1 kỹ năng tụt lại *đáng tin* (đủ ≥ 30 lượt, đã trừ đoán mò, thấp hơn mức giữa của các kỹ năng khác — cùng công thức màn Phân tích), **luyện được ngay**, và buổi có ≥ 4 thẻ chính thức. Không có bằng chứng → giữ trần cũ 25% / ≤ 6 và chạy **y như V127**.
2. **Luyện được ngay** nghĩa là: không phải *Nhận diện* (máy chủ chưa có đường lấy từ cho kỹ năng này), và *Nghe* chỉ khi máy có giọng đọc tiếng Trung.
3. **Chia chỗ:** số chỗ luyện thêm = trần − câu thăm dò tự gõ (V127, tối đa 2). Trong đó **tối đa 60%** dành cho kỹ năng tụt lại (có 2 kỹ năng thì chia theo độ tụt, mỗi kỹ năng ≥ 1); phần còn lại vẫn là "từ hay sai" như V127. Thiếu từ cho kỹ năng nào thì chỗ đó **nhường lại** cho "từ hay sai", không để trống.
4. **Chọn từ:** từ đã ôn mà kỹ năng đó yếu trước, rồi đến từ chưa đủ dữ liệu kỹ năng đó (dùng lại đường `practice-words` có sẵn). Không trùng từ, không chen từ đã có trong buổi, không chen từ đã trả lời đúng hôm nay.
5. **Xen kẽ** câu theo kế hoạch với "từ hay sai" để không dồn một loại vào nửa đầu buổi. Câu luyện thêm chỉ xen *giữa* các thẻ chính thức, không chen lên trước thẻ đầu, thẻ chính thức giữ nguyên thứ tự và số lượng.

Ví dụ khi có kỹ năng tụt lại (số câu luyện thêm tối đa): 8 thẻ: 2 → **3** · 10 thẻ: 2 → **4** · 20 thẻ: 5 → **8** (5 câu Nghe + 3 từ hay sai) · 25 thẻ trở lên: 6 → **10**.

## 2. Người học sẽ thấy gì
- **Trong câu hỏi:** câu luyện thêm theo kế hoạch ghi lý do, ví dụ *"Kỹ năng Nghe của bạn đang thấp hơn các kỹ năng khác (theo phần Phân tích năng lực), nên câu này được thêm vào để luyện (luyện bổ sung, không đổi lịch ôn)."* Chỉ ghi khi câu dựng được đúng kỹ năng đó.
- **Màn bắt đầu:** *"Luyện thêm theo kế hoạch: Nghe 5 câu"* (số THẬT trong hàng đợi) hoặc *"Hôm nay chưa thêm câu luyện thêm riêng cho kỹ năng này."*
- **Màn Phân tích:** nêu quy tắc trần (40% / ≤ 10; khi chưa có kỹ năng tụt lại: 25% / ≤ 6). Nếu kỹ năng tụt lại là Nhận diện thì nói thật: chưa có câu luyện thêm riêng.

## 3. Thay đổi so với giai đoạn 1
| File | Thay đổi |
|---|---|
| `js/training-plan.js` | Thêm `actionable`, `extraCap`, `allocate` (thuần) và các hằng số trần; thêm dòng giải thích ở `describe`. |
| `js/review.js` | Thêm `rvFetchSkillWords`, `rvPlanPriorities`; `rvAddExtras` dùng kế hoạch (trần, chia chỗ, xen kẽ); lý do trong `rvBuildQuestionFor`; màn bắt đầu đếm câu theo kế hoạch. Câu theo kế hoạch gắn `fromPlan: true`. |
| `test/v128-phase2-extras.test.js` (mới) | 26 test. |
| `test/v128-training-plan.test.js` | Điều chỉnh 1 test ranh giới: nay cho phép `rvAddExtras` / `rvPlanPriorities` dùng kế hoạch; các hàm còn lại (`rvBuildQuestionFor` trừ phần lý do, `rvAdvanceQueue`, `rvRecordAnswer`, `rvFetchFreshSession`…) vẫn bị cấm. |
| `test/adaptive-session.test.js`, `test/v127-client-isolation.test.js` | **Mỗi file đổi đúng 1 dòng**: thêm tên 2 hàm mới (`rvFetchSkillWords`, `rvPlanPriorities`) vào danh sách hàm được trích ra để chạy. Hai test này trích từng hàm theo tên nên thiếu hàm phụ thì `rvAddExtras` báo `ReferenceError`. **Không đổi nội dung kiểm tra nào.** |
| `package.json` | Script `test:v128-p2`, nối vào `test:v110`. |

Không đổi: `api/index.js` (so với giai đoạn 1), `lib/**`, `js/question-selector.js`, `js/question-engine.js`, `js/skill-score.js`, `js/study-queue.js`, `migrations/` — các file FSRS/DB/bộ chọn giống hệt V127 từng byte (đã so sánh bằng sha256).

## 4. Kiểm thử đã chạy (Node v22, không có database / ts-fsrs)
- **Test mới `v128-phase2-extras`: 26/26 đạt.** `rvAddExtras` được nạp **nguyên** trong `vm` với máy chủ giả. Gồm: bảng trần theo cỡ buổi; 400 ca ngẫu nhiên cho `extraCap`/`allocate` (không thấp hơn trần cũ, không quá 10, không tăng khi thiếu bằng chứng); đúng hạn mức từng kỹ năng; hai kỹ năng; không có giọng đọc; Nhận diện; ứng viên rỗng/lỗi mạng/trùng; câu thăm dò ≤ 2; thẻ chính thức không đổi thứ tự; lý do trong câu hỏi; màn bắt đầu và màn Phân tích.
- **Tương đương V127 khi không có bằng chứng (A/B):** chạy `rvAddExtras` của V127 gốc và V128 song song trên 600 người học ngẫu nhiên; ở **268/268 ca không có kỹ năng ưu tiên luyện thêm được, kết quả giống hệt** (cùng danh sách, cùng thứ tự, cùng các lần gọi máy chủ). 332 ca còn lại có kỹ năng ưu tiên — đó là phần được phép khác.
- **Hồi quy:** toàn bộ 39 file test cũ cho kết quả **giống hệt V127** (sau khi sửa 2 dòng nêu ở §3). Tổng số test đạt: 706 → 765, lỗi 0.
- **Kiểm tra đột biến:** phá cố ý 13 chỗ trên bản sao (nâng trần khi không có bằng chứng, bỏ chặn từ đã đúng hôm nay, bỏ chống trùng, đổi 40% → 50%, mở Nhận diện, bỏ giới hạn 60%, đổi `weakOnly`, biến câu theo kế hoạch thành thẻ chính thức, bỏ lý do, bỏ xen kẽ, bỏ kiểm tra giọng đọc, nâng trần quá 10, thêm lời gọi FSRS) → **bắt được cả 13**. (Lần đầu lọt 1: "bỏ chống trùng" vì dữ liệu giả không có từ trùng → đã thêm test từ trùng rồi chạy lại: bắt được.)
- Lần chạy đầu có 2 test của tôi lỗi do **dữ liệu giả** (từ ứng viên trùng thẻ chính thức), không phải lỗi mã; đã sửa dữ liệu test.

## 5. Chưa thể xác minh / lưu ý
1. **Chưa chạy trên Postgres thật và trình duyệt/điện thoại thật.** Đường `practice-words` theo kỹ năng là route có sẵn (không đổi), nhưng chưa thử với dữ liệu thật của bạn.
2. **Buổi học dài hơn:** khi có kỹ năng tụt lại, buổi 20 thẻ thêm 3 câu so với V127 (5 → 8); buổi ≥ 25 thẻ thêm tới 4 câu (6 → 10). Màn bắt đầu hiển thị số ước tính mới.
3. **Số liệu kỹ năng sẽ đổi nhanh hơn:** câu luyện thêm được ghi là bằng chứng kỹ năng (như V127), nên luyện nhiều hơn ở kỹ năng yếu thì kết luận "tụt lại" có thể mất đi sau vài buổi — đó là kết quả mong muốn, nhưng cần theo dõi.
4. **Chưa làm (giai đoạn 3 và 4):** chưa giảm câu còn lại khi làm tốt giữa buổi hoặc không dồn thêm khi sai liên tục (số liệu người học vẫn lấy **một lần** đầu buổi); chưa luyện thêm riêng cho **Nhận diện**.
5. Nếu kỹ năng đích là *Từ trong câu* mà từ đó chưa có câu ví dụ, bộ dựng câu sẽ rơi về dạng khác (như V127); câu đó vẫn được tính là luyện thêm nhưng không ghi lý do (vì không đúng kỹ năng).
6. 3 test FSRS không chạy được trong môi trường này (giống V127); các test `*.integration` cần database tự bỏ qua. Báo cáo này **không** khẳng định "FSRS chạy đúng", chỉ khẳng định các file FSRS giống hệt V127.

## 6. Hoàn tác
Xoá khối `planPri`/`alloc`/vòng lặp `planSkills.forEach` và dòng `const cap = planPri.length ? … : baseCap` trong `rvAddExtras` (đặt lại `const cap = baseCap`) → quay về hành vi V127. Không đổi dữ liệu nào.
