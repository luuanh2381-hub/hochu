// js/conversation.js — V145: Thư viện hội thoại HSK 3-4
// V145.1 (sửa lỗi): dùng đúng cơ chế đăng nhập của app (authHeaders), không còn gọi hàm không tồn tại,
// không nhét dữ liệu vào onclick, không tự gọi API khi mở trang, có nút quay lại danh sách.
// Hội thoại do server cung cấp (bảng conversations / conversation_turns), KHÔNG còn dữ liệu tĩnh.
'use strict';

let currentConvo = null;
let currentConvoId = null;
let convoVoices = {}; // key: id hội thoại + ':' + số thứ tự lượt
let convoFilters = { hsk_level: 'all', topic: 'all' };
let searchQuery = '';
let convoListReq = 0; // đếm lượt tải danh sách để bỏ qua kết quả cũ trả về muộn
const CONVO_DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural';

// ── Gọi API (dùng token đăng nhập của app: authHeaders() trong js/auth.js) ──
async function convoRequest(method, url, data) {
  if (typeof authHeaders !== 'function' || typeof authToken === 'undefined' || !authToken) {
    return { ok: false, error: 'Bạn cần đăng nhập để dùng thư viện hội thoại.' };
  }
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json', ...authHeaders() } };
    if (data !== undefined) opts.body = JSON.stringify(data);
    const res = await fetch('/api' + url, opts);
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    if (!res.ok) return { ok: false, error: (body && body.error) || ('Lỗi máy chủ (' + res.status + ')') };
    return body || { ok: false, error: 'Phản hồi không hợp lệ từ máy chủ' };
  } catch (error) {
    console.error('API error:', error);
    return { ok: false, error: (error && error.message) || 'Lỗi kết nối' };
  }
}

// Lấy danh sách hội thoại → { list, error }
async function loadConversations(filters = {}) {
  const qs = new URLSearchParams(filters).toString();
  const result = await convoRequest('GET', '/conversations' + (qs ? '?' + qs : ''));
  if (result.ok && Array.isArray(result.conversations)) return { list: result.conversations, error: null };
  return { list: [], error: result.error || 'Không tải được danh sách hội thoại' };
}

// Lấy chi tiết 1 hội thoại (theo dialogue_id) → { convo, error }
async function loadConversation(dialogueId) {
  const result = await convoRequest('GET', '/conversations/' + encodeURIComponent(dialogueId));
  if (result.ok && result.conversation) return { convo: result.conversation, error: null };
  return { convo: null, error: result.error || 'Không tải được hội thoại' };
}

// Lưu tiến độ học (convoId = id số của bảng conversations)
async function updateConversationProgress(convoId, lastPlayedTurn = 0, timesPracticed = 0) {
  const result = await convoRequest('POST', '/conversations/' + Number(convoId) + '/progress', {
    last_played_turn: lastPlayedTurn,
    times_practiced: timesPracticed,
  });
  return !!result.ok;
}

// Đánh dấu yêu thích
async function toggleConversationFavorite(convoId, isFavorited) {
  const result = await convoRequest('POST', '/conversations/' + Number(convoId) + '/favorite', {
    is_favorited: !!isFavorited,
  });
  return !!result.ok;
}

// Thống kê hội thoại
async function loadConversationStats() {
  const result = await convoRequest('GET', '/conversations/stats');
  if (result.ok && result.stats) return result.stats;
  console.error('Lỗi khi tải thống kê hội thoại:', result.error);
  return [];
}

// ── Giọng đọc ──
function convoVoiceFor(convo, turnIndex) {
  if (!convo || !convo.turns || !convo.turns[turnIndex]) return CONVO_DEFAULT_VOICE;
  return convoVoices[`${convo.id}:${turnIndex}`] || CONVO_DEFAULT_VOICE;
}

function convoSetVoice(convo, turnIndex, voice) {
  convo = convo || currentConvo;
  if (!convo) return;
  convoVoices[`${convo.id}:${turnIndex}`] = voice;
}

