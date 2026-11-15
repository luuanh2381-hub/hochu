// js/ai-bank.js — V119.1: tab "🤖 Thư viện AI" (Thêm → Thư viện AI).
// Mọi giải thích AI bạn đã xem ở câu sai được lưu theo tài khoản; ở đây xem lại, nghe lại ví dụ, tìm theo từ.
// Xem lại KHÔNG gọi AI và KHÔNG tốn lượt (dữ liệu đọc thẳng từ server). Xoá chỉ xoá khỏi thư viện của bạn.

let aiBank = { status: 'idle', items: [], error: '', q: '', quota: null };
let aiBankUser = null;

function aiBankEsc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function aiBankJs(s) { return (typeof escapeJsAttr === 'function') ? escapeJsAttr(s) : String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function aiBankNorm(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd'); }

function aiBankIsAdmin() { return typeof isAdminRole === 'function' && isAdminRole(); } // V119.2: chỉ quản trị viên

function aiBankFiltered() {
  const q = aiBankNorm(aiBank.q).trim();
  if (!q) return aiBank.items;
  return aiBank.items.filter(it => aiBankNorm([it.hz, it.py, it.vi, it.hanviet, it.meaning, it.data && it.data.meaning].join(' ')).includes(q));
}

function aiBankDate(iso) {
  const d = new Date(iso); if (isNaN(d)) return '';
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function aiBankDetailHtml(it) {
  const d = it.data || {};
  const h = aiBankJs(it.hz);
  const row = (label, text) => text ? `<div class="aib-sec"><b>${label}</b> ${aiBankEsc(text)}</div>` : '';
  const exs = (d.examples || []).map((e, j) => `<div class="aib-ex">
      <button class="aib-spk" aria-label="Nghe" onclick="aiBankSpeak('${h}',${j})">🔊</button>
      <div><div class="aib-zh">${aiBankEsc(e.zh)}</div>${e.py ? `<div class="aib-py">${aiBankEsc(e.py)}</div>` : ''}<div class="aib-vi">${aiBankEsc(e.vi)}</div></div></div>`).join('');
  const check = d.check && d.check.zh
    ? `<div class="aib-sec aib-chk">📝 ${aiBankEsc(d.check.zh.replace('____', d.check.answer))}${d.check.vi ? `<br><span>${aiBankEsc(d.check.vi)}</span>` : ''}</div>` : '';
  return `${row('Nghĩa:', d.meaning)}${row('Cách dùng:', d.usage)}${row('Dễ nhầm:', d.contrast)}
      ${d.mnemonic ? `<div class="aib-sec aib-mn">💡 <b>Mẹo nhớ:</b> ${aiBankEsc(d.mnemonic)}</div>` : ''}
      <div class="aib-exs">${exs}</div>${check}`;
}

// V119.1: danh sách nhẹ; phần chi tiết chỉ tải khi mở từ (it.open) rồi giữ trong bộ nhớ.
function aiBankItemHtml(it) {
  const h = aiBankJs(it.hz);
  let inner;
  if (it.data) inner = aiBankDetailHtml(it);
  else if (it.err) inner = `<div class="aib-sec aib-err">⚠️ ${aiBankEsc(it.err)} <button class="aib-link" onclick="aiBankLoadItem('${h}')">Thử lại</button></div>`;
  else inner = `<div class="aib-sec aib-wait">⏳ Đang tải giải thích…</div>`;
  return `<details class="aib-item" data-hz="${aiBankEsc(it.hz)}" ${it.open ? 'open' : ''} ontoggle="aiBankToggle('${h}',this.open)">
    <summary><span class="aib-hz">${aiBankEsc(it.hz)}</span><span class="aib-meta"><span class="aib-pyv">${aiBankEsc(it.py)}</span><span class="aib-viv">${aiBankEsc(it.vi)}</span></span><span class="aib-date">${aiBankDate(it.updatedAt)}</span></summary>
    <div class="aib-body">
      ${it.hanviet ? `<div class="aib-hv">Hán Việt: ${aiBankEsc(it.hanviet)}</div>` : ''}
      ${it.open || it.data ? inner : ''}
      <div class="aib-actions"><button class="aib-del" onclick="aiBankRemove('${h}')">🗑 Xoá khỏi thư viện</button></div>
    </div></details>`;
}

function aiBankListHtml() {
  if (aiBank.status === 'loading' && !aiBank.items.length) return `<div class="aib-empty">⏳ Đang tải thư viện…</div>`;
  if (aiBank.status === 'error' && !aiBank.items.length) return `<div class="aib-empty aib-err">⚠️ ${aiBankEsc(aiBank.error)}<br><button class="btn btn-sm" onclick="aiBankLoad()">Thử lại</button></div>`;
  if (!aiBank.items.length) return `<div class="aib-empty">Chưa có giải thích nào. Khi trả lời sai ở "Hôm nay học", bấm <b>🤖 Hỏi AI</b> — giải thích sẽ tự được lưu vào đây để xem lại mà không cần gọi AI.</div>`;
  const list = aiBankFiltered();
  if (!list.length) return `<div class="aib-empty">Không có từ nào khớp “${aiBankEsc(aiBank.q)}”.</div>`;
  return list.map(aiBankItemHtml).join('');
}

function aiBankCountHtml() {
  const n = aiBank.items.length, m = aiBankFiltered().length;
  if (!n) return '';
  return n === m ? `${n} từ đã lưu` : `${m}/${n} từ`;
}

function renderAiBank() {
  if (!isLoggedIn()) return `<div class="panel"><div class="aib-empty">🔒 Đăng nhập để dùng Thư viện AI.</div></div>`;
  if (!aiBankIsAdmin()) return `<div class="panel"><div class="aib-empty">🔒 Thư viện AI chỉ dành cho quản trị viên.</div></div>`;
  if (typeof authUsername !== 'undefined' && authUsername !== aiBankUser) { aiBankReset(); aiBankUser = authUsername; } // đổi tài khoản → không lộ thư viện của người trước
  return `<div class="panel aib-head">
      <div class="aib-title">🤖 Thư viện AI</div>
      <div class="aib-sub">Các giải thích AI đã soạn cho từ bạn từng trả lời sai. Xem lại ở đây <b>không tốn lượt AI</b>.</div>
      <input id="aib-search" class="aib-search" type="search" placeholder="Tìm theo chữ Hán, pinyin, nghĩa…" value="${aiBankEsc(aiBank.q)}" oninput="aiBankSearch(this.value)" autocomplete="off">
      <div id="aib-count" class="aib-count">${aiBankCountHtml()}</div>
    </div>
    <div id="aib-list">${aiBankListHtml()}</div>`;
}

function bindAiBank() { if (isLoggedIn() && aiBankIsAdmin()) aiBankLoad(); } // mỗi lần mở tab tải lại (nhỏ, và để thấy từ vừa lưu)

function aiBankRefresh() {
  const l = document.getElementById('aib-list'); if (l) l.innerHTML = aiBankListHtml();
  const c = document.getElementById('aib-count'); if (c) c.innerHTML = aiBankCountHtml();
}

async function aiBankLoad() {
  if (aiBank.status === 'loading') return;
  aiBank.status = 'loading'; aiBank.error = '';
  aiBankRefresh();
  try {
    const res = await fetch('/api/ai/library', { headers: authHeaders() });
    const d = await res.json().catch(() => null);
    if (!d || !d.ok) throw new Error((d && d.error) || 'Không tải được thư viện, thử lại sau.');
    const old = new Map(aiBank.items.map(x => [x.hz, x]));
    aiBank.items = (Array.isArray(d.items) ? d.items : []).map(x => { const o = old.get(x.hz); return o ? { ...x, open: o.open, data: o.data } : x; });
    aiBank.status = 'ok';
  } catch (e) {
    aiBank.status = 'error';
    aiBank.error = /failed to fetch|networkerror|load failed/i.test(e && e.message) ? 'Mất kết nối mạng. Kiểm tra mạng rồi thử lại nhé.' : (e && e.message) || 'Không tải được thư viện.';
  }
  aiBankRefresh();
}

function aiBankToggle(hz, open) {
  const it = aiBank.items.find(x => x.hz === hz); if (!it) return;
  it.open = !!open;
  if (!open) it.err = ''; // đóng rồi mở lại = thử lại
  if (open && !it.data && !it.loading && !it.err) return aiBankLoadItem(hz); // có lỗi thì chờ bấm "Thử lại" (tránh vòng lặp tự gọi)
}

async function aiBankLoadItem(hz) {
  const it = aiBank.items.find(x => x.hz === hz); if (!it || it.loading) return;
  it.loading = true; it.err = '';
  aiBankRefreshItem(hz);
  try {
    const res = await fetch('/api/ai/library/item?hz=' + encodeURIComponent(hz), { headers: authHeaders() });
    const d = await res.json().catch(() => null);
    if (!d || !d.ok || !d.item) throw new Error((d && d.error) || 'Không tải được giải thích, thử lại sau.');
    it.data = d.item.data;
  } catch (e) {
    it.err = /failed to fetch|networkerror|load failed/i.test(e && e.message) ? 'Mất kết nối mạng.' : (e && e.message) || 'Không tải được giải thích.';
  }
  it.loading = false;
  aiBankRefreshItem(hz);
}

// Chỉ vẽ lại phần thân của đúng từ đó (không vẽ lại cả danh sách → không nhảy màn hình).
function aiBankRefreshItem(hz) {
  const it = aiBank.items.find(x => x.hz === hz); if (!it) return;
  const list = document.getElementById('aib-list'); if (!list) return;
  const el = list.querySelector ? list.querySelector(`.aib-item[data-hz="${aiBankEsc(hz)}"]`) : null;
  if (el) { el.outerHTML = aiBankItemHtml(it); return; }
  aiBankRefresh(); // môi trường không có querySelector / chưa có phần tử → vẽ lại cả danh sách
}

function aiBankSearch(v) { aiBank.q = String(v || ''); aiBankRefresh(); }

function aiBankSpeak(hz, j) {
  const it = aiBank.items.find(x => x.hz === hz);
  const e = it && it.data && it.data.examples && it.data.examples[j];
  if (e && typeof speak === 'function') speak(e.zh);
}

async function aiBankRemove(hz) {
  if (typeof confirm === 'function' && !confirm(`Xoá “${hz}” khỏi Thư viện AI của bạn?`)) return;
  try {
    const res = await fetch('/api/ai/library/remove', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ hz }) });
    const d = await res.json().catch(() => null);
    if (!d || !d.ok) throw new Error((d && d.error) || 'Không xoá được, thử lại sau.');
    aiBank.items = aiBank.items.filter(x => x.hz !== hz);
    // Ở màn đáp án, từ này lại hiện nút hỏi bình thường (giải thích dùng chung vẫn còn nên hỏi lại cũng không tốn lượt)
    if (typeof aiEx !== 'undefined' && aiEx[hz]) delete aiEx[hz];
  } catch (e) {
    if (typeof alert === 'function') alert(e && e.message ? e.message : 'Không xoá được, thử lại sau.');
  }
  aiBankRefresh();
}

function aiBankReset() { aiBank = { status: 'idle', items: [], error: '', q: '', quota: null }; }

if (typeof module !== 'undefined' && module.exports) module.exports = { renderAiBank, aiBankItemHtml, aiBankDetailHtml, aiBankListHtml, aiBankFiltered, aiBankNorm };
