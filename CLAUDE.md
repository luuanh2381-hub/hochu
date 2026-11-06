## AUTOMATIC GIT COMMIT AND PUSH

After completing every coding task, follow this workflow:

1. Inspect git status and git diff.
2. Run relevant tests, syntax checks and build checks.
3. Fix errors caused by your changes before committing.
4. If checks pass, automatically stage only files modified or created for the current task.
5. Create a descriptive commit message using conventional commit style.
6. Automatically push the commit to origin/main.
7. Verify that the push succeeded.
8. Report the commit hash, changed files, tests and push status.

IMPORTANT RULES:
- Do not wait for the user to request a commit.
- Do not ask for confirmation before normal git add, git commit or git push operations.
- Never stage unrelated user changes.
- Never overwrite or discard existing user changes.
- Never use git reset --hard or git clean -fd.
- Never commit API keys, passwords, tokens, .env files or other secrets.
- Never force push.
- If tests fail, do not commit or push. Report the errors.
- If there are merge conflicts, stop and report them.
- If push fails, diagnose the problem and report it.
- Never claim success unless Git confirms it.

---

## BẢN ĐỒ DỰ ÁN (đọc phần này TRƯỚC khi grep khám phá)

App học từ vựng tiếng Trung. **Không có build step**: frontend là script thuần nạp theo thứ tự
trong `index.html`; backend là 1 Express app chạy serverless trên Vercel + Postgres (Neon).

| Đường dẫn | Trách nhiệm | Dòng |
|---|---|---|
| `api/index.js` | TOÀN BỘ route API (~110 route). File lớn nhất — xem bảng vùng bên dưới | 3310 |
| `lib/db.js` | Lớp lưu trữ Postgres, 54 export, `readDB/updateDB`, cache book-defs | 2085 |
| `lib/fsrs/` | `scheduler` (bọc ts-fsrs), `reviewService` (nguồn sự thật duy nhất), `cardMapper`, `analytics`, `studyScope` (phạm vi bài), `optimizer` (FSRS personal optimizer, phức tạp nhất), `study-time` | ~3247 |
| `lib/skills.js` | Nhãn kỹ năng + quy tắc THUẦN dùng chung server/client (không DB) | 230 |
| `lib/skill-store.js` | Lưu/truy vấn hồ sơ kỹ năng (Postgres) | 701 |
| `lib/skill-*.js` | `adaptive` (đề xuất), `recommend` (V110), `pooled` (V115) — đều THUẦN | — |
| `js/*.js` | Frontend, module IIFE toàn cục (`QE`, `QS`, `OS`, `AM`). Thứ tự nạp trong `index.html` QUAN TRỌNG | 12.4k |
| `test/*.js` | 51 file, `node:assert` thuần, không cần framework | 13.5k |
| `migrations/*.sql` | Schema tiến hoá theo version (V69 → V129) | 13 file |
| `docs/audit/*.md` | 43 báo cáo audit theo version — **tra cứu khi cần, KHÔNG đọc hết** | 432KB |
| `docs/audit/INDEX.md` | Mục lục 1 dòng/báo cáo — **tìm ở đây trước khi mở file** | ngắn |
| `docs/HANDOFF.md` | Trạng thái hiện tại + việc còn tồn. **Đọc file này ở đầu phiên mới** | ngắn |

### Vùng trong `api/index.js` (dùng `offset`/`limit` thay vì đọc cả file)
| Dòng | Nội dung |
|---|---|
| 1–210 | Import, config, rate-limit, xử lý lỗi, helper auth |
| 211–451 | `/api/auth/*`, register, login, logout, progress, leaderboard |
| 452–643 | Admin: users, logs, visits, settings đăng ký |
| 644–684 | `/api/vocab`, `/api/books` (đọc) |
| 685–912 | FSRS study: `/api/study/today|session|review|review/preview` |
| 912–1042 | Skills V104: overview, weak-words, trend, practice |
| 1042–1139 | Skills V110: retention, learner, recommendations |
| 1139–1246 | Notes V105 + skills confusion/delayed/word |
| 1246–1423 | Retention, reset, fsrs/stats, dashboard, heatmap, session start/heartbeat |
| 1423–1650 | Optimizer phía server: health/status/diagnostics/run/worker |
| 1650–2233 | Optimizer trong TRÌNH DUYỆT: prepare/heartbeat/cancel/commit, phục vụ package, importmap |
| 2233–2500 | Admin vocab CRUD, import Excel, orphans |
| 2500–3030 | Gemini AI dịch câu, hán việt, chiết tự, word-examples |
| 3030–3250 | `/api/ai/explain`, TTS hints, thư viện AI |
| 3250–3310 | Cron sinh dữ liệu hằng ngày |

