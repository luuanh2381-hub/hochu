// js/navigation.js — render() dispatcher (chuyển tab) + bộ lọc Quyển/bài đang chọn
// ════════════════════════════════════════════════════
// RENDER DISPATCHER
// ════════════════════════════════════════════════════
function render() {
  document.getElementById('streak-badge').textContent = '🔥 ' + getStreak(); // V116: bỏ chữ "ngày" cho header gọn (có tooltip "Số ngày học liên tiếp")
  if (typeof navSyncUI === 'function') navSyncUI(); // V116: chấm "đang ẩn Pinyin/nghĩa/Hán Việt" trên nút ⚙️
  // Task 4/5 (V70 Pha B): tab nào tính là "đang học thật" thì giữ phiên study_sessions sống +
  // chạy đồng hồ realtime; rời sang tab khác (Trang chủ, Thống kê, ...) thì dừng đếm/heartbeat lại
  // (phiên vẫn còn hiệu lực phía server trong 15 phút — quay lại sẽ nối tiếp, không tạo phiên mới).
  // V112: đồng bộ "vắng mặt" của câu hỏi đang treo (đổi tab trong app = vắng mặt) và giờ học THỰC (isStudyContext gồm cả buổi
  // luyện kỹ năng bổ sung). Rời màn học → báo nốt số giây học thực chưa gửi rồi dừng.
  vtSync();
  if (typeof swSync === 'function') swSync(); // V117: bật/tắt class `sw-on` + thanh điều khiển khu vực học (chỉ ở tab 'review')
  if (isStudyContext()) ensureStudySession(); else leaveStudyContext();
  const el = document.getElementById('content');
  if (currentTab === 'home')   { el.innerHTML = renderHome(); bindHome(); }
  else if (currentTab === 'today') { el.innerHTML = renderToday(); bindToday(); }
  else if (currentTab === 'review') { el.innerHTML = renderReview(); bindReview(); }
  else if (currentTab === 'flash') { el.innerHTML = renderFlash(); bindFlash(); }
  else if (currentTab === 'quiz')  { el.innerHTML = renderQuiz(); bindQuiz(); }
  else if (currentTab === 'type')  { el.innerHTML = renderType(); bindType(); }
  else if (currentTab === 'listen'){ el.innerHTML = renderListen(); bindListen(); }
  else if (currentTab === 'stats') { el.innerHTML = renderStats(); bindStats(); }
  else if (currentTab === 'skills') { el.innerHTML = renderSkills(); bindSkills(); }
  else if (currentTab === 'difficult'){ el.innerHTML = renderDifficult(); bindDifficult(); }
  else if (currentTab === 'compare'){ el.innerHTML = renderCompare(); bindCompare(); }
  else if (currentTab === 'aibank') { el.innerHTML = renderAiBank(); bindAiBank(); } // V119.1: Thư viện AI
  else if (currentTab === 'ttsfix') { el.innerHTML = renderTtsFix(); bindTtsFix(); } // V129: Sửa phát âm
  else if (currentTab === 'admin') { el.innerHTML = renderAdmin(); bindAdmin(); }
  else if (currentTab === 'vocab') { el.innerHTML = renderVocabAdmin(); bindVocabAdmin(); }
}

// Lesson filter html — 2 ô droplist đa lựa chọn: chọn Quyển/level, rồi (nếu cần) chọn bài cụ thể
function lessonFilterHtml() {
  const levelSelect = levelSelectHtml();
  const lessonSelect = lessonSelectHtml();
  const noBookHint = selectedBookIds.size === 0
    ? `<div style="font-size:.75rem;color:#b45309;background:#fffbeb;border:1px solid #f59e0b;border-radius:10px;padding:8px 10px;margin-bottom:8px;">⚠️ Chưa chọn Quyển/level nào — hãy chạm chọn ít nhất 1 mục ở trên để bắt đầu học.</div>`
    : '';
  const hint = selectedBookIds.size === 0 ? '' : (!lessonsAllMode
    ? (selectedLessons.size > 0
        ? `<div style="font-size:.72rem;color:var(--muted);margin:2px 0 8px;">Đang chọn ${selectedLessons.size} bài: ${[...selectedLessons].sort((a,b)=>a-b).join(', ')}</div>`
        : `<div style="font-size:.75rem;color:#b45309;background:#fffbeb;border:1px solid #f59e0b;border-radius:10px;padding:8px 10px;margin-bottom:8px;">⚠️ Chưa chọn bài nào — hãy chọn ít nhất 1 bài hoặc bấm "Tất cả" để bắt đầu học.</div>`)
    : (selectedBookIds.size > 1
      ? `<div style="font-size:.72rem;color:var(--muted);margin:2px 0 8px;">Đang chọn ${selectedBookIds.size} mục: ${[...selectedBookIds].map(id=>BOOKS.find(b=>b.id===id).name).join(', ')}</div>`
      : ''));
  return `<div id="book-filter" style="margin-bottom:8px;">${levelSelect}${lessonSelect}</div>` + noBookHint + hint;
}

function getFilteredWords() {
  let words;
  if (lessonsAllMode) words = WORDS.filter(w => selectedBookIds.has(bookOfLesson(w.l)));
  else words = WORDS.filter(w => selectedLessons.has(w.l));
  return words;
}
// Dùng cho các màn lọc theo bài không phải từ vựng (vd. câu ví dụ ở màn Dịch câu)
function isLessonInSelection(l) {
  return lessonsAllMode ? selectedBookIds.has(bookOfLesson(l)) : selectedLessons.has(l);
}

