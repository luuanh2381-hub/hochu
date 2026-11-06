# HANDOFF — trạng thái dự án

Cập nhật lần cuối: 2026-11-06 · Commit: xem `git log -1`

**Đọc file này đầu mỗi phiên thay vì dò lại repo.** Bản đồ kiến trúc đầy đủ nằm trong `CLAUDE.md`.

## Version hiện tại
Phiên bản mới nhất đã ship: **V135** — dạng "🧩 Sắp xếp câu" (`orderSentence`, practiceOnly) +
mỗi từ bù đủ 3 câu ví dụ (`MIN_EXAMPLES_PER_WORD = 3`). Chi tiết: `docs/audit/AUDIT-REPORT-V135-SAP-XEP-CAU.md`.

## Việc còn tồn (từ báo cáo V135)
- Chưa thử trên trình duyệt/điện thoại thật (chạm mảnh, bố cục hẹp, giọng đọc sau khi trả lời).
- Chưa gọi `/api/skills/practice` end-to-end với Express + Postgres thật.
- Chưa đo chi phí AI thật khi `MIN_EXAMPLES_PER_WORD = 3` (nếu tốn, hạ về 2).
- `Intl.Segmenter` với tiếng Trung trên Safari cũ chưa kiểm (đã có đường lùi tách từng chữ).

## Cố ý CHƯA làm
Kéo–thả mảnh chữ (chỉ dùng chạm) · sinh câu bằng AI lúc làm bài · tính sắp-xếp-câu vào kế hoạch năng lực V128.

## Trạng thái test (đo trên máy này, 2026-11-06)
| Lệnh | Kết quả |
|---|---|
| `npm run verify:core` | 5/5 file test qua |
| `npm run verify:server` | 4/4 file test qua |
| `npm run verify:ui` | 6/6 file test qua |
| `npm run verify:fsrs` | 4/4 file test qua |
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
