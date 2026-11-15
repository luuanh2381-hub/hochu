# BÁO CÁO KIỂM TOÁN ĐỘC LẬP — V127 (trắc nghiệm thích ứng theo năng lực người học)

Ngày: 29/10/2026. Đối tượng: bản `hoc-tu-vung-v127-hoan-chinh-1.zip` + `v127-thay-doi-1.patch`.
Phương pháp: dựng lại V126 bằng cách đảo patch (khớp sạch với zip), chạy toàn bộ test trên cả hai bản, viết thêm test so sánh dữ liệu trước/sau, thử phá mã có chủ đích để kiểm tra chính các test.

## 0. Giới hạn của môi trường kiểm thử (đọc trước)

- **Không có PostgreSQL thật.** DB trong test là giả lập trong bộ nhớ, ghi lại và phân loại mọi câu SQL do mã thật phát ra. Câu SQL **không** được Postgres thật chạy.
- **Không có `ts-fsrs`** (không có mạng). Thuật toán lập lịch FSRS **không** chạy ở đây. 3 test gốc cần thư viện này fail y hệt ở V126 và V127.
- Không có trình duyệt/điện thoại thật; không nạp được `api/index.js` (thiếu `express`).
- Vì vậy kết luận về FSRS bên dưới chỉ là: **"luyện bổ sung và phiên adaptive không GHI vào dữ liệu FSRS"** trong phạm vi đã mô phỏng. **Không** phải "toán FSRS đúng" và **không** phải "đã chạy trên DB thật".

## 1. Tóm tắt

| Nhóm | Kết quả |
|---|---|
| A. FSRS không bị đổi bởi luyện bổ sung / phiên adaptive | **Đạt** (trong phạm vi mô phỏng ở mục 0) |
| B. Trắc nghiệm thích ứng (8 tình huống) | **Đạt sau khi sửa 1 lỗi** |
| C. Hồi quy | **Đạt** (36/39 file test; 3 file còn lại không chạy được vì thiếu `ts-fsrs`) |
| D. Chất lượng mã | **Đạt** (0 lỗi cú pháp / 108 file JS); 1 lỗi logic đã sửa; một số quan sát ở mục 5 |
| Chưa thể xác minh | SQL trên Postgres thật, toán `ts-fsrs`, giao diện thật, route `api/index.js`, hiệu năng thật (mục 6) |

## 2. LỖI TÌM THẤY

### Lỗi #1 — Người mới bị cộng điểm "thu thêm dữ liệu" đồng đều, làm lệch bộ chọn so với V126 — **ĐÃ SỬA**

- **File / vị trí:** `js/question-selector.js`, hàm `learnerBonus` (thêm hàm phụ `learnerHasContrast` ngay trước nó).
- **Hiện tượng:** với người học mới (hoặc lâu không học, không có dữ liệu trong 90 ngày), server gửi `learner = { v:1, skills:{} }`. Bộ chọn cộng +0,5 cho **mọi** câu trắc nghiệm nhưng không cộng cho câu tự gõ. Điểm cộng này không mang thông tin gì (mọi kỹ năng đều thiếu như nhau) mà chỉ làm câu tự gõ tụt hạng. Báo cáo V127 và test cũ khẳng định người mới cho cùng chuỗi câu hỏi như V126; điều đó chỉ đúng khi hồ sơ theo từ cũng trống.
- **Đo được (mô phỏng 150 buổi × 30 câu, hồ sơ từ đã vững; kho câu hỏi rút gọn: 3 dạng trắc nghiệm + tự gõ, chưa có nghe/điền từ):** `learner=null` so với `learner rỗng`: 145/150 buổi khác nhau; số câu tự gõ 2962 → 2762 (−6,8%).
- **Nguyên nhân:** `learnerBonus` cộng `learnerDataMax·(1 − n/20)` cho kỹ năng thiếu mẫu mà không kiểm tra có kỹ năng nào đủ mẫu để đối chứng hay không.
- **Cách khắc phục:** chỉ cộng khi có **ít nhất một** kỹ năng đã đủ mẫu (`n ≥ learnerMinN`); nếu không, trả 0 (chạy như V126).
- **Sau khi sửa:** cùng phép đo → 76/150 buổi khác nhau, câu tự gõ 2962 vs 2958. Phần còn lại là do quy tắc **cố ý** của V127 (không trừ điểm "đã vững" của recall khi chưa có bằng chứng tự gõ; mục 5.1). Khi tắt riêng quy tắc đó (thử trên bản sao), chênh lệch về 0/150.
- **Test hồi quy:** `test/v127-adaptive-audit.test.js` — 2 test (`learnerBonus = 0` khi không có đối chứng; 100 buổi null vs rỗng cho cùng chuỗi câu hỏi). Cả hai **không đạt** trên V127 gốc và **đạt** sau khi sửa.
- **Test cũ phải chỉnh:** `test/v127-adaptive-learner.test.js`, test "Thiếu mẫu…" từng khẳng định learner rỗng được cộng +0,5 (đúng điều bị sửa). Đã đổi để thêm 1 kỹ năng đối chứng và thêm khẳng định "rỗng → 0".