// Ghi nhận tiến độ trên máy + gửi lên server (lượt đã nghe = lớn nhất từng nghe tới)
function convoMarkProgress(convo, lastTurn, countAsPractice) {
  if (!convo) return;
  const p = convo.progress = convo.progress || {};
  p.last_played_turn = Math.max(p.last_played_turn || 0, lastTurn);
  if (countAsPractice) p.times_practiced = (p.times_practiced || 0) + 1;
  updateConversationProgress(convo.id, p.last_played_turn, p.times_practiced || 0);
}

// Phát 1 lượt thoại
function convoPlayTurn(convo, turnIndex) {
  convo = convo || currentConvo;
  if (!convo || !convo.turns || !convo.turns[turnIndex]) return;
  const turn = convo.turns[turnIndex];

  ttsSpeakSegments([{
    text: turn.chinese_text,
    voice: convoVoiceFor(convo, turnIndex),
    gapAfter: 0,
  }], {
    start: () => convoStatus(`Đang phát lượt ${turnIndex + 1}...`),
    end: () => {
      convoStatus(`✓ Xong lượt ${turnIndex + 1}`);
      convoMarkProgress(convo, turnIndex + 1, false); // nghe lẻ từng câu KHÔNG tính là 1 lần luyện cả bài
    },
    error: () => convoStatus(`⚠️ Không phát được lượt ${turnIndex + 1}`),
  });
}

// Phát toàn bộ hội thoại
function convoPlayAll(convo) {
  convo = convo || currentConvo;
  if (!convo || !convo.turns || !convo.turns.length) {
    convoStatus('Hội thoại này chưa có nội dung các lượt thoại.');
    return;
  }

  const segs = convo.turns.map((t, i) => ({
    text: t.chinese_text,
    voice: convoVoiceFor(convo, i),
    gapAfter: i < convo.turns.length - 1 ? 600 : 0,
  }));

  ttsSpeakSegments(segs, {
    start: () => convoStatus('Đang phát toàn bộ hội thoại...'),
    end: () => {
      convoStatus('✓ Đã phát xong hội thoại');
      convoMarkProgress(convo, convo.turns.length, true);
    },
    error: () => convoStatus('⚠️ Không phát được hội thoại'),
  });
}

// ── Cài đặt hiển thị (lưu trên máy) ──
function convoPref(key, def) {
  try {
    const v = localStorage.getItem('convo_' + key);
    return v === null ? def : v === 'true';
  } catch (e) { return def; }
}

// ── Vẽ giao diện ──
const convoBadge = 'padding:2px 8px;border-radius:999px;font-size:.75rem;color:#fff;';

// Khung danh sách (KHÔNG gọi API ở đây — việc tải dữ liệu nằm ở loadConvoList, được bindConvo gọi)
function renderConvoList() {
  const hskBtn = (val, label) =>
    `<button class="btn btn-sm${convoFilters.hsk_level === val ? ' btn-primary' : ''}" onclick="setConvoFilter('hsk_level', '${val}')">${label}</button>`;

  return `<div class="panel">
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
      ${hskBtn('all', 'Tất cả')}${hskBtn('HSK 3', 'HSK 3')}${hskBtn('HSK 4', 'HSK 4')}
    </div>

    <div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap">
      <input type="text" id="convo-search" placeholder="Tìm kiếm hội thoại..." value="${escapeHtml(searchQuery)}"
        oninput="updateSearchQuery(this.value)" onkeydown="if(event.key==='Enter')searchConversations()" style="flex:1;min-width:140px">
      <button class="btn btn-sm" onclick="searchConversations()">🔍 Tìm</button>
    </div>

    <div id="convo-list-body"></div>

    <div id="convo-status" style="font-size:.8rem;opacity:.8;margin-top:6px;min-height:1em"></div>
  </div>`;
}

