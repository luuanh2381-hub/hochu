// js/review-multi.js — V130 (giai đoạn 1): "CÂU 3 PHẦN" cho "Hôm nay học".
// Một câu = 1 chữ Hán + 3 phần: Pinyin · Nghĩa · Hán Việt (4 đáp án mỗi phần). Đúng từ 2/3 phần trở lên mới tính là câu ĐÚNG.
//
// GIAI ĐOẠN 1 — chỉ áp dụng cho câu LUYỆN THÊM (item.type === 'extra', "🎯 Luyện thích ứng"):
//   • KHÔNG đụng thẻ FSRS chính thức / lịch ôn: câu này vẫn là luyện bổ sung (không gọi /api/study/review).
//   • Mỗi phần đã trả lời được gửi lên server như 1 bài luyện bổ sung riêng (submitSkillPractice, server tự chấm lại từng phần
//     — không tin kết quả từ trình duyệt) nên hồ sơ kỹ năng Pinyin / Nhận diện vẫn đúng.
//   • Phần bỏ trống tính là SAI trong câu này nhưng KHÔNG gửi lên server (không biến "không trả lời" thành dữ liệu kỹ năng).
//   • Từ không có Hán Việt, hoặc không dựng đủ 3 phần hợp lệ → rơi về câu 1 phần như cũ (không tạo câu giả).
//   • Cài đặt bật/tắt ở "Hôm nay học" → Chi tiết (mặc định BẬT, lưu theo thiết bị).
// Trạng thái rvMulti khai báo trong review.js (để thiếu file này web vẫn chạy như cũ).
//
// V131 — GIAI ĐOẠN 2b: áp dụng cho thẻ ÔN CHÍNH THỨC (item.type === 'review'), THỬ NGHIỆM, mặc định TẮT (Hôm nay học → Chi tiết).
//   • Gửi `parts` lên /api/study/review/preview và /api/study/review: SERVER chấm lại 3 phần, đúng ≥2/3 mới là đúng, đúng 2/3 thì không được Easy
//     (xem lib/multi-grade.js). Trình duyệt chỉ phản hồi tức thời bằng kết quả tạm rồi đồng bộ theo server.
//   • Nút Easy bị khoá khi đúng 2/3. Từ mới ('new') và thẻ có màn giới thiệu KHÔNG áp dụng (người học vừa xem đáp án).
//   • Vẫn đi qua đúng đường chọn rating / đếm ngược / outbox có idempotencyKey như thẻ 1 phần. Payload kèm cả quizType+selectedAnswer của 1 phần
//     (tương thích ngược: nếu server cũ chưa có V131 thì lượt vẫn được chấm như câu 1 phần, không bị mất).
//   • Từng phần đã trả lời cũng được gửi như bài luyện bổ sung riêng (source 'extra') để hồ sơ kỹ năng nhận đúng kết quả từng phần.
//   • Nhật ký phiên: đúng 1 dòng 'official' cho mỗi thẻ (phần Nghĩa, mang kết quả CẢ thẻ) + các phần còn lại không-official — để đếm thẻ/từ cứng đầu đúng.
'use strict';

const RVM_PASS = 2;      // số phần đúng tối thiểu
const RVM_TYPES = ['hz2py', 'hz2vi', 'hz2hv'];
const RVM_LABEL = { hz2py: 'Pinyin', hz2vi: 'Nghĩa', hz2hv: 'Hán Việt' };

function rvmEnabled() { try { return localStorage.getItem('rvMulti3') !== '0'; } catch { return true; } }
function rvmSetEnabled(on) { try { localStorage.setItem('rvMulti3', on ? '1' : '0'); } catch {} }
// V131 2b — thẻ ôn chính thức dạng 3 phần: THỬ NGHIỆM, mặc định TẮT (chỉ bật khi người học tự bật).
function rvmOfficialEnabled() { try { return localStorage.getItem('rvMulti3Official') === '1'; } catch { return false; } }
function rvmSetOfficialEnabled(on) { try { localStorage.setItem('rvMulti3Official', on ? '1' : '0'); } catch {} }

// Dựng 3 phần cho 1 từ (không đụng DOM). Trả null nếu thiếu dữ liệu / không dựng đủ 3 phần.
function rvmBuildParts(word, ctx, recentPositions) {
  if (!word || !word.hz || !word.hanviet || typeof QE === 'undefined') return null;
  let recent = Array.isArray(recentPositions) ? recentPositions.slice() : [];
  const parts = [];
  for (const typeId of RVM_TYPES) {
    const q = QE.build(typeId, word, Object.assign({}, ctx, { recentCorrectPositions: recent }));
    if (!q || !Array.isArray(q.options) || !q.options.length || !Number.isInteger(q.correctIndex) || !q.exercisePractice) return null;
    recent = recent.concat([q.correctIndex]); // 3 phần của cùng 1 câu không nên cùng vị trí đáp án đúng
    parts.push({ typeId, label: RVM_LABEL[typeId], q, picked: null, ok: null });
  }
  return parts;
}

