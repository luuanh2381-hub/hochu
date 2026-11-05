// js/flashcard.js — Tab Flashcard (fc*) + chiết tự bộ thủ + chấm phát âm bằng AI
// ════════════════════════════════════════════════════
// FLASHCARD
// ════════════════════════════════════════════════════
let fcQueue = sqCreate(), fcFlipped = false, fcStartedAt = 0, fcResponseTimeMs = null;

function renderFlash() {
  return `
  <div class="count-row">
    <label>Số thẻ:</label>
    <select onchange="fcChangeCount(this.value)">
      ${[10,20,30,50,'Tất cả'].map(n=>`<option value="${n}"${n==questionCount||n=='Tất cả'?' selected':''}>${n}</option>`).join('')}
    </select>
  </div>
  <div class="fc-counter" id="fc-counter"></div>
  <div class="fc-wrap" onclick="fcFlip()" id="fc-wrap">
    <div class="fc-inner" id="fc-inner">
      <div class="fc-front" id="fc-front"></div>
      <div class="fc-back" id="fc-back"></div>
    </div>
  </div>
  <div class="fc-controls" id="fc-btns"></div>
  <div class="kbd-hint" style="text-align:center;margin-top:6px;">⌨️ Space lật thẻ · 1 Chưa nhớ · 2 Đã nhớ · A phát âm</div>
  <div id="fc-pron-area" style="margin-top:10px;"></div>`;
}

function fcChangeCount(v) {
  questionCount = v === 'Tất cả' ? 9999 : parseInt(v);
  progressState.ui.questionCount = questionCount;
  cacheProgressLocally(); scheduleSync();
  // FIX (Bug 2 gốc — đổi số thẻ reset tiến trình): 'adjust' chỉ đổi KÍCH THƯỚC hàng đợi hiện có
  // (sqAdjustLimit ở study-queue.js), giữ nguyên phần đã học — không còn bindFlash(true) ép nạp lại từ đầu.
  bindFlash('adjust');
}

// V70/V71: user ĐÃ ĐĂNG NHẬP lấy thẻ từ ĐÚNG hàng đợi FSRS thật (due + new hôm nay, cùng nguồn với
// "Hôm nay học"/Trắc nghiệm/Gõ chữ/Nghe-chọn), nạp 1 LẦN vào fcQueue rồi chống lặp hoàn toàn ở
// client (xem sqAdvance). KHÁCH (không thể có thẻ FSRS thật) vẫn dùng pool theo bài đang chọn.
// forceReload: falsy = vào tab bình thường (giữ hàng đợi nếu có; lần đầu trong trang thử khôi phục
// từ localStorage — FIX Bug 2 "refresh mất tiến trình"); 'adjust' = đổi số thẻ, chỉ resize hàng đợi
// hiện có; true = ép nạp mới hoàn toàn (dự phòng, hiện không còn nơi nào gọi).
let fcRestoreAttempted = false;
async function bindFlash(forceReload) {
  fcFlipped = false;
  if (forceReload === 'adjust' && (fcQueue.items.length > 0 || fcQueue.answeredCount > 0)) {
    const limit = questionCount === 9999 ? 9999 : questionCount;
    const { error } = await sqAdjustLimit(fcQueue, limit);
    if (currentTab !== 'flash') return;
    if (error) {
      const content = document.getElementById('content');
      if (content) content.innerHTML = `<div class="panel center" style="padding:40px">⚠️ ${error}</div>`;
      return;
    }
    fcUpdate();
    return;
  }
  // V74 (audit lặp câu hỏi): render()/goTab() gọi lại bindFlash() MỖI LẦN vào tab 'flash', kể cả
  // khi chỉ rời sang tab khác rồi quay lại giữa phiên đang học dở — trước đây luôn sqLoad() lại,
  // xoá mất tiến độ + trạng thái chống lặp cũ (thẻ vừa đúng có thể hiện lại). Còn thẻ trong hàng
  // đợi (chưa hết phiên) thì chỉ vẽ lại, KHÔNG nạp lại.
  if (!forceReload && fcQueue.items.length > 0) { fcUpdate(); return; }
  if (!forceReload && !fcRestoreAttempted) {
    fcRestoreAttempted = true;
    if (sqRestoreIntoQueue('flash', fcQueue)) { fcUpdate(); return; }
  }
  const limit = questionCount === 9999 ? 9999 : questionCount;
  const front = document.getElementById('fc-front');
  if (isLoggedIn() && front) front.innerHTML = `<div class="fc-hint">⏳ Đang tải hàng đợi FSRS...</div>`;
  const { error } = await sqLoad(fcQueue, limit === 9999 ? 9999 : limit);
  if (currentTab !== 'flash') return; // user đã rời tab trong lúc chờ tải
  if (error) {
    const content = document.getElementById('content');
    if (content) content.innerHTML = `<div class="panel center" style="padding:40px">⚠️ ${error}</div>`;
    return;
  }
  fcUpdate();
}

