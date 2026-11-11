# AUDIT-REPORT-V146 — "Hôm nay học" nhận thiếu thẻ so với dashboard

Phạm vi: chọn thẻ cho phiên học (`lib/fsrs/reviewService.js`, `lib/db.js`, `js/review.js`, `js/study-queue.js`, `js/lesson.js`).
**Không** đổi thuật toán FSRS (`lib/fsrs.js`, `ts-fsrs`), lịch ôn đã lưu, schema DB, API.

## 1. Triệu chứng
Dashboard "Hôm nay học" báo `Cần ôn 50 · Từ mới 10`, bấm "Bắt đầu học" chỉ có ~6 thẻ.

## 2. Nguyên nhân (đo trên mã nguồn, mô phỏng đúng công thức)
| # | Nguyên nhân | Vị trí cũ | Tác động |
|---|---|---|---|
| 1 | Trần số thẻ mỗi buổi mặc định **6** cắt danh sách server trả về | `js/review.js` `rvSentenceCount()` + `startStudySession` | 50+10 → 5 ôn + 1 mới. Nguyên nhân chính |
| 2 | `blockedByBacklog` so **tổng thẻ đến hạn toàn tài khoản** với số slot ôn (gồm thẻ bài khác, thẻ mồ côi) | `getDailyBudget` | Chọn 1 bài (30 thẻ) nhưng bài khác còn 100 → khoá từ mới; không có cách tự dọn vì thẻ bài khác không hiện trong phạm vi |
| 3 | Cooldown 4 giờ cho MỌI thẻ + `sessionKnownHz` khoá hz trả lời đúng đến hết ngày | `REVIEW_COOLDOWN_CLAUSE`, `rvDedupeSession`, `sqLoad` | Thẻ vừa học/vừa sai (Learning/Relearning) không quay lại trong ngày dù dashboard vẫn đếm → lệch số; vô hiệu bước học ngắn hạn |
| 4 | SQL `LIMIT` đúng số slot rồi mới khử trùng hz; `reviewCount/newCount` đếm trước khi khử trùng | `getStudySession` | Mỗi hz trùng làm phiên hụt 1 thẻ; số đếm không khớp `session` |

## 3. Sửa
1. `rvSentenceCountSetting()` trả `'all'` (mặc định) hoặc 0–15; `rvSentenceCount()` trả `Infinity` khi `'all'`. Khoá mới `rvSessionCardsV2`; khoá cũ `rvSessionCards` chỉ được giữ khi là lựa chọn rõ ràng khác 6 (6 từng là mặc định). Ô chọn đổi nhãn "Số thẻ tối đa mỗi buổi học"; dashboard hiện dòng "Mỗi buổi chỉ lấy tối đa N thẻ" khi trần đang cắt bớt.
2. `getDailyBudget(userId, ui, scopeLessons)` đếm backlog theo phạm vi (`countDueFsrsCards(userId, scopeLessons)`), trả thêm `dueInScope`; `getTodayOverview` dùng lại (bớt 1 truy vấn). Thông báo "từ mới đang tạm khoá" nói đúng phạm vi.
3. `REVIEW_COOLDOWN_CLAUSE`: `CASE WHEN f.state IN (1, 3) THEN interval '15 minutes' ELSE interval '4 hours' END`. `rvIsLearningDue()` + `sqLoad` cho thẻ state 1/3 do server trả về bỏ qua `sessionKnownHz`.
4. `getStudySession`: lấy `n + min(n, 20)` dòng, `takeUnique()` khử trùng hz (thẻ ôn thắng từ mới trùng) rồi cắt đúng slot; `reviewCount/newCount` lấy sau khi khử trùng.

## 4. Kiểm thử
| Lệnh | Kết quả |
|---|---|
| `npm run test:v146` (mới, 15 test) | 15/15 qua; trên bản V145: 3 qua / 12 FAIL (3 qua là hành vi cần giữ nguyên) |
| Test cũ cập nhật | `v115-features` (mặc định `'all'`, khoá cũ), `v138-sentence` (trích `rvSentenceCountSetting`) |

## 5. Tồn tại / chưa kiểm chứng
- **Chưa chạy với Postgres thật**: cú pháp `now() - CASE … END` hợp lệ trong PostgreSQL nhưng chưa thử trên Neon.
- **Chưa thử trên trình duyệt thật**: phiên 60 thẻ dài hơn nhiều so với 6 thẻ — nếu quá dài, người học đặt trần 10/15 trong Cài đặt hằng ngày.
- `sessionKnownHz` dùng ngày theo giờ trình duyệt còn server dùng giờ Việt Nam; lệch chỉ xảy ra khi trình duyệt ở múi giờ khác (không đổi trong V146).
- Cooldown 15 phút cho thẻ state 1/3: nếu muốn thẻ sai quay lại sớm hơn trong cùng buổi, chỉnh `LEARNING_COOLDOWN_MINUTES` ở `lib/db.js`.
