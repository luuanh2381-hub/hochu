// js/ai-explain.js — V119: "🤖 Hỏi AI" ngay tại câu SAI ở "Hôm nay học".
// Nút hiện ở màn đáp án khi trả lời sai → AI giải thích từ (nghĩa, cách dùng, từ dễ nhầm, mẹo nhớ) + 3 ví dụ có pinyin/nghĩa
// + 1 câu tự kiểm tra (điền chỗ trống, chọn 1 trong vài đáp án). "➕ Ví dụ khác" xin thêm ví dụ.
// • Chỉ gọi server khi người học bấm. Kết quả giữ trong bộ nhớ theo từ: câu sau sai lại đúng từ đó thì hiện ngay, không gọi lại.
// • Không đụng tới FSRS: câu tự kiểm tra chỉ để luyện, không ghi điểm; nút Tiếp tục/chấm điểm của câu vẫn dùng bình thường.
// • Kết quả vẽ vào #ai-ex-box bằng DOM trực tiếp (không gọi render() của tab) nên không làm nhảy màn hình/mất trạng thái.

let aiEx = {};          // hz → { status:'idle'|'loading'|'ok'|'error', data, error, more, moreErr, open, choices, picked, cached }
let aiExCtx = {};       // hz → { typeId, chosen } của lần sai gần nhất (dùng khi bấm nút)
let aiExQuota = null;   // { remaining, limit } lần gần nhất server báo
let aiExUser = null;

