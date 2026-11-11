# INDEX — báo cáo audit theo version

Mỗi dòng một dòng tóm tắt để tìm đúng báo cáo mà **không phải mở/grep từng file**.
Chỉ đọc báo cáo khớp với lỗi đang sửa.

| File | Nội dung |
|---|---|
| `AUDIT-REPORT-V69.md` | Audit FSRS → V69 "Pure FSRS" (báo cáo cuối) — mốc kiến trúc FSRS hiện tại |
| `AUDIT-REPORT-V72-HIEU-NANG.md` | Hiệu năng: "thời gian phản hồi khi học quá chậm" |
| `AUDIT-REPORT-V79.md` | FSRS / Study Session / Study Queue / đồng bộ Neon / cache / chống lặp từ |
| `AUDIT-REPORT-V82-UX-PERF.md` | UX/UI & responsiveness của luồng học |
| `AUDIT-REPORT-V83-FSRS-OPTIMIZER.md` | FSRS Personal Optimizer (audit gốc) |
| `AUDIT-REPORT-V83-FSRS-OPTIMIZER-v4.md` | Optimizer trên Vercel: root cause + fix (v3/v4) |
| `AUDIT-REPORT-FSRS-OPTIMIZER.md` | Audit lại optimizer, bản yêu cầu đầy đủ 16 phần |
| `EDGE-TTS-TEST-REPORT.md` | Phòng thử `/tts-lab`: 2 voice đại lục, 5 tốc độ, 50/50 MP3 OK; Vercel không chạy Python |
| `AUDIT-REPORT-V85-ASYNC-OPTIMIZER.md` | Optimizer: kiến trúc bất đồng bộ (async job) |
| `AUDIT-REPORT-V86-FSRS-OPTIMIZER-DURABILITY.md` | Optimizer: durable retry + checkpoint |
| `AUDIT-REPORT-V87-FAILED-TO-FETCH.md` | "Failed to fetch": tách GET /status khỏi native optimizer |
| `AUDIT-REPORT-V89-CONTINUATION-CLAIM-BUG.md` | Root cause "mất heartbeat / retry tối đa 3 lần" |
| `AUDIT-REPORT-V90-FSRS-OPTIMIZER-ROOT-CAUSE.md` | Root cause của cùng lỗi heartbeat (audit lại) |
| `AUDIT-REPORT-V92-BROWSER-TRAINING-MIGRATION.md` | Chuyển train optimizer sang trình duyệt |
| `AUDIT-REPORT-V93-VOCAB-IDENTITY.md` | Thống nhất vocabulary identity giữa các bài |
| `AUDIT-REPORT-V93.1-TIMEOUT-FIX.md` | "Failed to fetch" khi Import Excel |
| `AUDIT-REPORT-V94-NOISY-REVIEW-FIX.md` | Loại review nhiễu khi thoát tab rồi vào lại |
| `AUDIT-REPORT-V95-BROWSER-OPTIMIZER-NESTED-DEPS.md` | Lỗi resolve `@napi-rs/wasm-runtime` (nested deps) |
| `AUDIT-REPORT-V96-BROWSER-OPTIMIZER-WORKER-REWRITE.md` | Lỗi còn lại sau V95: viết lại worker + import map |
| `AUDIT-REPORT-V97-VERCEL-INCLUDEFILES-ROOT-CAUSE.md` | Nguyên nhân thật: `vercel.json` includeFiles |
| `AUDIT-REPORT-V97.1-DELETE-FK-VIOLATION.md` | "Lỗi server nội bộ" khi xoá bài/từ/toàn bộ dữ liệu |
| `AUDIT-REPORT-V110-ADAPTIVE-RETENTION.md` | Câu tự nhập, trí nhớ dài hạn, khuyến nghị cá nhân hoá |
| `AUDIT-REPORT-V113-SKILL-EVIDENCE.md` | Bằng chứng kỹ năng, loại lượt "vừa xem đáp án", khoảng nghỉ |
| `AUDIT-REPORT-V114-INTRO-FLAG-TODAY-PROGRESS-DRYRUN.md` | Cờ `introduced`, tỉ lệ đúng, DRY_RUN của migration |
| `AUDIT-REPORT-V115-GHI-NHO-HIEU-QUA.md` | Cải tiến ghi nhớ hiệu quả hơn |
| `AUDIT-REPORT-V116-MENU-GON-BO-MEO-NHO.md` | Menu gọn + gỡ "Mẹo nhớ" khỏi giao diện |
| `AUDIT-REPORT-V117-STUDY-WORKSPACE.md` | Study Workspace + dạng bài bổ sung |
| `AUDIT-REPORT-V118-ADAPTIVE-SESSION.md` | Đổi chiều truy xuất khi sai, trần luyện lại, tổng kết |
| `AUDIT-REPORT-V119-AI-GIAI-THICH.md` | "Hỏi AI" ở câu sai + Thư viện AI + đếm ngày học |
| `AUDIT-REPORT-V127-KIEM-TOAN-DOC-LAP.md` | Kiểm toán độc lập V127 (trắc nghiệm thích ứng) |
| `AUDIT-REPORT-V127-ADAPTIVE-LEARNER.md` | Nối phân tích năng lực vào việc chọn dạng câu |
| `AUDIT-REPORT-V128-KE-HOACH-LUYEN.md` | V128 giai đoạn 1: kế hoạch ưu tiên theo năng lực |
| `AUDIT-REPORT-V128-GIAI-DOAN-2.md` | V128 giai đoạn 2: câu luyện thêm theo kỹ năng tụt lại |
| `AUDIT-REPORT-V128-GIAI-DOAN-3.md` | V128 giai đoạn 3: thích ứng ngay trong buổi học |
| `AUDIT-REPORT-V128-GIAI-DOAN-4.md` | V128 giai đoạn 4: luyện thêm kỹ năng Nhận diện |
| `AUDIT-REPORT-V129-SUA-PHAT-AM.md` | Sửa phát âm cho chữ Hán đa âm (多音字) |
| `AUDIT-REPORT-V130-CAU-3-PHAN.md` | "Câu 3 phần" cho màn Hôm nay học |
| `AUDIT-REPORT-V131-GIAI-DOAN-2A.md` | Server chấm "câu 3 phần" cho thẻ FSRS chính thức |
| `AUDIT-REPORT-V131B-GIAI-DOAN-2B.md` | Thẻ ôn chính thức dạng "câu 3 phần" (mặc định TẮT) |
| `AUDIT-REPORT-V131C-GIAI-DOAN-2C.md` | Tinh chỉnh "câu 3 phần" thẻ chính thức |
| `AUDIT-REPORT-V132-CHI-BAM-CHON.md` | Phương pháp luyện CHỈ CHẠM CHỌN |
| `AUDIT-REPORT-V133-A-HAY-B-NGHE-GHEP.md` | "A hay B?" + ghép cặp nghe ↔ chữ Hán |
| `AUDIT-REPORT-V134-DUNG-SAI-VA-SUA-THONG-KE.md` | "Đúng hay sai?" + sửa lỗi thống kê câu 2 đáp án |
| `AUDIT-REPORT-V135-SAP-XEP-CAU.md` | "Sắp xếp câu" + mỗi từ bù đủ 3 câu ví dụ |
| `AUDIT-REPORT-V136-TY-LE-DANG-BAI.md` | Tỷ lệ từng dạng bài trong Cài đặt; cloze mặc định "Nhiều" |
| `AUDIT-REPORT-V137-OPTIMIZER-WASM-RUNTIME-RESOLVE.md` | Optimizer: `@napi-rs/wasm-runtime` không resolve (đóng gói + exports + độ sâu đồ thị) và `NotEnoughData` (sai hình dạng mẫu train) |
| `AUDIT-REPORT-V138.md` | Kiểm toán trước V138: câu hỏi theo câu thay trắc nghiệm từ đơn lẻ |
| `AUDIT-REPORT-V138-IMPLEMENTATION.md` | V138 triển khai: 4 dạng câu mới, FSRS 1 thẻ/câu, âm thanh cả câu, trần 0–15 |

