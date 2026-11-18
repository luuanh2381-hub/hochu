# HANDOFF — trạng thái dự án

Cập nhật lần cuối: 2026-11-14 · Commit: xem `git log -1`

**Đọc file này đầu mỗi phiên thay vì dò lại repo.** Bản đồ kiến trúc đầy đủ nằm trong `CLAUDE.md`.
## V154 — Sửa gốc lỗi `relation "conversations" does not exist` (2026-11-14, đã chạy test trên Postgres 16 thật; CHƯA chạy trên Neon thật)
**Gốc rễ:** `ensureConversationGenSchema()` (V152) chỉ `ALTER TABLE conversations` — Neon chưa chạy `V145_conversation_library.sql` thì bảng không có; các hàm tiến độ/yêu thích còn không đảm bảo gì.
**Nay:** `lib/conversation-schema.js` là nguồn duy nhất: kiểm tra catalog → thiếu thì 1 transaction (advisory lock 152001, kiểm tra lại trong khoá) tạo bảng thiếu đúng V145 + áp đủ V152 → COMMIT; lỗi → ROLLBACK + `ConversationSchemaError` (category `connection|permission|missing_table|missing_column|migration`, đã lọc DATABASE_URL/mật khẩu/host). Đủ cấu trúc thì KHÔNG chạy DDL (user DB chỉ DML vẫn dùng được). Không DROP/TRUNCATE/DELETE, không chèn mẫu, không tự chạy batch.
- `lib/db.js`: MỌI hàm hội thoại mở kết nối bằng `connectConversationDb()` + gọi `ensureConversationGenSchema(client)`; bỏ nhánh "gen_status không dùng được → không lọc" (làm lộ bản nháp + che nguyên nhân). Thêm `getConversationDataReport`, `getConversationSchemaStatus`.
- `api/index.js`: route hội thoại dùng `convoFail` → 503 `{error, category}`; `GET /api/admin/conversations` kèm `dataReport` (batch nào thiếu, theo `lib/conversation-batches.js`) và `schema` (cảnh báo, bảng vừa tạo).
- `scripts/verify-conversations.js` (`npm run verify:conversations`): chỉ SELECT; PASS/WARNING/FAIL; kiểm bảng, cột V152, khoá, constraint, index, số hội thoại/lượt thoại, từng batch.
- Test: `npm run test:v154` (25 test, cần Postgres cục bộ: `TEST_PG_PORT`, mặc định 54329, user postgres, trust; thiếu → SKIP + mã thoát 3). Không đưa vào `verify:*`. `test/helpers/mini-pg.js` là client giao thức tối thiểu chỉ để test khi không cài được `pg`.
- **Nút "📥 Nhập N hội thoại còn thiếu"** (màn Quản trị, chỉ khi `dataReport` chưa đủ 200): `POST /api/admin/conversations/import-batches` → `importConversationBatches()` chạy NGUYÊN VĂN các batch còn thiếu (mỗi batch 1 transaction, `ON CONFLICT DO NOTHING`, không đè bài đã sửa). Văn bản SQL nhúng trong `lib/conversation-seed.js` (sinh bằng `node scripts/build-conversation-seed.js`; test đối chiếu từng byte với `migrations/`). Không bao giờ tự chạy. Lý do: DB Neon mới có 0 hội thoại nên "Sinh" báo "Không có bài nào cần sinh".
- Quy ước: chỉ mục `pg_trgm` và `uq_conversation_turns_pos` là TUỲ CHỌN (thiếu → WARNING, không chặn); thiếu cột V145 trên bảng đã có → `missing_column` (không tự sửa).

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
- AI dùng `callGemini(prompt, {maxTokens, timeoutMs})` (thực chất là API OpenRouter tương thích OpenAI, model miễn phí `openrouter/free` — V160 thay Vilao/DeepSeek: `AI_API_KEY`, `AI_MODELS`; mặc định cũ 4096 token/25s không đổi). Sinh với 8000 token/120s. Gemini thật chỉ dùng để chấm phát âm.
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

