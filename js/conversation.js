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

// ── Vẽ giao diện (V155: thiết kế lại — class cv-* trong css/conversation-v155.css; KHÔNG đổi API/logic) ──
// Hai màn tách riêng: (1) HỌC — danh sách + hội thoại dạng khung chat, dành cho mọi người học; (2) DUYỆT — chỉ quản trị viên
// (convoOpenReview). Màn học không còn bảng/nút quản trị; admin vào màn Duyệt từ 1 thẻ gọn ở đầu danh sách.
let convoFrom = 'list';          // chi tiết được mở từ đâu: 'list' (học) | 'review' (duyệt)
let convoReviewFilter = 'draft'; // tab đang xem ở màn Duyệt: draft | pending | ready | failed
let convoOnlyFav = false;        // lọc "★ Yêu thích" (lọc phía trình duyệt trên danh sách đã tải)
let convoLastList = [];          // danh sách đã tải gần nhất
let convoRoleplay = 'off';       // chế độ Đóng vai / Shadowing: 'off' | 'a' (ẩn nhân vật 1) | 'b' (ẩn nhân vật 2)
let convoRevealedTurns = new Set();

function convoSetRoleplay(mode) {
  convoRoleplay = (mode === 'a' || mode === 'b') ? mode : 'off';
  convoRevealedTurns = new Set();
  convoRedrawDetail();
}
function convoRevealTurn(index) {
  convoRevealedTurns.add(Number(index));
  convoRedrawDetail();
}

const cvNum = (n) => Number(n) || 0;
const CV_IC = {
  back: '<svg class="cv-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  play: '<svg class="cv-ic cv-ic-fill" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  pause: '<svg class="cv-ic cv-ic-fill" viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="3.6" height="14" rx="1"/><rect x="13.9" y="5" width="3.6" height="14" rx="1"/></svg>',
  stop: '<svg class="cv-ic cv-ic-fill" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  tune: '<svg class="cv-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
  speaker: '<svg class="cv-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.8l4.7 3.8V5.7L7.8 9.5z"/><path d="M16 9.2a4 4 0 0 1 0 5.6"/><path d="M18.4 6.8a7.4 7.4 0 0 1 0 10.4"/></svg>',
  star: '<svg class="cv-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.2l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"/></svg>',
  edit: '<svg class="cv-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
};
const convoLevelClass = (lv) => (lv === 'HSK 3' ? 'cv-hsk3' : 'cv-hsk4');
const convoPill = (text, cls) => `<span class="cv-pill ${cls || ''}">${escapeHtml(text)}</span>`;

// Khung danh sách (KHÔNG gọi API ở đây — việc tải dữ liệu nằm ở loadConvoList, được bindConvo gọi)
function renderConvoList() {
  const seg = (val, label) =>
    `<button type="button" class="cv-seg-btn${convoFilters.hsk_level === val ? ' is-on' : ''}" onclick="setConvoFilter('hsk_level', '${val}')">${label}</button>`;
  return `<div class="cv">
    <header class="cv-head">
      <h2 class="cv-h">Hội thoại</h2>
      <p class="cv-sub">Luyện nghe – đọc theo tình huống thực tế · HSK 3–4</p>
    </header>
    <div id="convo-admin-entry"></div>
    <div class="cv-seg" role="group" aria-label="Lọc theo cấp độ">
      ${seg('all', 'Tất cả')}${seg('HSK 3', 'HSK 3')}${seg('HSK 4', 'HSK 4')}
      <button type="button" class="cv-seg-btn cv-seg-fav${convoOnlyFav ? ' is-on' : ''}" onclick="toggleConvoFavFilter()">${CV_IC.star}<span>Yêu thích</span></button>
    </div>
    <div class="cv-search">
      <input type="search" id="convo-search" placeholder="Tìm theo tiêu đề, chủ đề, câu thoại…" value="${escapeHtml(searchQuery)}"
        oninput="updateSearchQuery(this.value)" onkeydown="if(event.key==='Enter')searchConversations()" autocomplete="off">
      <button type="button" class="cv-btn cv-btn-primary" onclick="searchConversations()">Tìm</button>
    </div>
    <div id="convo-list-body" class="cv-list"></div>
    <div id="convo-status" class="cv-status" role="status"></div>
  </div>`;
}

// Chi tiết 1 hội thoại: thanh tiêu đề · tình huống · khung chat · thanh phát âm cố định ở đáy
function renderConvoDetail(convo) {
  if (!convo) return '';
  const progress = convo.progress || {};
  const turns = convo.turns || [];
  const reviewMode = convoFrom === 'review' && convoIsAdmin();
  const body = turns.length
    ? turns.map((t, i) => renderConvoTurn(convo, t, i)).join('')
    : '<div class="cv-empty">Hội thoại này chưa có nội dung các lượt thoại.</div>';
  const done = Math.min(cvNum(progress.last_played_turn), turns.length);

  return `<div class="cv cv-detail">
    <div class="cv-bar">
      <button type="button" class="cv-iconbtn" onclick="convoBack()" aria-label="${reviewMode ? 'Quay lại màn Duyệt' : 'Quay lại danh sách'}">${CV_IC.back}</button>
      <div class="cv-bar-title">
        <span class="cv-title-zh">${escapeHtml(convo.title_zh)}</span>
        <span class="cv-title-vi">${escapeHtml(convo.title_vi)}</span>
      </div>
      <button type="button" class="cv-iconbtn cv-fav${progress.is_favorited ? ' is-on' : ''}" onclick="toggleFavorite(${Number(convo.id)}, ${!progress.is_favorited})"
        aria-pressed="${progress.is_favorited ? 'true' : 'false'}" aria-label="${progress.is_favorited ? 'Bỏ yêu thích' : 'Thêm yêu thích'}" title="${progress.is_favorited ? 'Bỏ yêu thích' : 'Thêm yêu thích'}">${CV_IC.star}</button>
    </div>

    <div class="cv-chips">
      ${convoPill(convo.hsk_level, convoLevelClass(convo.hsk_level))}${convoPill(convo.topic, 'cv-pill-topic')}
      <span class="cv-chip-txt">${turns.length} lượt${turns.length ? ` · đã nghe ${done}/${turns.length}` : ''}</span>
    </div>

    ${!reviewMode && turns.length ? `<div class="cv-seg" role="group" aria-label="Chế độ đóng vai" style="margin-bottom:10px">
      <button type="button" class="cv-seg-btn${convoRoleplay === 'off' ? ' is-on' : ''}" onclick="convoSetRoleplay('off')">Đọc đầy đủ</button>
      <button type="button" class="cv-seg-btn${convoRoleplay === 'a' ? ' is-on' : ''}" onclick="convoSetRoleplay('a')">🎭 Đóng vai A</button>
      <button type="button" class="cv-seg-btn${convoRoleplay === 'b' ? ' is-on' : ''}" onclick="convoSetRoleplay('b')">🎭 Đóng vai B</button>
    </div>` : ''}

    ${reviewMode ? convoAdminBar(convo) : ''}

    <div class="cv-situation"><span class="cv-situation-k">Tình huống</span>${escapeHtml(convo.situation || 'Không có mô tả tình huống')}</div>

    <div id="convo-body" class="cv-chat">${body}</div>

    <div id="convo-status" class="cv-status" role="status"></div>

    <div class="cv-dock" role="toolbar" aria-label="Phát âm thanh">
      <button type="button" class="cv-btn cv-btn-primary cv-dock-main" onclick="convoPlayAll(currentConvo)">${CV_IC.play}<span>Phát tất cả</span></button>
      <button type="button" class="cv-iconbtn" onclick="pauseSpeaking()" aria-label="Tạm dừng" title="Tạm dừng">${CV_IC.pause}</button>
      <button type="button" class="cv-iconbtn" onclick="resumeSpeaking()" aria-label="Tiếp tục" title="Tiếp tục">${CV_IC.play}</button>
      <button type="button" class="cv-iconbtn" onclick="stopSpeaking()" aria-label="Dừng" title="Dừng">${CV_IC.stop}</button>
      <button type="button" class="cv-iconbtn" onclick="showConvoSettings()" aria-label="Cài đặt hội thoại" title="Cài đặt">${CV_IC.tune}</button>
    </div>
  </div>`;
}

