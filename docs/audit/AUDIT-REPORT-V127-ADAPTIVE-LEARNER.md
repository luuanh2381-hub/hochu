# AUDIT-REPORT-V127 — Nối phân tích năng lực (cấp người học) vào việc chọn dạng câu hỏi

Phạm vi: màn "Hôm nay học". **FSRS không bị sửa.** Không đổi cấu trúc database, không thêm migration.

## 1. Vấn đề gốc (đã xác minh trong mã V126)
1. Bộ chọn dạng câu hỏi (`js/question-selector.js`) chỉ nhìn điểm của **(từ × kỹ năng)**, mỗi ô cần ≥ 3 lượt. Mỗi từ thường chỉ được hỏi ~1 lần/buổi nên phần lớn ô "chưa đủ dữ liệu" rất lâu → bộ chọn gần như chỉ xoay vòng cân bằng.
2. Số liệu **theo người học** (gộp mọi từ, trừ đoán mò, có khoảng tin cậy — `lib/skill-pooled.js`) đã có nhưng chỉ dùng để hiển thị ở màn phân tích.
3. Chọn đúng 1 trong 4 đáp án (nghĩa → chữ Hán) được tính cùng một ô `recall` với tự gõ chữ Hán, dù chỉ là bằng chứng **nhận diện**.
4. Cân bằng theo **dạng**, không theo **kỹ năng**: "Nghe" có 2 dạng nên chiếm ~35–39% thẻ khi chưa có dữ liệu.
5. Không có ghi nhớ giữa các ngày: cùng một từ có thể bị hỏi lại đúng dạng của lần trước.
6. Kho câu ví dụ (dạng "điền từ vào câu") chỉ được nạp khi tạo phiên **mới**; phiên "Học tiếp" và "Học lại từ đầu" đặt kho về rỗng rồi không nạp lại → thiếu câu điền từ.

## 2. Thay đổi
| File | Thay đổi |
|---|---|
| `lib/skill-pooled.js` | Hàm thuần `learnerCounts()`: gom số đếm theo (kỹ năng × trắc nghiệm/tự gõ × cửa sổ 90 ngày/14 ngày). Nhãn lạ bị bỏ qua. |
| `lib/skill-store.js` | Hàm **chỉ đọc** `getLastExerciseTypes()`: dạng câu hỏi gần nhất của từng từ (bỏ dòng `intro`). |
| `lib/fsrs/reviewService.js` | `getStudySession(userId, ui, opts)`: khi `opts.adaptive`, thêm field `learner` (cấp phiên) và `lastExerciseType` (cấp từng thẻ). Chỉ **thêm** field; field cũ giữ nguyên; lỗi ở phần phụ → bỏ qua. |
| `api/index.js` | `/api/study/session?adaptive=1` mới bật chế độ trên (4 tab luyện khác không xin nên không tốn thêm truy vấn). |
| `js/question-selector.js` | Số liệu cấp người học, luật nhận diện ≠ nhớ chủ động, cân bằng theo kỹ năng, chống lặp giữa ngày (chi tiết §3). |
| `js/review.js` | Nhận/lưu/khôi phục `learner`; truyền vào bộ chọn; câu thăm dò tự gõ (luyện bổ sung); nạp kho ví dụ ở cả "Học tiếp" và "Học lại từ đầu". |
| `package.json` | Script `test:v127` (và nối vào `test:v110`). |
| `test/…` | Mới: `v127-adaptive-learner.test.js`. Mở rộng: `adaptive-session.test.js`. Sửa môi trường giả (không sửa logic): 4 file thiếu hàm giả `lessonName`. |

**Không đổi (đã so sánh từng byte với V126):** `lib/fsrs.js`, `lib/fsrs-auto-rating.js`, `lib/fsrs/scheduler.js`, `lib/fsrs/optimizer.js`, `lib/fsrs/analytics.js`, `lib/db.js` (kể cả `reviewFsrsCard`), `lib/skills.js`, `js/question-engine.js`, `js/skill-score.js`, `js/study-queue.js`.

