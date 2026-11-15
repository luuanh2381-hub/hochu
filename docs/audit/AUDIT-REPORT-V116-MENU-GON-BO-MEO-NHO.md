# V116 — Menu gọn + gỡ "Mẹo nhớ" khỏi giao diện

Không đổi logic học (FSRS, chọn câu hỏi, chấm điểm), không đổi tên tab nội bộ: `goTab('flash'|'quiz'|...)` vẫn như cũ.

## Đã kiểm chứng gì

| | Trạng thái |
|---|---|
| Logic điều hướng (`js/nav.js` chạy thật với DOM giả) | Có test, 25 test mới |
| Bố cục thật trong Chromium headless, khổ 320/360/411px, có chạm cảm ứng | **Đã chụp và đo** (mục dưới) |
| Giao diện tối, màn rộng 1280px | Đã chụp, không tràn ngang |
| Toàn bộ test cũ | Kết quả giữ nguyên; chỉ sửa 3 test mã hoá đúng phần giao diện vừa đổi (có lý do bên dưới) |
| Màn **đã đăng nhập** (Hôm nay học đầy đủ, màn đáp án, phiên học) | **Chưa xem bằng mắt** — sandbox không có server/DB; chỉ chụp được khung (header, thanh dưới, chip, bảng) ở chế độ khách |
| Điện thoại thật | Chưa thử (chỉ giả lập Chromium) |

Kiểm tra đột biến: cố ý làm hỏng 5 chỗ (bỏ "So sánh" khỏi menu, gõ sai tên hàm, đổi nhóm tab, dùng lại lớp CSS cũ, gọi lại hàm mẹo nhớ) — test bắt được cả 5.

## 1. Gỡ "Mẹo nhớ"

**Chỉ ẩn giao diện, giữ dữ liệu.** Bạn chưa trả lời có người khác đang dùng không, nên mình chọn cách đảo ngược được:
- Bỏ khỏi màn giới thiệu từ mới, màn đáp án (2 chỗ) và Flashcard; bỏ nút "Viết/Sửa mẹo nhớ" và lời khuyên "tự viết mẹo" trong khối từ cứng đầu (V115). Khối này giờ còn: nối Hán Việt / chiết tự, đọc to 3 lần, xem nét viết.
- `index.html` không nạp `word-notes.js` nữa. File vẫn ở nguyên chỗ, đầu file ghi cách khôi phục.
- **Server và dữ liệu giữ nguyên**: `/api/notes`, `lib/word-notes.js`, bảng `word_notes`, migration. Không mất mẹo đã viết.
- `stroke.js` trước đây mượn biến và kiểu CSS của mẹo nhớ → đã chuyển sang tự chứa (lớp `stroke-*`, biến riêng). Nếu không làm bước này, cửa sổ nét viết sẽ mất định dạng.
- Nếu muốn xoá hẳn dữ liệu: cần quyết định riêng (xoá bảng + route + file), mình chưa làm.

## 2. Menu gọn

**Thanh dưới 4 mục:** 🏠 Trang chủ · 🎯 Học · 📊 Tiến bộ · ⋯ Thêm.
- **Học** = nhóm Hôm nay / Flashcard / Trắc nghiệm / Gõ chữ / Nghe–Chọn (hàng chip phụ phía trên). Chip ẩn khi đang trong phiên học để màn học gọn.
- **Tiến bộ** = Thống kê / Năng lực / Từ khó (chip phụ). Bấm lại sẽ về đúng màn xem gần nhất. Mình làm luôn mục này (trước đó định để sau) vì thanh dưới cần nó; chỉ gộp cách vào, không gộp nội dung ba màn.
- **Thêm** = So sánh; Quản trị và Từ vựng (chỉ admin thấy, vẫn do `auth.js` bật/tắt theo quyền như cũ).
- **Header 1 hàng:** logo · 🔥 streak · đồng hồ · tài khoản · ⚙️. Giao diện sáng/tối, tốc độ đọc, ẩn/hiện Pinyin–nghĩa–Hán Việt gom vào bảng ⚙️. Khi đang ẩn mục nào thì ⚙️ có chấm cam để biết vì sao thẻ thiếu chữ.

**Đo được (Chromium, khổ điện thoại, tài khoản admin + đồng hồ học đang chạy):**
- Header kèm thanh tab: 126px → **37px**. Thanh dưới cố định 57px; chip phụ 36px (chỉ ở nhóm có chip).
- Không tràn ngang ở 411 / 360 / 320px và ở màn 1280px.
- Chạm thật: Tiến bộ → chip Từ khó → Thêm → So sánh → ⚙️ → "Ẩn nghĩa" → chạm ra ngoài đóng bảng: đều đúng, không có lỗi JS.

## Thay đổi hành vi / đánh đổi (cần biết)

1. **Ẩn/hiện Pinyin–nghĩa–Hán Việt giờ mất 2 chạm** (mở ⚙️ rồi bấm) thay vì 1. Nếu bạn hay dùng khi tự kiểm tra thẻ, nên đưa riêng nút "Ẩn nghĩa" ra màn thẻ — nói mình sẽ làm.
2. **Màn rất hẹp (~320px):** ở trường hợp rộng nhất (admin + đồng hồ), nút tài khoản chỉ còn "👑 …" (tên bị cắt hoàn toàn). Vẫn bấm được để mở menu tài khoản. Màn ≤ 420px ẩn chữ "學中文", giữ biểu tượng 🀄.
3. Streak hiện "🔥 10" (bỏ chữ "ngày"; có tooltip). Nút Zalo nổi được nâng lên trên thanh dưới; phím tắt 1–4 bị chặn khi đang mở các bảng mới.
4. Nội dung có thêm đệm đáy ~84px để nút cuối trang không bị thanh dưới che.

## Test đã sửa (có lý do)

- `skills.test.js` — test "tab Phân tích năng lực đăng ký đủ" kiểm `index.html` có `goTab('skills')`. Nút đó giờ là chip do `nav.js` vẽ → đổi sang kiểm chip tồn tại + nhóm tab + script được nạp. Tinh thần giữ nguyên: người dùng vẫn tới được tab.
- `drill-notes.test.js` — test "khối ghi chú có mặt ở Review/Flashcard" → đảo thành "đã gỡ khỏi giao diện, nhưng file, API, bảng dữ liệu còn nguyên". Các test server của mẹo nhớ giữ nguyên và vẫn đạt.
- `v115-features.test.js` — khối từ cứng đầu không còn nút/lời khuyên mẹo nhớ.

## File

Mới: `js/nav.js`, `test/v116-menu.test.js`.
Sửa: `index.html`, `css/styles.css`, `package.json`, `js/{review,flashcard,stroke,word-notes,ui,navigation,study-session,auth,app}.js`, 3 test ở trên.

## Chạy test

```
node test/v116-menu.test.js    # 25 test mới
npm run test:v110              # đã nối v116 vào
```

## Việc nên làm trước khi dùng thật

Mở trên điện thoại thật khi đã đăng nhập: xem Hôm nay học, một phiên có trả lời sai (màn đáp án nay ngắn hơn), và thử bảng ⚙️ trong lúc học. Phần này mình chưa nhìn thấy được.
