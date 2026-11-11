// js/tts-fix.js — V129: "Sửa phát âm" cho chữ Hán đa âm (多音字).
// 1) ttsResolve(text): speak() (js/audio.js) gọi hàm này — nếu từ có "chữ đọc" đã lưu (vd 行 → 两行) thì đọc chữ đó thay cho chữ gốc.
//    Màn hình vẫn hiện chữ gốc. Từ không có chữ đọc → đọc y như cũ.
// 2) Tab "🔧 Sửa phát âm" (Thêm → chỉ quản trị viên): liệt kê từ đáng nghe thử, AI đề xuất chữ đọc, người dùng NGHE THỬ rồi mới bấm lưu.
// Không đụng FSRS / tiến độ học. Dữ liệu lưu ở bảng tts_hints dùng chung (xem lib/tts-hints.js).

let ttsHints = {};            // { hz: chữ đọc } — dùng chung mọi người học
let ttsHintsLoaded = false;
let ttsHintsLoading = false;

function ttsHintsLoad() {
  if (ttsHintsLoading || typeof isLoggedIn !== 'function' || !isLoggedIn()) return Promise.resolve();
  ttsHintsLoading = true;
  return fetch('/api/tts/hints', { headers: authHeaders() })
    .then(r => r.json())
    .then(d => { if (d && d.ok && d.hints && typeof d.hints === 'object') { ttsHints = d.hints; ttsHintsLoaded = true; } })
    .catch(() => {})
    .then(() => { ttsHintsLoading = false; });
}

function ttsHintFor(hz) {
  if (typeof hz !== 'string' || !Object.prototype.hasOwnProperty.call(ttsHints, hz)) return '';
  const s = ttsHints[hz];
  return (typeof s === 'string' && s) ? s : '';
}

// Lần đầu gọi khi chưa tải xong → đọc chữ gốc (không chặn, không làm chậm); các lần sau dùng chữ đọc đã sửa.
function ttsResolve(text) {
  if (!ttsHintsLoaded) ttsHintsLoad();
  return ttsHintFor(text) || text;
}

// ── Tab quản trị ──────────────────────────────────────────
let ttsFix = { status: 'idle', items: [], q: '', onlyTodo: true, limit: 40, ai: {}, skip: {}, busy: false, msg: '' };