## 3. Cách chọn dạng câu hỏi sau nâng cấp
Điểm của dạng bài T cho từ w = điểm V126 (theo từ, FSRS, đa dạng trong buổi…) **cộng thêm**:
- **Kỹ năng tụt lại (cấp người học):** so kỹ năng với mức *giữa* của các kỹ năng khác của chính người học (cả hai phía ≥ 30 lượt, đã trừ đoán mò, chênh ≥ 15 điểm %). Cộng 0,35 + chênh, trần 0,9, nhân độ tin cậy n/(n+10). Không dùng ngưỡng tuyệt đối (nhớ chủ động vốn khó hơn nhận diện).
- **Thiếu mẫu (< 20 lượt cấp người học):** *không kết luận yếu*; chỉ cộng nhỏ (≤ 0,5, giảm dần) để thu thêm dữ liệu.
- **Không phản ứng thái quá:** làm mượt Laplace; cửa sổ 14 ngày chỉ tính khi ≥ 8 lượt và chiếm 35% trọng số. Một lần sai làm điểm cộng đổi < 0,12.
- **Nhận diện ≠ nhớ chủ động:** khi chưa có ≥ 20 lượt **tự gõ** đúng ≥ 70%, dạng trắc nghiệm của `recall` không bị coi là "đã vững" (không bị trừ điểm strong). Để thu bằng chứng, `review.js` thêm tối đa 2 câu **thăm dò tự gõ** (nghĩa → chữ Hán) vào luyện bổ sung, chỉ khi nhận diện đã khá vững (≥ 30 lượt, đã trừ đoán mò ≥ 50%) và chưa đủ lượt tự gõ; chọn từ đã ôn mà recall của từ đó chưa đủ dữ liệu (không lấy từ đang yếu); tắt nếu người học tắt câu tự gõ; dành tối đa min(2, cap−1) chỗ luyện bổ sung (luôn để lại ≥ 1 chỗ cho từ hay sai; cần buổi có ≥ 2 chỗ), và nhường lại cho từ hay sai nếu không có từ phù hợp.
- **Cân bằng theo kỹ năng:** một kỹ năng chiếm > 40% câu của buổi (từ câu thứ 5) bị trừ 0,8.
- **Chống lặp giữa ngày:** dạng đã hỏi cho chính từ này lần trước bị trừ 0,6. Trong buổi vẫn dùng cơ chế cũ (trừ 10 điểm cho cặp từ+dạng đã hỏi, trừ liền kề, trừ đa dạng).
- **Dự phòng:** không có `learner` (người mới, mất mạng, phiên lưu từ V126, server cũ) → mọi điểm cộng bằng 0, chuỗi dạng câu hỏi **giống hệt** khi không truyền (có test). Dạng không dựng được → thử dạng kế tiếp → cuối cùng `hz2vi` 2 lựa chọn như V126.

## 4. Ranh giới FSRS (kiểm tra bằng test + so sánh file)
- Thẻ FSRS chính thức **không bao giờ** là câu tự gõ do thay đổi này (cổng tự gõ theo hồ sơ của TỪ giữ nguyên; thăm dò chỉ là luyện bổ sung) — có test mô phỏng 60 buổi × 30 thẻ.
- Câu thăm dò đi qua `submitSkillPractice` → `/api/skills/practice` → `skill_practice_log`; không gọi `/api/study/review`, không đụng `fsrs_cards`/`review_history` (test tĩnh + test hành vi).
- Truy vấn mới chỉ `SELECT`, chỉ chạy khi `adaptive`.
- Không đổi ngày đến hạn, stability, difficulty, state, số lần ôn.

## 5. Kiểm thử đã chạy (Node v22, không có database/ts-fsrs)
Chạy toàn bộ 35 file trong `test/` trên V126 gốc và V127. Kết quả V127:
- Đạt hoàn toàn: `adaptive-session` 39, `v127-adaptive-learner` 26, `question-engine` 27, `adaptive-v111` 46, `v118-adaptive` 34, `v118-hanzi-parts` 9, `answer-match` 35, `retention-recommend` 33, `v113-evidence` 28, `v114-fixes` 20, `v115-features` 55, `v116-menu` 25, `v117-workspace` 27, `v119-*` 75, `review-render.smoke` 15, `v110-ui.smoke` 44, `study-time` 39, `orphans` 9, `drill-notes` 10, `heavy-distractor` 16, `skills` 50 (khi `/tmp/orig` trỏ tới bản V126), cùng các test tĩnh `auth-security`, `xss-escaping`, `vocab-merge`, `visibility-timer`, `fsrs-optimizer.browser-asset-resolution`, `fsrs-optimizer-frontend.smoke` (exit 0).
- **Không chạy được ở đây (giống hệt trên bản gốc):** `fsrs.test`, `fsrs-optimizer.test`, `fsrs-optimizer.binding.smoke` (thiếu thư viện `ts-fsrs`/optimizer trong sandbox); các test `*.integration` (cần database — tự bỏ qua).
- Kiểm tra đột biến: phá lần lượt 7 cơ chế mới trên bản sao → bộ test `v127` bắt được cả 7.
- So sánh trực tiếp với bộ chọn V126 trên 400 hồ sơ ngẫu nhiên (không `learner`, buổi ngắn): **0 khác biệt**.
- Một hồi quy do chính thay đổi này gây ra (`v114-fixes`: lỗi `fetch` khi "Học tiếp") đã được phát hiện và sửa bằng cách gia cố `rvLoadExamples`.

