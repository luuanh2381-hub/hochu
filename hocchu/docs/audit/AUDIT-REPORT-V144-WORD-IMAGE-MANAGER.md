# AUDIT-REPORT-V144 — Hệ thống quản lý & kiểm tra ẢNH GỢI NHỚ

Phạm vi: tab **Từ vựng** trong Quản trị (màn học không đổi). Nối tiếp V142 (sinh ảnh) và V143 (hiện ảnh trong thẻ).
Nguyên tắc: số liệu lấy từ database + kết quả kiểm tra thật; **không** tạo ảnh khi mở trang; **không** xoá ảnh khi chưa xác minh hỏng.

## 1. Phân tích hiện trạng (đo trên mã nguồn)

| Điểm | Thực tế trong repo | Hệ quả cho thiết kế |
|---|---|---|
| Nơi lưu ảnh | metadata: Neon `word_images` (PK `hz`, `storage_key`, `status`, `story_vi`, `image_prompt`, `file_size`, `error`, `attempts`); tệp: R2 `img/v1/<2 ký tự>/<sha256(hz)>.jpg|png|webp` | Kiểm tra được **cả 2 phía**: hàng DB và đối tượng trên R2 (`r2.headObject(storage_key)`) |
| Khoá R2 | `hashForWord(hz)` — suy ra từ chữ Hán, ghi đè cùng key | 1 từ = 1 ảnh; "trùng lặp" chỉ có thể là **trùng nội dung/prompt**, kiểm bằng câu chuyện giống nhau |
| `r2.headObject` cũ | chuyển hash → `tts/v1/*.mp3` → **dùng sai cho ảnh** | Route verify truyền thẳng `storage_key` (`img/v1/...`) nên không cần sửa `lib/r2.js` |
| Nhãn từ vựng | **chỉ có 1 cột `tag` tự do** trên `vocab_words` (thực tế dùng `ly_hop`), không có hệ phân loại danh từ/động từ/địa điểm… | Bảng nhãn chạy trên **đúng các giá trị đang có** trong DB; KHÔNG tạo/đổi tên nhãn mới |
| 1 từ ở nhiều bài | `vocab_words` có 1 hàng cho mỗi (hz, bài) | Gộp theo **chữ Hán**; từ nhiều bài bị đếm ở mỗi bài → cộng dồn các dòng **lớn hơn** tổng hệ thống (có cảnh báo trong UI + CSV) |
| Lượt sinh ảnh | `runBatch(50000, {only})`; `only` chỉ lọc bước soạn prompt, `claimForImage()` **không** lọc → vẽ cả từ ngoài danh sách | Thêm tham số `only` cho `claimForImage` → thứ tự ưu tiên 37→36→38 mới thật sự được tuân thủ |
| Sửa ảnh lỗi | Hàng `ready` bị mất tệp R2 **không** được `runBatch` nhặt lại (chỉ nhận `prompted`/`failed`) | Có nhánh riêng: chỉ **xoá bản ghi** của từ đã xác minh hỏng (route `/reset` có sẵn) rồi đưa lại vào hàng đợi |
| Bài 36/37/38 | `BOOKS_RANGES` trong `lib/fsrs/studyScope.js` — Quyển 7/9/10 | Cả 3 bài đều tồn tại, dùng làm mốc ưu tiên |

## 2. Kiến trúc đã thêm

```
js/word-image-audit.js   (THUẦN, dùng chung server + browser — không DB, không R2, không DOM)
  audit() phân loại từng từ: ok / missing / pending / error  + nghi trùng (story) + cờ chất lượng
  buildStages() hàng đợi: bài ưu tiên → ảnh lỗi → các bài còn lại (thiếu nhiều trước), không trùng từ
  statusInfo() nhãn trạng thái 1 chỗ duy nhất (UI + CSV khớp nhau) · exportRows() CSV · runReport()

GET  /api/admin/word-images/audit    chỉ đọc DB (không gọi R2) → totals + byLesson + byTag + words (mảng gọn ~90 B/từ)
POST /api/admin/word-images/verify   { hz: [...] } ≤50 → HEAD tệp R2 + ký URL tải ảnh (mức ②③), KHÔNG ghi/xoá gì
js/word-image-admin.js   panel quản trị: số liệu, lọc/tìm, bảng từng từ + ảnh nhỏ, bảng bài, bảng nhãn,
                         hàng đợi ưu tiên, báo cáo theo bài, CSV, sửa ảnh hỏng (chỉ khi đã xác minh)
```

**4 mức xác minh** (không bao giờ kết luận "có ảnh" chỉ vì DB có `storage_key`):

| Mức | Cách kiểm | Nơi thực hiện |
|---|---|---|
| ① có bản ghi | `word_images.status='ready'` **và** có `storage_key` | `/audit` (DB) |
| ② có tệp trên R2 | `HEAD storage_key` → 200/404 | `/verify` |
| ③ URL xem được | `presignImageGet(storage_key)` thành công | `/verify` |
| ④ hiển thị thật | `<img crossorigin>` load được / lỗi, ghi nhận trong trình duyệt | thumbnail trong bảng + `probeDisplay()` sau mỗi lô sinh ảnh |