Không có lỗi nào khác được xác minh là do phần nâng cấp gây ra.

## 3. BẰNG CHỨNG THEO TỪNG NHÓM

### A. FSRS — so sánh dữ liệu trước/sau

`test/v127-fsrs-isolation.test.js` (9 ca) — mã thật `lib/skill-store.js` và `lib/fsrs/reviewService.js` chạy trên DB giả; băm SHA-256 các bảng `fsrs_cards`, `review_history`, `user_settings`, `vocab_words` trước và sau.

- **Đối chứng dương:** một lượt ôn chính thức giả (INSERT `review_history` + UPDATE `fsrs_cards`) làm hash **đổi** và bị ghi nhận vi phạm → bộ so sánh có khả năng phát hiện.
- **30 lượt luyện bổ sung** đủ loại (tự gõ đúng/sai, trắc nghiệm, nghe, câu; nguồn extra/check/redo/drill; trùng khoá; bỏ trống; nhãn FSRS bị từ chối; từ không tồn tại; khoá quá ngắn): hash FSRS không đổi; 0 câu ghi ngoài `skill_practice_log` và `word_skill_stats`.
- **Lỗi giữa chừng** (INSERT thống kê ném lỗi): ROLLBACK, FSRS nguyên vẹn, lỗi được ném ra.
- **`getStudySession` adaptive so với không adaptive** (cùng dữ liệu): danh sách thẻ, thứ tự, số lượng, và các trường `state/due/stability/difficulty/elapsed_days/scheduled_days/reps/lapses/last_review/version` giống hệt; chỉ thêm `learner` (cấp phiên) và `lastExerciseType` (cấp thẻ). Đúng 3 truy vấn thêm, đều là SELECT. Không ghi gì. Phần phụ lỗi → phiên vẫn trả bình thường.
- **Phía trình duyệt** — `test/v127-client-isolation.test.js` (14 ca), `fetch` giả ghi lại mọi lời gọi mạng: trả lời câu thăm dò tự gõ (đúng / sai / bỏ qua / nhiều lượt) chỉ tạo đúng 1 `POST /api/skills/practice`, **0** lời gọi `/api/study/review` hoặc `/api/study/review/preview`. Đối chứng dương: cùng câu tự gõ nhưng là thẻ chính thức thì thấy `/preview`.
- **Cổng tự gõ cho thẻ chính thức không bị đổi:** 600 hồ sơ ngẫu nhiên, tập dạng ứng viên giống hệt khi có / không có `learner`.
- **Kiểm tra chính các test (thử phá mã trên bản sao), 10 kiểu, đều bị bắt:** ghi `fsrs_cards` trong luyện bổ sung; ghi `review_history` trong phiên adaptive; đảo thứ tự thẻ; bỏ 1 thẻ; sửa `stability`; cho thăm dò đi đường FSRS; bỏ điểm cộng người học; bỏ phạt lặp dạng; bỏ kiểm tra trùng từ khi chọn thăm dò (phải siết lại test mới bắt được); bỏ kiểm tra dạng `learner`.
- **Nhận xét về test sẵn có:** mục [6] "Ranh giới FSRS" trong `v127-adaptive-learner.test.js` chỉ kiểm tra **chuỗi ký tự trong mã nguồn**, không so sánh dữ liệu. Vì vậy test ở trên được viết thêm.