// Chấm cả câu (thuần): phần chưa chọn = sai.
function rvmEvaluate(parts) {
  let right = 0;
  for (const p of parts) {
    p.ok = p.picked != null && p.picked === p.q.correctIndex;
    if (p.ok) right++;
  }
  return { right, total: parts.length, ok: right >= RVM_PASS };
}

// Gọi từ rvPrepareCurrentCard (review.js). Chỉ câu luyện thêm thường (không phải câu thăm dò tự gõ).
function rvmBuild(item) {
  try {
    if (!item || item.probe) return null;
    if (item.type === 'extra') { if (!rvmEnabled()) return null; }
    else if (item.type === 'review') { if (!rvmOfficialEnabled()) return null; } // V131 2b: thẻ ôn chính thức (không áp dụng cho 'new'/'check'/'redo')
    else return null;
    const ctx = Object.assign(rvQCtx(), { confusions: item.confusions });
    const parts = rvmBuildParts(item.word, ctx, rvQSession && rvQSession.recentCorrectPositions);
    return parts ? { parts, done: false } : null;
  } catch { return null; } // lỗi bất ngờ → câu 1 phần như cũ
}

function rvmInjectStyle() {
  if (document.getElementById('rvm-style')) return;
  const s = document.createElement('style');
  s.id = 'rvm-style';
  s.textContent = `.rvm-part{margin:10px 0}.rvm-ph{font-weight:700;margin:6px 0;text-align:left}
    .rvm-opts{display:grid;grid-template-columns:1fr 1fr;gap:6px}
    .rvm-opt{padding:8px 6px;min-height:44px;font-size:.95rem;line-height:1.3;word-break:break-word}
    .rvm-opt.rvm-sel{outline:2px solid var(--accent,#2a4fd6);outline-offset:-2px;font-weight:700}
    .rvm-opt.correct{outline:0}
    .rvm-chips{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin:6px 0}
    .rvm-chip{border:1px solid rgba(128,128,128,.4);border-radius:999px;padding:3px 10px;font-size:.85rem}`;
  document.head.appendChild(s);
}

// Màn câu hỏi (thay rvQuestionBodyHtml khi rvMulti đang bật)
function rvmBodyHtml(tagLabel, w) {
  rvmInjectStyle();
  const m = rvMulti;
  const num = ['①', '②', '③'];
  const parts = m.parts.map((p, i) => `<div class="rvm-part"><div class="rvm-ph">${num[i]} ${escapeHtml(p.label)} <span style="font-weight:400;opacity:.7;font-size:.85rem">— ${escapeHtml((p.q.prompt && p.q.prompt.ask) || '')}</span></div>
      <div class="rvm-opts">${p.q.options.map((o, j) => `<button class="quiz-opt rvm-opt${p.picked === j ? ' rvm-sel' : ''}" data-p="${i}" data-o="${j}" onclick="rvmPick(${i},${j})">${escapeHtml(o.label)}</button>`).join('')}</div></div>`).join('');
  const ready = m.parts.every(p => p.picked != null);
  return `
      <div class="rv-tag">${tagLabel} · ${lessonsLabel(w)}</div>
      <div class="rv-type-tag">Câu 3 phần · đúng từ ${RVM_PASS}/${m.parts.length} phần mới tính là đúng</div>
      ${rvHzHtml(w.hz)}
      <div id="rvm-root">${parts}</div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:10px">
        <button id="rvm-check" class="btn btn-primary" onclick="rvmSubmit(false)" ${ready ? '' : 'disabled'}>Kiểm tra</button>
        <button class="btn" style="background:var(--border)" onclick="rvmSubmit(true)">Không nhớ</button>
      </div>`;
}

// Chọn 1 đáp án (chỉ cập nhật DOM tại chỗ — không render lại cả màn để giữ vị trí cuộn)
function rvmPick(pi, oi) {
  const m = rvMulti;
  if (!m || m.done || rvPhase !== 'question') return;
  if (typeof swIsPaused === 'function' && swIsPaused()) return;
  const p = m.parts[pi]; if (!p || !p.q.options[oi]) return;
  p.picked = oi;
  document.querySelectorAll('#rvm-root .rvm-opt[data-p="' + pi + '"]').forEach(b => b.classList.toggle('rvm-sel', +b.dataset.o === oi));
  const chk = document.getElementById('rvm-check');
  if (chk) chk.disabled = !m.parts.every(x => x.picked != null);
}