function ttsFixEsc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function ttsFixJs(s) { return (typeof escapeJsAttr === 'function') ? escapeJsAttr(s) : String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function ttsFixIsAdmin() { return typeof isAdminRole === 'function' && isAdminRole(); }

function renderTtsFix() {
  if (!ttsFixIsAdmin()) return '<div style="padding:16px">Chỉ quản trị viên dùng được màn này.</div>';
  return '<div id="ttsfix-root" style="padding:4px 2px"></div>';
}

function bindTtsFix() {
  if (!ttsFixIsAdmin()) return;
  ttsFixDraw();
  if (ttsFix.status === 'idle' || ttsFix.status === 'error') ttsFixLoad();
}

async function ttsFixLoad() {
  ttsFix.status = 'loading'; ttsFix.msg = '';
  ttsFixDraw();
  try {
    const res = await fetch('/api/tts/candidates', { headers: authHeaders() });
    const d = await res.json();
    if (!d || !d.ok) throw new Error((d && d.error) || 'Lỗi máy chủ');
    ttsFix.items = d.items || [];
    if (d.hints && typeof d.hints === 'object') { ttsHints = d.hints; ttsHintsLoaded = true; }
    ttsFix.status = 'ok';
  } catch (e) { ttsFix.status = 'error'; ttsFix.msg = 'Không tải được danh sách: ' + e.message; }
  ttsFixDraw();
}

function ttsFixDraw() {
  const root = document.getElementById('ttsfix-root');
  if (!root) return;
  if (!root.dataset.ready) {
    root.dataset.ready = '1';
    root.innerHTML = `
      <h3 style="margin:6px 0">🔧 Sửa phát âm</h3>
      <div style="font-size:.85rem;opacity:.8;margin-bottom:8px">Một số chữ Hán có nhiều cách đọc nên trình duyệt đọc nhầm. Ở đây bạn gắn thêm chữ ngữ cảnh cho từ (vd 行 → 两行) để khi bấm 🔊 trình duyệt đọc đúng. Chữ hiển thị trên thẻ không đổi. AI chỉ đề xuất — bạn nghe thử rồi mới lưu.</div>
      <div id="ttsfix-stat" style="font-size:.85rem;margin-bottom:6px"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0">
        <input id="ttsfix-q" placeholder="Tìm chữ Hán / pinyin / nghĩa" value="${ttsFixEsc(ttsFix.q)}" oninput="ttsFix.q=this.value;ttsFix.limit=40;ttsFixDrawList()" style="flex:1;min-width:160px;padding:8px;border-radius:10px;border:1px solid rgba(128,128,128,.4)">
        <label style="display:flex;align-items:center;gap:4px;font-size:.85rem"><input type="checkbox" id="ttsfix-todo" ${ttsFix.onlyTodo ? 'checked' : ''} onchange="ttsFix.onlyTodo=this.checked;ttsFix.limit=40;ttsFixDrawList()">Chỉ từ chưa sửa</label>
      </div>
      <button id="ttsfix-batch" class="btn btn-sm" onclick="ttsFixAiBatch()">🤖 AI đề xuất 8 từ tiếp theo</button>
      <div id="ttsfix-msg" style="font-size:.85rem;margin:8px 0;min-height:1em"></div>
      <div id="ttsfix-list"></div>`;
  }
  ttsFixDrawStat(); ttsFixDrawMsg(); ttsFixDrawList();
}

function ttsFixDrawStat() {
  const el = document.getElementById('ttsfix-stat'); if (!el) return;
  if (ttsFix.status === 'loading') { el.textContent = 'Đang tải danh sách…'; return; }
  const done = ttsFix.items.filter(it => ttsHintFor(it.hz)).length;
  el.textContent = ttsFix.status === 'ok' ? `${ttsFix.items.length} từ đáng nghe thử · đã sửa ${done}` : '';
}

function ttsFixDrawMsg() {
  const el = document.getElementById('ttsfix-msg'); if (el) el.textContent = ttsFix.msg || '';
  const b = document.getElementById('ttsfix-batch'); if (b) b.disabled = !!ttsFix.busy;
}

function ttsFixFiltered() {
  const q = ttsFix.q.trim().toLowerCase();
  return ttsFix.items.filter(it => {
    if (ttsFix.onlyTodo && ttsHintFor(it.hz)) return false;
    return !q || (it.hz + ' ' + it.py + ' ' + it.vi).toLowerCase().includes(q);
  });
}

function ttsFixRowHtml(it) {
  const h = ttsFixJs(it.hz), saved = ttsHintFor(it.hz), a = ttsFix.ai[it.hz];
  const b = (label, fn) => `<button class="btn btn-sm" onclick="${fn}">${label}</button>`;
  let actions = b('🔊 Gốc', `ttsFixHear('${h}','raw')`);
  if (saved) {
    actions += b('🔊 ' + ttsFixEsc(saved), `ttsFixHear('${h}','saved')`) + b('Xoá sửa', `ttsFixRemove('${h}')`);
  } else if (a && a.say) {
    actions += `<span style="font-size:1.2rem">${ttsFixEsc(a.say)}</span>` + b('🔊 Thử', `ttsFixHear('${h}','ai')`) + b('✓ Lưu', `ttsFixSave('${h}')`) + b('✗ Bỏ', `ttsFixReject('${h}')`);
  } else if (a && a.error) {
    actions += '<span style="font-size:.8rem;opacity:.8">AI chưa chắc</span>' + b('✏️ Tự nhập', `ttsFixManual('${h}')`);
  } else {
    actions += b('🤖 AI', `ttsFixAi(['${h}'])`) + b('✏️ Tự nhập', `ttsFixManual('${h}')`);
  }
  return `<div style="border:1px solid rgba(128,128,128,.3);border-radius:12px;padding:10px;margin:8px 0">
    <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><span style="font-size:1.6rem">${ttsFixEsc(it.hz)}</span><span>${ttsFixEsc(it.py)}</span><span style="opacity:.7;font-size:.85rem">${ttsFixEsc(it.vi)}</span></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">${actions}</div></div>`;
}

function ttsFixDrawList() {
  const el = document.getElementById('ttsfix-list'); if (!el) return;
  if (ttsFix.status === 'loading') { el.innerHTML = ''; return; }
  if (ttsFix.status === 'error') { el.innerHTML = `<button class="btn btn-sm" onclick="ttsFixLoad()">Tải lại</button>`; ttsFix.msg = ttsFix.msg || ''; ttsFixDrawMsg(); return; }
  const all = ttsFixFiltered();
  if (!all.length) { el.innerHTML = '<div style="opacity:.7;padding:8px 0">Không có từ nào trong danh sách này.</div>'; return; }
  el.innerHTML = all.slice(0, ttsFix.limit).map(ttsFixRowHtml).join('')
    + (all.length > ttsFix.limit ? `<button class="btn btn-sm" onclick="ttsFix.limit+=40;ttsFixDrawList()">Hiện thêm (còn ${all.length - ttsFix.limit})</button>` : '');
}

function ttsFixHear(hz, mode) {
  let t = hz;
  if (mode === 'saved') t = ttsHintFor(hz) || hz;
  else if (mode === 'ai') t = (ttsFix.ai[hz] && ttsFix.ai[hz].say) || hz;
  if (typeof speak === 'function') speak(t, null, { raw: true }); // raw: đọc đúng chữ truyền vào, bỏ qua chữ đọc đã lưu
}

async function ttsFixAi(list) {
  if (ttsFix.busy || !list.length) return;
  ttsFix.busy = true; ttsFix.msg = '🤖 Đang hỏi AI…'; ttsFixDrawMsg();
  try {
    const res = await fetch('/api/tts/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ words: list }) });
    const d = await res.json().catch(() => null);
    if (!d || !d.ok) throw new Error((d && d.error) || 'AI không trả lời');
    const got = new Set();
    (d.items || []).forEach(it => { ttsFix.ai[it.hz] = { say: it.say }; got.add(it.hz); });
    const miss = list.filter(h => !got.has(h));
    miss.forEach(h => { ttsFix.ai[h] = { error: true }; });
    ttsFix.msg = miss.length ? `AI chưa đề xuất được ${miss.length} từ — bạn có thể tự nhập.` : '';
  } catch (e) { ttsFix.msg = '⚠️ ' + e.message; }
  ttsFix.busy = false; ttsFixDrawMsg(); ttsFixDrawList();
}

function ttsFixAiBatch() {
  const next = ttsFixFiltered().filter(it => !ttsHintFor(it.hz) && !ttsFix.ai[it.hz] && !ttsFix.skip[it.hz]).slice(0, 8).map(it => it.hz);
  if (!next.length) { ttsFix.msg = 'Không còn từ nào cần AI đề xuất trong danh sách đang xem.'; ttsFixDrawMsg(); return; }
  ttsFixAi(next);
}

async function ttsFixPost(hz, say) {
  const res = await fetch('/api/tts/hints', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ hz, say }) });
  const d = await res.json().catch(() => null);
  if (!d || !d.ok) throw new Error((d && d.error) || 'Không lưu được');
  return d;
}

