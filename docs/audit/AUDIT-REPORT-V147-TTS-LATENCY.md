# AUDIT-REPORT-V147 — Edge-TTS bị trễ / không đọc

Ngày: 2026-11-11. Phạm vi: đường phát âm thanh (client `js/audio.js`, `js/study-workspace.js`; server `api/edge-tts.py`,
`lib/audio-library.js`). Không đụng FSRS, Question Engine, dữ liệu từ vựng, schema DB.

## 1. Nguyên nhân tìm được (đọc code + mô phỏng; CHƯA đo trên Vercel/điện thoại thật)

| # | Nguyên nhân | Hậu quả | Sửa |
|---|---|---|---|
| 1 | Người đã đăng nhập đi qua chuỗi dài: Node → Python → Microsoft → R2 PUT → HEAD → Neon → ký URL → tải lại R2 | ~4,6–18 s lần đầu (đường trực tiếp chỉ 1–3 s) | **Hedged request**: R2 chưa trả MP3 sau 2,5 s → gọi `/api/tts` song song, dùng bản về trước. Server vẫn tạo MP3 R2 nền |
| 2 | R2 lỗi (CORS chưa đặt…) → bỏ kết quả rồi gọi Edge-TTS lần 2 | ~6–29 s, gọi Microsoft 2 lần | R2 lỗi nhanh → gọi ngay; cấu hình CORS (mục 3) |
| 3 | Đoạn kế tiếp chỉ tải sau khi đoạn trước phát xong | Khựng 1–10 s giữa các lượt hội thoại / câu dài | Tải trước đúng 1 đoạn kế tiếp |
| 4 | UI báo "bị chặn" sau 1,8 s dù chỉ đang tải | Người học tưởng hỏng | Thêm trạng thái "⏳ Đang tải…"; chỉ báo "bị chặn" khi lỗi thật hoặc quá 60 s |
| 5 | `audio.play()` chạy sau await mạng + `new Audio()` mỗi lần | iOS/Safari chặn autoplay → EDGE_TTS_PLAY_ERROR → Web Speech (có thể im lặng) | 1 phần tử `<audio>` dùng chung, mở khoá bằng WAV im lặng ở lần chạm đầu |
| 6 | `swPlayTracked` đòi `speechSynthesis` | WebView không có speechSynthesis → không bao giờ phát | Bỏ điều kiện |
| 7 | Python không retry, không đặt `connect_timeout` | 1 lần Microsoft từ chối/ngắt = rơi xuống Web Speech | Retry tối đa 3 lần trong ngân sách 45 s, timeout mỗi lần theo độ dài văn bản |
| 8 | Lời gọi nội bộ cùng 1 IP nguồn → chung giới hạn 60 req/phút; `VERCEL_URL` có thể bị Deployment Protection (401) | 429 / 401 → R2 không bao giờ được tạo | Token nội bộ `AUDIO_INTERNAL_TOKEN`; ưu tiên `VERCEL_PROJECT_PRODUCTION_URL`; Node retry 429/5xx 1 lần, KHÔNG retry 401/403/404 |

Sửa thêm: `ttsStopCurrent` giờ huỷ mọi request đang chạy, xoá bản gộp inflight và giải phóng promise phát đang chờ
(trước đây dừng lúc đang phát có thể treo `ttsSpeakSegments`; bấm dừng rồi bấm lại cùng câu có thể dùng request đã huỷ).

## 2. Kiểm thử

- `test/v147-tts-latency.test.js` (21 test): hedge, tải trước, phần tử dùng chung, mở khoá, dừng, UI, `ttsUrl`, token, retry.
- `test/test_edge_tts_api.py` (+8 test): retry, timeout từng lần, `connect_timeout` chỉ truyền khi bản edge-tts hỗ trợ, token nội bộ.
- Chạy lại không đổi: v140 (19), v141, v129, v117, v133, v143, v132.

**Chưa kiểm chứng:** hành vi thật trên iOS Safari/Android Chrome (autoplay), độ trễ thật trên Vercel, Microsoft có chặn IP Vercel không,
tham số `connect_timeout` của `edge-tts==7.3.1` (code tự dò chữ ký nên an toàn dù có hay không).

## 3. Việc cần làm trên môi trường thật

1. **Vercel → Environment Variables:** `AUDIO_TTS_URL=https://<domain-chính>/api/edge-tts` (hoặc để code tự dùng
   `VERCEL_PROJECT_PRODUCTION_URL` khi production); `AUDIO_INTERNAL_TOKEN=<chuỗi ngẫu nhiên ≥ 16 ký tự>` (đặt CÙNG giá trị cho cả
   Node và Python — cùng project nên chỉ cần 1 biến). Redeploy.
2. **CORS bucket R2** (Cloudflare → R2 → `hsk-audio` → Settings → CORS):
   `[{ "AllowedOrigins": ["https://hoctiengtrung2496.vercel.app"], "AllowedMethods": ["GET","HEAD"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3600 }]`
3. Đăng nhập admin → `GET /api/r2/health`: cần `ok:true` và `tts.ok:true`.
4. Trên điện thoại, mở Console/`#tts-status` và nghe 1 câu mới: thấy `AUDIO_LIBRARY_CREATED` hoặc `TTS_HEDGE`; câu nghe lại phải là
   `AUDIO_CACHE_HIT`. Nếu còn `EDGE_TTS_PLAY_ERROR NotAllowedError` thì ghi lại trình duyệt/phiên bản.
