# V119 — "Hỏi AI" ở câu sai + Thư viện AI + gọn màn đáp án + bật/tắt đăng ký + đếm ngày học

## 1. Màn đáp án ("Hôm nay học") gọn để vừa 1 trang điện thoại
- Bỏ dòng "Sai rồi — nhìn kỹ chữ, đọc to một lần…" (từ sai vẫn được hỏi lại sau 2 câu như cũ). Khối "🧲 Từ cứng đầu" giữ nguyên.
- Bỏ dòng "Bạn vừa nghe: …" (lặp lại thông tin đã hiện ngay phía trên).
- Chiết tự thu thành 1 dòng tóm tắt, chạm để xổ chi tiết (`renderHanziParts(hz, expanded, compact)` — tham số thứ 3 chỉ dùng ở màn đáp án; nơi khác giữ nguyên).
- Chữ Hán nhỏ lại, khoảng cách chặt hơn, thanh Đổi đánh giá / Tiếp tục **dính đáy** màn hình (né menu dưới và vạch Safari). CSS nằm cuối `css/styles.css`, chỉ áp cho `.rv-card[data-ans="1"]`.

## 2. 🤖 Hỏi AI ở câu sai (`lib/ai-explain.js`, `js/ai-explain.js`, route `POST /api/ai/explain`)
- Nút chỉ hiện ở màn đáp án khi trả lời SAI (cả câu chính thức và luyện bổ sung); chỉ gọi khi bấm.
- AI trả: nghĩa, cách dùng, từ dễ nhầm (so với đáp án người học đã chọn nhầm), mẹo nhớ, 3 ví dụ (chữ Hán + pinyin + nghĩa), 1 câu tự kiểm tra điền chỗ trống (không tính điểm FSRS).
- "➕ Ví dụ khác": xin thêm ví dụ; ví dụ mới tự vào kho `word_examples` để câu điền chỗ trống / ví dụ màn đáp án dùng lại.
- Kiểm tra đầu ra AI phía server: ví dụ phải chứa đúng từ, loại trùng, cắt độ dài, câu kiểm tra phải đúng cấu trúc; nội dung hiển thị luôn thoát HTML; đáp án người học được đưa vào prompt như DỮ LIỆU (JSON-quoted).
- **Phân quyền (V119.2):** chỉ quản trị viên (`admin`, `superadmin`) dùng được — chặn 403 ở server cho cả 4 API, không chỉ ẩn nút. `admin`: giới hạn `AI_EXPLAIN_DAILY_LIMIT` lượt/ngày (mặc định 20). `superadmin`: không giới hạn, không đếm lượt.
- Tiết kiệm quota Gemini: giải thích được cache chung theo từ (`ai_word_explain`); từ nào đã có bản giải thích thì dùng luôn (ưu tiên bản đúng cặp từ nhầm), không gọi AI, không tốn lượt. Trừ lượt nguyên tử (`INSERT … ON CONFLICT … WHERE n < limit`), Gemini lỗi → hoàn lượt.

## 3. 🤖 Thư viện AI (`js/ai-bank.js`, tab trong menu Thêm; chỉ admin)
- Mọi giải thích người đó đã xem tự lưu vào `ai_explain_user (user_id, hz)`; xem lại không gọi AI, không tốn lượt.
- Danh sách NHẸ (~200 byte/từ, không giới hạn số từ); chi tiết chỉ tải khi mở từ (`GET /api/ai/library/item`), tải 1 lần rồi giữ trong bộ nhớ.
- Tìm theo chữ Hán / pinyin / nghĩa / Hán Việt / đoạn đầu giải thích (không cần dấu). Xoá chỉ xoá bản của mình (`POST /api/ai/library/remove`), bản dùng chung giữ nguyên.
- Không có "Lưu vào ghi chú": tính năng ghi chú đã gỡ ở V116 nên không ai thấy lại được.

## 4. API / bảng mới
| | |
|---|---|
| `POST /api/ai/explain` | mode `explain` / `more` |
| `GET /api/ai/library` | danh sách nhẹ |
| `GET /api/ai/library/item?hz=` | chi tiết 1 từ |
| `POST /api/ai/library/remove` | xoá khỏi thư viện của mình |
| Bảng | `ai_word_explain`, `ai_explain_user`, `ai_explain_usage` — tự tạo ở lần dùng đầu; `migrations/V119_ai_explain.sql` để chạy tay nếu muốn |
| Biến môi trường (tuỳ chọn) | `AI_EXPLAIN_DAILY_LIMIT` (mặc định 20) |

## 5. Kiểm thử
`test/v119-ai-explain.test.js` (46 test): phần thuần của lib, route trích từ `api/index.js` chạy trong vm với DB + Gemini giả (cache, quota, hoàn lượt, phân quyền, unlimited), giao diện màn đáp án và tab Thư viện chạy trong vm. Đã sửa `test/v115-features.test.js` (dòng nhắc "Sai rồi" đã bỏ) và `test/v116-menu.test.js` (đếm `renderHanziParts(w.hz…`).
Test cũ `test/skills.test.js` có 1 ca fail từ trước (cần file `/tmp/orig` không có trong gói) — không liên quan V119.