async function ttsFixSave(hz) {
  const a = ttsFix.ai[hz]; if (!a || !a.say) return;
  try { const d = await ttsFixPost(hz, a.say); ttsHints[hz] = d.say || a.say; ttsHintsLoaded = true; delete ttsFix.ai[hz]; ttsFix.msg = ''; }
  catch (e) { ttsFix.msg = '⚠️ ' + e.message; }
  ttsFixDrawMsg(); ttsFixDrawStat(); ttsFixDrawList();
}

async function ttsFixRemove(hz) {
  try { await ttsFixPost(hz, ''); delete ttsHints[hz]; ttsFix.msg = ''; }
  catch (e) { ttsFix.msg = '⚠️ ' + e.message; }
  ttsFixDrawMsg(); ttsFixDrawStat(); ttsFixDrawList();
}

function ttsFixReject(hz) { delete ttsFix.ai[hz]; ttsFix.skip[hz] = true; ttsFixDrawList(); }

function ttsFixManual(hz) {
  const v = prompt('Nhập chữ đọc (phải chứa nguyên từ “' + hz + '”, chỉ chữ Hán, vd 银行):');
  const s = v == null ? '' : v.replace(/\s+/g, '');
  if (!s) return;
  ttsFix.ai[hz] = { say: s };
  ttsFixDrawList();
}
