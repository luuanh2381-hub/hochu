// test/v145-conversation.test.js — V145.1: chặn lại các lỗi làm hỏng web khi thêm "Thư viện hội thoại".
// KHÔNG cần DATABASE_URL, KHÔNG cần node_modules (chỉ đọc mã nguồn + chạy js/conversation.js trong vm với DOM giả).
//   Chạy: node test/v145-conversation.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let passed = 0;
function ok(name, fn) {
  try { const r = fn(); if (r && typeof r.then === 'function') return r.then(() => { passed++; console.log('  ✓ ' + name); }); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + (e && e.message)); process.exitCode = 1; }
}

const CONVO_FNS = ['getConversations', 'getConversationWithTurns', 'getConversationProgress', 'getConversationProgressForUser', 'updateConversationProgress', 'toggleConversationFavorite', 'getConversationStats'];

(async () => {
  console.log('── Server: lib/db.js + api/index.js ──');
  const db = read('lib/db.js');
  const api = read('api/index.js');

  ok('lib/db.js, api/index.js, js/conversation.js biên dịch được (không lỗi cú pháp)', () => {
    new vm.Script(db, { filename: 'lib/db.js' });
    new vm.Script(api, { filename: 'api/index.js' });
    new vm.Script(read('js/conversation.js'), { filename: 'js/conversation.js' });
  });

  ok('khối module.exports của db.js chỉ chứa tên, KHÔNG chứa định nghĩa hàm (lỗi gốc của V145)', () => {
    const start = db.indexOf('module.exports = {');
    assert.ok(start > 0, 'không thấy module.exports');
    const block = db.slice(start);
    assert.ok(!/\bfunction\b/.test(block), 'module.exports còn chứa từ khoá function');
    assert.ok(!/\bawait\b/.test(block), 'module.exports còn chứa await');
  });

  ok('7 hàm hội thoại được định nghĩa ở ngoài + có trong module.exports của db.js', () => {
    const exportsBlock = db.slice(db.indexOf('module.exports = {'));
    for (const n of CONVO_FNS) {
      assert.ok(new RegExp('^async function ' + n + '\\(', 'm').test(db), n + ' chưa được định nghĩa');
      assert.ok(new RegExp('\\b' + n + '\\b').test(exportsBlock), n + ' chưa được export');
    }
  });

  ok('api/index.js import đủ các hàm hội thoại từ ../lib/db (trước đây thiếu → ReferenceError)', () => {
    const m = api.match(/const \{([\s\S]*?)\} = require\('\.\.\/lib\/db'\)/);
    assert.ok(m, 'không thấy khối require("../lib/db")');
    const imported = m[1];
    const used = ['getConversations', 'getConversationWithTurns', 'getConversationProgressForUser', 'updateConversationProgress', 'toggleConversationFavorite', 'getConversationStats'];
    for (const n of used) assert.ok(new RegExp('\\b' + n + '\\b').test(imported), n + ' chưa được import');
  });

  ok('route /api/conversations/stats nằm TRƯỚC /api/conversations/:id', () => {
    const a = api.indexOf("app.get('/api/conversations/stats'");
    const b = api.indexOf("app.get('/api/conversations/:id'");
    assert.ok(a > 0 && b > 0 && a < b, 'sai thứ tự route');
  });

  ok('danh sách hội thoại không còn N+1 (không gọi getConversationProgress trong vòng lặp)', () => {
    assert.ok(!/conversations\.map\(async/.test(api), 'vẫn còn map async truy vấn từng hội thoại');
    assert.ok(/getConversationProgressForUser\(/.test(api));
  });

  ok('tìm kiếm: chỉ 1 tham số $n dùng chung cho 3 cột (trước đây $n,$n+1,$n+2 nhưng chỉ truyền 1 giá trị)', () => {
    assert.ok(/const searchParam = paramIndex\+\+/.test(db));
    assert.ok(!/ILIKE \$\$\{paramIndex\+\+\} OR/.test(db));
  });

  ok('route progress/favorite kiểm tra mã số hợp lệ', () => {
    assert.ok(api.includes('/^\\d{1,9}$/.test(raw)'));
  });

  console.log('── SQL / dữ liệu ──');
  ok('file tạo bảng bật pg_trgm TRƯỚC chỉ mục gin_trgm_ops', () => {
    const sql = read('migrations/V145_conversation_library.sql');
    const ext = sql.indexOf('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    const idx = sql.search(/CREATE INDEX[^;]*gin_trgm_ops/); // câu lệnh tạo chỉ mục thật (bỏ qua chú thích)
    assert.ok(idx >= 0, 'không thấy chỉ mục gin_trgm_ops');
    assert.ok(ext >= 0 && ext < idx, 'thiếu / sai vị trí CREATE EXTENSION pg_trgm');
  });

  ok('8 batch dữ liệu: đủ 200 hội thoại, không trùng mã, total_turns >= 30', () => {
    const ids = []; let bad = 0;
    for (let i = 1; i <= 8; i++) {
      const sql = read(`migrations/V145_conversation_data_batch${i}.sql`);
      const re = /\('([^']+)', '[^']*', '[^']*', '(HSK \d)', '[^']*', '[^']*', ARRAY\[[^\]]*\], (\d+)\)/g;
      let m; while ((m = re.exec(sql))) { ids.push(m[1]); if (Number(m[3]) < 30) bad++; }
    }
    assert.strictEqual(ids.length, 200);
    assert.strictEqual(new Set(ids).size, 200);
    assert.strictEqual(bad, 0);
  });

  console.log('── Frontend: js/conversation.js (vm + DOM giả) ──');
  const calls = [];       // mọi lần gọi fetch
  const spoken = [];      // mọi lần gọi ttsSpeakSegments
  const elements = {};    // id → phần tử giả
  const makeEl = () => ({ innerHTML: '', textContent: '', checked: false, remove() {} });
  const content = {
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; for (const m of String(v).matchAll(/id="([^"]+)"/g)) elements[m[1]] = makeEl(); },
    textContent: '',
  };
  elements.content = content;

  const store = {};
  let listPayload = { ok: true, conversations: [] };
  let detailPayload = { ok: true, conversation: null };
  const ctx = vm.createContext({
    console,
    window: { scrollTo() {} },
    document: {
      getElementById: (id) => elements[id] || null,
      body: { insertAdjacentHTML(_, html) { for (const m of String(html).matchAll(/id="([^"]+)"/g)) { const el = makeEl(); el.remove = () => { delete elements[m[1]]; }; elements[m[1]] = el; } } },
    },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    URLSearchParams,
    encodeURIComponent,
    fetch: (url, opts) => {
      calls.push({ url, opts });
      let payload = { ok: true };
      if (/\/conversations\?|\/conversations$/.test(url)) payload = listPayload;
      else if (/\/conversations\/[^/]+$/.test(url) && (!opts || opts.method === 'GET')) payload = detailPayload;
      return Promise.resolve({ ok: true, status: 200, json: async () => payload });
    },
    ttsSpeakSegments: (segs, hooks) => { spoken.push({ segs, hooks }); },
    goTab() {},
    pauseSpeaking() {}, resumeSpeaking() {}, stopSpeaking() {},
  });
  // escapeHtml + auth giống app thật (js/ui.js, js/auth.js)
  vm.runInContext(`
    function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    var authToken = 'tok123';
    function authHeaders() { return authToken ? { 'Authorization': 'Bearer ' + authToken } : {}; }
    var ttsRate = 0.9;
  `, ctx);
  vm.runInContext(read('js/conversation.js'), ctx, { filename: 'js/conversation.js' });
  const run = (code) => vm.runInContext(code, ctx);

  await ok('nạp file KHÔNG tự gọi API (trước đây tự gọi mỗi lần mở trang)', () => {
    assert.strictEqual(calls.length, 0);
  });

  await ok('renderConvo() trả về chuỗi HTML (không phải Promise → không hiện "[object Promise]")', () => {
    const html = ctx.renderConvo();
    assert.strictEqual(typeof html, 'string');
    assert.ok(html.includes('convo-list-body'));
    content.innerHTML = html;
  });

  await ok('bindConvo() tải danh sách kèm token đăng nhập và vẽ thẻ hội thoại', async () => {
    listPayload = { ok: true, conversations: [
      { id: 7, dialogue_id: 'hsk3-051', title_zh: '原材料检验', title_vi: 'Kiểm tra nguyên vật liệu', hsk_level: 'HSK 3', topic: 'QA/QC', situation: 'x', total_turns: 36, progress: { times_practiced: 2, is_favorited: true } },
      { id: 8, dialogue_id: 'evil', title_zh: '<img src=x onerror=alert(1)>', title_vi: 'v', hsk_level: 'HSK 4', topic: 't', total_turns: 30, progress: null },
    ] };
    ctx.bindConvo();
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].opts.headers.Authorization, 'Bearer tok123');
    const body = elements['convo-list-body'].innerHTML;
    assert.ok(body.includes('原材料检验') && body.includes("loadConvoDetail('hsk3-051')"));
    assert.ok(!body.includes('<img src=x'), 'tiêu đề chưa được escape (XSS)');
    assert.ok(elements['convo-status'].textContent.includes('2 hội thoại'));
  });

  await ok('chưa đăng nhập → báo lỗi thân thiện, không gọi fetch', async () => {
    run("authToken = null;");
    const before = calls.length;
    ctx.bindConvo();
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(calls.length, before);
    assert.ok(/đăng nhập/.test(elements['convo-status'].textContent));
    run("authToken = 'tok123';");
  });

  const convo = { id: 7, dialogue_id: 'hsk3-051', title_zh: '原材料检验', title_vi: 'Kiểm tra', hsk_level: 'HSK 3', topic: 'QA/QC', situation: 's',
    progress: { last_played_turn: 0, times_practiced: 0, is_favorited: false },
    turns: [{ character: 'A', chinese_text: '你好', pinyin: 'nǐ hǎo', vietnamese_text: 'Xin chào' }, { character: 'B', chinese_text: '再见', pinyin: 'zài jiàn', vietnamese_text: 'Tạm biệt' }] };

  await ok('mở chi tiết: nút bấm KHÔNG nhét JSON vào onclick, có nút quay lại danh sách', async () => {
    detailPayload = { ok: true, conversation: JSON.parse(JSON.stringify(convo)) };
    await ctx.loadConvoDetail('hsk3-051');
    const html = content.innerHTML;
    assert.ok(!html.includes('onclick="convoPlayAll({'), 'còn nhét JSON vào onclick');
    assert.ok(!/onclick="[^"]*\{&quot;|onclick="[^"]*\{"/.test(html));
    assert.ok(html.includes('convoPlayTurn(currentConvo, 0)') && html.includes("goTab('convo')"));
    assert.ok(html.includes('Nữ · Xiaoxiao'));
  });

  await ok('hội thoại chưa có lượt thoại → hiện thông báo, nút phát tất cả không báo lỗi', async () => {
    detailPayload = { ok: true, conversation: { ...JSON.parse(JSON.stringify(convo)), turns: [] } };
    await ctx.loadConvoDetail('hsk3-051');
    assert.ok(content.innerHTML.includes('chưa có nội dung các lượt thoại'));
    ctx.convoPlayAll(run('currentConvo'));
    assert.ok(elements['convo-status'].textContent.includes('chưa có nội dung'));
    assert.strictEqual(spoken.length, 0);
  });

  await ok('nghe 1 lượt: lưu last_played_turn = 1 nhưng KHÔNG tính là 1 lần luyện cả bài', async () => {
    detailPayload = { ok: true, conversation: JSON.parse(JSON.stringify(convo)) };
    await ctx.loadConvoDetail('hsk3-051');
    const before = calls.length;
    ctx.convoPlayTurn(run('currentConvo'), 0);
    assert.strictEqual(spoken.at(-1).segs[0].text, '你好');
    spoken.at(-1).hooks.end();
    await new Promise((r) => setTimeout(r, 10));
    const post = calls.slice(before).find((c) => /\/progress$/.test(c.url));
    assert.ok(post, 'chưa gửi tiến độ lên server');
    assert.deepStrictEqual(JSON.parse(post.opts.body), { last_played_turn: 1, times_practiced: 0 });
  });

  await ok('phát tất cả: lưu last_played_turn = số lượt và times_practiced + 1', async () => {
    const before = calls.length;
    ctx.convoPlayAll(run('currentConvo'));
    assert.strictEqual(spoken.at(-1).segs.length, 2);
    spoken.at(-1).hooks.end();
    await new Promise((r) => setTimeout(r, 10));
    const post = calls.slice(before).find((c) => /\/progress$/.test(c.url));
    assert.deepStrictEqual(JSON.parse(post.opts.body), { last_played_turn: 2, times_practiced: 1 });
    assert.ok(post.url.endsWith('/conversations/7/progress'), 'phải dùng id số, không phải dialogue_id');
  });

  await ok('yêu thích: cập nhật được giao diện (so sánh số, không so chuỗi với số)', async () => {
    await ctx.toggleFavorite(7, true);
    assert.ok(content.innerHTML.includes('★ Yêu thích'));
    const last = calls.at(-1);
    assert.ok(last.url.endsWith('/conversations/7/favorite'));
    assert.deepStrictEqual(JSON.parse(last.opts.body), { is_favorited: true });
  });

  await ok('cài đặt: mở/đóng/lưu được, ẩn pinyin theo lựa chọn', () => {
    ctx.showConvoSettings();
    assert.ok(elements['convo-modal'], 'chưa hiện cửa sổ cài đặt');
    elements['show-pinyin'].checked = false;
    elements['show-vietnamese'].checked = true;
    elements['show-explanations'].checked = false;
    ctx.saveConvoSettings();
    assert.ok(!elements['convo-modal'], 'chưa đóng cửa sổ cài đặt');
    assert.strictEqual(store.convo_show_pinyin, 'false');
    assert.ok(!content.innerHTML.includes('Pinyin: nǐ hǎo'));
    assert.ok(content.innerHTML.includes('Tiếng Việt: Xin chào'));
  });

  console.log(`\n${passed} kiểm tra đạt${process.exitCode ? ' — CÓ LỖI' : ''}`);
})();