// Từng lượt thoại: 2 nhân vật đầu tiên ở 2 phía (trái/phải) như khung chat; Hán tự lớn → pinyin → tiếng Việt
function renderConvoTurn(convo, turn, index) {
  const v = convoVoiceFor(convo, index);
  const progress = convo.progress || {};
  const isCompleted = index < (progress.last_played_turn || 0);
  const showPinyin = convoPref('show_pinyin', true);
  const showVi = convoPref('show_vietnamese', true);
  const showExplain = convoPref('show_explanations', false);
  const reviewMode = convoFrom === 'review' && convoIsAdmin();

  const names = [];
  for (const t of (convo.turns || [])) if (!names.includes(t.character)) names.push(t.character);
  const side = names.indexOf(turn.character) === 1 ? 'b' : 'a';
  const avatar = escapeHtml(Array.from(String(turn.character || '?').trim() || '?')[0]);

  const explain = [];
  if (showExplain && turn.vocabulary_explanations) explain.push(`<div class="cv-ex-row"><span class="cv-ex-k">Từ vựng</span><span>${convoFmtExplain(turn.vocabulary_explanations, 'v', true)}</span></div>`);
  if (showExplain && turn.grammar_explanations) explain.push(`<div class="cv-ex-row"><span class="cv-ex-k">Ngữ pháp</span><span>${convoFmtExplain(turn.grammar_explanations, 'g')}</span></div>`);

  const masked = !reviewMode && convoRoleplay === side && !convoRevealedTurns.has(index);
  return `<div id="convo-turn-${index}" class="cv-turn cv-side-${side}${isCompleted ? ' is-done' : ''}${masked ? ' is-roleplay' : ''}">
    <span class="cv-avatar" aria-hidden="true">${avatar}</span>
    <div class="cv-bubble">
      <div class="cv-who">${escapeHtml(turn.character)} · lượt ${index + 1}${isCompleted ? ' <span class="cv-tick" title="Đã nghe">✓</span>' : ''}${masked ? ' · <b>Lượt của bạn</b>' : ''}</div>
      ${masked
        ? `<div class="cv-vi" style="font-weight:700;margin-top:2px">🗣️ Hãy thử nói: “${escapeHtml(turn.vietnamese_text || '...')}”</div>
           <div style="margin-top:8px"><button type="button" class="cv-play" onclick="convoRevealTurn(${index})">👁 Hiện chữ Hán &amp; Pinyin</button></div>`
        : `<div class="cv-zh">${escapeHtml(turn.chinese_text)}</div>
           ${showPinyin ? `<div class="cv-py">${escapeHtml(turn.pinyin)}</div>` : ''}
           ${showVi ? `<div class="cv-vi">${escapeHtml(turn.vietnamese_text)}</div>` : ''}
           ${explain.length ? `<div class="cv-ex">${explain.join('')}</div>` : ''}`}
      <div class="cv-tools">
        <button type="button" class="cv-play" onclick="convoPlayTurn(currentConvo, ${index})" aria-label="Phát lượt ${index + 1}">${CV_IC.speaker}<span>Nghe</span></button>
        <select class="cv-voice" aria-label="Giọng đọc lượt ${index + 1}" onchange="convoSetVoice(currentConvo, ${index}, this.value)">
          <option value="zh-CN-XiaoxiaoNeural"${v === 'zh-CN-XiaoxiaoNeural' ? ' selected' : ''}>Nữ · Xiaoxiao</option>
          <option value="zh-CN-YunxiNeural"${v === 'zh-CN-YunxiNeural' ? ' selected' : ''}>Nam · Yunxi</option>
        </select>
        ${reviewMode ? `<button type="button" class="cv-play cv-edit" title="Sửa lượt này" aria-label="Sửa lượt ${index + 1}" onclick="convoEditTurn(${index})">${CV_IC.edit}<span>Sửa</span></button>` : ''}
      </div>
    </div>
  </div>`;
}