## V155 — Nâng cấp giao diện toàn site (CHỈ giao diện)
- Lớp thiết kế mới `css/design-v155.css` (nạp SAU `styles.css`; xoá link ở `index.html` là về giao diện cũ): token màu giấy–mực–ngọc, Hán tự dùng Noto Serif SC (link Google Font thêm ở `index.html`), thẻ/nút/ô nhập/điều hướng thống nhất, dark mode, chống tràn ngang ở ≤767px. Thanh điều hướng dưới đổi emoji → icon SVG.
- Hội thoại: `css/conversation-v155.css` + vẽ lại phần render trong `js/conversation.js` (class `cv-*`). Tách 2 màn: HỌC (danh sách thẻ + khung chat + thanh phát cố định) và DUYỆT (`convoOpenReview()`, chỉ admin; thẻ "Quản trị" ở đầu danh sách dẫn vào). Giữ nguyên toàn bộ hàm/API/id logic; thêm `convoBack`, `loadConvoAdminEntry`, `convoOpenReview`, `convoSetReviewTab`.
- Test cập nhật cho DOM mới: `test/v145-conversation.test.js`, `test/v153-conversation-review.test.js`.
- Chưa chạy Huashu Design thật (không cài/tải được trong môi trường) — áp dụng nguyên tắc tương đương thủ công.

## V156c — Quản lý câu ví dụ bằng file (admin): nhập, xoá theo file, xoá theo bài, xoá từng câu
- Trang Quản trị → panel "📄 Quản lý câu ví dụ bằng file": nhập từ .xlsx/.csv (cột `hz`,`zh`,`vi`; file được đọc ở trình duyệt rồi gửi JSON), xoá hàng loạt theo file (có bước **xem trước** rồi mới xác nhận), xem/xoá từng câu, xoá tất cả câu của 1 từ, **xoá theo bài** (`POST …/delete-by-lesson`, có xem trước; từ thuộc nhiều bài thì mất ví dụ ở cả bài khác).
- API (đều qua requireAdmin + logActivity): `POST /api/admin/word-examples/import`, `POST …/delete-by-file` (`dryRun`), `GET …/list?hz=`, `POST …/delete` (`id` hoặc `hz`). Hàm DB trong `lib/db.js`: `importWordExamples`, `deleteWordExamplesByRows`, `listWordExamples`, `deleteWordExample` — chỉ dùng bảng `word_examples` sẵn có (không đổi schema), nhập/xoá hàng loạt chạy trong transaction, tối đa 5000 dòng/lần; V156c: nhập/xoá theo LÔ (unnest) — 5000 dòng ~50ms thay vì hàng nghìn lượt gọi Neon.
- Quy tắc nhập: từ phải có trong kho từ vựng; câu phải chứa đúng chữ Hán (giống bước kiểm tra của AI); câu đã có (cùng hz+zh) bị bỏ qua; mỗi dòng bị bỏ qua kèm lý do + số dòng.
- Test: `npm run test:v156` (Postgres thật, như v154).

## V157 — Pinyin cho câu ví dụ + đọc đáp án 2 lần ở "Hôm nay học"
- File câu ví dụ có thêm cột **py** (pinyin cả câu, tuỳ chọn). `word_examples` thêm cột `py` bằng `ADD COLUMN IF NOT EXISTS` (không đổi/xoá dữ liệu cũ). Nhập lại file có py sẽ **bổ sung pinyin** cho câu đã có mà chưa có py (không ghi đè pinyin đã có). `getWordExamplesForLessons`/`listWordExamples` trả thêm `py`; engine (`findSentences`, `sentenceBank`, `OS.fromExamples`) chỉ thêm khoá `py` khi có. Màn đáp án (`rvSentenceBlockHtml`) hiện pinyin câu (theo công tắc "Hiện Pinyin").
- Hôm nay học: sau khi trả lời, đáp án (cả câu) được đọc **2 lần, nghỉ 1.1s** (`swSpeakAfterAnswer`), và chỉ **sang câu kế sau khi đọc xong** (`swWaitAnswerAudio` trong `rvCommitRating` và đường tự chuyển của luyện bổ sung; trần chờ 25s). Công tắc "Đọc đáp án 2 lần" trong ⚙️ khu vực học (mặc định bật; tắt → 1 lần); "Tự phát âm" tắt → không đọc, không chờ. Gửi FSRS xảy ra TRƯỚC bước chờ nên không bị trễ.
- Test: `npm run test:v157`, `npm run test:v156`.

