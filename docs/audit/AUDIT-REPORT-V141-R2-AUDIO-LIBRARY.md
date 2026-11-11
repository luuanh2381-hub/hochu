# AUDIT REPORT V141 — Thư viện âm thanh dùng chung (Cloudflare R2 + Neon)

Ngày: 2026-11-09 · Nền: V140 (Edge-TTS đọc tự nhiên, câu dài, hội thoại, luyện nghe)

## 1. Kiến trúc

```
Trình duyệt
  js/audio.js
    ├─ 1. IndexedDB (hsk-edge-tts-cache-v1) — khoá = content_hash
    ├─ 2. POST /api/audio/resolve  (có Bearer token)
    │      └─ server: Neon audio_library → presigned GET R2 (20 phút)
    │         nếu chưa có: claim pending → Edge-TTS → PutObject R2 → Neon ready
    ├─ 3. POST /api/tts (Edge-TTS trực tiếp) — fallback khi R2 lỗi/chưa cấu hình
    └─ 4. Web Speech API — fallback cuối, luôn ghi WEB_SPEECH_FALLBACK
```

- `content_hash = SHA-256(text \0 voice \0 speed \0 format \0 tts_version)`; chuỗi canonical nằm ở
  `js/audio-hash.js` (dùng chung server + trình duyệt). Đổi cách đọc/giọng → tăng `TTS_VERSION`.
- `storage_key = tts/v1/<2 ký tự đầu>/<hash>.mp3` do **server** sinh; client không gửi key.
- Neon `audio_library` là metadata; MP3 nằm trên R2. Không lưu BYTEA, không đụng bảng từ vựng/FSRS.
- Chống trùng: `content_hash UNIQUE` + `INSERT ... ON CONFLICT DO UPDATE ... WHERE failed/stale`.
  Request thua cuộc chờ tối đa 45 s rồi dùng lại; hết hạn trả `pending` để client thử lại.
- R2 mất tệp dù Neon ghi `ready`: server `HEAD` mỗi lần resolve; thiếu thì reset pending và tạo lại.
- Chỉ MP3: kiểm tra frame sync `FF Ex` trước khi upload; `Content-Type: audio/mpeg`; tối đa 5 MB.

## 2. File tạo / sửa

| File | Thay đổi |
|---|---|
| `js/audio-hash.js` | **Mới** — canonical string, `TTS_VERSION`, danh sách giọng/tốc độ (THUẦN) |
| `lib/r2.js` | **Mới** — S3 client R2, presign 15–30 phút, `putMp3`, `head`, `health` (chỉ server) |
| `lib/audio-library.js` | **Mới** — validate, SHA-256, store Neon, orchestration resolve/generate |
| `migrations/V141_audio_library.sql` | **Mới** — `CREATE TABLE IF NOT EXISTS audio_library` + index |
| `api/index.js` | Thêm `GET /api/r2/health` (admin) và `POST /api/audio/resolve` (đã đăng nhập) |
| `js/audio.js` | Cache theo content_hash; IndexedDB → R2 → Edge-TTS → Web Speech; gộp request trùng; xử lý quota |
| `index.html` | Nạp `js/audio-hash.js` trước `js/audio.js` |
| `test/v141-audio-library.test.js` | **Mới** — 35 test backend + frontend |
| `scripts/verify.js`, `package.json` | Thêm test vào `verify:server`/`verify:ui`, script `test:v141` |
| `package-lock.json` | Thêm `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` |

Không sửa: `lib/fsrs/**`, `lib/db.js`, `api/edge-tts.py`, `js/question-engine.js`, dữ liệu từ vựng,
đăng nhập/đồng bộ, giao diện ngoài phần audio.

## 3. API mới

### `GET /api/r2/health` — quản trị viên
Kiểm tra lần lượt: đủ 5 biến môi trường → `HeadBucket` → `ListObjectsV2` (đọc) → `PutObject` +
`DeleteObject` object thăm dò `health/probe.mp3` (ghi) → ký thử URL. Trả `checks`, `errors` chỉ gồm
**mã lỗi** (`InvalidAccessKeyId`, `NoSuchBucket`, `AccessDenied`, `HTTP_403`…), không trả message,
không trả credentials. HTTP 200 khi mọi bước OK, 503 khi lỗi.

