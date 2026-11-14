# HANDOFF — trạng thái dự án

Cập nhật lần cuối: 2026-11-14 · Commit: xem `git log -1`

**Đọc file này đầu mỗi phiên thay vì dò lại repo.** Bản đồ kiến trúc đầy đủ nằm trong `CLAUDE.md`.
## V153 — Hội thoại AI giai đoạn 2 + sửa lỗi "không thấy nút sinh AI" (2026-11-14, chưa chạy Postgres/AI thật)
**Lỗi "không thấy nút":** bảng quản trị nằm trong `<details>` chỉ tự mở khi có nháp/lỗi, và khi `/api/admin/conversations` lỗi thì bảng bị xoá trắng IM LẶNG. Nay khung LUÔN mở; lỗi hiện rõ kèm "Thử lại"; lỗi lược đồ (thiếu bảng `conversations`, thiếu quyền ALTER) trả 503 kèm nguyên nhân thật (`convoGenSchemaLastError`). Nguyên nhân thường gặp khác: chưa deploy V152, hoặc tài khoản không phải admin/superadmin (`isAdminRole()` ở `js/auth.js`).
- **Sinh tự động** (nút ⚡, lặp ≤20 vòng × ≤3 bài; dừng khi hết bài / hết quota AI / chạm hạn mức ngày / 2 vòng liền không ra bài / bấm Dừng). Lõi dùng chung `runConversationGeneration` (route admin + cron). **Hạn mức ngày** `CONVERSATION_GEN_DAILY_LIMIT` (mặc định 20, ≤0 = không giới hạn, đếm theo ngày giờ VN, chỉ áp cho sinh tự chọn). **Cron:** `GET /api/cron/generate-daily?task=conversations` (1 bài/lượt, cần `Authorization: Bearer $CRON_SECRET` nếu đã đặt); KHÔNG tự thêm vào `vercel.json` (gói Hobby giới hạn số cron) — gọi bằng cron ngoài/GitHub Actions nếu muốn.
- **Duyệt:** "Duyệt tất cả" (`POST /api/admin/conversations/approve-all`), "Duyệt & bản nháp kế", metadata AI (model, số lần sinh, thời điểm).
- **Sửa tay từng lượt** (`POST /api/admin/conversations/:dialogueId/turns/:n`): kiểm tra bằng đúng `validateTurnEdit` như bản AI; vocab không còn nằm trong câu mới bị tỉa.
- **Từ vựng ↔ kho từ ↔ FSRS:** `POST /api/conversations/vocab-status` (mọi người dùng đã đăng nhập) cho huy hiệu ✓ bài N / ＋ mới cạnh từng từ; admin thấy số từ chưa có + ô nhập số bài + nút "Thêm vào kho" (`POST .../add-vocab` {lesson 1–9999}): CHỈ thêm từ chưa có (tag `hoi-thoai`), không đụng từ đã có; từ vào bài thì tự chảy vào FSRS theo cơ chế sẵn có khi học viên học bài đó.
- Test: `npm run test:v153` (14 test). Chưa làm: dạng bài FSRS "chọn câu đáp lại" từ hội thoại; sinh câu ví dụ FSRS từ lượt thoại.

