# AUDIT-REPORT-V128 — Giai đoạn 3: thích ứng ngay trong buổi học

Phạm vi: trong lúc học, "Hôm nay học" **cập nhật số liệu năng lực của người học** sau mỗi câu và **bớt các câu luyện thêm theo kế hoạch chưa hỏi**
khi bạn làm tốt, hoặc **không dồn thêm** khi bạn sai liên tiếp. Đây là giai đoạn cuối của kế hoạch 4 giai đoạn.
**Thẻ FSRS chính thức, "từ hay sai", câu thăm dò tự gõ và câu hỏi lại sau khi sai không bao giờ bị bớt.** Không đổi máy chủ, database, migration.

## 1. Quy tắc (chỉ áp dụng cho câu luyện thêm THEO KẾ HOẠCH chưa hỏi)
| Tình huống | Hành động |
|---|---|
| **Làm tốt:** 3 câu theo kế hoạch gần nhất của cùng một kỹ năng đều đúng (không dùng gợi ý) | Bớt các câu theo kế hoạch còn lại của kỹ năng đó |
| **Hết tụt lại:** ≥ 2 câu theo kế hoạch của kỹ năng, câu gần nhất đúng, và Phân tích (số liệu vừa cập nhật) không còn coi kỹ năng đó là tụt lại | Bớt các câu theo kế hoạch còn lại của kỹ năng đó |
| **Không dồn thêm:** 3 câu theo kế hoạch gần nhất của kỹ năng đều sai | Bỏ các câu theo kế hoạch chưa hỏi của kỹ năng đó (câu hỏi lại sau khi sai vẫn giữ để sửa lỗi) |
| **Mệt:** 4 câu "bằng chứng" gần nhất (mọi loại câu) đều sai | Bỏ tất cả câu theo kế hoạch chưa hỏi, mọi kỹ năng |

"Bằng chứng" = cùng điều kiện với hồ sơ từng từ: không tính câu kiểm tra, luyện lại sau khi sai, và lượt đầu sau màn giới thiệu từ mới.
Mỗi kỹ năng được xét riêng: Nghe làm tốt chỉ bớt câu Nghe, câu Pinyin theo kế hoạch vẫn còn.

## 2. Người học sẽ thấy gì
- Một dòng 🔔 trên câu kế tiếp, ví dụ *"Bạn đã làm tốt kỹ năng Nghe ở các câu luyện thêm nên mình bớt 2 câu luyện thêm còn lại của kỹ năng này."* hoặc *"Kỹ năng Pinyin đang khó với bạn trong buổi này nên mình không dồn thêm: bỏ 2 câu luyện thêm còn lại của kỹ năng này (thẻ ôn chính thức vẫn như cũ)."* Dòng này chỉ hiện trong lúc làm câu kế tiếp, được thoát HTML, không lưu sang buổi khác.
- Bộ chọn dạng câu hỏi thấy số liệu năng lực **vừa cập nhật** trong chính buổi này (làm tốt Nghe thì bớt nghiêng về Nghe).

## 3. Thay đổi
| File | Thay đổi |
|---|---|
| `js/training-plan.js` | Thêm `applyAnswer` (cập nhật số đếm cấp người học, **cùng cách đếm của server**), `adaptExtras` (quy tắc ở §1, thuần), `describeAdapt` (câu thông báo). |
| `js/review.js` | `rvRecordAnswer`: cập nhật số liệu người học trong nhánh "là bằng chứng" và ghi cờ `plan` vào nhật ký; thêm `rvAdaptExtras` gọi trong `rvAdvanceQueue` **trước** khi kiểm tra hết hàng đợi và **trước** khi lưu phiên; hiển thị 🔔; xoá thông báo ở lần chuyển câu sau và ở các điểm khởi tạo phiên. |
| `test/v128-phase3-adapt.test.js` (mới) | 37 test. |
| `test/v128-training-plan.test.js` | Điều chỉnh 1 test ranh giới: nay cho phép `rvRecordAnswer`/`rvAdaptExtras` dùng `TP` (chỉ `applyAnswer`/`adaptExtras`/`describeAdapt`); các hàm còn lại vẫn bị cấm. |
| `test/adaptive-session.test.js` | Thêm tên `rvAdaptExtras` vào danh sách hàm được trích ra (**+1 dòng, không đổi nội dung kiểm tra nào**; cùng lý do như giai đoạn 2). |
| `package.json` | Script `test:v128-p3`, nối vào `test:v110`. |

Không đổi: `api/index.js` (so với giai đoạn 4), `lib/**`, `js/question-selector.js`, `js/question-engine.js`, `js/skill-score.js`, `js/study-queue.js`, `migrations/` — giống hệt V127 từng byte (sha256), trừ `api/index.js` đã đổi ở giai đoạn 1 và 4.