### `POST /api/audio/resolve` — người học đã đăng nhập
Body: `{ text, voice, rate }`. Chỉ nhận 2 giọng (`zh-CN-XiaoxiaoNeural`, `zh-CN-YunxiNeural`),
5 tốc độ (`0.8`–`1.2`), text ≤ 500 ký tự và có chữ Hán. Rate limit 120 request/phút/IP.
Trả `{ ok, contentHash, url, cached, expiresIn }`; lỗi có `code`:
`invalid_input` (400), `r2_not_configured` (503), `pending` (202), `tts_failed` / `upload_failed` /
`metadata_failed` / `sign_failed` / `library_error` (502).

## 4. Migration

- File `migrations/V141_audio_library.sql` chỉ `CREATE TABLE/INDEX IF NOT EXISTS`, không xoá/sửa bảng khác.
- `lib/audio-library.js` tự chạy y hệt khối SQL này ở lần dùng đầu (giống `tts_hints`), nên chạy tay là tuỳ chọn.
- **Chưa chạy migration trên Neon thật** trong phiên này: máy local không có `DATABASE_URL`.
  Bảng sẽ tự tạo ở request resolve đầu tiên sau khi deploy (hoặc chạy file SQL bằng tay).

## 5. Kiểm thử

`npm run test:v141` — 41 test, không cần mạng/DB/credentials:

| Nhóm | Nội dung |
|---|---|
| Canonical/hash | ổn định, phân biệt text/giọng/tốc độ/format/version, không dính trường, SHA-256 64 hex |
| Validate | rỗng, quá 500 ký tự, không chữ Hán, giọng lạ, tốc độ lạ |
| R2 | storage_key từ hash, hash sai bị chặn, presign 15–30 phút, chỉ MP3, frame sync |
| Health | thiếu env, sai credentials, bucket không tồn tại, thiếu quyền đọc, thiếu quyền ghi, HEAD xác minh, đủ quyền |
| Orchestrator | lần đầu tạo, người thứ 2 dùng lại, R2 mất tệp, Edge-TTS lỗi, upload lỗi, HEAD thiếu/sai size/sai type/lỗi quyền, ghi Neon lỗi, 2 request đồng thời, pending timeout, row failed tạo lại, chưa cấu hình, log từng bước không lộ credentials |
| Frontend | IndexedDB hit, cache miss → R2, chưa đăng nhập → Edge-TTS, resolve lỗi → Edge-TTS, URL R2 lỗi 1 lần/2 lần, mạng lỗi → Web Speech, cache hỏng, bấm nhanh gộp request, quota IndexedDB, câu dài, dừng khi đang tải |

Kết quả máy này: `verify:server` 6/6 file, `verify:ui` 11/11 file, `verify:core` 6/6 file.

## 6. Điều CHƯA kiểm chứng thật (bắt buộc đọc)

Máy local **không có** 5 biến `R2_*` và không có `DATABASE_URL`, nên:

- **Chưa kết nối R2 thật.** Không chứng minh được bucket `hsk-audio` tồn tại, credentials đúng,
  quyền đọc/ghi thật, hay presigned URL thật tải được MP3. Các test trên dùng client giả.
- **Chưa chạy migration trên Neon thật** và chưa thử 2 request đồng thời trên Postgres thật.
- **Chưa thử end-to-end trên trình duyệt/điện thoại thật** (autoplay, IndexedDB thật, CORS R2).
- **CORS bucket R2 chưa được cấu hình từ đây** (không có quyền quản trị bucket). Nếu thiếu CORS,
  `fetch(presignedUrl)` sẽ lỗi và app tự fallback Edge-TTS — audio vẫn kêu nhưng không dùng được kho chung.
- Chưa đo `duration` MP3 (cột để NULL).
- Khi `crypto.subtle` không có (ngữ cảnh không bảo mật), IndexedDB dùng khoá FNV thay vì SHA-256;
  server vẫn dùng SHA-256. Chỉ ảnh hưởng cache cục bộ, không ảnh hưởng kho chung.

## 7. Cấu hình Vercel / R2 cần làm