## V152 — Sinh lượt thoại bằng AI cho thư viện hội thoại (2026-11-14, chưa chạy Postgres/AI thật)
Bảng `conversations` có ~200 "đầu bài" nhưng `conversation_turns` trống. V152 thêm luồng: **pending → AI soạn + máy kiểm tra → draft → admin duyệt → ready** (người học chỉ thấy `ready`).
- `lib/conversation-gen.js` (thuần, test được): `buildPrompt`, `parseModelJson`, `validateTurns`, `generateConversationTurns` (thử lại tối đa 3 lần, đưa lỗi lần trước vào prompt). Kiểm tra cứng: JSON, số lượt, nhân vật, chữ Hán đủ/không số-Latin, **số âm tiết pinyin = số chữ Hán** (chấp nhận 儿 gộp âm), không trùng lượt, tiếng Việt không lẫn chữ Hán, `vocab.hz` phải nằm trong câu (sai thì loại mục đó). **Chưa kiểm soát cấp HSK bằng danh sách từ** (app chưa có bảng HSK): giữ bằng prompt + khâu duyệt tay.
- AI dùng `callGemini(prompt, {maxTokens, timeoutMs})` (thực chất là API Vilao tương thích OpenAI: `AI_API_KEY`, `AI_MODELS`; mặc định cũ 4096 token/25s không đổi). Sinh với 8000 token/120s. Gemini thật chỉ dùng để chấm phát âm.
- DB (`lib/db.js`): `ensureConversationGenSchema` tự thêm cột `gen_status, gen_error, gen_model, gen_prompt_version, gen_attempts, generated_at`, hạ CHECK `total_turns >= 30` xuống `>= 12`, thêm `UNIQUE(conversation_id, turn_number)`, và coi bài ĐÃ CÓ lượt thoại là `ready`. Có file chạy tay tương đương `migrations/V152_conversation_generation.sql`. `saveGeneratedConversation` = 1 transaction ngắn (khoá hàng → xoá → INSERT nhiều dòng → bài thành `draft` → reset `last_played_turn`); gọi AI TRƯỚC khi mở kết nối (pool chỉ vài kết nối). `getConversations/getConversationWithTurns/getConversationStats` chỉ trả bài `ready` trừ khi admin (`includeUnready`).
- API (admin): `GET /api/admin/conversations` (đếm + danh sách), `POST /api/admin/conversations/generate` {dialogueIds?|count (≤3), targetTurns (12–34), force?}, `POST /api/admin/conversations/:dialogueId/status` {ready|draft}. Bài `ready` không bị ghi đè nếu thiếu `force:true`.
- UI (`js/conversation.js`): bảng "🛠 Quản trị hội thoại" ở danh sách (đếm theo trạng thái, nút Sinh 1/3 bài, danh sách nháp có Xem/Duyệt, danh sách lỗi có Thử lại) + thanh quản trị ở trang chi tiết; giải thích từ vựng/ngữ pháp hiện dạng chữ thay vì JSON thô.
- **Tác động cần biết:** sau khi deploy, thư viện hội thoại của NGƯỜI HỌC sẽ trống cho tới khi có bài được duyệt (trước đó cũng chỉ là khung rỗng vì chưa có lượt thoại).
- Test: `npm run test:v152` (18 test). Chưa làm: sinh theo lô tự động/cron, dạng bài "chọn câu đáp lại" từ hội thoại, nối "Thêm từ vào học" (giai đoạn 2–3).

## V151 — Nút "🖼️ Tạo ảnh" ngay trên màn câu hỏi (2026-11-14, chưa thử trên trình duyệt thật)
Thanh đầu thẻ (`.rv-head-act`) có nút tạo ảnh gợi nhớ cho từ đang học — CHỈ quản trị viên, CHỈ khi từ chưa có ảnh (đã `ready` thì ô tự biến mất). Gọi `POST /api/admin/word-images/generate` {hz:[hz]} (≤~50 giây),
bấm đúp không vẽ 2 lần (`gen` Map trong `js/word-image.js`), lỗi hiện lý do + "Thử lại". Cố ý KHÔNG hiện ảnh ở màn câu hỏi (ảnh có thể lộ đáp án): vẽ xong, ảnh hiện ở màn đáp án như cũ (cache đã xoá).
Code: `wiActionSlot` / `wiMountAction` (`js/word-image.js`), gắn ở `rvRender` + `bindReview` (`js/review.js`), CSS `.wi-act/.wi-hbtn/.wi-hmsg` trong khối V142. Test: `npm run test:v151` (7 test, chạy THẬT word-image.js trong vm với DOM giả).
**Lưu ý:** ảnh chỉ hiện nếu CORS bucket R2 có origin của app (site bật COEP require-corp) — xem V142.

