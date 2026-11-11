# AUDIT-REPORT-V143 — Tối ưu UX/UI màn "Hôm nay học" (ảnh gợi nhớ trong luồng học)

Phạm vi: màn "🎯 Hôm nay học" (tab `today`), không gian học thật (tab nội bộ `review`) và thẻ Flashcard.
**Không** đụng FSRS, Question Engine, schema DB, API, R2, luồng đồng bộ tiến độ.

## 1. Vấn đề của giao diện cũ (đo trên mã nguồn)

| # | Vấn đề | Bằng chứng |
|---|---|---|
| 1 | Ảnh gợi nhớ **bị giấu sau mục gập** `<details>` "🖼️ Hình gợi nhớ" — phải chạm mới thấy, và `loading="lazy"` nên ảnh còn **không được tải** cho tới lúc mở | `js/word-image.js` (V142) |
| 2 | Ảnh nằm ở **cuối thẻ** — sau chữ Hán, pinyin, nghĩa, Hán Việt, chiết tự, ví dụ, nút Nghe → trên điện thoại gần như luôn nằm ngoài màn hình | `rvIntroHtml`, màn đáp án trong `js/review.js`, `fc-back` trong `js/flashcard.js` |
| 3 | Mỗi từ mới phải chờ một lượt gọi `/api/word-image` rồi mới biết có ảnh hay không; từ kế tiếp lại chờ tiếp | `wiMount()` gọi API theo từng thẻ, không có tải trước |
| 4 | Không xem được ảnh lớn: ảnh bị chặn ở `max-width:300–360px` | `css/styles.css` (V142) |
| 5 | Ô chờ ảnh rỗng vẫn nằm trong DOM (chiếm 1 khe `gap` của flex) ở khoảng thời gian trước khi có kết quả API | `.wi-slot` không có quy tắc `:empty` |
| 6 | "Cài đặt hằng ngày" là **panel mở sẵn, 7 dòng** — chiếm gần nửa màn hình điện thoại trước cả khi người học bấm "Bắt đầu học" | `renderToday()` trong `js/lesson.js` |
| 7 | Thanh tiến độ hôm nay nằm **dưới** 2 nút luyện thêm, không thấy được khi vừa mở màn | `renderTodayPanel()` |

## 2. Bố cục mới

### Thẻ học (màn từ mới + màn đáp án + Flashcard)
```
🏷 nhãn kỹ năng · bài
汉字            ← chữ Hán (to nhất)
pīnyīn
[ ẢNH GỢI NHỚ ]  ← hiện NGAY, cao tối đa 24vh/170px trên điện thoại, chạm để xem lớn
câu chuyện gợi nhớ (1–2 dòng)
nghĩa tiếng Việt
Hán Việt
🔊 Nghe · 🧩 chiết tự · ví dụ · (thanh đánh giá FSRS)
```
Vì sao: ảnh gợi nhớ chỉ có giá trị khi được nhìn **cùng lúc** với chữ Hán và trước khi đọc nghĩa
(liên tưởng hình → nghĩa), nên đặt ảnh giữa pinyin và nghĩa. Trần chiều cao theo `vh` để chữ Hán,
nghĩa và nút đánh giá vẫn nằm trong một màn hình điện thoại.

### Màn "Hôm nay học"
`🎯 Mục tiêu chính` → `▶️ Bắt đầu học` → 3 số (Cần ôn · Từ mới · Dự kiến nhớ) → thanh tiến độ
→ giới hạn ngày → (nút luyện thêm) → `📊 Chi tiết số liệu` (gập) → `🎛 Chế độ học khác` (gập)
→ `⚙️ Cài đặt hằng ngày` (**nay gập sẵn**).
Không xoá chức năng nào — chỉ đổi chỗ/thu gọn.

## 3. Vị trí ảnh: trước → sau

| Màn | Trước | Sau |
|---|---|---|
| Từ mới (intro) | cuối thẻ, trong `<details>` phải chạm | giữa thẻ, ngay sau pinyin, luôn hiện |
| Đáp án ôn tập FSRS | cuối thẻ, trong `<details>` | ngay sau pinyin, luôn hiện |
| Đáp án luyện bổ sung | cuối thẻ, trong `<details>` | ngay sau pinyin, luôn hiện |
| Flashcard (mặt sau) | cuối thẻ, trong `<details>` | ngay sau pinyin, cao 16vh/120px, cuộn được |
| Màn câu hỏi | không có (đúng) | **vẫn không có** — tránh lộ đáp án |

## 4. Thay đổi kỹ thuật

- `js/word-image.js`: bỏ `<details>`; ảnh + câu chuyện render trực tiếp; bọc ảnh trong `<button>`
  (bàn phím mở được, `aria-label`); `wiZoom()` mở overlay `#wi-zoom` (dùng lại URL đã ký, đóng bằng
  chạm hoặc `Escape`); `wiPrefetch(hz)` tải trước ảnh thẻ kế tiếp (gộp request + cache 15 phút như cũ).
  Giữ nguyên: `crossorigin="anonymous"` (COEP), tự gỡ ô khi lỗi/không đăng nhập, nút tạo ảnh cho admin.
- `js/review.js`, `js/flashcard.js`: chuyển chỗ gọi `wiSlot()` trong 4 màn; gọi `wiPrefetch()` cho thẻ kế tiếp.
- `css/styles.css`: `.wi-*` viết lại (trần chiều cao theo `vh`, biến thể `≤480px`, overlay zoom);
  `.wi-slot:empty{display:none}`; `.fc-back` cuộn được + `::before/::after{margin:auto}` (canh giữa
  mà không bị cắt đầu nội dung khi thẻ cao hơn khung); `.td-settings` cho mục cài đặt gập sẵn.
- `js/lesson.js`: `renderToday()` gập "Cài đặt hằng ngày"; `renderTodayPanel()` đưa thanh tiến độ lên
  ngay sau 3 số, thêm dòng `.td-limit` khi chưa có thanh tiến độ.
- `test/v143-study-ux.test.js` (mới, 11 test) + thêm vào `verify:ui`, `npm run test:v143`.

Không đổi: `/api/word-image`, `lib/word-images.js`, `lib/r2.js`, schema `word_images`, lịch FSRS,
`reviewService`, đồng bộ `progressState`.

## 5. Kiểm thử

| Lệnh | Kết quả |
|---|---|
| `npm run verify:ui` | 13/13 file test qua (gồm `v143-study-ux` 11 test) |
| `npm run verify:core` | 6/6 |
| `npm run verify:server` | 7/7 |
| `node --check js/*.js` | 49 file sạch |

## 6. Tồn tại (chưa kiểm chứng)

- **Chưa mở trên trình duyệt/điện thoại thật** (máy này không có trình duyệt headless) — các con số
  `vh` (24vh/170px, 16vh/120px) cần chỉnh lại nếu thực tế trông chật trên máy cụ thể.
- Thẻ đầu tiên của một phiên vẫn có thể **nhích bố cục** một nhịp khi ảnh tới (các thẻ sau đã được
  tải trước nên không còn hiện tượng này).
- Ảnh vẫn phụ thuộc CORS bucket R2 + `CF_AI_TOKEN` (tồn tại từ V142, không thuộc phạm vi V143).