## V158 — Nút "🔁 Học lại từ đầu" trong lúc học
- Thanh điều khiển phiên học (`sw-bar`) có nút mới `sw-reset-btn` → `swRestartSession()`: hỏi xác nhận, huỷ phần đọc đáp án đang chạy, rồi gọi `rvRelearnFromStart()` SẴN CÓ (lưu buổi cũ vào lịch sử, tải lại danh sách từ đầu; không xoá dữ liệu FSRS). Chỉ hiện khi đang trong phiên học (cùng điều kiện với nút Tạm dừng). Trước đây nút này chỉ có ở màn tổng kết cuối buổi.

## V159 — Prompt sinh câu ví dụ: ≥10 chữ Hán, ngữ pháp HSK 3.0 cấp 3–4, kèm pinyin
- `runWordExampleGeneration` (api/index.js): prompt mới — chuẩn HSK 3.0 cấp 3–4, từ đi kèm ≤ HSK 4, câu hoàn chỉnh **≥ 10 chữ Hán** (không tính dấu câu; trần 30 để các dạng cloze/sắp xếp ≤ 40 ký tự vẫn dùng được), mỗi từ nhận 3 **mẫu ngữ pháp gợi ý khác nhau** (`HSK34_GRAMMAR_PATTERNS`, xoay vòng theo vị trí từ), yêu cầu AI trả `py` (pinyin cả câu).
- Bộ lọc `validGeneratedExample`: phải chứa đúng chữ Hán của từ + có nghĩa + 10–30 chữ Hán; câu không đạt bị loại, từ thuộc diện "thử lại" ở lượt sau. `insertWordExamples` lưu `py`.
- Chỉ ảnh hưởng câu SINH MỚI; câu đã có không bị đổi (muốn làm lại: xoá theo bài rồi sinh lại). Danh sách mẫu là gợi ý tham chiếu, chưa đối chiếu với bản đặc tả HSK 3.0 chính thức.
- Test: `npm run test:v159`.

## V160 — Thay Vilao/DeepSeek bằng OpenRouter (model free)
- `api/index.js`: `AI_BASE_URL` mặc định `https://openrouter.ai/api/v1`, `AI_MODELS` mặc định `openrouter/free`, giãn cách gọi 3500ms (free ~20 req/phút), key đọc từ `AI_API_KEY` hoặc `OPENROUTER_API_KEY`, gửi header `HTTP-Referer`/`X-Title`; nếu model free không hỗ trợ JSON mode (400/404) thì tự gọi lại không JSON mode. Tên hàm `callGemini` và mọi nơi gọi giữ nguyên.
- Đổi trên Vercel: đặt `AI_API_KEY` = key OpenRouter (xoá `AI_BASE_URL`/`AI_MODELS` cũ của Vilao nếu đã đặt, vì chúng ghi đè mặc định mới). Test: `npm run test:v160`.

## V166 — Nhập hội thoại từ file ngoài (.xlsx/.csv)
- Màn Duyệt hội thoại (admin) có nút "📄 Nhập hội thoại từ file": chọn file → "Kiểm tra trước" (không ghi) → "Nhập". Có file mẫu tải về (nguồn: `templateRows()` trong `lib/conversation-import.js`, route `GET /api/admin/conversations/import-template`).
- Định dạng: mỗi DÒNG = 1 lượt. Thông tin bài (dialogue_id, title_zh, title_vi, hsk_level 3/4, topic, situation, characters) chỉ cần ở dòng đầu mỗi bài; dòng trống dialogue_id nối tiếp bài trên. Cột lượt: turn, character, zh, py, vi, vocab (`hz|py|nghĩa; ...`), grammar (`mẫu|ghi chú; ...`). Tiêu đề cột không phân biệt hoa/thường/dấu.
- `lib/conversation-import.js` (thuần): LỖI chặn bài = thiếu trường, HSK ≠ 3/4, <12 lượt (CHECK V152), trùng số lượt, id sai. CẢNH BÁO (vẫn nhập) = pinyin lệch số chữ Hán, chữ số/Latin trong zh, vocab không nằm trong câu — dùng đúng luật `validateTurnEdit` của bài AI soạn.
- `importConversationsFromFile` (lib/db.js): 1 transaction, chèn lượt theo lô; mặc định LƯU NHÁP (chờ duyệt), tuỳ chọn "Đăng ngay"; bài đã có → BỎ QUA, chỉ thay khi tick "Ghi đè" (đặt lại last_played_turn). `POST /api/admin/conversations/import-file {rows, dryRun, status, overwrite}`; tối đa 5000 dòng / 100 bài mỗi lần. Không gọi AI.
- Test: `npm run test:v166` (6 test thuần + 1 test Postgres thật).