## V150 — Thêm dạng bài cho "Hôm nay học" cùng FSRS (2026-11-14, chưa deploy, chưa chạy Postgres/trình duyệt thật)
(1) **Từ chưa có câu ví dụ không còn bị bỏ khỏi buổi:** `rvBuildQuestionFor` (thẻ chính thức, `check`, `drill`) thử `QE.SENTENCE_ORDER` trước; không dựng được thì rơi về `QE.WORD_FALLBACK_ORDER`
(`hz2vi, vi2hz, listen2vi, listen2hz, hz2py, typeVi2hz, typeHz2py` — đều có nhãn `review-*` fsrs:true trên server). Dạng gõ vẫn qua cổng cứng của `QS.rank` (kỹ năng đủ vững + bật gõ). Từ CÓ câu vẫn hỏi theo câu như V138.
(2) **Rating theo BẬC dạng bài** (`lib/fsrs-auto-rating.js`: `EXERCISE_TIER`, `exerciseTier`): bậc 1 = nhận diện từ đơn lẻ (`review-hz2vi`, `quiz-hz2vi`, `review-listen-vi`) → đúng tối đa **Good** (không Easy);
bậc 3 = tự gõ; bậc 2 = mặc định (gồm mọi dạng câu, nhãn lạ/thiếu) → y hệt trước V150. Sai luôn Again; thẻ mới vẫn không Easy; user override vẫn thắng. Baseline thời gian ưu tiên lượt CÙNG bậc (≥3 mẫu), thiếu thì dùng toàn bộ như cũ.
Preview (`/api/study/review/preview` → `previewRating`) và commit (`reviewFsrsCard`) cùng nhận `exerciseType` (nhãn đã qua `resolveExercise`). Truy vấn lịch sử lấy `exercise_type` bằng `to_jsonb(review_history) ->> 'exercise_type'` để thiếu cột cũng không làm hỏng transaction.
Test: `npm run test:v150` (11 test, cần `ts-fsrs`). Đã sửa 1 test cũ `adaptive-session` (khẳng định "thiếu câu → bỏ thẻ" của V138).
**Chưa làm / chưa kiểm chứng:** nâng sắp xếp câu (`orderSentence`) lên FSRS (bước 3); dạng mới cần dữ liệu (bước 4); optimizer cá nhân chưa được đọc kỹ khi log trộn nhiều dạng; cần thử trên trình duyệt thật cho từ không có câu.

## V149 — Sửa "hệ thống không trả thẻ ôn tập" (2026-11-13)
Lỗi: dashboard báo "Cần ôn 100 · Từ mới 20" nhưng bấm "Bắt đầu học" ra "0 Từ mới · 0 Thẻ đến hạn ôn · 1 Từ cần luyện thêm" (server vẫn trả đủ thẻ — thẻ bị loại ở CLIENT).
Nguyên nhân gốc: khoá localStorage cũ `rvSessionCards` trước V138 nghĩa "0 = không giới hạn" (mặc định); V138 đổi 0 thành "TẮT thẻ chính thức" và V146 giữ nguyên '0' cũ khi chuyển sang `rvSessionCardsV2`
→ `startStudySession` cắt `list = []`. Dashboard chỉ cảnh báo khi trần > 0 nên không báo gì. Phiên rỗng đó còn được `sqPersist` lưu và khôi phục lại ở lần "Bắt đầu học" sau.
Đã sửa: (1) `rvSentenceCountSetting()` coi khoá cũ ≤ 0 là `'all'` (chỉ khoá V2 mới được là 0); (2) `rvSavedSessionIsHollow()` — phiên đã lưu 0 câu đã trả lời + 0 thẻ chính thức bị bỏ, nạp lại từ server;
(3) trần "Tắt" tường minh vẫn được tôn trọng nhưng dashboard + màn bắt đầu + màn "Chưa có gì để học" nói rõ lý do và có nút "Bật lại thẻ ôn tập" (`rvEnableOfficialCards()`).
Test: `npm run test:v149` (12 test; trên mã V148 gốc FAIL 7/12). Đã sửa test V115 cũ khẳng định khoá cũ '0' → 0.
**Chưa kiểm chứng:** chưa chạy với Postgres/trình duyệt thật. Giả thuyết nguyên nhân khớp hoàn toàn ảnh chụp nhưng không thể đọc localStorage trên máy người dùng — nếu sau khi deploy vẫn thấy 0 thẻ, mở DevTools → Application → Local Storage và gửi giá trị `rvSessionCards` / `rvSessionCardsV2` / `dayKnownHz_*`.

