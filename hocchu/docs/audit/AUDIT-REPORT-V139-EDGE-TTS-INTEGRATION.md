# V139 — Tích hợp Edge-TTS (bản chuẩn bị deploy)

Ngày: 2026-11-09

## Thay đổi
- `api/edge-tts.py`: Python Function cho Edge-TTS; whitelist Xiaoxiao/Yunxi, 500 ký tự,
  5 mức tốc độ, giới hạn body 16 KB, timeout 45 giây, trả MP3, không log nội dung.
- `requirements.txt`: khóa `edge-tts==7.3.1`.
- `vercel.json`: rewrite chính xác `/api/tts` tới `/api/edge-tts`, giữ rewrite API Node catch-all
  cho các endpoint khác; Python function đặt `maxDuration: 60`.
- `js/audio.js`: Edge-TTS là đường đọc chính; IndexedDB cache theo SHA-256(text+voice+rate),
  tối đa 300 file hoặc 40 MB hoặc 40 MB; mỗi lần chỉ một audio/request hoạt động (request cũ bị huỷ); có nút tạm dừng/tiếp tục/dừng; fallback Web Speech nếu Edge-TTS lỗi.
- `index.html`: chọn giọng nữ/nam, chỉnh tốc độ 0.8–1.2x.
- `js/auth.js`: lưu voice/rate trong UI preferences. Các giá trị tốc độ cũ ngoài khoảng được
  chuẩn hóa về 0.9x.
- `test/test_edge_tts_api.py`: kiểm thử whitelist, validation, giới hạn ký tự và rate limit.

## Bảo toàn
Chỉ bổ sung whitelist `ttsRate`/`ttsVoice` trong `/api/progress` để lưu tuỳ chọn; không đổi DB/schema. Không sửa `lib/fsrs/`, `lib/fsrs/reviewService.js`, `js/question-engine.js`,
`js/question-selector.js`, schema database, migration, dữ liệu từ vựng hoặc luồng chấm đáp án.

## Kiểm thử trong gói mã nguồn
- Python unit tests: cần chạy bằng `python3 -m unittest test/edge-tts-api.test.py`.
- JavaScript syntax: `node --check js/audio.js`.
- JSON parse: `python3 -m json.tool vercel.json`.
- Các test dự án: `npm run verify:core`, `npm run verify:server`, `npm run verify:ui`,
  `npm run verify:fsrs`, `npm run test:v138`.

## Chưa xác minh
- Chưa cài dependency `edge-tts` trong môi trường kiểm tra này, do đó chưa gọi Edge-TTS thật.
- Chưa chạy `vercel build` hoặc deploy Preview/Production.
- Chưa xác minh route `/api/tts` sau rewrite trong deployment thật.
- Chưa nghe thử trên Android/desktop, chưa xác nhận pause/resume khi app chạy nền.
- Rate limit serverless là best-effort theo từng warm instance, không phải giới hạn toàn cục.
- Edge-TTS là dịch vụ không chính thức, có thể thay đổi hoặc ngừng hoạt động.

## Rollback
Để quay về Web Speech: khôi phục `js/audio.js`, `index.html`, `js/auth.js`, `vercel.json`,
`api/edge-tts.py` và `requirements.txt` từ commit trước. Không cần rollback dữ liệu vì cache chỉ
nằm trong IndexedDB và preferences chỉ là UI settings.

- Chất lượng giọng chưa được đánh giá bằng tai trên thiết bị thật; đây mới là tích hợp kỹ thuật.