## V167 — Dạng mới "Nghe câu → Chọn câu" (FSRS chính thức) ở "Hôm nay học"
- `listenSent2zh` (js/question-engine.js): đề chỉ có ÂM THANH cả câu (không hiện chữ); 4 lựa chọn là 4 câu chữ Hán (nhiễu = câu thật khác). Cùng nhóm với `listenSent2vi` (nghe → chọn nghĩa) nhưng đáp án là câu chữ Hán → luyện nhận ra câu bằng tai.
- CHÍNH THỨC: nhãn `review-listen-sent-zh` (lib/skills.js, `fsrs:true`, kỹ năng listening, sentField zh) → đổi lịch ôn như các câu hỏi theo câu khác; luyện thêm dùng `practice-listen-sent-zh`. Server vẫn tự tra câu thật rồi chấm (resolveSentenceAnswer) — không tin client.
- Nằm trong `SENTENCE_ORDER`, trọng số 1.0 (js/question-selector.js). Chỉ dựng khi máy có giọng đọc (`audioOk`) + từ có ≥1 câu ví dụ + đủ 3 câu nhiễu; không thì bỏ qua (không bịa, không rơi về từ đơn). Cùng kỹ năng với `listenSent2vi` nên hai dạng thay phiên nhau nhờ luân phiên dạng trong buổi.
- Test: `npm run test:v167`; đã cập nhật `v138-sentence` (SENTENCE_ORDER + bảng nhãn) và `adaptive-session` (case 5 chấp nhận cả 2 dạng nghe cả câu).

## V168 — Chế độ học ở "Hôm nay học" (Cơ bản / Nghe nhiều / Dịch nghe / Dịch đọc / Nhớ chữ Hán / Tổng hợp)
- `js/study-modes.js` (module THUẦN, global **`SMODE`** — KHÔNG đặt tên `SM`: đã là `js/session-summary.js`; test v168 có guard chống trùng const/let/class toàn cục giữa các script của index.html). Chế độ = bộ dạng đề + trọng số cho `QS.choose`; KHÔNG đổi thứ tự/danh tính thẻ đến hạn (FSRS + server quyết định) và KHÔNG đổi cách chấm (server vẫn tra đáp án theo nhãn `exerciseFsrs`).
- Cam kết (test khoá): mọi dạng của mọi chế độ là dạng CHÍNH THỨC (nhãn FSRS khớp `lib/skills.js`, không `practiceOnly`) và KHÔNG gõ bàn phím. Chế độ "Tổng hợp" = cách chọn cũ (vẫn có thể ra câu gõ nếu bật "Cho phép câu tự gõ" và kỹ năng đủ vững).
- `js/review.js`: `rvStudyMode()` (đọc `swPrefs.mode`; chế độ nghe + không có giọng đọc → tự về mix), `rvSetMode(id)`, `rvModePickerHtml()` (6 thẻ ở màn bắt đầu, chế độ nghe bị khoá + giải thích khi không có giọng đọc), `modeQ(...)` trong `rvBuildQuestionFor`: thẻ chính thức hỏi bằng dạng của chế độ (`fsrsOnly`); extra/redo cũng theo chế độ (vẫn luyện bổ sung, ưu tiên kỹ năng yếu nếu chế độ có dạng đó, loại `failedTypes`). Chế độ không dựng được câu (từ chưa có câu ví dụ…) → rơi về cách chọn mặc định, không bỏ thẻ.
- `js/study-workspace.js`: tuỳ chọn `mode` (lưu `swPrefs.v1`, mặc định mix, id lạ → mix) + hàng "Chế độ học" trong ⚙️ cài đặt học.
- Không đổi: api/, lib/ (không migration). Tỷ lệ dạng bài người học đã đặt (`rvQuestionMix`) vẫn được tôn trọng: dạng đặt "Tắt" bị loại khỏi chế độ; "Dịch nghe" nhân thêm trọng số (listenSent2vi ×2, listenSent2zh ×1, listen2vi ×0.5).
- Test: `npm run test:v168` (26 test; có trong verify:ui + verify:core); `adaptive-session` cập nhật danh sách hàm trích (thêm rvAudioOk, rvStudyMode).
- Chưa kiểm tra trên trình duyệt thật (chỉ dựng thử HTML bộ chọn với CSS thật: sáng/tối/điện thoại ổn).

