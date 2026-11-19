# V176 — "Từng chữ trong từ vựng HSK" ở màn ĐÁP ÁN của "Hôm nay học"
Với từ đang kiểm tra (vd 经理), mỗi chữ Hán (经, 理) được tra xem nằm trong những từ nào của danh sách HSK:
- Có trong từ HSK 1-3 → hiện tối đa 3 từ (xếp HSK thấp → cao, từ ngắn trước) kèm nhãn HSK, pinyin, nghĩa; chữ đang tra được nhấn (gạch chân/đổi màu) trong từ; "+N từ khác" nếu còn.
- Không có ở HSK 1-3 → tìm tiếp ở HSK 4, ghi rõ "không có ở HSK 1–3 → gợi ý HSK 4".
- Không có ở HSK 1-4 → "Chưa gặp trong HSK 1–4".
- Chỉ cần chữ NẰM TRONG danh sách (không đòi người học đã ôn từ đó). Chính từ đang kiểm tra không được tính. Chữ lặp chỉ hiện 1 lần; ký tự không phải chữ Hán bị bỏ qua.
- Hiển thị: lưới 2 cột đều nhau (số chữ lẻ → ô cuối trải ngang), nằm ngay dưới phần chiết tự, CHỈ ở 2 màn đáp án (đáp án thường + đáp án luyện bổ sung); KHÔNG ở màn giới thiệu từ mới / câu hỏi.
- Dữ liệu: các Quyển HSK 1..4 (BOOKS id 4..7 = bài 33..36), không cần bảng/API mới. Tải 1 lần (một lệnh /api/vocab cho các bài HSK chưa có trong máy), nhớ trong bộ nhớ trang; tải sẵn khi mở màn học; lỗi thì khối này tự ẩn, tạm nghỉ 30 giây rồi thử lại, không làm phiền người học.
Sửa/thêm: js/hsk-chars.js (MỚI), js/review.js (2 màn đáp án + CSS + tải sẵn), index.html (nạp js/hsk-chars.js trước review.js), test/v176-hsk-chars.test.js (14 test).
