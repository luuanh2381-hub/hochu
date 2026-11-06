# V135 — "🧩 Sắp xếp câu" + mỗi từ bù đủ 3 câu ví dụ

## Làm gì
1. **AI sinh tối đa 3 câu ví dụ cho mỗi từ** — đổi `MIN_EXAMPLES_PER_WORD` từ **1 → 3** trong `api/index.js`. Trước đây ngưỡng "từ đã đủ ví dụ" là 1 nên dù prompt cho phép sinh tới 3 câu, phần lớn từ dừng ở 1 câu và không bao giờ được bù thêm. Nay từ có 1–2 câu vẫn nằm trong hàng đợi sinh bù cho **đủ 3**. `TARGET_EXAMPLES_PER_WORD = 3` giữ nguyên. Không đổi prompt, không đổi bảng, không migration.
2. **Dạng bài mới "Sắp xếp câu"** — người học thấy **nghĩa tiếng Việt** của một câu có thật + nghĩa của từ cần dùng; các **mảnh chữ** (cắt theo TỪ) bị xáo; chạm để xếp lại đúng thứ tự.
   - Câu lấy từ **dữ liệu thật**: `SENTENCES` (câu mẫu giáo trình, 26 câu) và `word_examples` (ví dụ theo từ trong DB). **Không sinh câu lúc làm bài.**
   - Câu phải chứa **đúng một lần** từ đang học → người học biết mình đang luyện từ nào; đề **không hiện chữ Hán** của từ (sẽ lộ một mảnh).
   - **Chấm theo chuỗi đã chuẩn hoá** (`js/order-sentence.js`: bỏ dấu câu + khoảng trắng, giữ nguyên chữ Hán) → cách tách mảnh không ảnh hưởng kết quả.
   - Chỉ **luyện bổ sung**: `practiceOnly`, `exerciseFsrs: null`, nhãn `practice-order-sentence` khai báo `fsrs: false`. Server chỉ ghi `skill_practice_log` + `word_skill_stats` (kỹ năng `context`), **không** đụng `fsrs_cards` / `review_history`.
3. **"Hôm nay học" có thêm câu sắp xếp câu mỗi buổi** — mặc định **2 câu**, chọn được **0–5** trong "🎛 Chế độ học khác" (lưu theo tài khoản ở `progressState.ui.orderSentencePerSession`, chuẩn hoá 0–5). Câu được rải ở khoảng **1/3 và 2/3** buổi (N câu → `(k+1)/(N+1)` chiều dài buổi).
   - Từ để hỏi lấy từ **chính các từ chính thức của buổi**; nếu kho câu mẫu chỉ phủ một phần từ vựng thì lấy thêm **từ cùng bài đang học** cho đủ số câu (không lấy từ ngoài bài).
   - Câu sắp xếp câu **không bị xếp lại hàng đợi khi sai** (dạng bị ép, không "đổi dạng" được) — buổi học không lặp đúng câu vừa sai.
   - `item.type = 'order'` nằm trong `RV_PRACTICE_TYPES` → đi đúng đường luyện bổ sung (`/api/skills/practice`), không qua luồng FSRS.

## Nguyên tắc dữ liệu
- **Server là nguồn sự thật**: `/api/skills/practice` dựng lại danh sách câu đúng từ `PROGRAM_SENTENCES` + `word_examples` của **đúng từ đó** (`getWordExamplesForWord(hz)`), rồi chấm bằng `orderSentence.isOrderCorrect`. Trình duyệt chỉ chấm tức thời để phản hồi; gửi lên sai vẫn bị chấm sai.
- **Không bịa câu**: không có câu thật nào dùng được → `QE.build` trả `null`, từ đó bị bỏ qua (luyện riêng) / không chèn câu nào (buổi học).
- **Không làm bẩn dữ liệu lỗi**: chuỗi cả câu người học ghép **không** được lưu làm `wrong_answer` (nếu lưu, nó sẽ thành "đáp án nhiễu" vô nghĩa ở câu trắc nghiệm sau này). Nhật ký vẫn ghi đúng/sai bình thường.
- **Tách mảnh** bằng `Intl.Segmenter('zh-Hans', {granularity:'word'})` (có sẵn trong trình duyệt hiện đại + Node ≥ 16). Môi trường không có → lùi về tách **từng chữ Hán**; vẫn chấm đúng vì chấm theo chuỗi chuẩn hoá. Dấu câu **dính vào mảnh đứng trước** (`包子，`) để người học không phải xếp dấu câu rời.
- **Giới hạn độ dài**: câu 4–40 chữ Hán, 3–12 mảnh; câu không xáo được khác thứ tự gốc (mọi mảnh giống hệt nhau) bị loại.