## V170 — Nhập câu ví dụ từ file: tối đa 3 cặp / 1 từ
- `js/example-file.js` (module thuần, global `EXF`): `expandRows(rawRows)` tách mỗi dòng file thành ≤3 dòng `{hz,zh,vi,py}` (cột `zh1/py1/vi1 … zh3/py3/vi3`; cặp 1 có thể ghi `zh/py/vi`; tiêu đề không phân biệt hoa/thường/dấu; nhận cả file kiểu cũ 1 câu/dòng; cột cặp 4+ bị báo "bỏ qua"). `labelFor` đổi số dòng server → "dòng (cặp n)".
- `js/admin.js`: mẫu `.xlsx` mới 3 cặp; `readExampleFile` trả `{rows, src, ignoredColumns}`; nhập theo lô 4000 (server giữ giới hạn 5000/lần) và gộp kết quả; xoá-theo-file dùng cùng bộ đọc (tối đa 5000 câu).
- Server (`importWordExamples`, api) KHÔNG đổi. Lưu ý: màn học vẫn lấy 1 ví dụ/từ (V165 `DISTINCT ON (hz)`) — 3 cặp được lưu đủ trong `word_examples` nhưng chỉ 1 cặp (ưu tiên có pinyin, mới nhất) hiện ở "Hôm nay học".
- Test: `npm run test:v170` (10 test; có trong verify:ui).

## V171 — Cấu hình TẤT CẢ AI ở màn Quản trị (không phải sửa code / biến môi trường)
- `lib/ai-config.js` (THUẦN): `resolve(stored, env)` = DB > biến môi trường > mặc định (kèm `sources` từng trường), `applyPatch` (kiểm tra: URL https [http chỉ localhost], model ≤10 / ký tự an toàn, giãn cách 0–120000, bước 1–8, khoá 8–600 ký tự; ô thường rỗng = xoá ghi đè; ô khoá rỗng = GIỮ; `clearKey/clearToken`, `reset` theo nhóm), `publicView` (KHÔNG có khoá — chỉ `{set, source, tail}`), `imageEnv` (phủ CF_* lên env cho lib/word-images.js), `PRESETS` (OpenRouter, Gemini-OpenAI, OpenAI, Groq, tự nhập).
- 3 nhóm: `text` (API kiểu OpenAI /chat/completions), `speech` (Gemini chấm phát âm), `image` (Cloudflare FLUX). Biến môi trường cũ vẫn là dự phòng → hệ thống đang chạy bằng env chạy y như cũ cho tới khi có người lưu ở Quản trị.
- `lib/db.js`: bảng `ai_config` (1 dòng id=1, JSONB; tự tạo) + `getAiConfigRow/saveAiConfigRow`. Chứa khoá API (DB của bạn) — không bao giờ trả ra client, không vào nhật ký.
- `api/index.js`: `getAiRuntime()` cache 20 giây/instance (lỗi đọc DB → dùng cache cũ/env, không làm chết AI); `callGemini` (async) / `callGeminiWithAudio` / `doCallAi` (nhận `opts._cfg`) / `wordImagesService().env` đọc cấu hình này. `reasoning` + header OpenRouter chỉ gửi khi nhà cung cấp là OpenRouter (OpenAI/Groq có thể từ chối tham số lạ). Middleware làm "nóng" cache cho /api/word-image, /api/admin/word-images, /api/cron. Route superadmin: `GET/POST /api/admin/ai-config`, `POST /api/admin/ai-config/test` (gọi thử THẬT 1 model/lần với tin nhắn nhỏ; phát âm: GET model Gemini; lỗi được che khoá).
- `js/admin-ai.js` + `js/admin.js`: panel "🤖 Cấu hình AI" ở tab Quản trị (chỉ superadmin): chọn nhà cung cấp (điền sẵn URL + model), URL, khoá (ẩn), danh sách model theo thứ tự ưu tiên + nút ▶ Thử từng model, giãn cách, mức suy luận; khối Gemini phát âm; khối Cloudflare ảnh; huy hiệu nguồn (Đã lưu / env / Mặc định / Chưa đặt).
- Test: `npm run test:v171` (13 + 3 Postgres thật); v160 sửa theo (mặc định nằm ở lib/ai-config). Chưa kiểm tra bằng nhà cung cấp AI thật và trình duyệt thật. Hạn chế: không thử được Cloudflare ảnh từ màn này (chỉ lưu); instance khác thấy thay đổi sau ≤ 20 giây.
