# V180 — Gộp "Quản lý câu ví dụ bằng file" + "Từ mới trong câu": CHỈ CẦN TẢI LÊN 1 FILE
Trước: 2 file riêng — ① file câu ví dụ (hz, zh1/py1/vi1…zh3) tạo câu; ② file "Từ mới trong câu" (zh, word1…word8) giải thích từ — và ② chỉ nhập được khi câu đã có trong kho (phải làm ① trước).
Nay: 1 ô chọn file, 1 nút "📤 Nhập file (câu + từ trong câu)". **Server KHÔNG đổi** — giao diện tự chạy tuần tự bước ① (`/api/admin/word-examples/import`) rồi bước ② (`/api/admin/sentence-words/import`), mỗi bước dùng lại đúng phần kiểm tra cũ.
- **File gộp (1 dòng / 1 câu):** `hz | zh | cau_py | cau_vi | word1 py1 vi1 note1 … word8…` (tên cột không phân biệt hoa/thường/dấu). Đủ hz + zh + cau_vi → tạo câu (hoặc bổ sung pinyin nếu câu đã có); có word… → nhập từ trong câu.
  Một dòng có thể chỉ có phần câu, chỉ zh + word (câu đã có sẵn), hoặc cả hai.
- **Mọi file CŨ vẫn dùng được, tự nhận dạng theo tiêu đề cột** (js/example-bundle.js, hàm thuần `EXB.parse`): không có cột word… → file câu ví dụ kiểu cũ (dạng rộng 3 cặp / dạng dài, đọc bằng EXF như trước); có word… nhưng không có hz/cau_vi → file "từ mới trong câu" kiểu cũ;
  file AI trả về (zh, hz, cau_vi, word…) → coi như file gộp (câu đã có bị server bỏ qua như trùng). Vừa zh1/zh2… vừa word1… → báo lỗi rõ ràng (py1/vi1 mơ hồ), không đoán.
- **Tải file mẫu** nay xuất mẫu gộp: sheet "Câu" (3 câu mẫu, tự nhập lại được) + sheet "Hướng dẫn" (cách dùng + lời nhắc dán vào công cụ AI). Đọc sheet "Câu" nếu có, không thì sheet đầu.
- **👁️ Xem trước** (mới, không ghi gì): đếm câu sẽ tạo / câu có từ; riêng câu ĐÃ CÓ sẵn trong kho thì hỏi server `dryRun` để biết sẽ thêm bao nhiêu từ / câu nào không khớp.
- **Báo cáo gộp:** kết quả bước ① và ② trong 1 khung; bước ① lỗi → dừng và nói rõ "chưa nhập từ trong câu"; bước ② lỗi → vẫn hiện kết quả bước ① đã xong; cảnh báo dòng thiếu cau_vi, từ không nằm trong câu, cột bị bỏ qua.
- **🗑️ Xoá theo file** dùng được với mọi định dạng (lấy các dòng câu ví dụ của file).
- **Khung "Xuất câu để AI điền từ"** còn lại (2 nút xuất + hướng dẫn); đã bỏ ô chọn file và nút nhập riêng của "Từ mới trong câu" (hàm `sentwImport`, `sentwTemplate` gỡ). Việc gửi từ trong câu theo lô nằm ở `sentwPostSentences`.
Sửa/thêm: js/example-bundle.js (MỚI), js/admin.js, js/admin-sentence-words.js, index.html (nạp example-bundle.js), test/v180-one-file.test.js (23 test); cập nhật test cũ khoá cấu trúc: v170, v172, v175.
Chưa làm: gom 2 bước thành 1 lệnh giao dịch phía server (nếu bước ② lỗi thì bước ① vẫn đã lưu — an toàn vì nhập lại cùng file chỉ bỏ qua phần đã có).