## V148 — Bỏ R2 khỏi âm thanh: Edge-TTS gọi TRỰC TIẾP (2026-11-11, chưa deploy, chưa thử trên thiết bị thật)
Client: IndexedDB (máy người học) → `POST /api/tts` (Python `api/edge-tts.py`) → Web Speech dự phòng. KHÔNG còn bước hỏi server/R2, không còn hedge.
Đã xoá: `lib/audio-library.js`, route `/api/audio/resolve` + `/api/r2/health`, token nội bộ `AUDIO_INTERNAL_TOKEN` / `AUDIO_TTS_URL`, test V141.
`lib/r2.js` chỉ còn phần ẢNH GỢI NHỚ (V142/V144) — ảnh vẫn lưu R2. Khoá cache IndexedDB (`AH.canonical`) giữ nguyên nên không mất cache cũ.
**Việc phải làm:** (1) xoá biến `AUDIO_INTERNAL_TOKEN`, `AUDIO_TTS_URL` ở Vercel (không còn dùng); (2) tuỳ chọn chạy `migrations/V148_drop_audio_library.sql`
để xoá bảng `audio_library` (không còn đọc/ghi); (3) nghe thử trên iPhone/Android. Test: `npm run test:v148` + `npm run test:v147`.
Báo cáo: `docs/audit/AUDIT-REPORT-V148-REMOVE-R2-AUDIO.md`.

## V146 — "Hôm nay học" nhận đủ số thẻ dashboard báo (2026-11-11)
Lỗi: dashboard báo "Cần ôn 50 · Từ mới 10" nhưng vào học chỉ có ~6 thẻ. 4 nguyên nhân đã sửa:
(1) `rvSentenceCount()` mặc định cắt 6 thẻ → nay mặc định `'all'` (khoá mới `rvSessionCardsV2`; khoá cũ chỉ giữ lựa chọn rõ ràng ≠ 6);
(2) `blockedByBacklog`/`totalDue` nay đếm theo PHẠM VI đang chọn (`getDailyBudget(userId, ui, scopeLessons)`), `getTodayOverview` dùng lại cùng 1 lượt đếm;
(3) cooldown thẻ state 1/3 = 15 phút (thẻ khác 4 giờ) + `sessionKnownHz` không chặn thẻ state 1/3 đã đến hạn lại (`rvIsLearningDue`, `sqLoad`);
(4) `getStudySession` lấy dư (`n + min(n,20)`) rồi mới khử trùng hz và cắt đúng slot; `reviewCount/newCount` nay khớp số thẻ thật.
Test: `npm run test:v146` (15 test; chạy được không cần DB/ts-fsrs; 12/15 FAIL trên bản V145). Đã sửa test cũ khẳng định mặc định 6 (`v115`, `v138`).
Báo cáo: `docs/audit/AUDIT-REPORT-V146-SESSION-SIZE.md`. **Chưa chạy với Postgres thật** — mệnh đề SQL `now() - CASE WHEN f.state IN (1,3) THEN interval … END` cần xác nhận trên Neon.

