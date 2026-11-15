// lib/multi-grade.js — V131 (giai đoạn 2a): chấm "CÂU 3 PHẦN" cho thẻ FSRS CHÍNH THỨC — phía SERVER.
//
// Câu 3 phần = 1 chữ Hán + 3 phần: Pinyin (hz2py) · Nghĩa (hz2vi) · Hán Việt (hz2hv). Đúng từ 2/3 phần mới tính là câu ĐÚNG.
// Module này CHỈ quy 3 đáp án về đúng những thứ mà đường FSRS hiện tại đã nhận: answerCorrect (true/false), responseTimeMs,
// answerChanges, ratingOverride. KHÔNG đụng ts-fsrs, auto-rating, db.js hay reviewService — thuật toán/lịch ôn do FSRS quyết định như cũ.
//
// Quy tắc (người dùng đã duyệt):
//   • 3/3 đúng  → answerCorrect = true, rating theo đường hiện tại (tốc độ…).
//   • 2/3 đúng  → answerCorrect = true NHƯNG KHÔNG ĐƯỢC Easy (tối đa Good).
//   • ≤1/3 đúng → answerCorrect = false (→ Again như mọi câu sai).
//   • Thời gian: client gửi tổng thời gian cả câu; server chia cho số phần để gần với thời gian của câu 1 phần — nếu không, baseline
//     tốc độ cá nhân của thẻ (lấy từ các lượt trước) sẽ bị méo.  answerChanges = 0 (đổi đáp án giữa 3 phần là bình thường).
//   • SERVER tự chấm từng phần từ DB — không tin kết quả đúng/sai từ trình duyệt. Phần bỏ trống = sai.
//   • Hồ sơ kỹ năng: lượt FSRS chính thức KHÔNG ghi kỹ năng ở chế độ này (kết quả cả câu ≠ kết quả từng phần); trình duyệt gửi từng phần
//     như bài luyện bổ sung riêng (server chấm riêng từng phần) để mỗi kỹ năng nhận đúng kết quả của chính nó.
// Không gửi `parts` → đường cũ chạy y nguyên (không đi qua module này).
'use strict';

const MULTI_TYPES = ['hz2py', 'hz2vi', 'hz2hv'];
const MULTI_PASS = 2;

// raw = req.body.parts. Không có → { ok: true, parts: null } (đường cũ). Có → phải đúng 3 phần, mỗi dạng 1 lần.
function parseParts(raw) {
  if (raw === undefined || raw === null) return { ok: true, parts: null };
  if (!Array.isArray(raw) || raw.length !== MULTI_TYPES.length) return { ok: false, error: 'Câu 3 phần cần đúng 3 phần' };
  const byType = new Map();
  for (const p of raw) {
    if (!p || typeof p !== 'object' || !MULTI_TYPES.includes(p.quizType) || byType.has(p.quizType)) {
      return { ok: false, error: 'Phần của câu 3 phần không hợp lệ' };
    }
    const sel = (p.selectedAnswer === undefined || p.selectedAnswer === null) ? '' : p.selectedAnswer;
    if (typeof sel !== 'string' || sel.length > 500) return { ok: false, error: 'Đáp án của câu 3 phần không hợp lệ' };
    byType.set(p.quizType, sel);
  }
  return { ok: true, parts: MULTI_TYPES.map(quizType => ({ quizType, selectedAnswer: byType.get(quizType) })) };
}

// helpers: { correctAnswerForQuizType(word, quizType), gradeAnswer(correct, selected, ex) } — truyền từ api/index.js để dùng ĐÚNG hàm chấm hiện có.
function gradeParts(word, parts, helpers) {
  const out = [];
  let right = 0;
  for (const p of parts) {
    const correctAnswer = helpers.correctAnswerForQuizType(word, p.quizType);
    if (typeof correctAnswer !== 'string' || !correctAnswer.trim()) return { ok: false, error: 'Từ này chưa đủ dữ liệu cho câu 3 phần' };
    const correct = p.selectedAnswer.trim() !== '' && !!helpers.gradeAnswer(correctAnswer, p.selectedAnswer, null).answerCorrect;
    if (correct) right++;
    out.push({ quizType: p.quizType, correct, correctAnswer });
  }
  const total = parts.length;
  const answerCorrect = right >= MULTI_PASS;
  return { ok: true, right, total, answerCorrect, partial: answerCorrect && right < total, parts: out };
}

function capRating(rating, partial) { return (partial && rating === 'easy') ? 'good' : rating; }
function perPartMs(responseTimeMs, total) { return (Number.isFinite(responseTimeMs) && total > 0) ? Math.round(responseTimeMs / total) : null; }

// Gộp toàn bộ logic của câu 3 phần thành đúng các giá trị mà route FSRS cần.
// previewRating({ answerCorrect, responseTimeMs, answerChanges }) → 'again'|'hard'|'good'|'easy' (chỉ đọc) — dùng để chặn Easy khi đúng 2/3 mà người dùng không chọn tay.
async function resolveMultiReview({ parts, word, responseTimeMs, ratingOverride, helpers, previewRating }) {
  const g = gradeParts(word, parts, helpers);
  if (!g.ok) return g;
  const rt = perPartMs(responseTimeMs, g.total);
  let rating = ratingOverride || null;
  let capped = false;
  if (g.partial) {
    if (rating === 'easy') { rating = 'good'; capped = true; }
    else if (!rating) {
      try {
        const sys = await previewRating({ answerCorrect: true, responseTimeMs: rt, answerChanges: 0 });
        if (sys === 'easy') { rating = 'good'; capped = true; }
      } catch { rating = 'good'; capped = true; } // không xem trước được → mặc định an toàn: Good (không bao giờ để lọt Easy)
    }
  }
  return {
    ok: true, answerCorrect: g.answerCorrect, responseTimeMs: rt, answerChanges: 0, ratingOverride: rating,
    multi: { right: g.right, total: g.total, partial: g.partial, capped, parts: g.parts.map(p => ({ quizType: p.quizType, correct: p.correct })) },
  };
}

module.exports = { MULTI_TYPES, MULTI_PASS, parseParts, gradeParts, capRating, perPartMs, resolveMultiReview };