// Thẻ trong danh sách: Hán tự tiêu đề · nghĩa · cấp độ/chủ đề/số lượt · thanh tiến độ
function renderConvoListItems(conversations) {
  const list = convoOnlyFav ? (conversations || []).filter((c) => c.progress && c.progress.is_favorited) : (conversations || []);
  if (list.length === 0) {
    return `<div class="cv-empty">${convoOnlyFav ? 'Bạn chưa đánh dấu hội thoại yêu thích nào.' : 'Không tìm thấy hội thoại nào.'}</div>`;
  }
  return list.map((convo) => {
    const progress = convo.progress || {};
    const total = cvNum(convo.total_turns);
    const done = Math.max(0, Math.min(cvNum(progress.last_played_turn), total));
    const pct = total ? Math.round((done / total) * 100) : 0;
    const practiced = cvNum(progress.times_practiced);
    const state = done >= total && total > 0 ? 'Đã nghe hết' : (done > 0 ? `Đang học ${done}/${total}` : 'Chưa học');
    return `<button type="button" class="cv-card" onclick="loadConvoDetail('${convoSafeId(convo.dialogue_id)}', 'list')">
      <span class="cv-card-main">
        <span class="cv-card-zh">${escapeHtml(convo.title_zh)}</span>
        <span class="cv-card-vi">${escapeHtml(convo.title_vi)}</span>
        <span class="cv-meta">${convoPill(convo.hsk_level, convoLevelClass(convo.hsk_level))}<span>${escapeHtml(convo.topic)}</span><span class="cv-dot">·</span><span>${total} lượt</span></span>
        <span class="cv-prog"><span class="cv-prog-bar"><i style="width:${pct}%"></i></span><span class="cv-prog-txt">${state}${practiced ? ` · ${practiced} lần luyện` : ''}</span></span>
      </span>
      <span class="cv-card-side">${progress.is_favorited ? `<span class="cv-faved" title="Yêu thích">${CV_IC.star}</span>` : ''}<span class="cv-chev" aria-hidden="true">›</span></span>
    </button>`;
  }).join('');
}

function convoStatus(msg) {
  const el = document.getElementById('convo-status');
  if (el) el.textContent = msg || '';
}

// Nút quay lại ở màn chi tiết: về Duyệt (admin) hoặc về danh sách
function convoBack() {
  if (convoFrom === 'review' && convoIsAdmin()) { convoOpenReview(); return; }
  goTab('convo');
}

// ── Bộ lọc / tìm kiếm ──
function setConvoFilter(type, value) {
  convoFilters[type] = value;
  const el = document.getElementById('content');
  if (el) el.innerHTML = renderConvoList(); // vẽ lại khung để nút đang chọn đổi trạng thái
  loadConvoList();
  loadConvoAdminEntry();
}

function toggleConvoFavFilter() {
  convoOnlyFav = !convoOnlyFav;
  const btn = document.querySelector && document.querySelector('.cv-seg-fav');
  if (btn) btn.classList.toggle('is-on', convoOnlyFav);
  const body = document.getElementById('convo-list-body');
  if (body) { body.innerHTML = renderConvoListItems(convoLastList); convoStatus(''); }
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
    body.innerHTML = '<div class="cv-empty">Không tải được danh sách hội thoại.</div>';
    convoStatus('⚠️ ' + error);
    return;
  }
  convoLastList = list;
  if (list.length === 0) {
    body.innerHTML = '<div class="cv-empty">Không tìm thấy hội thoại nào.</div>';
    convoStatus('Không tìm thấy hội thoại nào.');
    return;
  }
  body.innerHTML = renderConvoListItems(list);
  convoStatus(`Tìm thấy ${list.length} hội thoại.`);
}

// Mở 1 hội thoại. `from`: 'list' (mặc định khi mở từ danh sách học) | 'review' (từ màn Duyệt). Không truyền → giữ nguyên nơi đã mở.
async function loadConvoDetail(dialogueId, from) {
  if (from === 'list' || from === 'review') convoFrom = from;
  convoStatus('Đang tải chi tiết hội thoại...');

  const { convo, error } = await loadConversation(dialogueId);
  if (!convo) {
    convoStatus('⚠️ ' + (error || 'Không thể tải chi tiết hội thoại.'));
    convoGenMsg('⚠️ ' + (error || 'Không thể tải chi tiết hội thoại.'));
    return;
  }

  currentConvo = convo;
  currentConvoId = convo.id;
  convoRoleplay = 'off';
  convoRevealedTurns = new Set();

  const el = document.getElementById('content');
  if (el) el.innerHTML = renderConvoDetail(convo);
  window.scrollTo(0, 0);
  convoVocabInfo = null;
  convoLoadVocabStatus(); // V153: huy hiệu từ vựng ↔ kho từ (chạy nền, lỗi không ảnh hưởng)
}

