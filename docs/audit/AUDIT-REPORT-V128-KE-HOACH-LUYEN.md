# AUDIT-REPORT-V128 — Kế hoạch ưu tiên theo năng lực (giai đoạn 1)

> **Lưu ý:** đây là báo cáo **giai đoạn 1** (chỉ hiển thị). Trạng thái mới nhất, gồm cả giai đoạn 2, xem `AUDIT-REPORT-V128-GIAI-DOAN-2.md`. Các mục §4–§5 dưới đây mô tả đúng thời điểm hết giai đoạn 1 (lúc đó `rvAddExtras` chưa đổi).

Phạm vi: nối **"Hôm nay học"** với **"Phân tích năng lực"** bằng một công thức dùng chung. **Giai đoạn 1 chỉ HIỂN THỊ**:
không đổi câu hỏi, không đổi số câu, không đổi lịch ôn. **FSRS không bị sửa.** Không đổi cấu trúc database, không thêm migration.

## 1. Vì sao có thay đổi này
Trong V127, phân tích năng lực chỉ "nghiêng" việc chọn *dạng* câu cho thẻ FSRS. Người học không thấy được vì sao hôm nay nghiêng về
kỹ năng nào, và màn Phân tích không cho thấy đúng số liệu mà "Hôm nay học" đang dùng. Giai đoạn 1 đặt nền: **một công thức duy nhất**
đọc năng lực của người học, hai màn cùng hiển thị kết quả của công thức đó. Các giai đoạn sau (xem §7) mới dùng nó để tăng số câu luyện.

## 2. Thay đổi
| File | Thay đổi |
|---|---|
| `js/training-plan.js` (**mới**) | Module thuần `TP`: `TP.build(learner)` và `TP.describe(plan)`. Phép tính "kỹ năng nào tụt lại" **gọi thẳng `QS.learnerSkill` / `QS.learnerGap`** của bộ chọn câu hỏi → kết luận trên màn hình luôn trùng kết luận bộ chọn đang dùng (cùng ngưỡng, cùng cách trừ đoán mò). |
| `js/review.js` | Thêm `rvPlanHtml()` và đặt 1 dòng `${rvPlanHtml()}` vào màn bắt đầu (`rvStartHtml`). Có `try/catch` và kiểm tra `typeof TP` → lỗi/thiếu module chỉ làm khối này không hiện. |
| `js/skills-analysis.js` | Thêm `saRenderPlan()`, tải số liệu `learner` (lỗi riêng lẻ không làm mất các khối khác), xoá khi đổi tài khoản. |
| `js/skills-ui.js` | Đặt khối kế hoạch lên **đầu** màn Phân tích (chuỗi render cũ giữ nguyên thứ tự phía sau). |
| `api/index.js` | Route mới **chỉ đọc** `GET /api/skills/learner`: cùng nguồn (`getTypeBreakdown`), cùng 2 cửa sổ (90 và 14 ngày) và cùng `learnerCounts` như `/api/study/session?adaptive=1`. |
| `index.html` | Nạp `training-plan.js` sau `question-selector.js`, trước `review.js`. |
| `package.json` | Script `test:v128`, nối vào `test:v110`. |
| `test/v128-training-plan.test.js` (**mới**) | 33 test (xem §5). |

## 3. Người học sẽ thấy gì
- **Màn bắt đầu "Hôm nay học"** (dưới các ô số liệu), ví dụ khi Nghe tụt lại:
  *"Theo phân tích năng lực, kỹ năng nên ưu tiên hôm nay: Nghe: 33% — thấp hơn mức giữa của các kỹ năng khác (72%) khoảng 38 điểm %. Bộ chọn câu hỏi sẽ nghiêng về các dạng câu của kỹ năng này (số thẻ ôn vẫn do FSRS quyết định)."*
- Nếu có câu thăm dò tự gõ trong buổi (V127), nêu **đúng số câu thật** trong hàng đợi.
- **Màn Phân tích năng lực**: khối "🎯 Kế hoạch ưu tiên hôm nay" ở đầu, liệt kê đủ 5 kỹ năng (mức đã trừ đoán mò, tụt lại bao nhiêu điểm, hoặc "chưa đủ để so sánh (n/30 lượt)").
- Thiếu dữ liệu: nói thật "Chưa đủ dữ liệu để biết kỹ năng nào cần ưu tiên" và cần bao nhiêu lượt; **không bịa** kỹ năng yếu. Chỉ có 1 kỹ năng đủ mẫu: nói rõ chưa có gì để so sánh.

## 4. Không đổi (so sánh từng byte với V127)
`lib/fsrs.js`, `lib/fsrs-auto-rating.js`, `lib/fsrs/scheduler.js`, `lib/fsrs/optimizer.js`, `lib/fsrs/analytics.js`, `lib/fsrs/reviewService.js`,
`lib/db.js`, `lib/skill-store.js`, `lib/skill-pooled.js`, `lib/skills.js`, `js/question-selector.js`, `js/question-engine.js`, `js/skill-score.js`,
`js/study-queue.js`, toàn bộ `migrations/`. Test tĩnh kiểm: các file này không chứa `TP`; trong `review.js`, `TP` chỉ nằm trong phần hiển thị
(không có trong `rvBuildQuestionFor`, `rvAddExtras`, `rvAdvanceQueue`, `rvRecordAnswer`, `rvFetchFreshSession`).