1. 5 biến môi trường đã có (theo yêu cầu): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME=hsk-audio`, `R2_ENDPOINT`.
2. **CORS bucket** (Cloudflare Dashboard → R2 → `hsk-audio` → Settings → CORS):
   ```json
   [{ "AllowedOrigins": ["https://hoctiengtrung2496.vercel.app"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600 }]
   ```
3. Nếu Vercel bật Deployment Protection, lời gọi nội bộ `https://$VERCEL_URL/api/edge-tts` có thể bị 401.
   Đặt thêm biến `AUDIO_TTS_URL=https://hoctiengtrung2496.vercel.app/api/edge-tts` để server gọi
   đúng domain công khai.
4. Sau deploy: đăng nhập admin → `GET /api/r2/health` để xác nhận thật (env/bucket/read/write/presign).
5. (Tuỳ chọn) chạy `migrations/V141_audio_library.sql` trên Neon; nếu không, bảng tự tạo.

## 8. Rủi ro / giới hạn

- Mỗi lần resolve có thêm 1 `HEAD` R2 để phát hiện tệp mất; đổi lại độ trễ nhỏ (~vài ms).
- Nếu 2 request cùng thấy “Neon ready nhưng R2 mất”, cả hai có thể tạo lại và ghi **cùng một key**
  (ghi đè cùng nội dung) — không sinh object trùng, nhưng có thể gọi Edge-TTS 2 lần trong tình huống hiếm.
- Nếu ghi Neon `ready` thất bại sau khi upload, object vẫn nằm trên R2; lần sau tạo lại và ghi đè cùng key.
- Rate limit vẫn là bộ đếm trong bộ nhớ từng instance (giống V88), không phải giới hạn phân tán.
- Presigned URL 20 phút; client tải ngay và cache MP3 vào IndexedDB nên không cần URL dài hạn.
- Không có endpoint xoá/dọn object R2 (không cần cho luồng hiện tại).

## 9. Hậu kiểm sau deploy — vì sao bucket trống (2026-11-09)

Triệu chứng: web vẫn phát âm thanh nhưng R2 `hsk-audio` không có MP3.

**Nguyên nhân gốc:** AWS SDK v3 (>= 3.729) tự gắn checksum **CRC32 FULL_OBJECT**
(`x-amz-checksum-crc32` + `x-amz-sdk-checksum-algorithm`) vào mọi `PutObject`. Theo bảng
“Checksum Types” của Cloudflare R2, R2 **không** hỗ trợ CRC32 FULL_OBJECT (chỉ COMPOSITE), nên
`PutObject` bị R2 từ chối. `putMp3` ném lỗi → `generateOwned` trả `upload_failed` → frontend
âm thầm fallback sang Edge-TTS trực tiếp (vẫn kêu) và không có object nào được tạo.
Chỉ cần xem mã nguồn không thấy lỗi vì lệnh gọi `PutObjectCommand` đúng và có `await`.

**Đã sửa** (`lib/r2.js`): thêm `requestChecksumCalculation: 'WHEN_REQUIRED'` và
`responseChecksumValidation: 'WHEN_REQUIRED'` vào `S3Client`; đã đo lại bằng S3 giả — header
`x-amz-checksum-crc32` biến mất.

**Chẩn đoán thêm:**
- Mỗi bước server ghi 1 dòng JSON `[AUDIO] <STEP>` với `requestId`, `contentHash`, `storageKey`,
  `bytes`, `ms`, `code`; không log text, credentials hay presigned URL. Các tag:
  `AUDIO_REQUEST_RECEIVED`, `NEON_CACHE_HIT/MISS`, `EDGE_TTS_STARTED/COMPLETED/FAILED`, `MP3_SIZE`,
  `R2_UPLOAD_STARTED/SUCCESS/FAILED`, `R2_HEAD_STARTED/SUCCESS/FAILED`, `R2_VERIFY_MISMATCH`,
  `NEON_METADATA_SAVED/FAILED`, `AUDIO_RESOLVE_DONE`.
- Sau `PutObject`, server gọi `HeadObject` kiểm tra `ContentLength` và `ContentType`; chỉ
  `markReady` khi khớp. Sai/thiếu → `upload_verify_failed` (`not_found`, `size_mismatch`,
  `content_type_mismatch`, hoặc mã lỗi R2) và đánh dấu `failed`.
- `GET /api/r2/health` kiểm tra thêm bước `verify` (HEAD object thăm dò) và `tts` (gọi thử đúng
  `ttsUrl()` nội bộ) để phân biệt R2 không kết nối / không đọc / không ghi / ghi nhưng không thấy tệp /
  Edge-TTS nội bộ lỗi.

**Vẫn cần xác nhận thật:** máy local không có 5 biến `R2_*` và không có phiên admin, nên chưa thể
tự chạy `PutObject` thật lên `hsk-audio`. Sau deploy: đăng nhập admin → `GET /api/r2/health`
(mong đợi `checks.verify = ok`, `tts.ok = true`) → mở một câu tiếng Trung **chưa từng nghe** →
log Vercel phải có chuỗi `R2_UPLOAD_SUCCESS` → `R2_HEAD_SUCCESS` → `NEON_METADATA_SAVED`, và bucket
phải xuất hiện `tts/v1/<2 hex>/<hash>.mp3`.
