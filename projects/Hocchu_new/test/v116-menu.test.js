#!/usr/bin/env node
// test/v116-menu.test.js — kiểm thử V116: menu gọn (thanh dưới 4 mục, chip phụ, bảng Thêm, bảng Hiển thị) + gỡ "Mẹo nhớ" khỏi giao diện.
// Chạy: node test/v116-menu.test.js
//
// LƯU Ý TRUNG THỰC: đây là test cấu trúc + logic điều hướng (chạy js/nav.js thật với DOM giả). KHÔNG đo được bố cục thật
// (header có vừa 1 hàng không, nút có bị che không) — phần đó cần xem trên điện thoại/trình duyệt thật.
'use strict';
const assert = require('assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0, failed = 0; const pending = [];
const test = (n, f) => pending.push({ n, f });
const section = (t) => pending.push({ section: t });
(async () => {
  await new Promise(r => setImmediate(r));
  for (const it of pending) {
    if (it.section) { console.log('\n' + it.section); continue; }
    try { await it.f(); passed++; console.log('  ✅ ' + it.n); }
    catch (e) { failed++; console.log('  ❌ ' + it.n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n     ') : e)); }
  }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();

const NAV = require('../js/nav.js');
const html = read('index.html');
const css = read('css/styles.css');
const allJs = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => ({ f, s: read('js/' + f) }));

// DOM giả đủ cho nav.js: phần tử có classList, style, attribute; querySelectorAll('#nav button')
function makeDom() {
  const mk = (id) => { const cls = new Set(); return { id, style: { display: '' }, innerHTML: '', title: '', attrs: {}, classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c), _s: cls }, setAttribute(k, v) { this.attrs[k] = v; } }; };
  const ids = ['tab-home', 'tab-today', 'tab-progress', 'tab-more', 'more-sheet', 'display-panel', 'display-btn', 'display-dot', 'subnav'];
  const els = {}; ids.forEach(i => { els[i] = mk(i); });
  els['more-sheet'].style.display = 'none'; els['display-panel'].style.display = 'none';
  const doc = { getElementById: (i) => els[i] || null, querySelectorAll: (sel) => (sel === '#nav button' ? ['tab-home', 'tab-today', 'tab-progress', 'tab-more'].map(i => els[i]) : []), addEventListener() {} };
  return { doc, els };
}
function navEnv(globals) {
  const { doc, els } = makeDom();
  const calls = [];
  const ctx = Object.assign({ console, document: doc, goTab: (t) => calls.push(t), currentTab: 'home', showPinyin: true, showMeaning: true, showHanViet: true }, globals || {});
  vm.createContext(ctx);
  vm.runInContext(read('js/nav.js'), ctx);
  return { ctx, els, calls, R: (code) => vm.runInContext(code, ctx) };
}
const activeIds = (els) => ['tab-home', 'tab-today', 'tab-progress', 'tab-more'].filter(i => els[i].classList.contains('active'));

section('[A] Nhóm tab và chip phụ — không màn nào bị "mồ côi"');
test('mọi tab mà dispatcher render() xử lý đều thuộc một nhóm điều hướng', () => {
  const tabs = [...read('js/navigation.js').matchAll(/currentTab === '(\w+)'/g)].map(m => m[1]);
  assert.ok(tabs.length >= 12, 'đọc được danh sách tab: ' + tabs.join(','));
  for (const t of new Set(tabs)) assert.ok(NAV.navGroupOf(t), 'tab "' + t + '" không thuộc nhóm nào');
});
test('mọi tab (trừ phiên đang học "review") đều TỚI ĐƯỢC từ giao diện: nút thanh dưới, chip phụ hoặc bảng Thêm', () => {
  const chipTabs = new Set([].concat(...Object.values(NAV.NAV_CHIPS)).map(c => c[0]));
  const moreSheet = html.slice(html.indexOf('<div id="more-sheet"'), html.indexOf('<div id="nav"'));
  const navBar = html.slice(html.indexOf('<div id="nav"'), html.indexOf('</div>', html.indexOf('<div id="nav"')));
  const tabs = [...new Set([...read('js/navigation.js').matchAll(/currentTab === '(\w+)'/g)].map(m => m[1]))].filter(t => t !== 'review');
  for (const t of tabs) {
    const direct = new RegExp(`goTab\\('${t}'\\)`).test(moreSheet) || new RegExp(`goTab\\('${t}'\\)`).test(navBar);
    assert.ok(chipTabs.has(t) || direct || (t === 'stats'), `tab "${t}" không có đường vào`); // stats: vào qua nút Tiến bộ (navGoProgress)
  }
  assert.ok(/navGoProgress\(\)/.test(navBar));
});
test('chip nhóm Học: 5 chip theo thứ tự, chip đang xem được đánh dấu; trong phiên học (review) KHÔNG có chip', () => {
  const h = NAV.navChipsHtml('flash');
  const labels = [...h.matchAll(/goTab\('(\w+)'\)/g)].map(m => m[1]);
  assert.deepStrictEqual(labels, ['today', 'flash', 'quiz', 'type', 'listen']);
  assert.strictEqual((h.match(/nav-chip active/g) || []).length, 1); assert.ok(/nav-chip active" onclick="goTab\('flash'\)"/.test(h));
  assert.strictEqual(NAV.navChipsHtml('review'), '');
});
test('chip nhóm Tiến bộ: Thống kê / Năng lực / Từ khó; Trang chủ, So sánh, Quản trị không có chip', () => {
  assert.deepStrictEqual([...NAV.navChipsHtml('skills').matchAll(/goTab\('(\w+)'\)/g)].map(m => m[1]), ['stats', 'skills', 'difficult']);
  for (const t of ['home', 'compare', 'admin', 'vocab', 'nope', undefined]) assert.strictEqual(NAV.navChipsHtml(t), '');
});

section('[B] Tô sáng thanh dưới + chip phụ (js/nav.js chạy thật với DOM giả)');
test('mỗi tab sáng đúng nút nhóm của nó (flash/quiz/review → Học; skills/difficult → Tiến bộ; compare → Thêm)', () => {
  const cases = { home: 'tab-home', today: 'tab-today', review: 'tab-today', flash: 'tab-today', quiz: 'tab-today', type: 'tab-today', listen: 'tab-today', stats: 'tab-progress', skills: 'tab-progress', difficult: 'tab-progress', compare: 'tab-more', admin: 'tab-more', vocab: 'tab-more' };
  for (const [tab, id] of Object.entries(cases)) {
    const e = navEnv(); e.R(`navHighlight('${tab}')`);
    assert.deepStrictEqual(activeIds(e.els), [id], tab);
  }
  const e = navEnv(); e.R("navHighlight('home')"); e.R("navHighlight('???')"); assert.deepStrictEqual(activeIds(e.els), [], 'tab lạ: không sáng nút nào, không ném lỗi');
});
test('chip phụ được vẽ cho nhóm có chip, ẩn đi ở nơi khác (kể cả phiên học)', () => {
  const e = navEnv();
  e.R("navHighlight('quiz')"); assert.strictEqual(e.els.subnav.style.display, 'flex'); assert.ok(e.els.subnav.innerHTML.includes('Trắc nghiệm'));
  e.R("navHighlight('review')"); assert.strictEqual(e.els.subnav.style.display, 'none'); assert.strictEqual(e.els.subnav.innerHTML, '');
  e.R("navHighlight('home')"); assert.strictEqual(e.els.subnav.style.display, 'none');
});
test('nút "Tiến bộ" quay lại đúng màn đã xem gần nhất (mặc định Thống kê)', () => {
  const e = navEnv(); e.R('navGoProgress()'); assert.deepStrictEqual(e.calls, ['stats']);
  e.R("navHighlight('skills')"); e.R('navGoProgress()'); assert.deepStrictEqual(e.calls, ['stats', 'skills']);
  e.R("navHighlight('compare')"); e.R('navGoProgress()'); assert.strictEqual(e.calls[2], 'skills', 'đi qua nhóm khác không làm mất màn đã nhớ');
});
test('render() đồng bộ lại mục đang chọn + chip khi currentTab đổi mà KHÔNG qua goTab (vd. vào phiên học)', () => {
  const e = navEnv({ currentTab: 'review' }); e.R('navSyncUI()');
  assert.deepStrictEqual(activeIds(e.els), ['tab-today']); assert.strictEqual(e.els.subnav.style.display, 'none');
  e.R("currentTab = 'listen'; navSyncUI()"); assert.ok(e.els.subnav.innerHTML.includes('Nghe'));
});

section('[C] Bảng "Thêm" và bảng "⚙️ Hiển thị"');
test('mở/đóng bảng; mở bảng này thì đóng bảng kia; đổi tab đóng cả hai', () => {
  const e = navEnv();
  e.R('navToggleDisplay()'); assert.strictEqual(e.els['display-panel'].style.display, 'block'); assert.strictEqual(e.els['display-btn'].attrs['aria-expanded'], 'true');
  e.R('navToggleMore()'); assert.strictEqual(e.els['more-sheet'].style.display, 'block'); assert.strictEqual(e.els['display-panel'].style.display, 'none');
  e.R('navToggleMore()'); assert.strictEqual(e.els['more-sheet'].style.display, 'none');
  e.R('navToggleDisplay()'); e.R("navHighlight('stats')");
  assert.strictEqual(e.els['display-panel'].style.display, 'none'); assert.strictEqual(e.els['more-sheet'].style.display, 'none');
});
test('chấm cảnh báo trên ⚙️ khi đang ẩn Pinyin/nghĩa/Hán Việt (để hiểu vì sao thẻ thiếu chữ)', () => {
  const e = navEnv(); e.R('navSyncUI()'); assert.strictEqual(e.els['display-dot'].style.display, 'none'); assert.strictEqual(e.els['display-btn'].title, 'Hiển thị');
  e.R('showMeaning = false; showHanViet = false; navSyncUI()');
  assert.strictEqual(e.els['display-dot'].style.display, 'inline-block'); assert.ok(/đang ẩn 2 mục/.test(e.els['display-btn'].title));
  assert.strictEqual(e.R('navHiddenCount()'), 2);
});

section('[D] index.html — cấu trúc & id cũ được giữ');
test('id cũ mà code khác còn dùng vẫn có MỘT lần duy nhất (nhãn nút ẩn/hiện, tốc độ, theme, badge, timer)', () => {
  for (const id of ['py-toggle-btn', 'vi-toggle-btn', 'hv-toggle-btn', 'speed-slider', 'speed-val', 'theme-toggle-btn', 'user-badge', 'streak-badge', 'study-timer-chip', 'tab-admin', 'tab-vocab', 'tab-home', 'tab-today', 'content']) {
    assert.strictEqual((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
  }
});
test('các nút giao diện nằm TRONG bảng Hiển thị, không còn chiếm chỗ ở topbar', () => {
  const top = html.slice(html.indexOf('<div id="topbar">'), html.indexOf('<div id="display-panel"'));
  const panel = html.slice(html.indexOf('<div id="display-panel"'), html.indexOf('<div id="subnav"'));
  for (const id of ['py-toggle-btn', 'vi-toggle-btn', 'hv-toggle-btn', 'speed-slider', 'theme-toggle-btn']) { assert.ok(!top.includes(`id="${id}"`), id + ' còn ở topbar'); assert.ok(panel.includes(`id="${id}"`), id + ' chưa vào bảng'); }
  assert.ok(top.includes('id="display-btn"') && top.includes('id="user-badge"') && top.includes('id="streak-badge"'));
});
test('thanh dưới đúng 4 nút, nằm NGOÀI #app-header; admin/vocab ẩn sẵn trong bảng Thêm', () => {
  const nav = html.slice(html.indexOf('<div id="nav"'), html.indexOf('<script src="/js/theme.js">'));
  assert.strictEqual((nav.match(/<button /g) || []).length, 4);
  const header = html.slice(html.indexOf('<div id="app-header">'), html.indexOf('<div id="subnav"'));
  assert.ok(!header.includes('id="nav"'));
  const more = html.slice(html.indexOf('<div id="more-sheet"'), html.indexOf('<div id="nav"'));
  assert.ok(/id="tab-admin" style="display:none;"/.test(more) && /id="tab-vocab" style="display:none;"/.test(more) && more.includes("goTab('compare')"));
});
test('script: nav.js nạp trước app.js; word-notes.js KHÔNG còn được nạp; stroke.js vẫn nạp', () => {
  assert.ok(html.indexOf('/js/nav.js') > 0 && html.indexOf('/js/nav.js') < html.indexOf('/js/app.js'));
  assert.ok(!html.includes('word-notes.js')); assert.ok(html.includes('/js/stroke.js'));
});
test('mọi hàm gọi trong onclick/oninput của index.html đều được định nghĩa ở đâu đó (bắt lỗi gõ nhầm tên)', () => {
  const names = new Set([...html.matchAll(/on(?:click|input|change)="(\w+)\(/g)].map(m => m[1]));
  const defined = (n) => allJs.some(({ s }) => new RegExp(`function\\s+${n}\\s*\\(`).test(s));
  for (const n of names) assert.ok(defined(n), 'chưa định nghĩa: ' + n);
  for (const n of ['navGoProgress', 'navToggleMore', 'navToggleDisplay']) assert.ok(names.has(n), n + ' không được dùng');
});
test('3 nơi từng tự gắn class active theo id "tab-"+tab đã chuyển sang navHighlight', () => {
  for (const f of ['js/ui.js', 'js/study-session.js', 'js/auth.js']) {
    const s = read(f); assert.ok(!/getElementById\('tab-' \+/.test(s), f + ' còn dùng id tab- trực tiếp'); assert.ok(/navHighlight\(/.test(s), f);
  }
  const ui = read('js/ui.js'), g = ui.slice(ui.indexOf('function goTab'), ui.indexOf('function goTab') + 900);
  assert.ok(g.includes('navHighlight(tab)') && /render\(\);\s*\}/.test(g), 'goTab phải gọi navHighlight rồi render()');
});

section('[E] CSS & va chạm với phần tử khác');
test('thanh điều hướng cố định ở đáy; #content chừa đệm đáy ≥ chiều cao thanh; bảng Thêm nằm trên thanh', () => {
  assert.ok(/#nav\{position:fixed;left:0;right:0;bottom:0;/.test(css));
  const pad = css.match(/#content\{padding:16px 16px calc\((\d+)px/); assert.ok(pad && Number(pad[1]) >= 72, 'đệm đáy #content');
  const sheet = css.match(/#more-sheet\{[^}]*bottom:calc\((\d+)px/); assert.ok(sheet && Number(sheet[1]) >= 54, 'bảng Thêm phải nằm trên thanh dưới');
  assert.ok(/#subnav\{/.test(css) && /\.nav-chip\.active\{/.test(css) && /#display-panel\{position:absolute;/.test(css));
});
test('nút Zalo nổi được nâng lên trên thanh dưới; phím tắt 1-4 bị chặn khi đang mở các bảng mới', () => {
  assert.ok(/bottom:calc\(max\(12px, env\(safe-area-inset-bottom\)\) \+ 6\d+px\)/.test(read('js/app.js')));
  const ui = read('js/ui.js'); const k = ui.slice(ui.indexOf('function kbdAnyModalOpen'), ui.indexOf('function kbdAnyModalOpen') + 400);
  for (const id of ['stroke-overlay', 'display-panel', 'more-sheet']) assert.ok(k.includes(`'${id}'`), id);
});
test('header: streak ngắn gọn (không chữ "ngày"), user-badge cắt bằng dấu … thay vì tràn', () => {
  assert.ok(/textContent = '🔥 ' \+ getStreak\(\);/.test(read('js/navigation.js')));
  assert.ok(/#topbar\{flex-wrap:nowrap;\}/.test(css) && /#user-badge\{flex-shrink:1;min-width:48px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\}/.test(css), 'topbar 1 hàng, tên tài khoản co lại bằng …');
  assert.ok(/max-width:420px\)\{ #topbar h1 \.brand-text\{display:none;\} \}/.test(css) && /<span class="brand-text">/.test(html));
  assert.ok(Number((css.match(/#more-sheet\{[^}]*z-index:(\d+)/) || [])[1]) > 500, 'bảng Thêm phải nằm trên nút Zalo nổi (z-index 500)');
});

section('[F] Gỡ "Mẹo nhớ" khỏi giao diện');
test('không còn tham chiếu tới hàm mẹo nhớ ở các file đang chạy (trừ word-notes.js đã ngừng nạp)', () => {
  const live = allJs.filter(({ f }) => f !== 'word-notes.js');
  for (const { f, s } of live) {
    const hits = [...s.matchAll(/wnBlockHtml|wnOpenEditor|wnNotes|wnPausedCountdown|wn-overlay|wn-sheet/g)];
    assert.strictEqual(hits.length, 0, `${f} còn dính mẹo nhớ: ${hits.map(h => h[0]).join(',')}`);
  }
});
test('auth.js vẫn gọi wnReset có kiểm tra typeof → không lỗi khi file mẹo nhớ không được nạp', () => {
  assert.ok(/typeof wnReset === 'function'\) wnReset\(\)/.test(read('js/auth.js')));
});
test('stroke.js tự chứa: mọi lớp CSS của cửa sổ nét viết đều được chính file này định nghĩa', () => {
  const s = read('js/stroke.js');
  const used = [...s.matchAll(/class="(stroke-[\w-]+)"/g)].map(m => m[1]).concat(['stroke-ov']);
  const css2 = s.slice(s.indexOf('st.textContent'), s.indexOf('document.head.appendChild(st)'));
  for (const c of new Set(used)) assert.ok(css2.includes('.' + c + '{') || css2.includes('.' + c + ','), 'thiếu CSS cho ' + c);
  assert.ok(!/className = 'wn-|class="wn-/.test(s));
});
test('dữ liệu & API server của mẹo nhớ giữ nguyên (khôi phục được, không mất mẹo đã viết)', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'js/word-notes.js')) && fs.existsSync(path.join(ROOT, 'lib/word-notes.js')) && fs.existsSync(path.join(ROOT, 'migrations/V105_word_notes.sql')));
  assert.ok(/V116: FILE NÀY KHÔNG CÒN ĐƯỢC NẠP/.test(read('js/word-notes.js')));
  const api = read('api/index.js'); assert.ok(/\/api\/notes/.test(api) && /wordNotes\.setNote/.test(api));
});
test('màn giới thiệu từ mới & màn đáp án vẫn có chiết tự, âm Hán Việt, ví dụ — chỉ mất khối mẹo', () => {
  const r = read('js/review.js');
  assert.ok((r.match(/renderHanziParts\(w\.hz/g) || []).length >= 3);
});

section('[G] Nối dây test');
test('package.json có test:v116 và đã nối vào test:v110', () => {
  const pkg = JSON.parse(read('package.json')); assert.strictEqual(pkg.scripts['test:v116'], 'node test/v116-menu.test.js'); assert.ok(/npm run test:v116/.test(pkg.scripts['test:v110']));
});