function aiExReset() { aiEx = {}; aiExCtx = {}; aiExQuota = null; }
function aiExState(hz) { return aiEx[hz] || (aiEx[hz] = { status: 'idle', data: null, error: '', more: false, moreErr: '', open: true, choices: [], picked: null, cached: false }); }
function aiExEnabled() { return typeof isLoggedIn === 'function' && isLoggedIn() && typeof isAdminRole === 'function' && isAdminRole(); } // V119.2: chỉ quản trị viên
function aiExEsc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function aiExJs(s) { return (typeof escapeJsAttr === 'function') ? escapeJsAttr(s) : String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function aiExShuffle(arr) { const a = (arr || []).slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function aiExQuotaLine() {
  if (!aiExQuota) return '';
  if (aiExQuota.unlimited) return `<div class="ai-ex-quota">♾️ Không giới hạn lượt AI (quản trị cao nhất)</div>`;
  return `<div class="ai-ex-quota">Còn ${aiExQuota.remaining}/${aiExQuota.limit} lượt hỏi AI hôm nay</div>`;
}

function aiExCheckHtml(hz, st) {
  const c = st.data && st.data.check;
  if (!c || !st.choices.length) return '';
  const h = aiExJs(hz);
  const blank = '<span class="ai-ex-blank">____</span>';
  const sentence = aiExEsc(c.zh).replace('____', blank);
  const answered = st.picked != null;
  const btns = st.choices.map((ch, i) => {
    let cls = 'ai-ex-choice';
    if (answered) { if (ch === c.answer) cls += ' ok'; else if (i === st.picked) cls += ' bad'; }
    return `<button class="${cls}" ${answered ? 'disabled' : ''} onclick="aiExPick('${h}',${i})">${aiExEsc(ch)}</button>`;
  }).join('');
  let result = '';
  if (answered) {
    const right = st.choices[st.picked] === c.answer;
    result = `<div class="ai-ex-result ${right ? 'ok' : 'bad'}">${right ? '✅ Đúng rồi!' : `❌ Chưa đúng — đáp án: <b>${aiExEsc(c.answer)}</b>`}
      <div class="ai-ex-full">${aiExEsc(c.zh.replace('____', c.answer))}${c.vi ? `<br><span>${aiExEsc(c.vi)}</span>` : ''}</div>
      <button class="ai-ex-link" onclick="aiExRetryCheck('${h}')">Làm lại</button></div>`;
  }
  return `<div class="ai-ex-check"><div class="ai-ex-q">📝 Tự kiểm tra (không tính điểm)</div>
    <div class="ai-ex-sentence">${sentence}</div>${c.vi && !answered ? `<div class="ai-ex-sub">${aiExEsc(c.vi)}</div>` : ''}
    <div class="ai-ex-choices">${btns}</div>${result}</div>`;
}

function aiExOkHtml(hz, st) {
  const d = st.data;
  const h = aiExJs(hz);
  const row = (label, text) => text ? `<div class="ai-ex-sec"><b>${label}</b> ${aiExEsc(text)}</div>` : '';
  const exs = (d.examples || []).map((e, i) => `<div class="ai-ex-item">
      <button class="ai-ex-spk" aria-label="Nghe" onclick="aiExSpeak('${h}',${i})">🔊</button>
      <div class="ai-ex-item-t"><div class="ai-ex-zh">${aiExEsc(e.zh)}</div>${e.py ? `<div class="ai-ex-py">${aiExEsc(e.py)}</div>` : ''}<div class="ai-ex-vi">${aiExEsc(e.vi)}</div></div></div>`).join('');
  const moreBtn = st.more
    ? `<button class="ai-ex-btn ai-ex-btn-sm" disabled><span class="ai-ex-spin"></span> Đang soạn ví dụ…</button>`
    : `<button class="ai-ex-btn ai-ex-btn-sm" onclick="aiExAsk('${h}','more')">➕ Ví dụ khác</button>`;
  return `<details class="ai-ex-det" ${st.open ? 'open' : ''} ontoggle="aiExToggle('${h}',this.open)">
    <summary>🤖 AI giải thích${st.cached ? ' <span class="ai-ex-chip">đã có sẵn</span>' : ''}</summary>
    ${row('Nghĩa:', d.meaning)}${row('Cách dùng:', d.usage)}${row('Dễ nhầm:', d.contrast)}${d.mnemonic ? `<div class="ai-ex-sec ai-ex-mn">💡 <b>Mẹo nhớ:</b> ${aiExEsc(d.mnemonic)}</div>` : ''}
    <div class="ai-ex-list">${exs}</div>
    <div class="ai-ex-actions">${moreBtn}</div>
    ${st.moreErr ? `<div class="ai-ex-err">⚠️ ${aiExEsc(st.moreErr)}</div>` : ''}
    ${aiExCheckHtml(hz, st)}<div class="ai-ex-saved">✅ Đã lưu vào <b>Thêm → Thư viện AI</b>: lần sau xem lại không cần gọi AI.</div>${aiExQuotaLine()}</details>`;
}

function aiExInner(hz) {
  const st = aiExState(hz);
  const h = aiExJs(hz);
  if (st.status === 'loading') return `<div class="ai-ex-loading"><span class="ai-ex-spin"></span> AI đang soạn giải thích… có thể mất 10–20 giây</div>`;
  if (st.status === 'ok' && st.data) return aiExOkHtml(hz, st);
  const err = st.status === 'error' ? `<div class="ai-ex-err">⚠️ ${aiExEsc(st.error)}</div>` : '';
  const label = st.status === 'error' ? '🔄 Thử lại' : '🤖 Hỏi AI: giải thích + ví dụ';
  return `${err}<button class="ai-ex-btn" onclick="aiExAsk('${h}','explain')">${label}</button>${aiExQuotaLine()}`;
}

// HTML nhúng vào màn đáp án của câu SAI. Rỗng nếu chưa đăng nhập (khách không dùng được AI).
function aiExBlockHtml(w, ctx) {
  if (!w || !w.hz || !aiExEnabled()) return '';
  if (typeof authUsername !== 'undefined' && authUsername !== aiExUser) { aiExReset(); aiExUser = authUsername; }
  aiExCtx[w.hz] = { typeId: ctx && ctx.typeId ? String(ctx.typeId) : '', chosen: ctx && ctx.chosen ? String(ctx.chosen).slice(0, 60) : '' };
  return `<div id="ai-ex-box" class="ai-ex" data-hz="${aiExEsc(w.hz)}" onclick="event.stopPropagation()">${aiExInner(w.hz)}</div>`;
}

function aiExRender(hz, scroll) {
  const el = (typeof document !== 'undefined') ? document.getElementById('ai-ex-box') : null;
  if (!el || el.dataset.hz !== hz) return; // người học đã sang câu khác → không vẽ đè
  el.innerHTML = aiExInner(hz);
  if (scroll && el.scrollIntoView) { try { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {} }
}

function aiExNiceError(e) {
  const m = e && e.message ? String(e.message) : '';
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Mất kết nối mạng. Kiểm tra mạng rồi thử lại nhé.';
  return m || 'Không gọi được AI, thử lại sau.';
}

async function aiExAsk(hz, mode) {
  const st = aiExState(hz);
  if (st.status === 'loading' || st.more) return; // chặn bấm đúp
  mode = mode === 'more' ? 'more' : 'explain';
  if (mode === 'more') { st.more = true; st.moreErr = ''; } else { st.status = 'loading'; st.error = ''; }
  aiExRender(hz);
  const ctx = aiExCtx[hz] || {};
  try {
    const res = await fetch('/api/ai/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ hz, mode, typeId: ctx.typeId || '', chosen: ctx.chosen || '' }),
    });
    const d = await res.json().catch(() => null);
    if (d && d.unlimited) aiExQuota = { unlimited: true };
    else if (d && typeof d.remaining === 'number') aiExQuota = { remaining: d.remaining, limit: d.limit };
    if (!d || !d.ok) throw new Error((d && d.error) || 'Không gọi được AI, thử lại sau.');
    if (mode === 'more') {
      const prev = (st.data && st.data.examples) || [];
      st.data = d.data || { ...(st.data || {}), examples: [...prev, ...(d.newExamples || [])] };
    } else {
      st.data = d.data; st.cached = !!d.cached; st.picked = null;
      st.choices = aiExShuffle(d.data && d.data.check ? d.data.check.choices : []);
    }
    st.status = 'ok'; st.open = true;
    // Ví dụ mới dùng được ngay cho ví dụ ở màn đáp án / câu điền chỗ trống trong phiên này.
    if (typeof rvExamplePool !== 'undefined' && Array.isArray(rvExamplePool)) {
      for (const e of (d.newExamples || [])) rvExamplePool.push({ hz, zh: e.zh, vi: e.vi });
    }
  } catch (e) {
    if (mode === 'more') st.moreErr = aiExNiceError(e); else { st.status = 'error'; st.error = aiExNiceError(e); }
  } finally {
    st.more = false;
    if (st.status === 'loading') st.status = 'error';
  }
  aiExRender(hz, true);
}

function aiExPick(hz, i) {
  const st = aiExState(hz);
  if (!st.data || !st.data.check || st.picked != null || !st.choices[i]) return;
  st.picked = i;
  aiExRender(hz);
}
function aiExRetryCheck(hz) { const st = aiExState(hz); st.picked = null; st.choices = aiExShuffle(st.choices); aiExRender(hz); }
function aiExToggle(hz, open) { aiExState(hz).open = !!open; }
function aiExSpeak(hz, i) {
  const st = aiExState(hz);
  const e = st.data && st.data.examples && st.data.examples[i];
  if (e && typeof speak === 'function') speak(e.zh);
}

(function aiExInjectStyle() {
  if (typeof document === 'undefined' || document.getElementById('ai-ex-style')) return;
  const s = document.createElement('style'); s.id = 'ai-ex-style';
  // Chỉ là hoạt ảnh quay; phần còn lại nằm trong css/styles.css
  s.textContent = '@keyframes ai-ex-rot{to{transform:rotate(360deg)}}';
  (document.head || document.documentElement).appendChild(s);
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { aiExBlockHtml, aiExInner, aiExState, aiExReset, aiExAsk, aiExPick, aiExShuffle };