## V144 — Quản lý & kiểm tra ảnh gợi nhớ (2026-11-10)
Tab **Quản trị → Từ vựng** có thêm panel “📊 Kiểm tra & tạo ảnh gợi nhớ”: thống kê theo từ/bài/nhãn,
kiểm tra THẬT trên R2 (4 mức: bản ghi DB → tệp R2 `HEAD` → URL ký sẵn → ảnh load được trong trình duyệt),
hàng đợi ưu tiên **Bài 37 → 36 → 38 → sửa ảnh lỗi → các bài còn lại**, xuất CSV, sửa ảnh hỏng (chỉ khi đã xác minh).
Code: `js/word-image-audit.js` (THUẦN, dùng chung server+browser) · `js/word-image-admin.js` (UI) ·
2 route mới `GET /api/admin/word-images/audit` (chỉ đọc DB) + `POST /api/admin/word-images/verify` (HEAD+ký URL, ≤50 từ/lượt) ·
`lib/word-images.js` thêm `auditRows/rowsFor` và tham số `only` cho `claimForImage` (giữ đúng thứ tự ưu tiên khi vẽ).
Mở trang KHÔNG tự tạo ảnh, KHÔNG tự quét R2; tiến trình hàng đợi lưu `localStorage` → chạy tiếp được.
Test: `npm run test:v144` (24 test, có 4 test chạy thật file UI trong DOM giả). Báo cáo: `docs/audit/AUDIT-REPORT-V144-WORD-IMAGE-MANAGER.md`.
**Chưa kiểm chứng:** R2/CF quota/CORS thật + hiển thị trên điện thoại (phải bấm “🔍 Kiểm tra R2” trên môi trường thật mới biết).
**Lưu ý dữ liệu:** `vocab_words` chỉ có 1 cột `tag` tự do (thực tế `ly_hop`) — không có hệ nhãn danh từ/động từ/địa điểm; bảng nhãn chỉ chạy trên giá trị đang có.

## V143 — Tối ưu UX/UI màn "Hôm nay học" (2026-11-10)
**Ảnh gợi nhớ nay hiện NGAY trong thẻ học** (trước đây bị giấu trong mục gập `<details>` và nằm ở cuối thẻ):
`js/word-image.js` bỏ `<details>`, bọc ảnh trong `<button>` (chạm/bàn phím mở ảnh lớn qua overlay `#wi-zoom`),
thêm `wiPrefetch(hz)` tải trước ảnh thẻ kế tiếp. Vị trí ảnh trong `js/review.js` (từ mới + 2 màn đáp án) và
`js/flashcard.js` (mặt sau): **sau chữ Hán + pinyin, TRƯỚC nghĩa**. Màn câu hỏi vẫn KHÔNG có ảnh (tránh lộ đáp án).
Trần chiều cao ảnh: `min(30vh,220px)`, điện thoại `min(24vh,170px)`, Flashcard `min(16vh,120px)` — chỉnh ở
`css/styles.css` khối `V142 — ảnh gợi nhớ` (khối này phải nằm TRƯỚC khối `V117`, có test canh).
Màn "Hôm nay học": "Cài đặt hằng ngày" gập sẵn (`.td-settings`), thanh tiến độ lên ngay sau 3 số chính.
Test: `npm run test:v143` (11 test) + đã thêm vào `verify:ui`. Báo cáo: `docs/audit/AUDIT-REPORT-V143-TODAY-UX.md`.
**Chưa mở trên trình duyệt/điện thoại thật** (máy này không có trình duyệt headless) — các con số `vh` có thể cần chỉnh lại.

## V142 — Ảnh gợi nhớ (CHƯA hậu kiểm trên môi trường thật)
Pipeline nền: model văn bản soạn câu chuyện + prompt → FLUX.1 schnell (Cloudflare Workers AI) vẽ → R2 (`img/v1/..`),
metadata ở Neon `word_images`. Client: `js/word-image.js` (mục "Hình gợi nhớ" trong flashcard + ôn tập).
Admin: thẻ "🖼️ Ảnh gợi nhớ" ở tab Từ vựng (trạng thái, chạy ngay, tạo lại theo từ). Cron: `?task=images` (đã có trong workflow).
**Việc phải làm trước khi dùng thật:** (1) đặt `CF_AI_TOKEN` (+ `CF_ACCOUNT_ID` nếu khác `R2_ACCOUNT_ID`); (2) CORS bucket R2
cho origin của app (site bật COEP require-corp nên `<img>` dùng `crossorigin="anonymous"`, thiếu CORS thì ảnh không hiện);
(3) chạy thử 3–5 từ qua thẻ admin rồi xem trên điện thoại. Chi tiết: `docs/audit/AUDIT-REPORT-V142-WORD-IMAGES.md`.