## 3. Luồng sinh ảnh theo ưu tiên (đúng yêu cầu)

1. **Bài 37 → 36 → 38**: mỗi chặng lặp theo lô **15 từ**; **giữa các lô đọc lại database**, chỉ gửi những từ
   THẬT SỰ còn thiếu → không tạo trùng, không vẽ lại từ vừa xong.
2. Sau mỗi lô: gọi `/verify` cho đúng các từ vừa xong (mức ②③), rồi **mở thật URL trong trình duyệt** (mức ④).
3. Chỉ sang bài kế tiếp khi chặng trước hết từ thiếu.
4. **Sửa ảnh lỗi**: chỉ những từ `HEAD` trả 404 hoặc ảnh không hiển thị được mới được xoá bản ghi (có xác nhận)
   rồi quay lại hàng đợi. Ảnh đang dùng tốt không bị chạm.
5. **Mở rộng toàn bộ**: các bài còn lại, xếp theo số từ thiếu giảm dần.
6. Dừng an toàn: hết hạn mức Cloudflare → dừng cả lượt; 2 lượt liên tiếp không tiến triển → dừng; trần 60 vòng/chặng;
   tiến trình + báo cáo lưu `localStorage` → mở lại bấm **“▶️ Tiếp tục hàng đợi”** là chạy tiếp.

## 4. Giao diện (mobile-first)

- Khối trên: 6 chip số liệu + thanh tiến độ % + dòng “đã kiểm tra R2 n/M từ”.
- Nút: 🔄 nạp lại số liệu · 🔍 kiểm tra R2 (trang đang xem / từ thiếu-lỗi / toàn bộ) · ⏹ dừng.
- Lọc: bài (kèm số thiếu) · nhãn · trạng thái (thiếu/có ảnh/ảnh hỏng/chưa kiểm tra/lỗi/đang xử lý/nghi trùng/cần xem lại) · ô tìm kiếm.
- Bảng từng từ: checkbox chọn nhiều, ảnh thu nhỏ 44px (chỉ hiện sau khi kiểm tra), chữ Hán + pinyin + nghĩa, bài, nhãn, nhãn trạng thái; bấm vào từ → ảnh lớn + thông tin lưu trữ (DB/R2/hiển thị/kích thước/lỗi).
- Hành động: chọn các từ đang hiện, tạo ảnh cho từ đã chọn, xuất CSV (thiếu ảnh / ảnh lỗi / tất cả), chạy hàng đợi.
- Phân trang 50 từ/trang; kiểm tra R2 chia lô 50 → không quét bucket một lượt, không chặn màn học.

## 5. Bảo toàn dữ liệu

Không đổi schema (không thêm bảng/cột), không đổi khoá R2, không đổi luồng học/FSRS/tiến độ. Thêm 2 route **chỉ đọc**
+ 1 tham số tuỳ chọn của `claimForImage` (không truyền thì giữ nguyên hành vi cũ). Xoá dữ liệu chỉ ở 1 chỗ duy nhất
(`/reset`, đã có từ V142) và chỉ sau khi đã xác minh hỏng + có xác nhận.

## 6. Kiểm thử

| Lệnh | Kết quả |
|---|---|
| `npm run test:v144` | **24/24 pass** — 9 test logic thuần, 3 test nối server, 8 test nối UI, **4 test chạy thật file UI trong DOM giả** (mở trang chỉ gọi `/audit`; sau verify thì thumbnail dùng URL ký sẵn; hàng đợi 1 chặng tạo→kiểm tra→xác minh hiển thị→có báo cáo; huỷ xác nhận thì không tạo ảnh) |
| `npm run verify:ui` | 14/14 file test qua (51 file syntax sạch) |
| `npm run verify:server` | 8/8 file test qua (30 file syntax sạch) |
| `npm run verify:core` | 6/6 file test qua |

**Chưa chứng minh được (thiếu môi trường):** R2 thật trả 200/404 đúng, `CF_AI_TOKEN` + CORS bucket, quota thật của
Cloudflare, SQL thật trên Neon, ảnh hiển thị thật trên điện thoại. Muốn kiểm chứng: mở Quản trị → Từ vựng →
“📊 Kiểm tra & tạo ảnh gợi nhớ” → bấm **🔍 Kiểm tra R2 (trang đang xem)**, xem ảnh nhỏ có hiện không.

## 7. Còn tồn

- Chưa thấy được danh sách tệp mồ côi trong R2 (có tệp nhưng DB không còn hàng) — cần `ListObjectsV2` toàn bucket,
  cố ý không làm để không quét bucket mỗi lần mở trang.
- “Nghi trùng” chỉ dựa trên câu chuyện/prompt giống nhau (không so từng pixel ảnh), nên là **cảnh báo để xem lại**.
- Cờ chất lượng là suy luận từ metadata (thiếu câu chuyện, tệp <8 KB, prompt còn chữ Hán), không đánh giá nội dung ảnh.
- Hàng đợi chạy trong tab đang mở (giống V142); đóng tab là dừng — mở lại bấm “Tiếp tục hàng đợi”.
- Cron `/api/cron/generate-daily?task=images` vẫn chạy theo thứ tự cũ của nó (mọi từ đang chờ), không theo ưu tiên bài.