// Nộp cả câu. skipBlank=true ("Không nhớ"): cho phép nộp khi còn phần chưa chọn.
function rvmSubmit(skipBlank) {
  const m = rvMulti, item = rvQueue.items[0];
  if (!m || m.done || rvPhase !== 'question' || !item || !(item.type === 'extra' || item.type === 'review')) return;
  if (item.type === 'review' && !rvmOfficialEnabled()) return; // thẻ chính thức chỉ nộp qua nhánh riêng khi người học đã bật
  if (typeof swIsPaused === 'function' && swIsPaused()) return;
  if (!skipBlank && !m.parts.every(p => p.picked != null)) return;
  if (item.type === 'review') return rvmSubmitOfficial(m, item);
  m.done = true;
  const w = item.word;
  const totalMs = Math.max(0, Math.round(performance.now() - rvStartedAt - vtHiddenMs()));
  const perPart = Math.round(totalMs / m.parts.length);
  const res = rvmEvaluate(m.parts);
  if (res.ok) playDing(); else playBuzz();
  if (typeof swSpeakAfterAnswer === 'function') swSpeakAfterAnswer(w.hz); else speak(w.hz);
  for (const p of m.parts) {
    if (p.picked == null) continue; // bỏ trống: sai trong câu này, nhưng không gửi lên server
    rvRecordAnswer(item, p.q, !!p.ok, perPart, false);
    submitSkillPractice({ word: w, exerciseType: p.q.exercisePractice, selectedAnswer: p.q.options[p.picked].key, responseTimeMs: perPart, source: 'extra', sessionId: rvQueue.sessionId }).catch(() => {});
  }
  rvLastAnswer = { correct: res.ok, card: null, autoRating: null, chosen: '',
    multi: { right: res.right, total: res.total, parts: m.parts.map(p => ({ quizType: p.typeId, label: p.label, ok: !!p.ok, blank: p.picked == null, chosen: p.picked == null ? '' : p.q.options[p.picked].label, correct: p.q.options[p.q.correctIndex].label })) } };
  rvPhase = 'answered';
  rvRatingPhase = null;
  render();
}

// Dòng kết quả ở màn đáp án (thay "✅ Chính xác / ❌ Chưa đúng" khi là câu 3 phần)
function rvmFeedback(r) {
  const mm = r.multi;
  return r.correct ? `✅ Đúng ${mm.right}/${mm.total} phần` : `❌ Mới đúng ${mm.right}/${mm.total} phần — cần từ ${RVM_PASS}/${mm.total}`;
}
function rvmResultHtml(r) {
  if (!r || !r.multi) return '';
  const chips = r.multi.parts.map(p => `<span class="rvm-chip" style="color:${p.ok ? 'var(--l8a)' : 'var(--l10a)'}">${p.ok ? '✅' : '❌'} ${escapeHtml(p.label)}</span>`).join('');
  const wrong = r.multi.parts.filter(p => !p.ok).map(p => `<div style="font-size:.85rem;opacity:.85">${escapeHtml(p.label)}: ${p.blank ? 'bỏ trống' : 'bạn chọn “' + escapeHtml(p.chosen) + '”'} → đúng là “${escapeHtml(p.correct)}”</div>`).join('');
  rvmInjectStyle();
  return `<div class="rvm-chips">${chips}</div>${wrong}`;
}

// ── V131 2b: THẺ ÔN CHÍNH THỨC ─────────────────────────────────────────────────────────────────────
// Đúng 2/3 → không cho chọn Easy (server cũng chặn). Dùng ở rvRenderRatingBar / rvChooseRating (review.js).
function rvmEasyLocked() {
  const a = (typeof rvLastAnswer !== 'undefined') ? rvLastAnswer : null;
  return !!(a && a.multi && a.correct && a.multi.right < a.multi.total);
}

// Hỏi server (CHỈ ĐỌC) gợi ý rating cho đúng lượt 3 phần này. Server chấm lại 3 phần; lỗi/mất mạng → null (dùng mặc định an toàn bên dưới).
async function rvmFetchPreview(word, parts, totalMs) {
  try {
    const res = await fetch('/api/study/review/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ wordId: { hz: word.hz, l: word.l }, parts, responseTimeMs: Math.round(totalMs), answerChanges: 0 }),
    });
    return await res.json().catch(() => null);
  } catch { return null; }
}