## 5. Kiểm thử đã chạy (Node v22, không có database / ts-fsrs)
- **Test mới `v128-training-plan`: 33/33 đạt.** Gồm: công thức (thiếu mẫu → không kết luận; ngưỡng 29/30 lượt; 1 kỹ năng đứng một mình; tối đa 2 ưu tiên; dữ liệu hỏng không văng lỗi); **400 người học ngẫu nhiên: kết luận trùng `QS.learnerGap` 100%**; màn bắt đầu và màn Phân tích (nạp nguyên file vào `vm`); thoát HTML; lỗi tải phụ không làm mất khối khác; route chỉ đọc và cùng cửa sổ với phiên học; ranh giới "chỉ hiển thị".
- **Hồi quy: chạy toàn bộ 39 file test cũ trên V127 gốc và V128 — kết quả giống hệt nhau từng file** (số đạt/không đạt và mã thoát). Ví dụ: `adaptive-session` 39, `v127-adaptive-learner` 26, `v127-fsrs-isolation` 9, `v115-features` 55, `skills` 50 (`/tmp/orig` trỏ tới V127), `review-render.smoke` 15, `v110-ui.smoke` 44…
- **Kiểm tra đột biến:** phá cố ý 7 chỗ trên bản sao (bỏ so sánh `learnerGap`; bỏ gắn khối vào màn bắt đầu; đổi cửa sổ route 14→7 ngày; cho `rvAddExtras` gọi `TP`; cho bộ chọn dùng `TP`; cho route ghi dữ liệu; bỏ `escapeHtml`) → test mới **bắt được cả 7**. (Lần đầu chỉ bắt được 6/7; lỗi "bỏ thoát HTML" lọt vì khi đó chưa có test cho phần này → đã bổ sung 2 test thoát HTML rồi chạy lại: bắt được.)

## 6. Chưa thể xác minh / còn tồn tại
1. **Route `/api/skills/learner` chưa chạy trên Postgres thật.** Nó chỉ gọi lại `getTypeBreakdown` (truy vấn đã chạy ở màn Phân tích) 2 lần; chỉ kiểm tra tĩnh. Nếu lỗi, màn Phân tích chỉ mất khối kế hoạch (có test).
2. **Chưa nhìn bằng mắt trên trình duyệt/điện thoại thật.** Giao diện được kiểm bằng `vm` (HTML đúng, thoát ký tự), chưa kiểm bố cục, cỡ chữ, khoảng cách.
3. **Không chạy được ở đây (giống hệt trên V127):** `fsrs.test`, `fsrs-optimizer.test`, `fsrs-optimizer.binding.smoke` (thiếu thư viện `ts-fsrs`/optimizer). Các test `*.integration` cần database nên tự bỏ qua (thoát 0 nhưng **không** có nghĩa đã chạy). Vì vậy **không** khẳng định "FSRS chạy đúng" từ báo cáo này — chỉ khẳng định các file FSRS giống hệt V127.
4. **Giai đoạn 1 chưa tăng số câu luyện.** "Nghiêng về kỹ năng ưu tiên" vẫn là cơ chế cũ của V127 (điểm cộng có trần 0,9). Câu luyện thêm vẫn tối đa 1/4 số thẻ và không quá 6 câu; kỹ năng Nhận diện vẫn chưa được chọn để luyện thêm (máy chủ loại ra); số liệu người học vẫn lấy một lần đầu buổi. Đây là việc của các giai đoạn sau.
5. Ngưỡng (`learnerGapMinN` 30, `learnerGapMin` 0,15) là của V127, chưa chỉnh theo dữ liệu thật.
6. Người mới sẽ thấy dòng "Chưa đủ dữ liệu…" mỗi ngày cho đến khi có đủ lượt. Nếu thấy phiền, có thể thu gọn thành 1 dòng ở màn bắt đầu.

## 7. Các giai đoạn tiếp theo (mỗi giai đoạn dừng để duyệt)
2. "Hôm nay học" dùng kế hoạch để chọn từ và **số câu luyện thêm** theo kỹ năng; trần đề xuất 40% số thẻ, tối đa 10 câu (hiện 25% / 6) — **cần chủ dự án chốt**.
3. Cập nhật số liệu người học ngay trong buổi (làm tốt giữa buổi → giảm câu còn lại; sai liên tục → không dồn thêm).
4. Cho phép luyện thêm kỹ năng Nhận diện (sửa nhỏ phần chọn từ ở máy chủ, chỉ đọc).

## 8. Triển khai và hoàn tác
- Triển khai bình thường. Client mới + server cũ: màn bắt đầu vẫn có kế hoạch; màn Phân tích chỉ thiếu khối kế hoạch (lỗi tải bị bắt riêng). Client cũ + server mới: route mới không ai gọi.
- Hoàn tác: xoá dòng `${rvPlanHtml()}` trong `rvStartHtml` và chữ `saRenderPlan() + ` trong `renderSkills` → app về đúng như V127 (không đổi dữ liệu nào).