### Module dùng CHUNG server + browser (sửa là ảnh hưởng cả hai phía!)
`js/question-engine.js`, `js/question-selector.js`, `js/order-sentence.js`, `js/answer-match.js`,
`js/skill-score.js`, `js/sentences-data.js`, `lib/skills.js`.
Chúng theo mẫu: `const X = (function(){...})(); if (typeof module !== 'undefined' && module.exports) module.exports = X;`
→ **Không** dùng `window`/`document` trong các file này.

### Kiến trúc đáng nhớ
- FSRS do `ts-fsrs` quyết định hoàn toàn; `lib/fsrs/reviewService.js` là nguồn sự thật duy nhất.
- Có 2 đường: **FSRS chính thức** (`exerciseFsrs`, đổi lịch ôn) và **luyện bổ sung** (`practiceOnly`, không đụng FSRS).
  Nhãn trong `js/question-engine.js` (`TYPES`) và `lib/skills.js` phải khớp nhau.
- Kỹ năng: `recognition` · `recall` · `listening` · `pinyin` · `context`.

---

## LỆNH THƯỜNG DÙNG (chạy đúng phạm vi, không chạy hết mọi lúc)

**Ưu tiên `npm run verify:<vùng>`** — 1 lượt gọi làm cả syntax + test, PASS chỉ in 1 dòng/file,
FAIL in đầy đủ output:

```bash
npm run verify:server   # api/index.js + lib/**       (~4 test)
npm run verify:ui       # js/*.js                      (~6 test)
npm run verify:core     # module thuần dùng chung      (~5 test)
npm run verify:fsrs     # lib/fsrs/** + optimizer      (~4 test)
```
Khi chỉ sửa 1 vùng → chỉ chạy vùng đó. Sửa module dùng chung (`core`) → chạy thêm `server` + `ui`.

Lệnh lẻ khi cần:
```bash
node --check <file>            # check 1 file
npm test                       # fsrs.test.js
npm run test:vNNN              # test theo version (vd test:v135)
npm run test:quiet -- test/a.test.js test/b.test.js   # nhiều file, chỉ in khi lỗi
npm run token:report [--all]   # số token thật từ log phiên
```
Test cần `DATABASE_URL` (chỉ các file `*.integration.*` và `v114-fixes`, `heavy-distractor`) —
**không** đưa chúng vào lệnh verify.
`test/skills.test.js` lấy bản gốc `api/index.js` từ `git` (commit gốc); nếu môi trường không có git,
đặt `HOCHU_ORIG_API=<đường dẫn file>`.


---

## QUY TẮC TIẾT KIỆM NGỮ CẢNH (bắt buộc)

1. **Gộp lệnh tìm kiếm**: tối đa 1 Bash call cho nhiều `grep`/`sed`, nối bằng `;` + `echo '==='`.
2. **Tìm kiếm bằng `git grep -n -- '*.js'`** thay vì `grep -r` (tránh quét `node_modules` 21MB).
3. **Đọc theo khoảng**: file > 400 dòng → `Read` với `offset`/`limit`, hoặc grep lấy số dòng rồi đọc đúng vùng.
4. **Không đọc lại file đã đọc** trong cùng phiên; đừng đọc lại để "xác nhận" sau khi Edit (Edit đã báo lỗi nếu sai).
5. **Không đọc hết `docs/audit/`**: chỉ mở báo cáo liên quan tới lỗi đang sửa.
6. **Không chạy test ngoài phạm vi** đã sửa (trừ khi sửa module dùng chung ở trên).
7. **Chỉ đọc `.env` nếu được yêu cầu** — không bao giờ in ra, không commit.
8. Khi bắt đầu phiên mới: đọc `docs/HANDOFF.md` (~60 dòng) thay vì dò lại toàn repo.
9. **Báo cáo token**: chỉ dùng `npm run token:report` — không tự viết lại script python rời.
   Nếu lệnh không truy cập được log thì nói rõ "không có dữ liệu", KHÔNG ước lượng thay số thật.