## V147 — Sửa Edge-TTS trễ / không đọc (chưa deploy, chưa thử trên thiết bị thật) — phần R2 đã bị V148 gỡ
Còn hiệu lực: tải trước đoạn kế; 1 phần tử `<audio>` dùng chung mở khoá ở lần chạm đầu; UI "⏳ Đang tải" thay cho "bị chặn";
`edge-tts.py` retry ≤3 lần + `connect_timeout`. Đã bị V148 gỡ: hedge R2↔Edge-TTS, token nội bộ `AUDIO_INTERNAL_TOKEN`, `ttsUrl()`.
Chi tiết: `docs/audit/AUDIT-REPORT-V147-TTS-LATENCY.md` (lịch sử). Test: `npm run test:v147`.

## Version hiện tại
Phiên bản V148. Âm thanh: Edge-TTS gọi trực tiếp (V139) + cache IndexedDB; thư viện âm thanh dùng chung trên R2 (V141) ĐÃ BỊ GỠ ở V148
(bucket vốn trống do lỗi checksum, và hedge R2↔Edge-TTS của V147 chỉ làm phức tạp thêm). Lịch sử: `docs/audit/AUDIT-REPORT-V141-R2-AUDIO-LIBRARY.md`.
Trước đó: V140 Natural Chinese Speech; V139 Edge-TTS.

## Việc còn tồn (từ báo cáo V138)
- Chưa chạy end-to-end với Express + Postgres thật; chưa thử trên trình duyệt/điện thoại thật.
- `word_examples`/`SENTENCES` không có pinyin câu → màn đáp án chưa hiện pinyin cả câu.
- Từ chưa có câu ví dụ bị bỏ khỏi buổi học (không có câu hỏi thay thế).
- Dạng 7 (hội thoại), 9 (tìm câu sai), 10 (chọn câu trả lời) chưa làm — thiếu dữ liệu.
- Azure Neural TTS chưa triển khai; Edge-TTS (Xiaoxiao/Yunxi) đã là giọng chính từ V139.
- Chưa đo chi phí AI thật khi `MIN_EXAMPLES_PER_WORD = 3` (nếu tốn, hạ về 2).
- `Intl.Segmenter` với tiếng Trung trên Safari cũ chưa kiểm (đã có đường lùi tách từng chữ).

## Tự động sinh dữ liệu AI (thêm 2026-11-06)
`/api/cron/generate-daily?task=examples` chỉ chạy phần ví dụ theo từ (bỏ qua hán việt/chiết tự).
`.github/workflows/generate-daily.yml` gọi song song `task=examples` + mặc định, mỗi 15 phút trong
khung 20h–22h UTC. Cần secret `APP_URL` + `CRON_SECRET`. Trần thật là RPD của Gemini free.

## Thứ tự từ mới "Hôm nay học" (sửa 2026-11-06)
`buildLessonPriorityOrder` giờ là bài hiện tại → bài sau tăng dần → bài trước giảm dần (trước đây bài
trước đứng đầu, nên đang Bài 10 vẫn mở màn bằng từ Bài 1). Từ đã có dòng `review_history` không còn
được coi là từ mới dù mất `fsrs_cards` (`getNewWordsByLessonOrder` + `countNewWordsInLessons`).
`resolveCurrentLesson` nhận thêm `learnedLessons` (từ `getLearnedLessons`) thay vì rơi thẳng về bài 1.
Test cần DB: `npm run test:lesson-order`.

## Edge-TTS (V139 — tích hợp lần đầu, 2026-11-09)
`/api/tts` được rewrite tới Python Function `api/edge-tts.py`; `requirements.txt` khóa `edge-tts==7.3.1`.
Hai voice đại lục: Xiaoxiao nữ mặc định, Yunxi nam; 500 ký tự; 5 tốc độ 0.8–1.2x; timeout 45 s;
rate limit best-effort 60 request/phút/IP/instance. `js/audio.js` ưu tiên Edge-TTS, cache MP3 bằng
IndexedDB (tối đa 300 bản hoặc 40 MB) và tự fallback Web Speech khi API/mạng lỗi. Cài đặt giọng/tốc độ đồng bộ
trong `progressState.ui`; không thay đổi FSRS, Question Engine hay schema DB. Slider tốc độ cũ 0.3–1.0
được chuẩn hóa về 0.9x do Edge-TTS chỉ cho phép 0.8–1.2x.
`tts-lab/` vẫn được giữ độc lập để so sánh. Bằng chứng đo Edge-TTS: `docs/audit/EDGE-TTS-TEST-REPORT.md`.
**Đã deploy + hậu kiểm trên Vercel** (`GET/POST /api/tts` → 200; POST trả `audio/mpeg` hợp lệ).