## 4. Kiểm thử đã chạy (Node v22, không có database / ts-fsrs)
- **Test mới `v128-phase3-adapt`: 37/37 đạt.** Gồm: `applyAnswer` **khớp `lib/skill-pooled.learnerCounts` của server trên 300 chuỗi ngẫu nhiên** với mọi dạng câu của app (23 mã bài tập của client đều khớp bảng của server về kỹ năng và kiểu trắc nghiệm/tự gõ); bất biến (không sửa đối tượng cũ); từng quy tắc ở §1 và các biên (2 câu chưa đủ, đúng nhờ gợi ý không tính, redo/check/giới thiệu không tính); **400 ca ngẫu nhiên: không bao giờ bớt thẻ chính thức / từ hay sai / thăm dò / câu hỏi lại, không sửa hàng đợi hay nhật ký, lặp lại thì không còn gì để bớt**; khôi phục phiên giữa chừng (qua JSON) cho cùng quyết định; buổi học giả chạy **nguyên `review.js`**: bớt đúng chỗ, bản lưu phiên đã bớt, 200 buổi ngẫu nhiên thẻ chính thức luôn được hỏi đủ, hàng đợi trống thì buổi kết thúc đúng cách; thiếu/hỏng module thì chạy như V127.
- **So sánh buổi học giả V127 và V128 (A/B), 300 buổi không có câu theo kế hoạch:** hàng đợi từng bước, bản lưu phiên, tiến độ và nhật ký (từ nào, đúng/sai, nguồn, chính thức) **giống hệt 300/300**. Người học không có số liệu: giống hệt toàn bộ 150/150. Người học có số liệu: 11/150 buổi khác ở **dạng/kỹ năng câu hỏi được chọn** — đúng chủ đích, vì bộ chọn nay thấy số liệu vừa cập nhật.
- **Hồi quy:** 39 file test cũ giống hệt V127; tổng test đạt 706 → 821, lỗi 0. Hai A/B cũ (đường lấy từ 504 tổ hợp; luyện thêm 203 ca) vẫn giống hệt.
- **Kiểm tra đột biến:** phá cố ý 18 chỗ (ngưỡng 3 → 2; coi đúng nhờ gợi ý là tốt; bớt cả câu hỏi lại; bớt cả câu thường; coi redo là bằng chứng; ngưỡng mệt 4 → 3; đảo trắc nghiệm/tự gõ; sửa đối tượng cũ; bớt sau khi lưu phiên; không xoá thông báo; cập nhật cả với redo; bỏ chốt phiên luyện lại; sửa hàng đợi trong hàm thuần; bỏ kiểm tra "hết tụt lại"; không thoát HTML; thiếu cờ `plan`; bớt nhầm kỹ năng khác; tự dựng số liệu cho người mới) → **bắt được cả 18**.

## 5. Chưa thể xác minh / lưu ý
1. **Chưa thử trên trình duyệt/điện thoại thật** (bố cục dòng 🔔, cảm giác khi câu bị bớt giữa chừng). Giai đoạn này không đổi máy chủ nên không có phần chạy trên Postgres mới.
2. **Ngưỡng 3 câu đúng/sai liên tiếp, 4 câu sai liên tiếp là ước lượng, chưa chỉnh theo dữ liệu thật.** Quy tắc "mệt" tính mọi câu bằng chứng, kể cả thẻ từ mới (sai từ mới vốn hay xảy ra) nên có thể bỏ câu luyện thêm sớm hơn cần thiết; hậu quả chỉ là buổi học nhẹ hơn.
3. Giai đoạn này **chỉ bớt, không thêm** câu giữa buổi; màn Tổng kết chưa nêu việc đã bớt câu nào (chỉ có dòng 🔔 lúc đang học).
4. Số liệu người học cập nhật chỉ ở trình duyệt trong buổi này; buổi mới lấy lại số liệu từ máy chủ (máy chủ tự ghi và tính lại từng câu). Buổi khôi phục sau khi tải lại trang dùng bản lưu đã gồm các cập nhật đó.
5. Với người mới chưa có số liệu (`null`), số liệu **không** được tự dựng từ 1 buổi: bộ chọn và quy tắc "hết tụt lại" chạy như V127 (các quy tắc dựa trên chuỗi đúng/sai vẫn hoạt động nếu có câu theo kế hoạch).
6. 3 test FSRS không chạy được trong môi trường này (giống V127); các test `*.integration` cần database tự bỏ qua. Báo cáo **không** khẳng định "FSRS chạy đúng", chỉ khẳng định các file FSRS giống hệt V127.

## 6. Hoàn tác
Dùng lại gói giai đoạn 4 (`hoc-tu-vung-v128-giai-doan-4.zip`). Không đổi dữ liệu nào.
