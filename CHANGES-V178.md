# V178 — Luyện bổ sung bớt lặp lại: "từ hay sai" chọn có trọng số + nghỉ mềm (phương án C)
Nguyên nhân tìm thấy (đọc code): (1) từ V165 server chỉ gửi 1 câu ví dụ/từ → 7 dạng bài dùng câu luôn ra cùng 1 câu cho 1 từ [CHƯA sửa — phương án A]; 
(2) danh sách từ hay sai xếp STRICT theo độ yếu, ngẫu nhiên chỉ khi bằng điểm, không cho từ vừa luyện nghỉ → buổi nào cũng đúng nhóm đó [V178 sửa]; (3) app không nhớ câu đã hiện [CHƯA sửa — phương án B].
Sửa (chỉ đường ĐỌC, không đụng việc ghi kết quả):
- lib/practice-pick.js (MỚI, hàm thuần): `pickWeakWords` — mỗi từ 1 dòng (kỹ năng yếu nhất); lấy mẫu có trọng số KHÔNG hoàn lại (Efraimidis–Spirakis) với trọng số = (0,6 − điểm) + 0,05
  (từ yếu nhất ≈ 6,5× dễ được chọn hơn từ sát ngưỡng, nhưng không chắc chắn); từ có lần luyện gần nhất < 36 giờ bị nhân trọng số 0,02 (nghỉ mềm: không loại hẳn — thiếu từ đã nghỉ thì vẫn lấy từ vừa luyện để đủ số câu).
- lib/skill-store.js `getPracticeWords`: SQL thêm cột `last_at` (= word_skill_stats.last_attempt_at); khi weakOnly=1 cửa sổ ứng viên rộng hơn (max(10×limit, 60) thay vì 3×limit) rồi chọn bằng pickWeakWords;
  `last_at` bị bỏ khỏi phản hồi nên client không thấy khác. weakOnly=0 (Luyện theo kỹ năng, từ thiếu dữ liệu, kỹ năng theo kế hoạch, thăm dò) GIỮ NGUYÊN.
- Hằng số chỉnh được trong lib/practice-pick.js: COOLDOWN_HOURS (36), COOLDOWN_FACTOR (0,02).
- Test: test/v178-weak-pick.test.js (11 test: phân phối thống kê có hạt giống, nghỉ mềm, biên thời gian, getPracticeWords thật với database giả). Test cũ không đổi.
Lưu ý: nếu người học chỉ có vài từ yếu thì buổi nào cũng gặp các từ đó (không có gì khác để chọn); muốn đa dạng hơn nữa cần thêm câu cho mỗi từ (A/B).
