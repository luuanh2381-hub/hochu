# AUDIT REPORT — V136: tỷ lệ dạng bài + tăng câu "Điền từ vào câu"

## Yêu cầu
1. Tăng số câu dạng **điền từ vào câu** (cloze) trong "Hôm nay học".
2. Trong **Cài đặt** thêm tỷ lệ các dạng bài sẽ xuất hiện.

## Cách làm (một cơ chế cho cả hai yêu cầu)
Thêm `questionMix = { hz2vi, vi2hz, listen2hz, listen2vi, hz2py, cloze }`, mỗi khoá là **hệ số
0 · 0.5 · 1 · 2** (Tắt · Ít · Vừa · Nhiều) nhân vào điểm khởi đầu của dạng trong bộ chọn.

| Nơi | Thay đổi |
|---|---|
| `js/question-selector.js` | `rank()` chuyển `opts.mix` xuống `scoreType()`; ở đó `s *= mix[typeId]` ngay sau `WEIGHTS.base`, nên **mọi** cộng/trừ thích ứng phía dưới giữ nguyên |
| `js/review.js` | `rvQuestionMix()` / `rvSetQuestionMix()` / `rvQuestionMixHtml()`; `rvBuildQuestionFor` truyền `mix` cho **mọi** câu hệ thống tự chọn |
| `js/lesson.js` | Cài đặt hằng ngày chèn `rvQuestionMixHtml()` (mỗi dạng 1 ô chọn, 4 mức) |
| `js/auth.js` | `QUESTION_MIX_TYPES`, `QUESTION_MIX_DEFAULT`, `normalizeQuestionMix()` (kẹp 0–2, thiếu → mặc định) |
| `api/index.js` | `/api/progress` chỉ nhận 6 khoá đã biết, kẹp 0–2, thiếu → giá trị đang lưu → mặc định |

**Mặc định `cloze: 2`** — đây là phần "tăng câu điền từ" của yêu cầu 1: người học vẫn đổi được về
"Vừa"/"Ít"/"Tắt" trong Cài đặt.

## Giới hạn có chủ ý
- Hệ số **không phải tỷ lệ cứng**: dạng để "Tắt" (0) vẫn có thể được dùng làm phương án cuối khi mọi
  dạng khác không dựng được câu. Đây là hành vi cũ của `QS.choose` (hạ chuẩn), giữ nguyên để buổi học
  không bị kẹt.
- Câu **bị ép đúng 1 dạng** (thăm dò tự gõ, sắp xếp câu, câu kiểm tra sau giới thiệu) **không** bị mix
  đổi — chúng vốn không phải "hệ thống chọn dạng".
- Trọng số chỉ nhân vào điểm; nếu trong phạm vi học **không từ nào có câu ví dụ** thì vẫn không có câu
  điền từ. Muốn nhiều hơn nữa phải sinh thêm `word_examples` (cron `task=examples`), không phải sửa code.

## Đo thực tế trên dữ liệu repo
Kịch bản: 400 lượt chọn dạng, kho 80 từ đều có câu thật trong `SENTENCES`, không có `word_examples`.

| Cấu hình | cloze | Nghe | Nghĩa→Hán | Hán→Nghĩa |
|---|---|---|---|---|
| mọi dạng "Vừa" | 390 | 3 | 4 | 3 |
| mặc định mới (cloze 2) | 390 | 3 | 4 | 3 |

→ Trên dữ liệu này cloze đã gần như luôn thắng; nút chỉnh tỷ lệ có tác dụng thật khi người học muốn
**giảm** cloze (đặt "Ít"/"Tắt") hoặc **tăng** dạng khác. Với kho từ phổ thông (phần lớn KHÔNG có câu ví dụ)
thì cloze hiếm vì thiếu dữ liệu, không phải vì trọng số.

## Kiểm thử
- Mới: `test/v136-question-mix.test.js` — 8 test (hệ số, tắt hẳn, câu bị ép không đổi, chuẩn hoá client,
  danh sách khoá server, 3 danh sách dạng khớp nhau, ô chọn trong Cài đặt).
- Hồi quy: `verify:core` 5/5, `verify:ui` 7/7, `verify:server` 5/5; thêm 10 suite liên quan (adaptive-v111,
  v127×2, v128×2, v130, v131, v131b, v117, v119) đều qua.

## Chưa làm
- Chưa thử trên trình duyệt/điện thoại thật (ô chọn mới trong màn hẹp).
- `questionMix` **không** áp cho các dạng chỉ luyện bổ sung ngoài 6 dạng trắc nghiệm (Hán Việt, A hay B?,
  Đúng/Sai…). Người học vào các chế độ đó qua nút riêng nên chưa có nhu cầu chỉnh tỷ lệ.