### B. Trắc nghiệm thích ứng — `test/v127-adaptive-audit.test.js` (21 ca)

| Tình huống | Kết quả |
|---|---|
| Người mới chưa có dữ liệu | Đạt sau sửa lỗi #1; mọi buổi dựng được câu, 0 câu tự gõ, đủ 5 kỹ năng |
| Kỹ năng mạnh/yếu khác nhau | Đạt: recall tụt lại được hỏi nhiều hơn khi không có `learner`; test đặt ngưỡng trần trung bình ≤ 55%, buổi cao nhất ≤ 70%; điểm cộng chỉ cho câu trắc nghiệm, có trần |
| Một kỹ năng quá ít dữ liệu | Đạt: không kết luận "yếu", chỉ cộng nhỏ giảm dần theo số lượt; lời giải thích không nói "thấp hơn" |
| Sai liên tiếp | Đạt: luôn dựng được câu; liền kề cùng dạng chỉ có thể là hz2vi (dạng dễ); không ép tự gõ |
| Đúng liên tiếp | Đạt: 0 cặp liền kề cùng dạng, đủ 5 kỹ năng, không kỹ năng nào > 45% |
| Không còn câu hỏi phù hợp | Đạt: không ném lỗi; kho 2 từ vẫn có câu; kho 1 từ → null; dạng ép không dựng được → null (không hạ chuẩn âm thầm) |
| Nhiều câu trùng lặp | Đạt: cùng 1 từ hỏi 12 lần dùng ≥ 4 dạng; thăm dò không trùng từ yếu / thẻ chính thức / từ đã đúng hôm nay (`test/v127-client-isolation.test.js` mục C4) |
| Thiếu / hỏng dữ liệu phân tích | Đạt: 24 dạng `learner` hỏng không gây lỗi hay điểm không hữu hạn; phiên cũ thiếu `skillCount`; server `learnerCounts` bỏ hàng hỏng; client chấp nhận `learner` sai kiểu → null |

### C. Hồi quy

Chạy cả 39 file test: **36 đạt**. 3 file không chạy được (`fsrs.test.js`, `fsrs-optimizer.test.js`, `fsrs-optimizer.binding.smoke.test.js`) vì thiếu `ts-fsrs` — y hệt ở V126. Tổng số ca đếm được ở các file có dòng tổng: **706 đạt, 0 lỗi** (một số file chỉ báo đạt/không đạt theo mã thoát).
`skills.test.js` cần `/tmp/orig` trỏ tới bản V126 → dựng lại, **50/50 đạt**.
4 file test (`review-render.smoke`, `v110-ui.smoke`, `v115-features`, `v117-workspace`) fail trên V126 vì mock giả thiếu `lessonName` (hàm này có thật trong `js/ui.js`; `js/review.js` của V126 đã gọi nó từ V117). V127 chỉ thêm mock — xác minh bằng cách chạy V126 + test V126: fail đúng lỗi đó. Đây là sửa môi trường giả có từ trước, không phải lỗi do V127.
Các chức năng cũ liên quan được test bằng mã thật trong `vm`: "Hôm nay học" (v110-ui, adaptive-session, review-render), lưu kết quả/outbox (skills.test mục 5), tải dữ liệu phiên (client C5), thống kê (v115, v113, retention). **Không** có trình duyệt thật.

### D. Chất lượng mã

- `node --check` trên 108 file JS: 0 lỗi cú pháp.
- `api/index.js`: chỉ đổi 1 dòng (truyền `{ adaptive: req.query.adaptive === '1' }`), đúng với mô tả.
- `package.json`: chỉ thêm test vào `test:v127`.
- Async: `rvLoadExamples` nuốt mọi lỗi và không chặn phiên; các đường `await` nằm trong hàm `async`.
- Đã đọc toàn bộ diff của các file không phải test (`api/index.js`, `lib/skill-pooled.js`, `lib/skill-store.js`, `lib/fsrs/reviewService.js`, `js/question-selector.js`, `js/review.js`, `package.json`): không thấy thay đổi nằm ngoài phạm vi nâng cấp. 4 file test sửa chỉ ở phần mock (`lessonName`); các file test và tài liệu còn lại của patch (kể cả `AUDIT-REPORT-V127-ADAPTIVE-LEARNER.md`) mình chỉ chạy, không rà từng dòng.

