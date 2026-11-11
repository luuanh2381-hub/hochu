# HANDOFF — trạng thái dự án

Cập nhật lần cuối: 2026-11-10 · Commit: xem `git log -1`

**Đọc file này đầu mỗi phiên thay vì dò lại repo.** Bản đồ kiến trúc đầy đủ nằm trong `CLAUDE.md`.
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

## Version hiện tại
Phiên bản mới nhất đã ship: **V141** — Thư viện âm thanh dùng chung: mỗi (câu, giọng, tốc độ) = 1 MP3
trên Cloudflare R2, metadata trong Neon `audio_library`, sinh lazy bằng Edge-TTS khi nghe lần đầu.
Client: IndexedDB → `/api/audio/resolve` (presigned R2) → Edge-TTS trực tiếp → Web Speech.
Health check admin: `GET /api/r2/health`. Chi tiết: `docs/audit/AUDIT-REPORT-V141-R2-AUDIO-LIBRARY.md`.
**Hậu kiểm 2026-11-09:** bucket trống vì AWS SDK v3 tự gắn checksum CRC32 FULL_OBJECT mà R2 không
hỗ trợ → `PutObject` bị từ chối, frontend fallback Edge-TTS. Đã tắt bằng
`requestChecksumCalculation/responseChecksumValidation = 'WHEN_REQUIRED'`, thêm log từng bước,
`HeadObject` xác minh trước khi `ready`, health kiểm thêm `verify` + `tts`. **Chưa xác nhận upload
thật** (local không có credentials/phiên admin) — xem mục 9 báo cáo V141 để chạy hậu kiểm.
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
| `npm run test:v141` | 41 pass (R2/thư viện âm thanh, không cần mạng/DB) |
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
