# AUDIT V148 — Bỏ R2 khỏi âm thanh, Edge-TTS gọi trực tiếp

## Yêu cầu
"Loại bỏ hoàn toàn việc xuất hiện của R2. Từ nay Edge-TTS gọi trực tiếp."

## Luồng âm thanh sau V148
IndexedDB (máy người học) → `POST /api/tts` (Vercel rewrite → `api/edge-tts.py`) → Web Speech dự phòng.
Không còn bước hỏi server, không còn presigned URL, không còn hedge (gọi song song) như V147.

## Đã gỡ
- `lib/audio-library.js` (thư viện âm thanh Neon + R2, `ttsUrl()`, `probeTts()`), `test/v141-audio-library.test.js`.
- Route `POST /api/audio/resolve` và `GET /api/r2/health` trong `api/index.js`.
- `js/audio.js`: `audioLibraryResolve`, `audioFetchBlob`, `audioLibraryBlob`, `ttsAcquireBlob`, `TTS_HEDGE_MS`.
- `api/edge-tts.py`: `AUDIO_INTERNAL_TOKEN` / header `x-audio-internal` / `_is_internal` / `hmac` (không còn lời gọi nội bộ từ Node,
  mỗi người học gọi từ IP của mình nên giới hạn 60 request/phút/IP áp dụng cho mọi lời gọi).
- `lib/r2.js`: `putMp3`, `presignGet`, `storageKey`, `head`, `health`, `isMp3` (chỉ còn phần ảnh).
- Script `test:v141`; tham chiếu trong `scripts/verify.js`.

## Giữ nguyên (cố ý)
- Khoá cache IndexedDB `AH.canonical` + `TTS_VERSION` — đổi sẽ làm mất toàn bộ cache âm thanh đã tải trên máy người học.
- **Ảnh gợi nhớ (V142/V144) vẫn lưu trên R2**: `lib/r2.js` (putImage, presignImageGet, headObject), biến `R2_*`, gói `@aws-sdk/*`.
  Gỡ nốt R2 nghĩa là phải chọn nơi lưu ảnh khác hoặc bỏ tính năng ảnh — chưa làm vì chưa có yêu cầu.
- Các báo cáo audit cũ (V141, V147…) và `migrations/V141_audio_library.sql` giữ nguyên làm lịch sử.

## Việc người dùng cần làm
1. Xoá biến môi trường `AUDIO_INTERNAL_TOKEN`, `AUDIO_TTS_URL` ở Vercel (không còn dùng).
2. Tuỳ chọn: chạy `migrations/V148_drop_audio_library.sql` để xoá bảng `audio_library`.
3. Nghe thử trên iPhone/Android sau khi deploy.

## Kiểm chứng
`npm run test:v148` (10 test đọc mã nguồn), `npm run test:v147` (17 test nạp thật `js/audio.js` vào vm + 14 test Python),
`test:v142` / `test:v144` (ảnh gợi nhớ còn chạy). **Chưa kiểm chứng:** phát âm thanh thật trên trình duyệt/điện thoại, Edge-TTS thật từ Vercel.