## 7. Bật/tắt trang đăng ký + tạo tài khoản (V119.3, chỉ superadmin)
- **Cài đặt** lưu trong `app_store` (`db.settings.registrationOpen`); thiếu = MỞ (giữ nguyên hành vi cũ). `lib/db.js` `normalize()` thêm `settings`.
- `GET /api/auth/config` (công khai, `no-store`): chỉ trả `{registrationOpen}`. Màn đăng nhập gọi khi mở: đang tắt → ẩn tab "Đăng ký" + ghi chú "tạm đóng"; lỗi mạng → giữ nguyên.
- `POST /api/register`: tắt → 403 `registrationClosed` (từ chối sớm, không tốn bcrypt) và kiểm tra LẠI trong `updateDB` (đọc mới nhất, có khoá) nên không lọt dù cache đọc còn cũ. Ngoại lệ: hệ thống chưa có user nào vẫn đăng ký được (người đầu tiên là superadmin) để không tự khoá mình ngoài cửa.
- `POST /api/admin/settings/registration {open:boolean}` — chỉ superadmin, có nhật ký "Bật/Tắt trang đăng ký".
- `POST /api/admin/users/create {username,password,role?}` — chỉ superadmin; dùng được cả khi đăng ký đang tắt; role chỉ `user`/`admin` (không tạo được superadmin); cùng luật tên/mật khẩu với đăng ký (`validateNewAccount`); không trả token, không đăng nhập hộ, mật khẩu băm bcrypt; trùng tên (không phân biệt hoa thường) bị từ chối.
- Giao diện: Quản trị → panel "🔐 Trang đăng ký" (trạng thái + nút Bật/Tắt có xác nhận) và "➕ Tạo tài khoản mới" (tên, mật khẩu, quyền). Chỉ hiện với superadmin; admin thường không thấy và bị 403 ở server.
- Lưu ý: tắt đăng ký KHÔNG ảnh hưởng đăng nhập của tài khoản đang có. Có thể mất tối đa ~5 giây để các instance Vercel khác nhìn thấy cờ mới ở màn đăng nhập (cache `readDB`), nhưng việc chặn đăng ký ở server là tức thì.
- Kiểm thử: `test/v119-registration.test.js` (17 test: route chạy trong vm với DB trong bộ nhớ — mặc định mở, tắt → 403, chống đua, người đầu tiên, phân quyền 401/403/400, tạo tài khoản đủ ca; giao diện đăng nhập và quản trị).

## 8. Đếm số ngày học và số ngày tạo tài khoản (V119.4)
- **Quy ước (theo NGÀY LỊCH giờ Việt Nam, cùng cách tính streak):**
  - *Số ngày đã học* = số ngày khác nhau có ít nhất 1 lượt học/ôn (gộp `study_sessions` có `cards_reviewed > 0` và `review_history`, loại trùng ngày bằng `UNION` — nên cũng tính cả giai đoạn trước khi có `study_sessions`). Khác streak: không cần đạt ngưỡng 5 phút/10 lượt và không cần liên tiếp.
  - *Số ngày từ khi tạo tài khoản* = số ngày lịch từ ngày tạo đến hôm nay (0 = tạo hôm nay). Lấy từ `createdAt` của tài khoản; tài khoản cũ không có mốc này thì ẩn ô đó (không đoán).
  - *Tỉ lệ* = ngày đã học / (ngày tạo + 1), làm tròn, tối đa 100%.
- Code: `lib/study-days.js` (phần thuần), `getStudyDays` / `getStudyDaysForUsers` trong `lib/fsrs/analytics.js` (danh sách quản trị dùng đúng 1 truy vấn `GROUP BY`, không N+1; thiếu bảng `review_history` thì bỏ nhánh đó, không lỗi).
- API: `GET /api/study/dashboard` thêm trường `days` (giữ nguyên các trường cũ); `GET /api/admin/users` thêm `studyDays`, `lastStudyDay`, `accountDays` cho từng tài khoản.
- Giao diện: tab Thống kê thêm 2 ô KPI "📅 Số ngày đã học" (kèm tỉ lệ) và "🗓️ Ngày từ khi tạo tài khoản" (kèm ngày tạo); danh sách tài khoản ở Quản trị có thêm dòng "Đã học X ngày · Tạo N ngày trước · Học gần nhất". Sửa luôn lỗi nhỏ có sẵn: danh sách quản trị in "🔥undefined" vì server không trả streak — nay chỉ in khi có số.
- Kiểm thử: `test/v119-study-days.test.js` (12 test: ranh giới nửa đêm giờ VN, năm nhuận, mốc tạo ở tương lai/`null`, tỉ lệ tối đa 100%, SQL 1 người/nhiều người, route dashboard + admin, hai phần giao diện).

## 6. Chưa kiểm chứng
Chưa chạy với Gemini và Postgres thật (môi trường dựng không có mạng/DB). Các SQL mới chỉ được đọc kỹ và kiểm tra cấu trúc bằng test; nên thử các luồng: hỏi AI lần đầu, hỏi lại (cache), "Ví dụ khác", mở Thư viện, xoá một từ — bằng tài khoản user thường / admin / superadmin.