// Chi tiết 1 hội thoại (gồm cả các lượt thoại)
function renderConvoDetail(convo) {
  if (!convo) return '';
  const progress = convo.progress || {};
  const turns = convo.turns || [];
  const body = turns.length
    ? turns.map((t, i) => renderConvoTurn(convo, t, i)).join('')
    : '<div class="panel center" style="padding:16px;opacity:.8">Hội thoại này chưa có nội dung các lượt thoại.</div>';

  return `<div class="panel">
    <div style="margin-bottom:8px">
      <button class="btn btn-sm" onclick="goTab('convo')">← Danh sách</button>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <h3 style="margin:0">${escapeHtml(convo.title_zh)} <small style="color:var(--muted);font-weight:normal">(${escapeHtml(convo.title_vi)})</small></h3>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <span style="${convoBadge}background:${convo.hsk_level === 'HSK 3' ? '#3b82f6' : '#ef4444'}">${escapeHtml(convo.hsk_level)}</span>
        <span style="${convoBadge}background:#10b981">${escapeHtml(convo.topic)}</span>
        <button class="btn btn-sm" onclick="toggleFavorite(${Number(convo.id)}, ${!progress.is_favorited})">${progress.is_favorited ? '★ Yêu thích' : '☆ Thêm yêu thích'}</button>
      </div>
    </div>

    <div style="margin-bottom:10px;font-size:.9rem;opacity:.8">
      <strong>Tình huống:</strong> ${escapeHtml(convo.situation || 'Không có mô tả tình huống')}
    </div>

    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
      <button class="btn btn-primary btn-sm" onclick="convoPlayAll(currentConvo)">▶ Phát tất cả</button>
      <button class="btn btn-sm" onclick="pauseSpeaking()">⏸ Tạm dừng</button>
      <button class="btn btn-sm" onclick="resumeSpeaking()">▶ Tiếp tục</button>
      <button class="btn btn-sm" onclick="stopSpeaking()">⏹ Dừng</button>
      <button class="btn btn-sm" onclick="showConvoSettings()">⚙️ Cài đặt</button>
    </div>

    <div id="convo-body">${body}</div>

    <div id="convo-status" style="font-size:.8rem;opacity:.8;margin-top:6px;min-height:1em"></div>
  </div>`;
}