## V140 — Natural Chinese Speech (2026-11-09)
- `js/tts-text.js` (THUẦN): `splitSpeech` cắt tại dấu câu, mệnh đề dài cắt tại ranh giới từ
  (`Intl.Segmenter`), bất biến `join('') === text`; `pauseAfter`, `cacheKeyText`, `conversationSegments`.
- `js/audio.js`: `ttsSpeakSegments` phát tuần tự nhiều đoạn (không chồng lấn), pause/resume/stop bằng
  `ttsToken`; cache hỏng → xoá + tải lại 1 lần; giữ 4 tag chẩn đoán.
- Tab mới (nhóm "Thêm"): `convo` (`js/dialogues-data.js` + `js/conversation.js`) và `listening`
  (`js/listening.js`). `index.html`, `js/nav.js`, `js/navigation.js`, `js/auth.js` đã nối.
- Test: `npm run test:v140` (18 test) + `npm run verify:ui` 10/10, `verify:server` 5/5.
- **Chưa đánh giá nghe thực tế**; chưa thử trên Android thật.

## Cố ý CHƯA làm
Kéo–thả mảnh chữ (chỉ dùng chạm) · sinh câu bằng AI lúc làm bài · tính sắp-xếp-câu vào kế hoạch năng lực V128.

## Trạng thái test (đo trên máy này, 2026-11-10)
| Lệnh | Kết quả |
|---|---|
| `npm run verify:core` | 6/6 file test qua |
| `npm run verify:server` | 8/8 file test qua |
| `npm run verify:ui` | 14/14 file test qua |
| `npm run test:v144` | 24 pass (quản lý/kiểm tra ảnh gợi nhớ, không cần mạng/DB) |
| `npm run test:v148` | 10 pass (âm thanh không còn R2, không cần mạng/DB) |
| `npm run verify:fsrs` | 4/4 file test qua |
| Toàn bộ test không cần DB (50 file) | PASS |
| `npm test` | 23 pass |
| `test:skills` | 50 pass (bản gốc lấy từ git, không cần `/tmp/orig`) |
| `test:v132` / `v133` / `v134` / `v135` | 8 / 9 / 12 / 19 pass |
| `test:xss` / `test:auth-security` | 21 / 7 pass |
| `test:fsrs-optimizer:binding` | **FAIL sẵn có** — thiếu native `@open-spaced-repetition/binding` đúng kiến trúc trên máy này (liên quan deploy, không phải code app) |
| `test:*integration*` | **cần `DATABASE_URL`** — không chạy được nếu thiếu |

## Công cụ tiết kiệm token (thêm 2026-11-06)
`npm run verify:<vùng>` (syntax + test, chỉ in khi lỗi) · `npm run test:quiet -- <files>` ·
`npm run token:report [--all]` (số token thật từ `~/.claude/projects/*.jsonl`).
Mục lục báo cáo audit: `docs/audit/INDEX.md`.


## Cấu trúc quyết định đã chốt (đừng tự đổi)
- FSRS = `ts-fsrs`, không tự viết thuật toán. `lib/fsrs/reviewService.js` là nguồn sự thật duy nhất.
- Hai đường tách biệt: FSRS chính thức (`exerciseFsrs`) vs luyện bổ sung (`practiceOnly`).
- Module thuần dùng chung server/client giữ mẫu `(function(){})()` + `module.exports`; không DOM.

## Báo cáo audit
43 file trong `docs/audit/`. Chỉ mở báo cáo khớp lỗi đang sửa; danh sách đầy đủ: `ls docs/audit/`.
