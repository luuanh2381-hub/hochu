# Hướng dẫn đưa app lên Vercel

App đã được sửa để chạy được trên Vercel: dữ liệu (tài khoản, tiến độ học)
giờ lưu trong **Postgres** thay vì file `db.json`, vì Vercel không giữ file
lâu dài giữa các lần chạy.

## Bước 1 — Tạo database Postgres miễn phí

Dùng **Neon** (dễ nhất, có gói free, tích hợp sẵn với Vercel):

1. Vào https://neon.tech → đăng ký (có thể dùng tài khoản GitHub/Google).
2. Tạo 1 project mới.
3. Vào phần **Connection string**, copy chuỗi dạng:
   `postgresql://user:password@ep-xxxx.aws.neon.tech/neondb?sslmode=require`
4. Giữ lại chuỗi này, sẽ dùng ở Bước 3.

(Có thể dùng Supabase hoặc Vercel Postgres/Storage tương tự — chỉ cần có
được 1 chuỗi kết nối Postgres.)

## Bước 2 — Đưa code lên GitHub

1. Tạo 1 repo mới trên GitHub.
2. Đẩy toàn bộ nội dung thư mục này lên repo đó (`git init`, `git add .`,
   `git commit`, `git push`).

## Bước 3 — Deploy trên Vercel