// Từng lượt thoại
function renderConvoTurn(convo, turn, index) {
  const v = convoVoiceFor(convo, index);
  const progress = convo.progress || {};
  const isCompleted = index < (progress.last_played_turn || 0);
  const showPinyin = convoPref('show_pinyin', true);
  const showVi = convoPref('show_vietnamese', true);
  const showExplain = convoPref('show_explanations', false);

  const info = [];
  if (showPinyin) info.push(`<div style="font-size:.85rem;opacity:.75">Pinyin: ${escapeHtml(turn.pinyin)}</div>`);
  if (showVi) info.push(`<div style="font-size:.85rem;opacity:.75">Tiếng Việt: ${escapeHtml(turn.vietnamese_text)}</div>`);

  return `<div style="border:1px solid rgba(128,128,128,.3);border-radius:12px;padding:10px;margin:8px 0;${isCompleted ? 'background:rgba(34,197,94,.12);' : ''}">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="font-weight:700;color:var(--active-dark,#3730a3)">${escapeHtml(turn.character)}</span>
      <span style="font-size:1.25rem">${escapeHtml(turn.chinese_text)}</span>
      <button class="btn btn-sm btn-sound" onclick="convoPlayTurn(currentConvo, ${index})">🔊</button>
      <select onchange="convoSetVoice(currentConvo, ${index}, this.value)" style="padding:4px;border-radius:8px;font-size:.75rem">
        <option value="zh-CN-XiaoxiaoNeural"${v === 'zh-CN-XiaoxiaoNeural' ? ' selected' : ''}>Nữ · Xiaoxiao</option>
        <option value="zh-CN-YunxiNeural"${v === 'zh-CN-YunxiNeural' ? ' selected' : ''}>Nam · Yunxi</option>
      </select>
    </div>
    ${info.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">${info.join('')}</div>` : ''}
    ${showExplain && turn.vocabulary_explanations ? `<div style="margin-top:4px;font-size:.75rem;opacity:.6">Giải thích từ vựng: ${escapeHtml(JSON.stringify(turn.vocabulary_explanations))}</div>` : ''}
    ${showExplain && turn.grammar_explanations ? `<div style="margin-top:4px;font-size:.75rem;opacity:.6">Giải thích ngữ pháp: ${escapeHtml(JSON.stringify(turn.grammar_explanations))}</div>` : ''}
  </div>`;
}

// Các thẻ trong danh sách
function renderConvoListItems(conversations) {
  if (!conversations || conversations.length === 0) {
    return '<div class="panel center" style="padding:24px">Không tìm thấy hội thoại nào.</div>';
  }

  return conversations.map((convo, i) => {
    const progress = convo.progress || {};
    return `<div class="card" style="margin:8px 0;cursor:pointer;${i === 0 ? 'border-left:4px solid #3b82f6;' : ''}" onclick="loadConvoDetail('${escapeHtml(convo.dialogue_id)}')">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <div>
          <h4 style="margin:0">${escapeHtml(convo.title_zh)}</h4>
          <div style="font-size:.85rem;opacity:.75">${escapeHtml(convo.title_vi)}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span style="${convoBadge}background:${convo.hsk_level === 'HSK 3' ? '#3b82f6' : '#ef4444'}">${escapeHtml(convo.hsk_level)}</span>
          <span style="${convoBadge}background:#10b981">${escapeHtml(convo.topic)}</span>
          <span style="${convoBadge}background:#8b5cf6">${Number(convo.total_turns) || 0} lượt</span>
          ${progress.is_favorited ? `<span style="${convoBadge}background:#fbbf24;color:#000">★</span>` : ''}
        </div>
      </div>
      <div style="margin-top:6px;font-size:.8rem;opacity:.6">${escapeHtml(convo.situation || 'Không có mô tả tình huống')}</div>
      <div style="margin-top:4px;font-size:.75rem;opacity:.5">${Number(progress.times_practiced) || 0} lần luyện tập</div>
    </div>`;
  }).join('');
}

function convoStatus(msg) {
  const el = document.getElementById('convo-status');
  if (el) el.textContent = msg || '';
}

// ── Bộ lọc / tìm kiếm ──
function setConvoFilter(type, value) {
  convoFilters[type] = value;
  const el = document.getElementById('content');
  if (el) el.innerHTML = renderConvoList(); // vẽ lại khung để nút đang chọn đổi màu
  loadConvoList();
}

function updateSearchQuery(query) {
  searchQuery = query;
}

function searchConversations() {
  loadConvoList();
}

// Tải + vẽ danh sách vào khung (chỉ chạy khi đang ở tab Hội thoại)
async function loadConvoList() {
  if (!document.getElementById('convo-list-body')) return;
  const myReq = ++convoListReq;
  convoStatus('Đang tải danh sách hội thoại...');

  const filters = {};
  if (convoFilters.hsk_level !== 'all') filters.hsk_level = convoFilters.hsk_level;
  if (convoFilters.topic !== 'all') filters.topic = convoFilters.topic;
  if (searchQuery) filters.search = searchQuery;

  const { list, error } = await loadConversations(filters);

  const body = document.getElementById('convo-list-body');
  if (myReq !== convoListReq || !body) return; // đã chuyển tab / có lượt tải mới hơn

  if (error) {
    body.innerHTML = '<div class="panel center" style="padding:24px">Không tải được danh sách hội thoại.</div>';
    convoStatus('⚠️ ' + error);
    return;
  }
  if (list.length === 0) {
    body.innerHTML = '<div class="panel center" style="padding:24px">Không tìm thấy hội thoại nào.</div>';
    convoStatus('Không tìm thấy hội thoại nào.');
    return;
  }
  body.innerHTML = renderConvoListItems(list);
  convoStatus(`Tìm thấy ${list.length} hội thoại.`);
}

// Mở 1 hội thoại
async function loadConvoDetail(dialogueId) {
  convoStatus('Đang tải chi tiết hội thoại...');

  const { convo, error } = await loadConversation(dialogueId);
  if (!convo) {
    convoStatus('⚠️ ' + (error || 'Không thể tải chi tiết hội thoại.'));
    return;
  }

  currentConvo = convo;
  currentConvoId = convo.id;

  const el = document.getElementById('content');
  if (el) el.innerHTML = renderConvoDetail(convo);
  window.scrollTo(0, 0);
}

function convoRedrawDetail() {
  const el = document.getElementById('content');
  if (el && currentConvo) el.innerHTML = renderConvoDetail(currentConvo);
}

// Yêu thích
async function toggleFavorite(convoId, isFavorited) {
  const ok = await toggleConversationFavorite(convoId, isFavorited);
  if (!ok) { convoStatus('⚠️ Không lưu được mục yêu thích.'); return; }
  if (currentConvo && Number(currentConvo.id) === Number(convoId)) {
    currentConvo.progress = currentConvo.progress || {};
    currentConvo.progress.is_favorited = isFavorited;
    convoRedrawDetail();
  }
}

// ── Cửa sổ cài đặt ──
function showConvoSettings() {
  convoCloseModal();
  const rate = (typeof ttsRate === 'number') ? ttsRate : 0.9;
  const chk = (id, label, on) => `<label style="display:block;margin:4px 0"><input type="checkbox" id="${id}"${on ? ' checked' : ''}> ${label}</label>`;

  const html = `<div id="convo-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px"
      onclick="if(event.target===this)convoCloseModal()">
    <div style="background:var(--card,#fff);color:var(--ink,inherit);border-radius:14px;padding:16px;max-width:420px;width:100%">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="margin:0">Cài đặt hội thoại</h3>
        <button class="btn btn-sm" onclick="convoCloseModal()">×</button>
      </div>
      <div style="margin-bottom:12px">
        <label>Tốc độ phát âm: <span id="convo-rate-value">${rate.toFixed(2)}x</span></label>
        <input type="range" min="0.8" max="1.2" step="0.05" value="${rate}" style="width:100%" oninput="convoSetRate(this.value)">
      </div>
      <div style="margin-bottom:12px">
        ${chk('show-pinyin', 'Hiển thị Pinyin', convoPref('show_pinyin', true))}
        ${chk('show-vietnamese', 'Hiển thị tiếng Việt', convoPref('show_vietnamese', true))}
        ${chk('show-explanations', 'Hiển thị giải thích', convoPref('show_explanations', false))}
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" onclick="convoCloseModal()">Hủy</button>
        <button class="btn btn-primary" onclick="saveConvoSettings()">Lưu cài đặt</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function saveConvoSettings() {
  const val = (id) => { const el = document.getElementById(id); return !!(el && el.checked); };
  try {
    localStorage.setItem('convo_show_pinyin', val('show-pinyin'));
    localStorage.setItem('convo_show_vietnamese', val('show-vietnamese'));
    localStorage.setItem('convo_show_explanations', val('show-explanations'));
  } catch (e) { /* trình duyệt chặn localStorage: bỏ qua, dùng mặc định */ }
  convoCloseModal();
  convoRedrawDetail();
}

function convoCloseModal() {
  const modal = document.getElementById('convo-modal');
  if (modal) modal.remove();
}

// Tốc độ phát: dùng lại hàm của app (js/audio.js) để được giới hạn 0.8–1.2 và đồng bộ lên tài khoản
function convoSetRate(value) {
  if (typeof updateSpeed === 'function') updateSpeed(value);
  const el = document.getElementById('convo-rate-value');
  if (el && typeof ttsRate === 'number') el.textContent = `${ttsRate.toFixed(2)}x`;
}

// ── Điểm vào (được js/navigation.js gọi khi mở tab "Hội thoại") ──
function renderConvo() {
  return renderConvoList();
}

function bindConvo() {
  loadConvoList();
}

function initConvo() {
  loadConvoList(); // an toàn: tự thoát nếu chưa ở tab Hội thoại
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  renderConvo,
  bindConvo,
  initConvo,
  loadConvoList,
  loadConvoDetail,
  convoPlayTurn,
  convoPlayAll,
  toggleFavorite,
};