- `AUDIT-REPORT-V139-EDGE-TTS-INTEGRATION.md` — tích hợp Edge-TTS lần đầu.
- `AUDIT-REPORT-V140-NATURAL-SPEECH.md` — đọc tự nhiên, câu dài, hội thoại nhiều nhân vật, luyện nghe, cache.
- `AUDIT-REPORT-V141-R2-AUDIO-LIBRARY.md` — thư viện âm thanh dùng chung: Neon `audio_library` + Cloudflare R2, presigned URL, health check, fallback.
- `AUDIT-REPORT-V142-WORD-IMAGES.md` — ảnh gợi nhớ từ vựng: Workers AI FLUX.1 schnell → R2, sinh nền theo lô, thẻ admin, sửa COEP/crossorigin.
- `AUDIT-REPORT-V143-TODAY-UX.md` — màn "Hôm nay học": ảnh gợi nhớ hiện ngay giữa thẻ (bỏ mục gập), chạm xem lớn, tải trước thẻ kế tiếp; cài đặt hằng ngày gập sẵn.
- `AUDIT-REPORT-V144-WORD-IMAGE-MANAGER.md` — quản lý & kiểm tra ảnh gợi nhớ: thống kê theo từ/bài/nhãn, kiểm tra thật trên R2 (4 mức xác minh), hàng đợi ưu tiên 37→36→38→sửa ảnh lỗi→mở rộng, CSV, sửa ảnh hỏng có xác minh.
- `AUDIT-REPORT-V146-SESSION-SIZE.md` — "Hôm nay học" nhận thiếu thẻ so với dashboard: bỏ trần 6 thẻ, backlog theo phạm vi, cooldown thẻ đang học 15 phút, lấy dư trước khi khử trùng hz.
- `AUDIT-REPORT-V147-TTS-LATENCY.md` — Edge-TTS trễ/không đọc: hedged request R2↔Edge-TTS, tải trước đoạn kế, phần tử audio dùng chung + mở khoá autoplay, retry Python/Node, token nội bộ, UI "đang tải" thay vì "bị chặn".
- `AUDIT-REPORT-V148-REMOVE-R2-AUDIO.md` — bỏ R2 khỏi âm thanh: Edge-TTS gọi trực tiếp (IndexedDB → /api/tts → Web Speech); gỡ thư viện âm thanh, route resolve/health, token nội bộ; ảnh gợi nhớ vẫn dùng R2.