async function rvmSubmitOfficial(m, item) {
  if (rvSubmitting) return;
  m.done = true;
  rvSubmitting = true;
  const w = item.word;
  const totalMs = Math.max(0, Math.round(performance.now() - rvStartedAt - vtHiddenMs()));
  const per = Math.round(totalMs / m.parts.length);
  const res = rvmEvaluate(m.parts); // kết quả TẠM để phản hồi ngay; server chấm lại và là nguồn sự thật
  if (res.ok) playDing(); else playBuzz();
  if (typeof swSpeakAfterAnswer === 'function') swSpeakAfterAnswer(w.hz); else speak(w.hz);

  // Hồ sơ kỹ năng cục bộ + nhật ký phiên: mỗi phần đã trả lời cập nhật đúng kỹ năng của nó. Đúng 1 dòng 'official' / thẻ, mang kết quả CẢ thẻ.
  const order = ['hz2vi', 'hz2py', 'hz2hv'];
  const answered = order.map(t => m.parts.find(p => p.typeId === t)).filter(p => p && p.picked != null);
  const logByType = {}; let carrierEntry = null; // V131 2c: giữ tham chiếu để khớp lại nhật ký với kết quả server
  for (const p of m.parts) {
    if (p.picked == null) continue; // bỏ trống: sai trong câu này, nhưng không ghi kỹ năng / không gửi server
    const carrier = answered[0] === p;
    rvRecordAnswer(item, p.q, !!p.ok, per, carrier);
    const e = rvLog[rvLog.length - 1]; logByType[p.typeId] = e;
    if (carrier && e) { e.correct = res.ok; carrierEntry = e; }
    submitSkillPractice({ word: w, exerciseType: p.q.exercisePractice, selectedAnswer: p.q.options[p.picked].key, responseTimeMs: per, source: 'extra', sessionId: rvQueue.sessionId }).catch(() => {});
  }
  if (!answered.length) { // "Không nhớ" cả 3 phần: vẫn phải có 1 dòng official cho thẻ này
    carrierEntry = { hz: w.hz, l: w.l, typeId: 'hz2vi', skill: 'recognition', correct: false, ms: totalMs, official: true, source: item.type, hinted: false, intro: false, plan: !!item.fromPlan };
    rvLog.push(carrierEntry);
    if (rvLog.length > 400) rvLog.shift();
  }

  const mp = m.parts.map(p => ({ quizType: p.typeId, label: p.label, ok: !!p.ok, blank: p.picked == null, chosen: p.picked == null ? '' : p.q.options[p.picked].label, correct: p.q.options[p.q.correctIndex].label }));
  rvLastAnswer = { correct: res.ok, card: null, autoRating: null, chosen: '', multi: { right: res.right, total: res.total, parts: mp } };
  rvPhase = 'answered';
  rvRatingPhase = 'loading';
  rvSystemRating = null; rvUserRating = null; rvFinalRating = null;
  const attemptId = ++rvAttemptId;
  const parts = m.parts.map(p => ({ quizType: p.typeId, selectedAnswer: p.picked == null ? '' : p.q.options[p.picked].key }));
  const legacy = parts.find(p => p.selectedAnswer) || parts[0]; // tương thích ngược với server chưa có V131 (chấm như câu 1 phần, không mất lượt)
  rvPendingReview = { selectedAnswer: legacy.selectedAnswer, legacyQuizType: legacy.quizType, responseTimeMs: totalMs, answerChanges: 0, parts };
  rvSubmitting = false;
  render();

  const data = await rvmFetchPreview(w, parts, totalMs);
  if (attemptId !== rvAttemptId || currentTab !== 'review' || rvRatingPhase !== 'loading') return;
  let sys;
  if (data && data.ok && data.multi && RV_RATING_ORDER.includes(data.systemRating)) {
    sys = data.systemRating;
    // Server là nguồn sự thật: đồng bộ kết quả cả câu + từng phần.
    rvLastAnswer.correct = !!data.answerCorrect;
    rvLastAnswer.multi.right = data.multi.right; rvLastAnswer.multi.total = data.multi.total;
    for (const sp of data.multi.parts || []) {
      const lp = rvLastAnswer.multi.parts.find(x => x.quizType === sp.quizType); if (lp) lp.ok = !!sp.correct;
      const le = logByType[sp.quizType]; if (le && le !== carrierEntry) le.correct = !!sp.correct; // nhật ký từng phần theo server
    }
    if (carrierEntry) carrierEntry.correct = !!data.answerCorrect; // dòng official của thẻ = kết quả CẢ thẻ theo server
  } else {
    sys = res.ok ? 'good' : 'again'; // mất mạng / server cũ: mặc định bảo thủ (không bao giờ Easy)
  }
  rvSystemRating = sys;
  rvRatingPhase = 'pending';
  render();
  if (rvShouldAutoCommit()) rvStartCountdown(attemptId);
}

if (typeof module !== 'undefined' && module.exports) module.exports = { RVM_PASS, RVM_TYPES, rvmBuildParts, rvmEvaluate, rvmEasyLocked };