// V77 (Yêu cầu 2/8): "Học tiếp" trên màn hình Xong phiên = nạp Study Session MỚI tiếp theo (Yêu
// cầu 4: server tự trả đúng từ CHƯA học kế tiếp theo, không quay lại đầu danh sách). "Học lại từ
// đầu" là hành động TƯỜNG MINH riêng (Yêu cầu 8) — chỉ chạy khi bấm đúng nút này, ôn lại đúng bộ
// từ vừa xong bất kể đã "hoàn thành hôm nay" hay chưa; không đụng tới FSRS thật trên server.
async function fcContinueSession() {
  const limit = questionCount === 9999 ? 9999 : questionCount;
  const { error } = await sqStartNewSession('flash', fcQueue, limit);
  if (currentTab !== 'flash') return;
  if (error) { document.getElementById('content').innerHTML = `<div class="panel center" style="padding:40px">⚠️ ${error}</div>`; return; }
  fcUpdate();
}
async function fcRelearnFromStart() {
  const limit = questionCount === 9999 ? 9999 : questionCount;
  const { error } = await sqRelearnFromStart('flash', fcQueue, limit);
  if (currentTab !== 'flash') return;
  if (error) { document.getElementById('content').innerHTML = `<div class="panel center" style="padding:40px">⚠️ ${error}</div>`; return; }
  fcUpdate();
}

