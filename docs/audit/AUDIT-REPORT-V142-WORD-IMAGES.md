# AUDIT V142 — Ảnh gợi nhớ cho từ vựng

## 1. Tóm tắt
Mỗi từ có thể có 1 ảnh minh hoạ + câu chuyện gợi nhớ tiếng Việt, sinh NỀN theo lô (không sinh lúc người học bấm).

## 2. Kiến trúc
1. `lib/word-images.js`: model văn bản (`callGemini` = API văn bản qua Vilao, dùng chung hàng đợi `reserveGeminiSlot`) soạn `story_vi` + `image_prompt`
   (từ nghĩa, Hán Việt, chiết tự) → FLUX.1 schnell (`CF_AI_TOKEN`) vẽ → kiểm tra magic bytes → R2 `img/v1/<2>/<sha256>.<ext>`.
2. Neon `word_images` (tự tạo bảng): `drafting → prompted → generating → ready | failed`, tối đa 3 lần thử, hàng kẹt >120 s trả về hàng đợi,
   429 = hết hạn mức → dừng lượt, KHÔNG đánh dấu lỗi.
3. API: `GET /api/word-image` (đăng nhập, URL ký sẵn 20 phút), admin `generate` / `status` / `reset`, cron `?task=images`.
4. Client: `js/word-image.js`, ảnh lazy trong `<details>`; không có ảnh/lỗi → ô giữ chỗ biến mất, không chặn học. Không đụng FSRS.

## 3. Thay đổi trong lượt hoàn thiện này
- **COEP:** `vercel.json` bật `Cross-Origin-Embedder-Policy: require-corp`; ảnh R2 khác origin không có CORP nên bị chặn. `<img>` nay có
  `crossorigin="anonymous"` (cần CORS bucket R2, xem mục 5).
- **Admin UI** (`js/admin.js`): thẻ trạng thái theo số lượng, cảnh báo thiếu biến môi trường, nút chạy ngay, "xoá bản cũ và tạo lại" theo danh sách chữ Hán. Dữ liệu từ server được `escapeHtml`.
- **CSS:** chuyển khối V142 lên TRƯỚC khối V117 trong `css/styles.css` — test cô lập selector V117 (B4) lấy từ V117 tới cuối file nên trước đó FAIL.
- **Lỗi đăng nhập (D4):** `wiMount` dùng `g.authToken` nhưng `authToken` là `let` (không nằm trên `window`) → luôn coi là chưa đăng nhập và xoá ô ảnh; nay kiểm tra qua `authHeaders()`.
- **Test:** thêm D1–D4 vào `test/v142-word-images.test.js`; đăng ký vào `scripts/verify.js` (server + ui).

## 4. Chi phí / hạn mức (theo bảng giá Cloudflare Workers AI)
Miễn phí 10.000 neuron/ngày (reset 00:00 UTC). FLUX schnell: 4,8 neuron/tile 512×512 + 9,6 neuron/step.
Ước tính ~58 neuron/ảnh nếu ra 1024×1024 với 4 step (≈170 ảnh/ngày) — **kích thước ra thật chưa đo**. Giảm `CF_AI_IMAGE_STEPS` (1–8) để tăng số ảnh/ngày.

## 5. Cấu hình cần làm
- Vercel env: `CF_AI_TOKEN` (quyền Workers AI), `CF_ACCOUNT_ID` (mặc định `R2_ACCOUNT_ID`), tuỳ chọn `CF_AI_IMAGE_MODEL`, `CF_AI_IMAGE_STEPS`.
- CORS bucket R2 (cùng cấu hình V141): `AllowedOrigins` = domain app, `AllowedMethods` = GET, HEAD.
- GitHub secrets `APP_URL`, `CRON_SECRET` (workflow đã chạy `task=images`).

## 6. Đã kiểm chứng / CHƯA kiểm chứng
- Đã: `node --check` admin.js/word-image.js; `test:v142` 20/20 (SDK AWS được thay bằng stub vì môi trường không cài được gói → chỉ chứng minh logic, không chứng minh R2 thật); `xss` 21/21; `v117` 27/27; `v110-ui` 45/45.
- CHƯA: R2/Workers AI/Neon thật, SQL của `createStore` trên Postgres thật, hiển thị trên trình duyệt/điện thoại thật (đặc biệt COEP + CORS), chất lượng ảnh với từ trừu tượng, kích thước/neuron thật mỗi ảnh.
- `reset` chỉ xoá hàng Neon; object cũ trên R2 bị ghi đè khi vẽ lại (cùng key nếu cùng đuôi ảnh; khác đuôi thì object cũ còn mồ côi, dung lượng nhỏ).