1. Vào https://vercel.com → đăng nhập → **Add New → Project**.
2. Chọn repo GitHub vừa tạo → Import.
3. Ở phần **Environment Variables**, thêm:
   - `DATABASE_URL` = chuỗi kết nối Postgres ở Bước 1
  - `AI_API_KEY` = API key **OpenRouter** (tạo miễn phí tại https://openrouter.ai/keys) — cần cho mọi tính năng AI văn bản
    (luyện dịch, giải thích, sinh ví dụ, chiết tự...). Tuỳ chọn: `AI_BASE_URL` (mặc định
    `https://openrouter.ai/api/v1`), `AI_MODELS` (mặc định `openrouter/free` = OpenRouter tự chọn 1 model MIỄN PHÍ đang chạy được;
    muốn cố định thì ghi model có hậu tố `:free`, nhiều model cách nhau dấu phẩy — thử lần lượt, lỗi thì chuyển model kế),
    `AI_MIN_INTERVAL_MS` (mặc định 3500 — model free giới hạn khoảng 20 yêu cầu/phút và có hạn mức theo ngày; hết hạn mức thì
    lượt chạy dừng và tiếp tục hôm sau). Biến `OPENROUTER_API_KEY` cũng được nhận thay cho `AI_API_KEY`.
  - `GEMINI_API_KEY` = (không bắt buộc) chỉ cần cho chấm phát âm bằng ghi âm giọng nói, vì các model
    văn bản miễn phí của OpenRouter không nhận âm thanh
  - `CRON_SECRET` = 1 chuỗi bí mật tự đặt (vd 1 chuỗi random dài) — dùng để
    khoá endpoint sinh dữ liệu AI, tránh người lạ gọi tràn tốn tiền/quota
    Gemini của bạn. Không bắt buộc nhưng rất khuyến khích.
4. Bấm **Deploy**. Đợi khoảng 1 phút.
5. Xong! Vercel cho bạn 1 link dạng `https://ten-app.vercel.app` — vào link
   đó dùng app bình thường.

## Bước 4 — Cho AI tự sinh dữ liệu (Hán Việt / chiết tự / ví dụ) chạy NHIỀU LẦN/NGÀY

Vercel Hobby (miễn phí) chỉ cho phép cron dựng sẵn (`vercel.json`) chạy
**tối đa 1 lần/ngày** — file này đã đặt sẵn ở mức tối đa đó (21h UTC mỗi
ngày), không thể tăng thêm nếu không nâng cấp lên Vercel Pro.

Để tự động chạy **nhiều lần hơn mỗi ngày mà vẫn miễn phí**, project đã có
sẵn 1 workflow GitHub Actions ở `.github/workflows/generate-daily.yml`,
gọi thẳng vào cùng API đó mỗi 15 phút, trong khung 20h–22h UTC (3h–6h sáng
giờ VN) để database Neon free không phải chạy 24/7. Mỗi lượt gọi 2 lần song
song: `?task=examples` (chỉ sinh ví dụ theo từ) và không tham số (hán việt →
chiết tự → ví dụ). Cách bật:

1. Vào repo GitHub của project → **Settings → Secrets and variables →
   Actions**.
2. Thêm secret `APP_URL` = link app đã deploy (vd
   `https://ten-app.vercel.app`, không có dấu `/` cuối).
3. Nếu Bước 3 bạn có đặt `CRON_SECRET` trên Vercel, thêm thêm 1 secret
   `CRON_SECRET` với **đúng giá trị đó**.
4. Vào tab **Actions** của repo, bật workflow lên nếu GitHub hỏi.

Xong — từ giờ mỗi 15 phút GitHub sẽ tự gọi 1 lần để sinh thêm dữ liệu, cho
tới khi phủ hết toàn bộ từ vựng thì các lượt gọi sau gần như không tốn gì
(trả lời ngay vì không còn gì để sinh thêm). Muốn đổi tần suất/khung giờ,
sửa dòng `cron:` trong file workflow (`*/30 * * * *` = 30 phút/lần cả ngày).

**Trigger dày hơn (tuỳ chọn, không cần code):** GitHub Actions hay bị trễ
5–20 phút và repo private bị giới hạn 2000 phút/tháng. Muốn sát 1 phút/lần
thì tạo 1 cron miễn phí ở cron-job.org (hoặc UptimeRobot), trỏ tới
`https://ten-app.vercel.app/api/cron/generate-daily?task=examples`, thêm
header `Authorization: Bearer <CRON_SECRET>`. Chạy song song với GitHub
cũng không vượt quota Gemini vì hàng đợi quota nằm chung trong Postgres.

## Lưu ý

- Tài khoản **đăng ký đầu tiên** trên app sẽ tự động là `superadmin`.
- Nếu quên set `DATABASE_URL`, app sẽ báo lỗi "Chưa cấu hình biến môi
  trường DATABASE_URL" khi gọi API — vào **Project Settings → Environment
  Variables** trên Vercel để thêm/sửa, sau đó **Redeploy**.
- Muốn chạy thử ở máy local trước khi deploy:
  ```
  npm install
  DATABASE_URL="chuỗi-kết-nối-của-bạn" GEMINI_API_KEY="key-của-bạn" npm start
  ```
  rồi mở `http://localhost:3000`.

---

## V177 — Tăng tốc tải dữ liệu từ Neon (không đổi cách ghi kết quả học)

**Đã làm sẵn trong code (có hiệu lực sau lần deploy kế tiếp):**
- `vercel.json` đặt `"regions": ["syd1"]` → server chạy ở Sydney, cùng vùng với Neon (AWS Asia Pacific 2 – Sydney). Trước đó Vercel dùng vùng mặc định (Washington D.C.), mỗi truy vấn đi nửa vòng trái đất.
  Sau khi deploy, vào Vercel → Deployment → mục Functions/Resources để thấy vùng; hoặc xem Logs có dòng `[db] Neon ap-southeast-2 · ... · server Vercel syd1`.
- Server thức dậy không còn chạy lại hàng chục lệnh "kiểm tra/tạo bảng": lần deploy đầu tiên sau V177 chạy đủ **một lần** (hơi chậm lần mở đầu), từ đó mỗi lần thức dậy chỉ cần 1 lệnh.
  - Cần chạy lại toàn bộ (ví dụ sau khi tự tay xoá bảng trong Neon): thêm biến môi trường `SCHEMA_FORCE_INIT` = `1` trong Vercel rồi Redeploy (xong việc nhớ xoá biến này), hoặc chạy `DELETE FROM schema_state;` trong Neon SQL Editor.

**Việc BẠN cần làm: dùng địa chỉ kết nối "pooler" của Neon** (ổn định hơn khi nhiều server thức dậy cùng lúc)
1. Neon Console → chọn dự án → nút **Connect** (thông tin kết nối) → bật **Connection pooling** (tên có thể khác đôi chút tuỳ giao diện).
2. Sao chép chuỗi kết nối mới — tên máy chủ trong đó có chữ `-pooler` (ví dụ `ep-xxxx-pooler.ap-southeast-2.aws.neon.tech`). **Chép chuỗi cũ ra chỗ khác trước** để quay lại khi cần.
3. Vercel → Project → Settings → Environment Variables → sửa biến **DATABASE_URL** (Production, và Preview nếu có dùng) → dán chuỗi mới → Save.
4. **Redeploy** (Deployments → ⋯ → Redeploy) để biến mới có hiệu lực.
5. Kiểm tra: Vercel → Logs, tìm dòng `[db] Neon ap-southeast-2 · kết nối POOLER (tốt) · server Vercel syd1`. Nếu thấy "TRỰC TIẾP" nghĩa là chưa đổi được địa chỉ; "KHÁC VÙNG" nghĩa là vùng Vercel chưa khớp Neon.
Không thấy chuyển biến tốt hoặc gặp lỗi lạ → dán lại chuỗi cũ và Redeploy (an toàn, không mất dữ liệu).