// Chiết tự bộ thủ lấy từ database (AI sinh, phủ toàn bộ từ vựng) — tải 1 lần lúc mở app
let dbHanziParts = {};
// V118.1: theo dõi trạng thái tải để KHÔNG báo "đang chờ AI" khi thực ra chỉ là tải chiết tự thất bại/chưa xong.
// 'idle' → chưa tải; 'loading'; 'ok' → đã nạp từ máy chủ; 'failed' → lỗi mạng/HTTP/phiên hết hạn (sẽ tự thử lại).
let hanziPartsState = 'idle';
async function loadHanziParts(attempt) {
  attempt = attempt || 0;
  if (!authToken) return;
  if (hanziPartsState === 'loading') return;
  hanziPartsState = 'loading';
  try {
    const res = await fetch('/api/hanzi-parts', { headers: authHeaders() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!(data && data.ok && Array.isArray(data.parts))) throw new Error('bad payload');
    for (const row of data.parts) {
      let pr = row.parts;
      if (typeof pr === 'string') { try { pr = JSON.parse(pr); } catch { pr = null; } } // V118.2: dòng bị mã hoá JSON 2 lần
      if (pr) dbHanziParts[row.hz] = pr;
    }
    hanziPartsState = 'ok';
  } catch {
    // Không tải được thì dùng tạm từ điển có sẵn trong code (phủ ít hơn), không chặn app — và tự thử lại (tối đa 2 lần, 3s/6s).
    hanziPartsState = 'failed';
    if (attempt < 2) setTimeout(() => loadHanziParts(attempt + 1), 3000 * (attempt + 1));
  }
}

// V118.3 — THIẾT KẾ LẠI chiết tự: mỗi chữ là 1 thẻ (ô chữ lớn + danh sách thành phần, mỗi thành phần 1 dòng "ô bộ thủ · nghĩa").
// Trước đây khối này bị cố định max-height:82px + cuộn trong (làm cho mặt sau flashcard) nên ở "Hôm nay học" chỉ thấy 1 dải bị cắt.
// Giờ: không giới hạn chiều cao ở Hôm nay học / Trắc nghiệm; chỉ mặt sau flashcard (chiều cao cố định) mới cuộn, và cuộn cả khối chứ không cắt tiêu đề.
// Tham số thứ 2 (expanded) giữ lại để tương thích chỗ gọi cũ; không còn ảnh hưởng bố cục.
// V119: tham số thứ 3 (compact) — dùng ở màn đáp án của Hôm nay học: chỉ hiện 1 dòng tóm tắt "扌tay + 辰 người quỷ · 辶đường + 首đầu"; chạm vào mới xổ ra đủ thẻ chi tiết.
// Trạng thái mở/đóng nhớ trong hpCompactOpen để người học đã mở thì các thẻ sau vẫn mở.
let hpCompactOpen = false;
function hpShort(m) { // rút nghĩa dài thành cụm ngắn cho dòng tóm tắt: bỏ phần sau ( : ; , /
  let s = String(m == null ? '' : m).split(/[(:;,\/]/)[0].trim();
  if (!s) s = String(m == null ? '' : m).trim();
  return s.length > 18 ? s.slice(0, 17).trim() + '…' : s;
}
function renderHanziParts(hz, expanded, compact) {
  const cjk = /[\u4e00-\u9fff]/;
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
  const comp = (c, m) => `<div class="hp-comp"><span class="hp-chip">${esc(c)}</span><span class="hp-mean">${esc(m)}</span></div>`;
  const card = (ch, body) => `<div class="hp-card"><div class="hp-char">${esc(ch)}</div><div class="hp-body">${body}</div></div>`;
  const shorts = []; // mỗi chữ: phần tóm tắt 1 dòng (rỗng nếu chưa có dữ liệu)
  const rows = [...hz].map(ch => {
    // Ưu tiên dữ liệu từ database (AI sinh, phủ rộng hơn), fallback về từ điển nhỏ có sẵn trong code
    const dbEntry = dbHanziParts[ch];
    if (dbEntry) {
      if (dbEntry.type === 'parts' && Array.isArray(dbEntry.items) && dbEntry.items.length) { shorts.push({ ch, s: dbEntry.items.map(x => `<b>${esc(x.c)}</b>${esc(hpShort(x.m))}`).join(' + ') }); return card(ch, dbEntry.items.map(x => comp(x.c, x.m)).join('')); }
      if (dbEntry.type === 'note' && dbEntry.text) { shorts.push({ ch, s: esc(hpShort(dbEntry.text)) }); return card(ch, `<div class="hp-note">${esc(dbEntry.text)}</div>`); }
    }
    const entry = HANZI_PARTS[ch];
    if (entry) { shorts.push({ ch, s: Array.isArray(entry) ? entry.map(([c, m]) => `<b>${esc(c)}</b>${esc(hpShort(m))}`).join(' + ') : esc(hpShort(entry)) }); return card(ch, Array.isArray(entry) ? entry.map(([c, m]) => comp(c, m)).join('') : `<div class="hp-note">${esc(entry)}</div>`); }
    // Chưa có dữ liệu — chỉ báo cho chữ Hán thật sự (bỏ qua số/chữ Latin lẫn trong từ)
    if (!cjk.test(ch)) return '';
    // V118.1: phân biệt 3 tình huống — đang/chưa tải xong, tải lỗi, và máy chủ thật sự chưa có chữ này.
    if (hanziPartsState !== 'ok' && authToken) {
      if (hanziPartsState === 'idle' || hanziPartsState === 'failed') loadHanziParts(); // thử lại ngầm, không chặn vẽ
      shorts.push({ ch, s: '<i>đang tải…</i>' });
      return card(ch, '<div class="hp-note hp-empty">⏳ Đang tải chiết tự…</div>');
    }
    shorts.push({ ch, s: '<i>chưa có</i>' });
    return card(ch, '<div class="hp-note hp-empty">Chưa có chiết tự cho chữ này</div>');
  }).join('');
  if (!rows) return '';
  if (compact) {
    const sum = shorts.map(x => `<span class="hp-sum-item"><span class="hp-sum-ch">${esc(x.ch)}</span> ${x.s}</span>`).join('<span class="hp-sum-sep">·</span>');
    return `<details class="hp-wrap hp-compact"${hpCompactOpen ? ' open' : ''} ontoggle="hpCompactOpen=this.open" onclick="event.stopPropagation()"><summary class="hp-sum"><span class="hp-sum-ic">🧩</span><span class="hp-sum-txt">${sum}</span><span class="hp-sum-arrow">▾</span></summary>${rows}</details>`;
  }
  return `<div class="hp-wrap" onclick="event.stopPropagation()"><div class="hp-title">🧩 Chiết tự · bộ thủ</div>${rows}</div>`;
}

function fcUpdate() {
  sqPersist('flash', fcQueue); // FIX (Bug 2 — session persistence): lưu lại mọi lần vẽ để refresh không mất tiến trình
  if (fcQueue.totalPlanned === 0) {
    const msg = '🎉 Không còn thẻ nào đến hạn hoặc từ mới trong ngân sách hôm nay!<br><span style="font-size:.85rem;color:var(--muted)">Vào "🎯 Hôm nay học" để xem/chỉnh giới hạn.</span>';
    document.getElementById('content').innerHTML = `<div class="panel center" style="padding:40px">${msg}</div>`;
    return;
  }
  if (fcQueue.items.length === 0) {
    const msg = `🎉 Xong! Đã học ${fcQueue.doneHz.size} thẻ trong phiên này.`;
    document.getElementById('content').innerHTML = `<div class="panel center" style="padding:40px">${msg}
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px">
        <button class="btn btn-primary" onclick="fcContinueSession()">▶️ Học tiếp</button>
        <button class="btn" onclick="fcRelearnFromStart()">🔁 Học lại từ đầu</button>
      </div></div>`;
    if (isLoggedIn()) refreshServerMeta();
    return;
  }
  const w = fcQueue.items[0];
  document.getElementById('fc-counter').textContent = `Thẻ ${fcQueue.answeredCount+1} · còn ${fcQueue.items.length} trong hàng đợi`;
  const inner = document.getElementById('fc-inner');
  inner.classList.remove('flipped'); fcFlipped = false;
  fcStartedAt = performance.now(); fcResponseTimeMs = null; vtMarkStart(); // Phần 4: đo từ lúc thẻ MỚI hiện ra

  const tagStyle2 = lessonTagStyle(w.l);
  const lyHopBadge = w.tag === 'ly_hop' ? `<span class="fc-lesson-tag" style="background:#fff0e0;color:#b5651d;margin-left:6px;">🧩 Ly hợp</span>` : '';
  document.getElementById('fc-front').innerHTML = `
    <span class="fc-lesson-tag" style="${tagStyle2}">${lessonsLabel(w)}</span>${lyHopBadge}
    <div class="fc-hz">${w.hz}</div>
    ${showPinyin ? `<div class="fc-py">${w.py}</div>` : ''}
    ${showHanViet && w.hanviet ? `<div class="fc-hv">Hán Việt: ${w.hanviet}</div>` : ''}
    <div class="fc-hint">Nhấn để lật thẻ</div>`;
  document.getElementById('fc-back').innerHTML = `
    <span class="fc-lesson-tag" style="${tagStyle2}">${lessonsLabel(w)}</span>${lyHopBadge}
    <div class="fc-hz-back">${w.hz}</div>
    ${showPinyin ? `<div class="fc-py">${w.py}</div>` : ''}
    ${showHanViet && w.hanviet ? `<div class="fc-hv">Hán Việt: ${w.hanviet}</div>` : ''}
    ${showMeaning ? `<div class="fc-vi">${w.vi}</div>` : `<button class="btn btn-sm" style="background:var(--l9b);color:var(--l9a);margin-bottom:6px;" onclick="event.stopPropagation();toggleMeaning();fcUpdate();">👁️ Hiện nghĩa</button>`}
    <button class="btn btn-sound btn-sm" onclick="event.stopPropagation();speak('${w.hz}')">🔊 Nghe</button>
    ${renderHanziParts(w.hz)}`;
  document.getElementById('fc-btns').innerHTML = `
    <button class="fc-btn btn-fail" onclick="fcAnswer(false)">❌ Chưa nhớ</button>
    <button class="fc-btn btn-ok" onclick="fcAnswer(true)">✅ Đã nhớ</button>`;
  const pronArea = document.getElementById('fc-pron-area');
  if (pronArea) {
    pronArea.innerHTML = `
      <button class="btn btn-sm" style="background:var(--l12b);color:var(--l12a);display:block;margin:0 auto;" onclick="pronounceTest()">🎤 Đọc thử (AI chấm)</button>
      <div id="fc-pron-result"></div>`;
  }
}

function fcFlip() {
  const inner = document.getElementById('fc-inner');
  if (!fcFlipped) {
    inner.classList.add('flipped'); fcFlipped = true;
    // "Review nhiễu khi thoát ra vào lại": trừ tổng thời gian tab bị ẩn ra khỏi thời gian "cố nhớ".
    fcResponseTimeMs = Math.max(0, performance.now() - fcStartedAt - vtHiddenMs()); // thời gian "cố nhớ" trước khi lật thẻ
    speak(fcQueue.items[0].hz);
  }
}

// ── Chấm điểm giọng đọc — dùng tính năng nhận diện giọng nói có sẵn của trình duyệt (Chrome/Edge),
//    so khớp văn bản được nhận diện với chữ Hán cần đọc. Không cần server/AI, miễn phí, tức thì.
let pronRecognition = null;
// ── Chấm điểm phát âm bằng AI — ghi âm 3 giây rồi gửi cho Gemini nghe và đánh giá thanh điệu/phát âm ──
let pronMediaRecorder = null;
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
async function pronounceTest() {
  const w = fcQueue.items[0];
  const area = document.getElementById('fc-pron-result');
  if (!w || !area) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
    area.innerHTML = `<div style="color:var(--wrong);font-size:.8rem;text-align:center;margin-top:8px;">⚠️ Trình duyệt này không hỗ trợ ghi âm. Hãy dùng Chrome hoặc Edge.</div>`;
    return;
  }
  if (pronMediaRecorder && pronMediaRecorder.state === 'recording') { try { pronMediaRecorder.stop(); } catch {} return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
      : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    pronMediaRecorder = rec;
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    let seconds = 3;
    area.innerHTML = `<div style="color:var(--wrong);font-size:.85rem;text-align:center;margin-top:8px;font-weight:700;">🔴 Đang ghi âm... đọc to chữ <b>${w.hz}</b> (<span id="fc-pron-timer">${seconds}</span>s)</div>`;
    const timer = setInterval(() => {
      seconds--;
      const t = document.getElementById('fc-pron-timer');
      if (t) t.textContent = Math.max(seconds, 0);
      if (seconds <= 0) clearInterval(timer);
    }, 1000);

    rec.onstop = async () => {
      clearInterval(timer);
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' });
      if (blob.size === 0) {
        area.innerHTML = `<div style="color:var(--muted);font-size:.82rem;text-align:center;margin-top:8px;">⚠️ Không ghi được âm thanh, thử lại nhé.</div>`;
        return;
      }
      area.innerHTML = `<div style="color:var(--muted);font-size:.82rem;text-align:center;margin-top:8px;">⏳ AI đang chấm phát âm...</div>`;
      try {
        const base64 = await blobToBase64(blob);
        const res = await fetch('/api/pronunciation/grade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ hz: w.hz, py: w.py, vi: w.vi, audio: base64, mimeType: blob.type }),
        });
        const data = await res.json();
        if (!data.ok) { area.innerHTML = `<div style="color:var(--wrong);font-size:.82rem;text-align:center;margin-top:8px;">❌ ${data.error}</div>`; return; }
        const r = data.result || {};
        const score = Number.isFinite(r.score) ? r.score : 0;
        const color = score >= 8 ? 'var(--l8a)' : (score >= 5 ? '#b45309' : 'var(--l10a)');
        const bg = score >= 8 ? 'var(--l8c)' : (score >= 5 ? '#fffbeb' : 'var(--l10c)');
        area.innerHTML = `<div style="background:${bg};color:${color};border-radius:10px;padding:10px 12px;text-align:center;margin-top:6px;">
          <div style="font-weight:900;font-size:1.3rem;">${score}/10</div>
          <div style="font-size:.85rem;font-weight:700;margin-top:2px;">${r.comment || ''}</div>
          ${r.heardAs ? `<div style="font-size:.75rem;font-weight:400;margin-top:3px;opacity:.85;">AI nghe được: ${r.heardAs}</div>` : ''}
        </div>`;
      } catch (e) {
        area.innerHTML = `<div style="color:var(--wrong);font-size:.82rem;text-align:center;margin-top:8px;">❌ Không kết nối được máy chủ: ${e.message}</div>`;
      }
    };
    rec.start();
    setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, seconds * 1000 + 50);
  } catch (e) {
    area.innerHTML = `<div style="color:var(--muted);font-size:.82rem;text-align:center;margin-top:8px;">⚠️ Không dùng được micro — cần cho phép quyền truy cập micro trong trình duyệt.</div>`;
  }
}