function convoRedrawDetail() {
  const el = document.getElementById('content');
  if (el && currentConvo) el.innerHTML = renderConvoDetail(currentConvo);
  if (currentConvo) convoLoadVocabStatus();
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
  const chk = (id, label, on) => `<label class="cv-check"><input type="checkbox" id="${id}"${on ? ' checked' : ''}><span>${label}</span></label>`;

  const html = `<div id="convo-modal" class="cv-modal" onclick="if(event.target===this)convoCloseModal()">
    <div class="cv-sheet" role="dialog" aria-modal="true" aria-label="Cài đặt hội thoại">
      <div class="cv-sheet-head">
        <h3>Cài đặt hội thoại</h3>
        <button type="button" class="cv-iconbtn" onclick="convoCloseModal()" aria-label="Đóng">×</button>
      </div>
      <div class="cv-field">
        <label>Tốc độ phát âm <b id="convo-rate-value">${rate.toFixed(2)}x</b></label>
        <input type="range" min="0.8" max="1.2" step="0.05" value="${rate}" oninput="convoSetRate(this.value)">
      </div>
      <div class="cv-field">
        ${chk('show-pinyin', 'Hiển thị Pinyin', convoPref('show_pinyin', true))}
        ${chk('show-vietnamese', 'Hiển thị tiếng Việt', convoPref('show_vietnamese', true))}
        ${chk('show-explanations', 'Hiển thị giải thích', convoPref('show_explanations', false))}
      </div>
      <div class="cv-sheet-foot">
        <button type="button" class="cv-btn" onclick="convoCloseModal()">Hủy</button>
        <button type="button" class="cv-btn cv-btn-primary" onclick="saveConvoSettings()">Lưu cài đặt</button>
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


// ── V152: QUẢN TRỊ — sinh lượt thoại bằng AI, duyệt bài (chỉ quản trị viên thấy) ─────────────────
// Luồng: chờ sinh → AI soạn + máy kiểm tra → NHÁP → admin xem & bấm Duyệt → người học mới thấy.
let convoGenBusy = false;
const convoSafeId = (id) => String(id == null ? '' : id).replace(/[^A-Za-z0-9_-]/g, '');
const convoIsAdmin = () => typeof isAdminRole === 'function' && isAdminRole();
const CONVO_STATUS_LABEL = { pending: '⏳ Chờ sinh', generating: '⚙️ Đang sinh', draft: '📝 Nháp (chờ duyệt)', ready: '✅ Đã duyệt', failed: '⚠️ Lỗi' };

// Hiển thị mảng giải thích {hz,py,vi} / {pattern,note_vi}; dữ liệu cũ dạng khác thì in nguyên văn đã escape
function convoFmtExplain(v, kind, withStatus) {
  if (!Array.isArray(v)) return escapeHtml(typeof v === 'string' ? v : JSON.stringify(v));
  return v.map((x) => {
    if (typeof x === 'string') return escapeHtml(x);
    if (!x || typeof x !== 'object') return '';
    if (kind === 'v') return escapeHtml(x.hz || '') + (x.py ? ' (' + escapeHtml(x.py) + ')' : '') + (x.vi ? ': ' + escapeHtml(x.vi) : '') + (withStatus ? '<span class="convo-vs" data-hz="' + escapeHtml(x.hz || '') + '" style="opacity:.9"></span>' : '');
    return escapeHtml(x.pattern || '') + (x.note_vi ? ' — ' + escapeHtml(x.note_vi) : '');
  }).filter(Boolean).join(' · ');
}

function convoAdminBar(convo) {
  if (!convoIsAdmin() || !convo) return '';
  const st = convo.gen_status || 'ready';
  const id = convoSafeId(convo.dialogue_id);
  const btn = (label, onclick, primary) => `<button type="button" class="cv-btn${primary ? ' cv-btn-primary' : ''}" onclick="${onclick}">${label}</button>`;
  const hasTurns = (convo.turns || []).length > 0;
  const actions = [];
  if (st === 'draft') { actions.push(btn('✅ Duyệt & bản nháp kế', `convoApproveAndNext('${id}')`, true)); actions.push(btn('✅ Chỉ duyệt', `convoSetApproval('${id}','ready')`)); }
  if (st === 'ready') actions.push(btn('↩️ Gỡ duyệt', `convoSetApproval('${id}','draft')`));
  if (st === 'pending' || st === 'failed' || !hasTurns) actions.push(btn('✨ Sinh bằng AI', `convoGenerate(1,['${id}'],false)`, true));
  else actions.push(btn('🔄 Sinh lại', `convoRegenerate('${id}')`));
  const metaParts = [];
  if (convo.generated_at) metaParts.push('AI soạn lúc ' + escapeHtml(convoFmtDate(convo.generated_at)));
  if (convo.gen_attempts) metaParts.push(Number(convo.gen_attempts) + ' lần sinh');
  if (convo.gen_model) metaParts.push('model: ' + escapeHtml(String(convo.gen_model).slice(0, 40)));
  metaParts.push((convo.turns || []).length + ' lượt');
  const meta = `<div class="cv-admin-meta">${metaParts.join(' · ')} · bấm “Sửa” ở từng lượt để chỉnh trước khi duyệt</div>`;
  const err = (st === 'failed' && convo.gen_error) ? `<div class="cv-admin-err">${escapeHtml(String(convo.gen_error).slice(0, 300))}</div>` : '';
  return `<section class="cv-admin">
    <div class="cv-admin-row"><strong>Quản trị</strong><span class="cv-state cv-state-${escapeHtml(st)}">${CONVO_STATUS_LABEL[st] || escapeHtml(st)}</span></div>
    <div class="cv-admin-row">${actions.join('')}</div>
    ${meta}${err}<div id="convo-vocab-admin" class="cv-admin-vocab"></div><div id="convo-gen-msg" class="cv-msg" role="status"></div></section>`;
}

// ── V155: màn DUYỆT riêng (chỉ admin) — tách khỏi màn học ──
const CV_REVIEW_TABS = [['draft', 'Nháp'], ['pending', 'Chờ sinh'], ['ready', 'Đã duyệt'], ['failed', 'Lỗi']];

// Thẻ gọn ở đầu danh sách học: chỉ hiện cho admin, dẫn sang màn Duyệt
async function loadConvoAdminEntry() {
  const box = document.getElementById('convo-admin-entry');
  if (!box || !convoIsAdmin()) return;
  const r = await convoRequest('GET', '/admin/conversations');
  const live = document.getElementById('convo-admin-entry');
  if (!live) return;
  if (!r.ok || !r.counts) {
    live.innerHTML = `<div class="cv-entry cv-entry-err"><span>Quản trị hội thoại không tải được: ${escapeHtml(r.error || 'lỗi không rõ')}</span>
      <button type="button" class="cv-btn" onclick="loadConvoAdminEntry()">Thử lại</button></div>`;
    return;
  }
  const c = r.counts;
  const miss = r.dataReport && !r.dataReport.complete ? ' · thiếu bài đầu bài' : '';
  live.innerHTML = `<button type="button" class="cv-entry" onclick="convoOpenReview()">
    <span class="cv-entry-k">Quản trị</span>
    <span class="cv-entry-t">${c.draft | 0} nháp chờ duyệt · ${c.pending | 0} chờ sinh · ${c.failed | 0} lỗi${miss}</span>
    <span class="cv-chev" aria-hidden="true">›</span></button>`;
}

// Mở màn Duyệt (khung + tải dữ liệu)
function convoOpenReview() {
  if (!convoIsAdmin()) { goTab('convo'); return; }
  convoFrom = 'review';
  const el = document.getElementById('content');
  if (el) el.innerHTML = `<div class="cv cv-review">
    <div class="cv-bar">
      <button type="button" class="cv-iconbtn" onclick="goTab('convo')" aria-label="Quay lại danh sách học">${CV_IC.back}</button>
      <div class="cv-bar-title"><span class="cv-title-zh">Duyệt hội thoại</span><span class="cv-title-vi">Chỉ quản trị viên thấy màn này</span></div>
    </div>
    <div id="convo-admin"></div></div>`;
  window.scrollTo(0, 0);
  loadConvoAdmin();
}

function convoSetReviewTab(tab) { convoReviewFilter = tab; loadConvoAdmin(); }

async function loadConvoAdmin() {
  const box = document.getElementById('convo-admin');
  if (!box || !convoIsAdmin()) return;
  const r = await convoRequest('GET', '/admin/conversations');
  const live = document.getElementById('convo-admin');
  if (!live) return; // đã chuyển màn
  if (!r.ok || !r.counts) {
    // KHÔNG im lặng: admin phải thấy vì sao màn duyệt không có (route chưa deploy, thiếu bảng conversations, v.v.)
    live.innerHTML = `<div class="cv-admin cv-admin-bad"><strong>Quản trị hội thoại</strong> — <span class="cv-admin-err">không tải được: ${escapeHtml(r.error || 'lỗi không rõ')}</span>
      <div class="cv-admin-row"><button type="button" class="cv-btn" onclick="loadConvoAdmin()">Thử lại</button></div></div>`;
    return;
  }
  const c = r.counts, items = r.items || [];
  const tabs = CV_REVIEW_TABS.map(([k, label]) =>
    `<button type="button" class="cv-seg-btn${convoReviewFilter === k ? ' is-on' : ''}" onclick="convoSetReviewTab('${k}')">${label} <b>${c[k] | 0}</b></button>`).join('');
  const shown = items.filter((x) => x.gen_status === convoReviewFilter);
  const row = (x) => {
    const id = convoSafeId(x.dialogue_id);
    const view = `<button type="button" class="cv-btn" onclick="loadConvoDetail('${id}', 'review')">Xem</button>`;
    let extra = view;
    if (x.gen_status === 'draft') extra += `<button type="button" class="cv-btn cv-btn-primary" onclick="convoSetApproval('${id}','ready')">Duyệt</button>`;
    if (x.gen_status === 'failed') extra += `<button type="button" class="cv-btn" onclick="convoGenerate(1,['${id}'],false)">Thử lại</button>`;
    if (x.gen_status === 'pending') extra = `<button type="button" class="cv-btn" onclick="convoGenerate(1,['${id}'],false)">Sinh bằng AI</button>`;
    const err = x.gen_status === 'failed' && x.gen_error ? `<div class="cv-admin-err" title="${escapeHtml(x.gen_error)}">${escapeHtml(String(x.gen_error).slice(0, 120))}</div>` : '';
    return `<div class="cv-row"><div class="cv-row-main"><span class="cv-row-zh">${escapeHtml(x.title_zh)}</span><span class="cv-row-vi">${escapeHtml(x.title_vi)} · ${Number(x.total_turns) || 0} lượt</span>${err}</div><div class="cv-row-act">${extra}</div></div>`;
  };
  // V154: DB chưa có (đủ) 200 hội thoại đầu bài → báo rõ + nút nhập (admin tự bấm, không tự chạy)
  const dr = r.dataReport;
  const missingBox = dr && !dr.complete
    ? `<div class="cv-admin cv-admin-bad">Database mới có <strong>${dr.presentTotal | 0}/${dr.expectedTotal | 0}</strong> hội thoại đầu bài (thiếu batch ${(dr.needBatches || []).join(', ')}). Chưa có bài thì chưa thể sinh lượt thoại.
         <div class="cv-admin-row"><button type="button" class="cv-btn cv-btn-primary" id="convo-import-btn" onclick="convoImportBatches()">📥 Nhập ${(dr.expectedTotal | 0) - (dr.presentTotal | 0)} hội thoại còn thiếu</button></div></div>`
    : '';
  // V166: nhập hội thoại từ file ngoài (.xlsx/.csv, mỗi dòng 1 lượt)
  const importBox = `<div class="cv-admin-row"><button type="button" class="cv-btn" id="convo-file-toggle" onclick="convoToggleFileBox()">📄 Nhập hội thoại từ file (.xlsx / .csv) ${convoFileOpen ? '▴' : '▾'}</button></div>
    <div class="cv-admin" id="convo-file-box"${convoFileOpen ? '' : ' hidden'}>
      <div class="cv-admin-meta">Mỗi DÒNG = 1 lượt thoại. Cột: dialogue_id, title_zh, title_vi, hsk_level (HSK 3/4), topic, situation, characters (thông tin bài — chỉ điền ở dòng đầu mỗi bài) và turn, character, zh, py, vi, vocab, grammar. Tối thiểu 12 lượt/bài.</div>
      <div class="cv-admin-row">
        <input type="file" id="convo-file-input" accept=".xlsx,.xls,.csv" onchange="convoFileResult('')">
        <button type="button" class="cv-btn" onclick="convoDownloadTemplate()">⬇️ Tải file mẫu</button>
      </div>
      <div class="cv-admin-row">
        <label><input type="checkbox" id="convo-file-ready"> Đăng ngay cho người học (bỏ chọn = lưu nháp, chờ duyệt)</label>
      </div>
      <div class="cv-admin-row">
        <label><input type="checkbox" id="convo-file-overwrite"> Ghi đè bài đã có (thay TOÀN BỘ lượt thoại)</label>
      </div>
      <div class="cv-admin-row">
        <button type="button" class="cv-btn" onclick="convoImportFile(true)">🔍 Kiểm tra trước</button>
        <button type="button" class="cv-btn cv-btn-primary" id="convo-file-btn" onclick="convoImportFile(false)">📥 Nhập</button>
      </div>
      <div id="convo-file-result" class="cv-msg" role="status"></div>
    </div>`;
  live.innerHTML = `<div class="cv-stats">
      <div class="cv-stat"><b>${c.pending | 0}</b><span>Chờ sinh</span></div>
      <div class="cv-stat"><b>${c.draft | 0}</b><span>Nháp</span></div>
      <div class="cv-stat"><b>${c.ready | 0}</b><span>Đã duyệt</span></div>
      <div class="cv-stat"><b>${c.failed | 0}</b><span>Lỗi</span></div>
    </div>
    <div class="cv-toolbar">
      <button type="button" class="cv-btn cv-btn-primary" onclick="convoGenerate(1)">✨ Sinh 1 bài tiếp theo</button>
      <button type="button" class="cv-btn" onclick="convoGenerate(3)">✨ Sinh 3 bài</button>
      <button type="button" class="cv-btn" id="convo-auto-btn" onclick="convoAutoRun()">${convoAutoRunning ? '⏹ Dừng' : '⚡ Sinh tự động'}</button>
      ${c.draft > 1 ? `<button type="button" class="cv-btn" onclick="convoApproveAll(${c.draft | 0})">✅ Duyệt tất cả (${c.draft | 0})</button>` : ''}
    </div>
    ${missingBox}
    ${importBox}
    <div id="convo-gen-msg" class="cv-msg" role="status"></div>
    <div class="cv-seg" role="tablist" aria-label="Trạng thái">${tabs}</div>
    <div class="cv-rows">${shown.length ? shown.map(row).join('') : '<div class="cv-empty">Không có bài nào ở trạng thái này.</div>'}</div>`;
}

function convoGenMsg(text) {
  const el = document.getElementById('convo-gen-msg');
  if (el) el.textContent = text || '';
}

function convoSummarize(results, quota) {
  const lines = (results || []).map((x) => {
    if (x.status === 'draft') return `✅ ${x.dialogueId}: nháp ${x.turns} lượt${x.attempts > 1 ? ` (sau ${x.attempts} lần thử)` : ''}`;
    if (x.status === 'failed') return `⚠️ ${x.dialogueId}: ${(x.errors && x.errors[0]) || 'lỗi'}`;
    if (x.status === 'skipped_ready') return `↷ ${x.dialogueId}: đã duyệt, bỏ qua (dùng "Sinh lại" để ghi đè)`;
    if (x.status === 'skipped') return `↷ ${x.dialogueId}: để lượt sau (hết thời gian)`;
    return `${x.dialogueId}: ${x.status}`;
  });
  if (quota) lines.push('⛔ Hết hạn mức AI — thử lại sau');
  return lines.join(' · ') || 'Không có bài nào cần sinh.';
}

async function convoGenerate(count, dialogueIds, force) {
  if (convoGenBusy) return;
  convoGenBusy = true;
  convoGenMsg('⏳ AI đang soạn hội thoại… (mỗi bài khoảng 1 phút, vui lòng giữ trang mở)');
  const body = { count: count || 1, force: !!force };
  if (Array.isArray(dialogueIds) && dialogueIds.length) body.dialogueIds = dialogueIds;
  const r = await convoRequest('POST', '/admin/conversations/generate', body);
  convoGenBusy = false;
  if (!r.ok) { convoGenMsg('⚠️ ' + (r.error || 'Không sinh được')); return; }
  const summary = convoSummarize(r.results, r.quota);
  if (document.getElementById('convo-admin')) { await loadConvoAdmin(); convoGenMsg(summary); }
  else if (currentConvo && dialogueIds && dialogueIds[0]) { await loadConvoDetail(dialogueIds[0]); convoGenMsg(summary); }
  else convoGenMsg(summary);
}

function convoRegenerate(dialogueId) {
  if (!confirm('Sinh lại sẽ GHI ĐÈ các lượt thoại hiện có và đưa bài về trạng thái nháp. Tiếp tục?')) return;
  convoGenerate(1, [convoSafeId(dialogueId)], true);
}

async function convoSetApproval(dialogueId, status) {
  const id = convoSafeId(dialogueId);
  const r = await convoRequest('POST', '/admin/conversations/' + encodeURIComponent(id) + '/status', { status });
  if (!r.ok) { convoGenMsg('⚠️ ' + (r.error || 'Không đổi được trạng thái')); convoStatus('⚠️ ' + (r.error || 'Không đổi được trạng thái')); return; }
  if (document.getElementById('convo-admin')) await loadConvoAdmin();
  else await loadConvoDetail(id);
  convoGenMsg(status === 'ready' ? '✅ Đã duyệt — người học thấy bài này.' : '↩️ Đã gỡ duyệt — bài về trạng thái nháp.');
}


// ── V153: GIAI ĐOẠN 2 — sinh tự động, duyệt hàng loạt, sửa lượt thoại, nối từ vựng với kho từ (FSRS) ──
let convoAutoRunning = false;
let convoAutoStopFlag = false;
let convoVocabInfo = null; // { hzs, status } của hội thoại đang mở

function convoFmtDate(iso) {
  try { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN'); } catch (e) { return ''; }
}

// Chạy liên tiếp (mỗi vòng ≤3 bài) cho tới khi: hết bài, hết hạn mức AI, chạm hạn mức ngày, lỗi liên tiếp, hoặc admin bấm Dừng.
async function convoAutoRun() {
  if (convoAutoRunning) { convoAutoStopFlag = true; convoGenMsg('⏹ Sẽ dừng sau khi bài đang sinh xong…'); return; }
  if (convoGenBusy) return;
  convoAutoRunning = true; convoAutoStopFlag = false; convoGenBusy = true;
  const btn = () => document.getElementById('convo-auto-btn');
  if (btn()) btn().textContent = '⏹ Dừng';
  let drafted = 0, failedN = 0, noProgress = 0, why = '';
  for (let i = 0; i < 20 && !convoAutoStopFlag; i++) {
    convoGenMsg(`⚡ Đang sinh tự động… ${drafted} bản nháp, ${failedN} lỗi (giữ trang mở; bấm Dừng để ngắt)`);
    const r = await convoRequest('POST', '/admin/conversations/generate', { count: 3 });
    if (!r.ok) { why = '⚠️ ' + (r.error || 'Lỗi'); break; }
    const res = r.results || [];
    const d = res.filter((x) => x.status === 'draft').length;
    drafted += d; failedN += res.filter((x) => x.status === 'failed').length;
    if (r.quota) { why = '⛔ Hết hạn mức AI'; break; }
    if (r.limitReached) { why = `⛔ Chạm hạn mức ngày (${r.generatedToday}/${r.dailyLimit})`; break; }
    if (!res.length) { why = '✔ Không còn bài nào cần sinh'; break; }
    noProgress = d ? 0 : noProgress + 1;
    if (noProgress >= 2) { why = '⚠️ Nhiều bài lỗi liên tiếp — dừng để kiểm tra'; break; }
  }
  convoAutoRunning = false; convoGenBusy = false;
  await loadConvoAdmin();
  convoGenMsg(`${why || (convoAutoStopFlag ? '⏹ Đã dừng' : 'Đã chạy xong số vòng tối đa')} — ${drafted} bản nháp mới, ${failedN} lỗi.`);
}

// V154: nhập các batch hội thoại còn thiếu (idempotent trên server: ON CONFLICT DO NOTHING)
let convoImporting = false;
async function convoImportBatches() {
  if (convoImporting) return;
  if (!confirm('Nhập các hội thoại đầu bài còn thiếu vào database? Bài đã có sẽ KHÔNG bị ghi đè.')) return;
  convoImporting = true;
  const btn = document.getElementById('convo-import-btn'); if (btn) btn.disabled = true;
  try {
    const r = await convoRequest('POST', '/admin/conversations/import-batches', {});
    if (!r.ok) { convoGenMsg('⚠️ ' + (r.error || 'Không nhập được')); return; }
    await loadConvoAdmin();
    convoGenMsg(`✅ Đã nhập ${r.added | 0} hội thoại mới.`);
  } finally { convoImporting = false; if (btn) btn.disabled = false; }
}

async function convoApproveAll(n) {
  if (!confirm(`Duyệt TẤT CẢ ${n} bản nháp? Người học sẽ thấy ngay các bài này — bạn đã xem qua chúng chưa?`)) return;
  const r = await convoRequest('POST', '/admin/conversations/approve-all', {});
  if (!r.ok) { convoGenMsg('⚠️ ' + (r.error || 'Không duyệt được')); return; }
  await loadConvoAdmin();
  convoGenMsg(`✅ Đã duyệt ${r.approved | 0} bài.`);
}

// ── V166: nhập hội thoại từ file ngoài ─────────────────────────────────────────────────────────
let convoFileOpen = false;
let convoFileBusy = false;
function convoToggleFileBox() {
  convoFileOpen = !convoFileOpen;
  const box = document.getElementById('convo-file-box'); if (box) box.hidden = !convoFileOpen;
  const t = document.getElementById('convo-file-toggle'); if (t) t.textContent = '📄 Nhập hội thoại từ file (.xlsx / .csv) ' + (convoFileOpen ? '▴' : '▾');
}
function convoFileResult(html) { const el = document.getElementById('convo-file-result'); if (el) el.innerHTML = html || ''; }

async function convoDownloadTemplate() {
  const r = await convoRequest('GET', '/admin/conversations/import-template');
  if (!r.ok) { convoFileResult('⚠️ ' + escapeHtml(r.error || 'Không tải được file mẫu')); return; }
  try { await ensureXlsx(); } catch (e) { convoFileResult('⚠️ ' + escapeHtml(e.message)); return; } // V175
  const ws = XLSX.utils.json_to_sheet(r.rows, { header: r.columns });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Hội thoại');
  XLSX.writeFile(wb, 'mau-hoi-thoai.xlsx');
}

async function convoReadFile() {
  const input = document.getElementById('convo-file-input');
  const file = input && input.files && input.files[0];
  if (!file) throw new Error('Chưa chọn file.');
  await ensureXlsx(); // V175
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  if (!rows.length) throw new Error('File không có dữ liệu.');
  return rows;
}

function convoImportSummary(d) {
  const L = [];
  const lines = (arr) => arr.length ? `<ul style="margin:4px 0 0;padding-left:18px;font-size:.76rem;color:var(--muted);">${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '';
  const ICON = { added: '✅ Thêm mới', replaced: '♻️ Ghi đè', would_add: '➕ Sẽ thêm', would_replace: '♻️ Sẽ ghi đè', exists: '↷ Đã có — bỏ qua', invalid: '❌ Lỗi — không nhập' };
  for (const x of d.results || []) {
    const warn = x.warningCount ? ` · ${x.warningCount} cảnh báo` : '';
    L.push(`<div style="margin-top:6px;"><b>${escapeHtml(x.dialogueId)}</b> — ${ICON[x.status] || escapeHtml(x.status)} · ${x.turns | 0} lượt${warn}`
      + (x.status === 'invalid' ? lines(x.errors || []) : lines(x.warnings || [])) + '</div>');
  }
  const head = d.dryRun
    ? `🔍 Kiểm tra trước (chưa ghi gì): sẽ thêm <b>${d.wouldAdd | 0}</b>, ghi đè <b>${d.wouldReplace | 0}</b>, bỏ qua <b>${d.exists | 0}</b>, lỗi <b>${d.invalid | 0}</b>.`
    : `✅ Đã thêm <b>${d.added | 0}</b>, ghi đè <b>${d.replaced | 0}</b>, bỏ qua <b>${d.exists | 0}</b> bài đã có, lỗi (không nhập) <b>${d.invalid | 0}</b>. Trạng thái: <b>${d.status === 'ready' ? 'đã đăng' : 'nháp — vào tab "Nháp" để duyệt'}</b>.`;
  return head + L.join('');
}

async function convoImportFile(dryRun) {
  if (convoFileBusy) return;
  const ready = !!(document.getElementById('convo-file-ready') || {}).checked;
  const overwrite = !!(document.getElementById('convo-file-overwrite') || {}).checked;
  if (!dryRun && overwrite && !confirm('Ghi đè sẽ THAY TOÀN BỘ lượt thoại của các bài đã có trong file (tiến độ nghe của người học được đặt lại). Tiếp tục?')) return;
  convoFileBusy = true;
  const btn = document.getElementById('convo-file-btn'); if (btn) btn.disabled = true;
  try {
    const rows = await convoReadFile();
    convoFileResult(dryRun ? `Đang kiểm tra ${rows.length} dòng…` : `Đang nhập ${rows.length} dòng…`);
    const r = await convoRequest('POST', '/admin/conversations/import-file', { rows, dryRun: !!dryRun, status: ready ? 'ready' : 'draft', overwrite });
    if (!r.ok) { convoFileResult('❌ ' + escapeHtml(r.error || 'Không nhập được')); return; }
    convoFileResult(convoImportSummary(r));
    if (!dryRun) {
      const inp = document.getElementById('convo-file-input'); if (inp) inp.value = '';
      const keep = document.getElementById('convo-file-result').innerHTML;
      await loadConvoAdmin();
      convoFileOpen = true;
      const box = document.getElementById('convo-file-box'); if (box) box.hidden = false;
      convoFileResult(keep);
    }
  } catch (e) {
    convoFileResult('❌ ' + escapeHtml((e && e.message) || 'Lỗi'));
  } finally { convoFileBusy = false; const b = document.getElementById('convo-file-btn'); if (b) b.disabled = false; }
}

// Duyệt rồi nhảy sang bản nháp kế tiếp (xem-duyệt liên tục)
async function convoApproveAndNext(dialogueId) {
  const id = convoSafeId(dialogueId);
  const r = await convoRequest('POST', '/admin/conversations/' + encodeURIComponent(id) + '/status', { status: 'ready' });
  if (!r.ok) { convoGenMsg('⚠️ ' + (r.error || 'Không duyệt được')); return; }
  const ov = await convoRequest('GET', '/admin/conversations');
  const next = ov.ok && (ov.items || []).find((x) => x.gen_status === 'draft' && x.dialogue_id !== id);
  if (next) { await loadConvoDetail(next.dialogue_id); convoGenMsg('✅ Đã duyệt ' + id + ' — đây là bản nháp kế tiếp.'); }
  else { await loadConvoDetail(id); convoGenMsg('✅ Đã duyệt — hết bản nháp chờ.'); }
}

// Sửa tay 1 lượt ngay tại thẻ (chỉ admin)
function convoEditTurn(index) {
  if (!convoIsAdmin() || !currentConvo) return;
  const t = (currentConvo.turns || [])[index];
  const host = document.getElementById('convo-turn-' + index);
  if (!t || !host) return;
  host.innerHTML = `<div class="cv-edit-form">
    <div class="cv-edit-h">Sửa lượt ${index + 1} (${escapeHtml(t.character)})</div>
    <label for="convo-ed-zh-${index}">Chữ Hán</label><input id="convo-ed-zh-${index}" value="${escapeHtml(t.chinese_text)}">
    <label for="convo-ed-py-${index}">Pinyin (mỗi chữ Hán một âm tiết, cách nhau dấu cách)</label><input id="convo-ed-py-${index}" value="${escapeHtml(t.pinyin)}">
    <label for="convo-ed-vi-${index}">Tiếng Việt</label><textarea id="convo-ed-vi-${index}" rows="2">${escapeHtml(t.vietnamese_text)}</textarea>
    <div class="cv-admin-row"><button type="button" class="cv-btn cv-btn-primary" onclick="convoSaveTurn(${index})">Lưu</button><button type="button" class="cv-btn" onclick="convoRedrawDetail()">Huỷ</button></div>
    <div id="convo-ed-msg-${index}" class="cv-admin-err"></div></div>`;
}

async function convoSaveTurn(index) {
  if (!convoIsAdmin() || !currentConvo) return;
  const val = (id) => { const el = document.getElementById(id); return el ? String(el.value || '') : ''; };
  const msg = document.getElementById('convo-ed-msg-' + index);
  const r = await convoRequest('POST', '/admin/conversations/' + encodeURIComponent(convoSafeId(currentConvo.dialogue_id)) + '/turns/' + (index + 1), {
    chinese_text: val('convo-ed-zh-' + index), pinyin: val('convo-ed-py-' + index), vietnamese_text: val('convo-ed-vi-' + index),
  });
  if (!r.ok) { if (msg) msg.textContent = '⚠️ ' + (r.error || 'Không lưu được'); return; }
  Object.assign(currentConvo.turns[index], r.turn || {});
  convoRedrawDetail();
  convoGenMsg('💾 Đã lưu lượt ' + (index + 1) + '.');
}

// Từ vựng AI soạn trong hội thoại ↔ kho từ vựng của app (kho → bài học → FSRS)
async function convoLoadVocabStatus() {
  const convo = currentConvo;
  if (!convo || !(convo.turns || []).length) return;
  if (!convoIsAdmin() && !convoPref('show_explanations', false)) return; // người học chỉ cần khi đang hiện phần giải thích
  const hzs = [];
  for (const t of convo.turns) {
    if (Array.isArray(t.vocabulary_explanations)) for (const v of t.vocabulary_explanations) if (v && v.hz && !hzs.includes(v.hz)) hzs.push(v.hz);
  }
  if (!hzs.length) { convoVocabInfo = null; convoRenderVocabAdmin(); return; }
  const r = await convoRequest('POST', '/conversations/vocab-status', { hzs: hzs.slice(0, 100) });
  if (!r.ok || currentConvo !== convo) return;
  convoVocabInfo = { hzs, status: r.status || {} };
  if (typeof document.querySelectorAll === 'function') {
    document.querySelectorAll('.convo-vs').forEach((el) => {
      const st = convoVocabInfo.status[el.getAttribute('data-hz')];
      el.textContent = st ? (st.lessons && st.lessons.length ? ' ✓ bài ' + st.lessons.join(', ') : ' ✓ có trong kho') : ' ＋ mới';
    });
  }
  convoRenderVocabAdmin();
}

function convoRenderVocabAdmin() {
  const box = document.getElementById('convo-vocab-admin');
  if (!box || !convoIsAdmin()) return;
  const info = convoVocabInfo;
  if (!info) { box.innerHTML = ''; return; }
  const missing = info.hzs.filter((hz) => !info.status[hz]);
  if (!missing.length) { box.innerHTML = `<span class="cv-admin-meta">📚 Cả ${info.hzs.length} từ vựng đã có trong kho từ.</span>`; return; }
  box.innerHTML = `<span class="cv-admin-meta">📚 ${missing.length}/${info.hzs.length} từ chưa có trong kho</span>
    <input id="convo-vocab-lesson" class="cv-mini-in" type="number" min="1" max="9999" placeholder="Bài số">
    <button type="button" class="cv-btn" onclick="convoAddVocab()">＋ Thêm vào kho</button>`;
}

async function convoAddVocab() {
  if (!convoIsAdmin() || !currentConvo) return;
  const el = document.getElementById('convo-vocab-lesson');
  const lesson = parseInt(el && el.value, 10);
  if (!Number.isFinite(lesson) || lesson < 1) { convoGenMsg('⚠️ Nhập số bài học (1–9999) để thêm từ vào.'); return; }
  const r = await convoRequest('POST', '/admin/conversations/' + encodeURIComponent(convoSafeId(currentConvo.dialogue_id)) + '/add-vocab', { lesson });
  if (!r.ok) { convoGenMsg('⚠️ ' + (r.error || 'Không thêm được')); return; }
  convoGenMsg(`📚 Đã thêm ${r.added | 0} từ mới vào bài ${lesson} (đã có sẵn ${r.existing | 0}). Học viên học bài này sẽ có thẻ FSRS cho các từ đó.`);
  await convoLoadVocabStatus();
}

// ── Điểm vào (được js/navigation.js gọi khi mở tab "Hội thoại") ──
function renderConvo() {
  return renderConvoList();
}

function bindConvo() {
  loadConvoList();
  loadConvoAdminEntry(); // V155: thẻ vào màn Duyệt (chỉ admin) — màn học không còn bảng quản trị
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
  loadConvoAdmin,
  loadConvoAdminEntry,
  convoOpenReview,
  convoBack,
  convoGenerate,
  convoSetApproval,
  convoFmtExplain,
  convoAutoRun,
  convoApproveAll,
  convoImportBatches,
  convoApproveAndNext,
  convoEditTurn,
  convoSaveTurn,
  convoAddVocab,
  convoLoadVocabStatus,
  convoPlayTurn,
  convoPlayAll,
  toggleFavorite,
};