## 4. Danh sách file thay đổi trong đợt kiểm toán (so với V127 gốc)

| File | Thay đổi |
|---|---|
| `js/question-selector.js` | **Sửa lỗi #1** (`learnerHasContrast` + điều kiện trong `learnerBonus`) |
| `test/v127-adaptive-learner.test.js` | Chỉnh 1 test theo bản sửa |
| `test/v127-adaptive-audit.test.js` | **Mới** — 21 ca (phần B) |
| `test/v127-fsrs-isolation.test.js` | **Mới** — 9 ca (phần A, server) |
| `test/v127-client-isolation.test.js` | **Mới** — 14 ca (phần A phía trình duyệt, C4–C6) |
| `package.json` | `test:v127` chạy thêm 3 test mới |
| `AUDIT-REPORT-V127-KIEM-TOAN-DOC-LAP.md` | **Mới** — báo cáo này |

## 5. Quan sát (không phải lỗi do nâng cấp; để bạn cân nhắc)

1. **`learner = null` khác `learner rỗng` một chút, có chủ ý:** khi có đối tượng `learner` (dù rỗng), điểm "đã vững" của recall không bị trừ nếu chưa có bằng chứng tự gõ. Đây là quy tắc đã ghi trong báo cáo V127 ("chọn đúng đáp án ≠ đã tự nhớ ra chữ"). Đã kiểm chứng đây là nguồn khác biệt còn lại sau khi sửa lỗi #1.
2. **Buổi ≥ 12 câu khác V126 khoảng 5–7% vị trí** do quy tắc cân bằng theo kỹ năng; buổi 4 câu giống hệt (0/200). Khớp với mô tả.
3. **Không dựng được câu hỏi nào cho một thẻ chính thức** (kho từ quá ít) → thẻ bị bỏ qua trong phiên, **không** gửi lượt ôn nào lên FSRS (thẻ vẫn đến hạn). Hành vi có từ trước V127 (`rvPrepareCurrentCard` không đổi).
4. *(suy ra từ đọc mã, chưa đo)* Câu thăm dò có thể ít xuất hiện nếu người học có nhiều từ recall yếu: server ưu tiên từ yếu trước rồi client lọc bỏ, trong khi chỉ lấy `limit` từ.
5. *(suy ra từ đọc mã, chưa đo)* `rvLoadExamples`: nếu 2 phiên bắt đầu sát nhau, phản hồi đến muộn có thể ghi đè kho ví dụ (ảnh hưởng tối đa là thiếu một số câu điền từ).
6. *(suy ra từ cấu hình, chưa đo)* Phiên adaptive mở tối đa 5 kết nối song song trong khi pool `max: 3` → chờ lượt, có thể chậm hơn chút. Không thấy nguy cơ deadlock: các hàm `ensure*` không mở kết nối lồng nhau.

## 6. CHƯA THỂ XÁC MINH

- Cú pháp và kết quả của 3 truy vấn SQL mới (`DISTINCT ON`, `= ANY($2::int[])`…) trên Postgres thật. Chỉ đối chiếu được tên cột/kiểu với migration (`word_id INT`, `TIMESTAMPTZ`, `exposure`, `exercise_type`) và mẫu `ANY($2::int[])` đã dùng ở các truy vấn cũ.
- Toán `ts-fsrs` và việc lập lịch thật (test gốc cần thư viện này).
- Route `api/index.js` chạy thật (thiếu `express`, không có DB).
- Giao diện thật trên trình duyệt/điện thoại, âm thanh thật.
- Hiệu năng/độ trễ thật của 3 truy vấn thêm trên Neon.
- Việc khôi phục phiên lưu từ V126 (`saved.extra.learner`) mới được kiểm gián tiếp, chưa có test riêng.

## 7. Cách chạy lại

```
npm run test:v127                 # 4 test V127 (cần Node ≥ 20, không cần DB/mạng)
node test/v127-fsrs-isolation.test.js
node test/v127-client-isolation.test.js
node test/v127-adaptive-audit.test.js
```
Test `skills.test.js` cần thư mục `/tmp/orig` chứa bản V126 (đường dẫn cố định trong test từ trước).