// V70 (Task 2/3 audit): thay vì "recordAnswer" cục bộ, mỗi lượt tự chấm Đã nhớ/Chưa nhớ giờ đi
// qua ĐÚNG reviewService.reviewCard() như mọi tab khác (user đã đăng nhập). "Đã nhớ" gửi đáp án
// đúng, "Chưa nhớ" gửi 1 chuỗi chắc chắn sai — server tự xác định answerCorrect + suy FSRS rating
// (Again nếu chưa nhớ; Good/Hard/Easy tuỳ baseline nếu đã nhớ, Phần 6/9/10 lib/fsrs-auto-rating.js).
// V70/V71: ok=true/false đã đủ xác định answerCorrect ở server (selectedAnswer=w.vi khi true,
// sentinel chắc chắn sai khi false) nên biết ngay kết quả, không cần chờ round-trip mới sqAdvance.
// FIX (Bug 1 gốc — "UI chuyển câu nhưng Neon chưa lưu"): TRƯỚC ĐÂY sqAdvance()/fcUpdate() chạy
// NGAY, submitFsrsReview() chạy nền không chờ — thẻ kế tiếp có thể hiện ra (và user có thể
// refresh/đóng tab) trước khi Neon xác nhận đã lưu. Giờ ĐỢI submitFsrsReviewAwaited() (có trần chờ)
// trước khi sang thẻ tiếp theo.
let fcSubmitting = false; // AUDIT V82 (chống double-tap trong lúc đang chờ lưu — cùng lớp fix với tySubmitting ở type.js)
async function fcAnswer(ok) {
  const w = fcQueue.items[0];
  if (!w || fcSubmitting) return;
  fcSubmitting = true;
  // AUDIT V82 (Phần 2/12 — "tap → phản hồi ngay", tránh cảm giác app đứng hình): flashcard KHÔNG
  // có khoảng nghỉ hiển thị đáp án cố định như Quiz/Gõ chữ/Nghe-chọn (Promise.all + setTimeout) —
  // mạng nhanh thì gần như tức thì, nhưng mạng chậm (tới 6s trần chờ, xem SUBMIT_REVIEW_MAX_WAIT_MS)
  // TRƯỚC ĐÂY không có bất kỳ phản hồi nào trong lúc đợi, giống hệt vấn đề audit mô tả. Khoá + làm mờ
  // 2 nút NGAY khi bấm (đồng bộ, trước await) để user biết thao tác đã được ghi nhận.
  const btnsEl = document.getElementById('fc-btns');
  if (btnsEl) { btnsEl.classList.add('is-busy'); btnsEl.querySelectorAll('button').forEach(b => b.disabled = true); }
  if (isLoggedIn()) {
    const selectedAnswer = ok ? w.vi : '⨯ (tự chấm: chưa nhớ) ⨯';
    await submitFsrsReviewAwaited({ word: w, quizType: 'hz2vi', selectedAnswer, responseTimeMs: fcResponseTimeMs });
  }
  fcSubmitting = false;
  if (currentTab !== 'flash' || fcQueue.items[0] !== w) return; // user đã rời tab hoặc hàng đợi đã đổi trong lúc chờ
  sqAdvance(fcQueue, ok);
  fcFlipped = false;
  fcUpdate();
}