## File
- Mới: `js/order-sentence.js` (thư viện thuần: tách mảnh / chuẩn hoá / chấm / lọc câu), `js/order-sentence-ui.js` (giao diện ô chữ dùng chung cho Hôm nay học + Phân tích), `js/sentences-data.js` (26 câu mẫu tách khỏi `js/data.js` để **server `require` được**), `test/v135-sentence-order.test.js` (19 test, `npm run test:v135`)
- Sửa: `api/index.js` (MIN_EXAMPLES_PER_WORD = 3, chấm order-sentence, không lưu cả câu vào wrong_answer), `lib/skills.js` (nhãn `practice-order-sentence`), `lib/db.js` (`getWordExamplesForWord`), `js/question-engine.js` (TYPES `orderSentence`, `ORDER_ORDER`, `buildOrderSentence`, `validateOrder`), `js/data.js` (bỏ khai báo SENTENCES, giữ nguyên tên biến toàn cục), `index.html` (nạp 3 file mới trước `data.js`), `js/review.js` (item `'order'`, `rvInsertOrderSentence`, `rvSubmitOrder`, `rvOrderPerSession`/`rvSetOrderPerSession`), `js/skills-ui.js` (chế độ `ordersentence` + `skSubmitOrder`), `js/lesson.js` (nút + ô chọn số câu mỗi buổi), `js/auth.js` (`orderSentencePerSession: 2` + chuẩn hoá 0–5), `package.json`
- Cập nhật 1 test cũ (`test/v128-phase2-extras.test.js`) khoá nguyên văn dòng `RV_PRACTICE_TYPES` — chỉ thêm `'order'`, ý nghĩa giữ nguyên.

## Đã kiểm tra (chạy thật)
- `node --check` toàn bộ `js/*.js`, `lib/*.js`, `api/index.js`: sạch.
- `test/v135-sentence-order.test.js`: **19/19**. Gồm chạy **thật** `QE.build('orderSentence')` trên 25 hạt ngẫu nhiên × 9 từ (≥ 50 câu dựng được): mảnh là hoán vị của câu gốc, luôn khác thứ tự gốc, đề không lộ chữ Hán, `QE.validate` chấp nhận; và 8 kiểu hỏng bị `validate` chặn (thiếu câu, < 3 mảnh, câu không dùng được, thiếu đáp án, đáp án không khớp, mảnh chưa xáo, mảnh lạ, đề lộ chữ Hán).
- Chạy **nguyên `js/review.js`** trong sandbox DOM giả: màn câu hỏi sắp xếp câu vẽ ra ô chữ + nghĩa tiếng Việt, bấm ghép **đúng** → `rvLastAnswer.correct = true`, màn đáp án hiện câu chuẩn, payload gửi server là `{ exerciseType: 'practice-order-sentence', selectedAnswer: <câu đã ghép>, source: 'extra' }` — **không** có `quizType`/đường FSRS; "Tiếp tục" gỡ câu khỏi hàng đợi đúng 1 lần.
- `rvInsertOrderSentence` chạy **hàm thật** trong sandbox: mặc định chèn 2 câu đúng vị trí tăng dần trong buổi, không sửa mảng gốc, không lặp từ, `0` = tắt, cấu hình 9 bị kẹp về 5.
- Toàn bộ test cũ liên quan: `question-engine` 27, `adaptive-session` 39, `review-render` 15, `skills` 50, `v110-ui` 44, `v128-*` (33/25/37/20), `v127-fsrs-isolation` 9, `v127-client-isolation` 14, `v130`, `v131`, `v131b`, `v132` 8, `v133` 9, `v134` 12, `v113`, `v114`, `v115` 55, `v116` 25, `v117` 27, `v118` 34+9, `v119`, `answer-match` 35, `study-time` 39, `drill-notes` 10, `retention` 33 — **tất cả qua**.
- Lỗi sẵn có của môi trường (không liên quan V135): `test/fsrs.test.js` cần `ts-fsrs` (chưa `npm install`); `test/skills.test.js` cần bản gốc ở `/tmp/orig/api/index.js` — sau khi dựng lại file đó từ `git show HEAD:api/index.js`, test chạy 50/50 qua.

## CHƯA kiểm tra được
- Bấm thử trên trình duyệt/điện thoại thật: chạm mảnh, xếp lại, bố cục màn hình hẹp, giọng đọc sau khi trả lời.
- Gọi route `/api/skills/practice` với Express + PostgreSQL thật (logic chấm đã đọc/chạy test tĩnh; chưa chạy HTTP end-to-end).
- Sinh ví dụ bằng AI thật để xem `MIN_EXAMPLES_PER_WORD = 3` có làm hàng đợi sinh dài hơn đáng kể không (chi phí/thời gian gọi AI). Nếu tốn quá, hạ lại 2 là đủ để có lựa chọn câu.
- Chất lượng của `Intl.Segmenter` với tiếng Trung trên **Safari cũ**; đã có đường lùi tách từng chữ nên chấm vẫn đúng, chỉ là mảnh ngắn hơn.

## Ý tưởng cố ý CHƯA làm
- **Kéo–thả** mảnh chữ: chỉ dùng chạm (đúng tinh thần "chỉ chạm chọn" của V132) — kéo–thả trên điện thoại dễ sai thao tác và cần thêm thư viện.
- **Sinh câu bằng AI khi làm bài**: câu phải có đáp án đúng đã biết trước. AI sinh lúc làm bài thì server không có "câu đúng" để chấm, và câu có thể sai ngữ pháp → dạy sai.
- **Sắp xếp câu cho từ chưa có câu mẫu/ví dụ**: hiện bị bỏ qua thay vì bịa câu. Muốn phủ rộng hơn thì mở rộng `js/sentences-data.js` hoặc để AI sinh **trước** và lưu vào `word_examples` (có người/kiểm tra lại được).
- **Tính câu sắp xếp câu vào kế hoạch năng lực (V128)** và **cân bằng kỹ năng theo mục tiêu**: mới có ~vài câu/buổi nên chưa đủ mẫu; thêm ngay sẽ làm lệch các quyết định thích ứng đang dựa trên dữ liệu dày hơn.