## 6. Vấn đề còn tồn tại / chưa xác minh
1. **SQL mới chưa chạy trên Postgres thật** (`getLastExerciseTypes`: `DISTINCT ON` + `UNION ALL`; dùng đúng cột như `getTypeBreakdown`/`getConfusionsForWords`). Có `.catch` nên nếu lỗi chỉ mất tính năng chống lặp giữa ngày. `getTypeBreakdown` là truy vấn đã có, nay gọi thêm 2 lần/buổi (90 và 14 ngày).
2. **Chưa thử trên trình duyệt thật.** Logic được chạy trong môi trường giả (`vm`); chưa nhìn bằng mắt giao diện câu thăm dò và dòng lý do (`q.why`).
3. **Ngưỡng chưa chỉnh theo dữ liệu thật** (`learnerGapMin` 0,15; `skillShareCap` 0,4; `productionMinN` 20…). Nên đo sau vài tuần dùng.
4. **FSRS tự chấm rating theo thời gian trả lời** so với 10 lượt đúng gần nhất của chính thẻ, không phân biệt dạng bài (`lib/fsrs-auto-rating.js` — không sửa). Việc đổi tỉ lệ các dạng chậm hơn (điền từ, nghe) trên thẻ chính thức vẫn có thể làm tăng tỉ lệ "Hard". V127 không thêm dạng chậm nào vào thẻ chính thức ngoài những gì V126 đã cho phép, nhưng cân bằng theo kỹ năng và điểm cộng cấp người học có thể đổi *tỉ lệ* giữa các dạng đó. Chưa có số liệu thật để đo. Đây là quyết định cần chủ dự án (xem câu hỏi mở bên dưới).
5. Kết quả thăm dò tự gõ cũng được cộng vào ô `recall` **theo từng từ** (cách `recordPractice` hoạt động từ V113): tự gõ khó hơn nên điểm recall theo từ có thể thấp hơn trước.
6. Khi người học sai liên tiếp, bộ chọn vẫn có thể hỏi `hz2vi` hai lần liền (cơ chế "dạng dễ khi vật lộn" từ V106; V126: 80 lần, V127: 75 lần trong cùng mô phỏng) — không đổi.
7. Nhóm kỹ năng `recognition` vẫn gộp chữ→nghĩa, pinyin→nghĩa, chữ→Hán Việt; và dạng chữ→nghĩa vẫn hiện pinyin kèm đề theo mặc định → chưa tách "nhận diện chữ Hán" khỏi "hiểu nghĩa". Cần quyết định (có ẩn pinyin mặc định không) và/hoặc lưu thêm dạng bài ở bảng theo từ.
8. Đính chính báo cáo phân tích trước: với đường vào thông thường (có màn bắt đầu) thẻ đầu được dựng sau khi người học bấm "Bắt đầu" nên kho ví dụ thường đã nạp xong; lỗi thật là hai đường "Học tiếp"/"Học lại từ đầu" không nạp kho (đã sửa).

## 7. Triển khai
- JS được phục vụ `no-cache, must-revalidate` (vercel.json) nên trình duyệt lấy bản mới.
- Triển khai server/client lệch nhau đều an toàn: client mới + server cũ → không có `learner` → chạy như V126; client cũ + server mới → bỏ qua field mới.
- Hoàn tác: bỏ `?adaptive=1` trong `rvFetchFreshSession` (`js/review.js`) → server không gửi `learner`/`lastExerciseType` → bộ chọn chạy như V126 (chỉ còn cân bằng theo kỹ năng).
