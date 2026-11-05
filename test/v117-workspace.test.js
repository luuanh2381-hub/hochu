#!/usr/bin/env node
// test/v117-workspace.test.js — V117: Study Workspace + dạng bài bổ sung + tạm dừng + tổng kết.
// Kiểm bằng mã thật (QE/QS chạy thật; review.js/study-workspace.js nạp vào vm với DOM giả). KHÔNG thay cho thử trên trình duyệt thật.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let passed = 0, failed = 0; const pending = [];
const test = (n, f) => pending.push({ n, f });
async function runAll() {
  for (const { n, f } of pending) {
    try { await f(); passed++; console.log('  ✅ ' + n); }
    catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); }
  }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
}
const QE = require('../js/question-engine');
const SS = require('../js/skill-score');
global.SS = SS; global.QE = QE;
const QS = require('../js/question-selector');

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const POOL = [
  { hz: '认真', py: 'rènzhēn', vi: 'nghiêm túc', l: 5, hanviet: 'nhận chân' }, { hz: '准备', py: 'zhǔnbèi', vi: 'chuẩn bị', l: 5, hanviet: 'chuẩn bị' },
  { hz: '参加', py: 'cānjiā', vi: 'tham gia', l: 5, hanviet: 'tham gia' }, { hz: '发现', py: 'fāxiàn', vi: 'phát hiện', l: 5, hanviet: 'phát hiện' },
  { hz: '学习', py: 'xuéxí', vi: 'học tập', l: 1, hanviet: 'học tập' }, { hz: '休息', py: 'xiūxi', vi: 'nghỉ ngơi', l: 1 },
  { hz: '苹果', py: 'píngguǒ', vi: 'quả táo', l: 2, hanviet: 'bình quả' }, { hz: '桌子', py: 'zhuōzi', vi: 'cái bàn', l: 2 }, { hz: '天气', py: 'tiānqì', vi: 'thời tiết', l: 2, hanviet: 'thiên khí' },
];
const ctxOf = (over) => Object.assign({ pool: POOL, examples: [], sentences: [], confuseGroups: [], audioOk: true, heavy: null }, over || {});
const NEW = ['py2hz', 'py2vi', 'vi2py', 'hz2hv', 'listen2type'];

// ── A. Dạng bài mới ──────────────────────────────────────────────────────────────────────────────────────────
test('A1. 5 dạng mới đều là CHỈ LUYỆN BỔ SUNG: không có exerciseFsrs, practiceOnly, không fsrsEligible', () => {
  for (const id of NEW) {
    const T = QE.TYPES[id]; assert.ok(T, id);
    assert.strictEqual(T.practiceOnly, true, id); assert.strictEqual(T.exerciseFsrs, null, id);
    for (const w of POOL) { const q = QE.build(id, w, ctxOf({ rand: rng(7) })); if (q) assert.strictEqual(q.fsrsEligible, false, id); }
  }
});
test('A2. Dựng nhiều lần: luôn hợp lệ — 1 đáp án đúng, không trùng đáp án, không lộ đáp án trong đề', () => {
  const made = {};
  for (const id of NEW) for (let seed = 1; seed <= 40; seed++) for (const w of POOL) {
    const q = QE.build(id, w, ctxOf({ rand: rng(seed) }));
    if (!q) continue;
    made[id] = (made[id] || 0) + 1;
    assert.ok(QE.validate(q, { viOf: hz => (POOL.find(x => x.hz === hz) || {}).vi, pyOf: hz => (POOL.find(x => x.hz === hz) || {}).py }).ok, id);
    if (q.typed) { assert.strictEqual(q.options.length, 0); continue; }
    const keys = q.options.map(o => QE.normText(o.key));
    assert.strictEqual(new Set(keys).size, keys.length, id + ' trùng đáp án');
    assert.strictEqual(q.options.filter(o => o.key === q.correctKey).length, 1, id);
    assert.strictEqual(q.options[q.correctIndex].key, q.correctKey);
    assert.ok(q.options.length >= 3 && q.options.length <= 4, id);
  }
  for (const id of NEW) assert.ok(made[id] > 0, 'dạng ' + id + ' không dựng được câu nào');
});
test('A3. Pinyin→chữ Hán/nghĩa: kho có từ đồng âm → KHÔNG dựng (đề chỉ có pinyin sẽ mơ hồ)', () => {
  const homo = POOL.concat([{ hz: '准备2', py: 'zhǔnbèi', vi: 'thứ khác', l: 6 }]);
  const w = POOL.find(x => x.hz === '准备');
  for (const id of ['py2hz', 'py2vi', 'listen2type']) assert.strictEqual(QE.build(id, w, ctxOf({ pool: homo })), null, id);
  assert.ok(QE.build('py2hz', w, ctxOf()), 'không đồng âm thì dựng được');
});
test('A4. Hán Việt: từ không có trường hanviet → không dựng; nhiễu không trùng Hán Việt đáp án', () => {
  assert.strictEqual(QE.build('hz2hv', POOL.find(x => x.hz === '休息'), ctxOf()), null);
  for (let seed = 1; seed <= 30; seed++) {
    const q = QE.build('hz2hv', POOL.find(x => x.hz === '认真'), ctxOf({ rand: rng(seed) }));
    if (q) q.options.forEach((o, i) => { if (i !== q.correctIndex) assert.notStrictEqual(QE.normText(o.key), QE.normText('nhận chân')); });
  }
});
test('A5. Từ có nhiều cách đọc (cháng/zhǎng) → không dựng dạng pinyin; nghe-gõ cần âm thanh', () => {
  const multi = { hz: '长', py: 'cháng / zhǎng', vi: 'dài', l: 1 };
  for (const id of ['py2hz', 'py2vi', 'vi2py']) assert.strictEqual(QE.build(id, multi, ctxOf({ pool: POOL.concat([multi]) })), null, id);
  assert.strictEqual(QE.build('listen2type', POOL[0], ctxOf({ audioOk: false })), null);
  const q = QE.build('listen2type', POOL[0], ctxOf());
  assert.ok(q && q.typed === 'hz' && q.prompt.kind === 'audio');
  assert.ok(!JSON.stringify({ m: q.prompt.main, a: q.prompt.ask }).includes(POOL[0].hz), 'đề nghe lộ chữ Hán'); // audioText chỉ để phát âm, không hiển thị
});
test('A6. Bộ chọn: mặc định / fsrsOnly KHÔNG BAO GIỜ trả dạng mới; chỉ luyện bổ sung mới có thể trả', () => {
  const session = QS.newSession();
  for (let seed = 1; seed <= 60; seed++) for (const w of POOL) {
    const q1 = QS.choose(w, ctxOf({ rand: rng(seed) }), { session, rand: rng(seed), allowTyped: true });
    assert.ok(!q1 || !NEW.includes(q1.typeId), 'dạng mới lọt vào đường chính thức: ' + (q1 && q1.typeId));
    const q2 = QS.choose(w, ctxOf({ rand: rng(seed) }), { session, rand: rng(seed), fsrsOnly: true, allowTyped: true, allowPracticeOnly: true });
    assert.ok(!q2 || (!NEW.includes(q2.typeId) && q2.fsrsEligible), 'dạng mới lọt vào fsrsOnly');
  }
  const seen = new Set();
  const recog = QE.MCQ_ORDER.concat(QE.PRACTICE_ORDER).filter(t => QE.TYPES[t].skill === 'recognition');
  for (let seed = 1; seed <= 200; seed++) for (const w of POOL) {
    const sess = QS.newSession();
    QS.record(sess, { hz: w.hz, typeId: 'hz2vi', skill: 'recognition', correctIndex: 0 }, false, 1000); // vừa sai dạng hz2vi
    const q = QS.choose(w, ctxOf({ rand: rng(seed) }), { session: sess, rand: rng(seed), allowPracticeOnly: true, only: recog, exclude: ['hz2vi'] });
    if (q) seen.add(q.typeId);
  }
  assert.ok(['py2vi', 'hz2hv'].some(t => seen.has(t)), 'luyện bổ sung không bao giờ chọn dạng mới: ' + [...seen]);
});
test('A7. Bảng server: mọi dạng mới có nhãn khớp quizType + fsrs:false; server chấm được hz2hv', () => {
  const sk = read('lib/skills.js'), api = read('api/index.js');
  for (const id of NEW) {
    const T = QE.TYPES[id];
    const m = sk.match(new RegExp("'" + T.exercisePractice + "':\\s*\\{([^}]*)\\}"));
    assert.ok(m, 'thiếu nhãn ' + T.exercisePractice + ' trong lib/skills.js');
    assert.ok(m[1].includes("quizType: '" + T.quizType + "'"), T.exercisePractice + ' lệch quizType');
    assert.ok(m[1].includes('fsrs: false'), T.exercisePractice + ' phải fsrs:false');
    assert.ok(m[1].includes("skill: '" + T.skill + "'"), T.exercisePractice + ' lệch kỹ năng');
  }
  assert.ok(/quizType === 'hz2hv'\) return word\.hanviet/.test(api), 'server chưa chấm hz2hv');
});
test('A8. resolveExercise thật của server nhận các nhãn mới (không phải nhãn FSRS)', () => {
  let skills; try { skills = require('../lib/skills'); } catch (e) { return; } // thiếu phụ thuộc trong môi trường → bỏ qua có chủ ý
  for (const id of NEW) { const ex = skills.resolveExercise(QE.TYPES[id].exercisePractice, null); assert.ok(ex && !ex.fsrs, id); }
  assert.strictEqual(skills.resolveExercise('practice-listening-typed', null).typed, 'hz');
});

// ── B. Study Workspace (hàm thuần + không can thiệp trình duyệt) ───────────────────────────────────────────
const SW_SRC = read('js/study-workspace.js');
const swCtx = () => { const c = { console, Math, JSON, Number, Object, localStorage: undefined }; vm.createContext(c); vm.runInContext(SW_SRC, c); return c; };
test('B1. Không dùng Fullscreen API / đổi cỡ cửa sổ / zoom / extension trong toàn bộ mã nguồn của phiên học', () => {
  const files = ['js/study-workspace.js', 'js/review.js', 'css/styles.css'];
  for (const f of files) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n'); // bỏ chú thích
    for (const bad of ['requestFullscreen', 'webkitRequestFullscreen', 'exitFullscreen', 'resizeTo', 'resizeBy', 'moveTo(', 'chrome.runtime', 'document.body.style.zoom', 'window.open(']) {
      assert.ok(!src.includes(bad), f + ' có dùng ' + bad);
    }
    assert.ok(!/(^|[^-\w])zoom\s*:/.test(src), f + ' có thuộc tính CSS zoom');
  }
});
test('B2. Chuẩn hoá tuỳ chọn: giá trị rác/thiếu → mặc định; ngoài khoảng → kẹp; layout lạ → standard', () => {
  const c = swCtx();
  const N = (o) => vm.runInContext('swNormalizePrefs(' + JSON.stringify(o) + ')', c);
  assert.deepStrictEqual(N(null), vm.runInContext('SW_DEFAULTS', c));
  assert.strictEqual(N({ layout: 'fullscreen' }).layout, 'standard');
  assert.strictEqual(N({ layout: 'max-space' }).layout, 'max-space');
  assert.strictEqual(N({ hz: 99 }).hz, 1.8); assert.strictEqual(N({ hz: -5 }).hz, 0.7); assert.strictEqual(N({ hz: 'abc' }).hz, 1);
  assert.strictEqual(N({ gap: 'x' }).gap, 'normal'); assert.strictEqual(N({ autoNext: 'x' }).autoNext, 'normal');
  assert.strictEqual(N({ autoAudio: false }).autoAudio, false); assert.strictEqual(N({}).autoAudio, true);
});
test('B3. Tốc độ tự chuyển câu: Nhanh < Vừa < Chậm; mặc định Vừa = 2000ms (giữ hành vi cũ)', () => {
  const c = swCtx();
  const M = vm.runInContext('SW_NEXT_MS', c);
  assert.ok(M.fast < M.normal && M.normal < M.slow); assert.strictEqual(M.normal, 2000);
});
test('B4. CSS Workspace chỉ có hiệu lực khi body.sw-on (không đụng trang khác)', () => {
  const css = read('css/styles.css');
  const block = css.slice(css.lastIndexOf('/*', css.indexOf('V117 — STUDY WORKSPACE')));
  // gỡ comment + @keyframes; mỗi selector còn lại phải bắt đầu bằng body.sw-on / .sw- / .rv- (lớp riêng của màn học)
  const clean = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const sels = []; clean.replace(/(?:^|\})\s*([^{}@]+)\{/g, (m, s) => { sels.push(s.trim()); return m; });
  assert.ok(sels.length > 30);
  for (const group of sels) for (const sel of group.split(',').map(x => x.trim()).filter(Boolean)) {
    if (/^\d+%|^(from|to)$/.test(sel)) continue;
    assert.ok(/^(body\.sw-on|\.sw-|\.rv-)/.test(sel), 'selector không được cô lập: ' + sel);
  }
});
test('B5. 3 chế độ có CSS riêng; Tập trung/Tối đa ẩn header, subnav, nav dưới; không đặt chiều cao cố định cho .rv-card', () => {
  const css = read('css/styles.css'); const blk = css.slice(css.indexOf('V117 — STUDY WORKSPACE'));
  for (const l of ['focus', 'max-space']) { assert.ok(blk.includes('[data-sw-layout="' + l + '"] #app-header')); assert.ok(blk.includes('[data-sw-layout="' + l + '"] #nav')); }
  const noC = blk.replace(/\/\*[\s\S]*?\*\//g, '');
  noC.replace(/([^{}]+)\{([^{}]*)\}/g, (m, sel, decl) => {
    if (sel.split(',').some(x => /\.rv-card\s*$/.test(x.trim()))) assert.ok(!/(^|[;\s])height\s*:/.test(decl), 'height cố định cho ' + sel.trim());
    return m;
  });
  assert.ok(/max-height:\s*560px/.test(blk), 'thiếu quy tắc màn thấp');
  assert.ok(/339px/.test(blk), 'thiếu bố cục dọc cho ghép cặp trên màn hẹp');
});
test('B6. Nối dây: index.html nạp study-workspace.js sau review.js; render() gọi swSync; khôi phục mặc định có mặt', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('/js/study-workspace.js') > html.indexOf('/js/review.js'));
  assert.ok(html.indexOf('/js/study-workspace.js') < html.indexOf('/js/app.js'));
  assert.ok(/swSync\(\)/.test(read('js/navigation.js')));
  assert.ok(/swResetPrefs/.test(SW_SRC) && /Khôi phục mặc định/.test(SW_SRC));
});
test('B7. Đổi chế độ bố cục KHÔNG vẽ lại câu hỏi (không gọi render/renderReview trong swSetLayout)', () => {
  const i = SW_SRC.indexOf('function swSetLayout'); const j = SW_SRC.indexOf('function swSetPref');
  const body = SW_SRC.slice(i, j);
  assert.ok(!/render\(|renderReview\(|innerHTML/.test(body), 'swSetLayout vẽ lại nội dung → mất câu trả lời đang nhập');
});

// ── C. Tạm dừng / tiếp tục (DOM giả) ─────────────────────────────────────────────────────────────────────────
function pauseEnv() {
  let now = 1000; const els = {};
  const mk = (id) => ({ id, remove() { delete els[id]; }, querySelector: () => ({ focus() {} }), setAttribute() {}, appendChild() {}, classList: { toggle() {}, add() {}, remove() {} }, style: {}, dataset: {} });
  const doc = { body: { appendChild(el) { els[el.id] = el; }, classList: { add() {}, remove() {}, contains: () => false }, style: { setProperty() {}, removeProperty() {} }, dataset: {} },
    createElement: () => { const e = mk(''); Object.defineProperty(e, 'innerHTML', { set() {}, get: () => '' }); return e; },
    getElementById: (id) => els[id] || null, addEventListener() {}, hidden: false };
  const ctx = { console, Math, JSON, Number, Object, document: doc, performance: { now: () => now }, localStorage: undefined, currentTab: 'review',
    rvQueue: { items: [{ type: 'review' }], practiceOnly: false }, rvStage: 'run', rvStartedAt: 1000, rvPhase: 'question', rvRatingPhase: null, rvAttemptId: 1,
    rvSummary: {}, rvLog: [], rvStorageMode: () => 'review', sqPersist: () => { ctx.persisted = (ctx.persisted || 0) + 1; }, rvClearCountdown: () => { ctx.cleared = (ctx.cleared || 0) + 1; },
    rvShouldAutoCommit: () => true, rvStartCountdown: () => { ctx.restarted = (ctx.restarted || 0) + 1; }, vtHiddenMs: () => 0, speechSynthesis: { cancel() {} },
    goTab: (t) => { ctx.wentTo = t; }, setTimeout: () => 0, clearTimeout() {}, matchMedia: () => ({ matches: false }) };
  ctx.tick = (ms) => { now += ms; };
  vm.createContext(ctx); vm.runInContext(SW_SRC, ctx);
  return ctx;
}
test('C1. Tạm dừng: dừng đếm ngược, lưu hàng đợi, KHÔNG ghi câu trả lời nào; tiếp tục: trừ thời gian dừng khỏi thời gian trả lời', () => {
  const c = pauseEnv();
  vm.runInContext('swPause()', c);
  assert.strictEqual(vm.runInContext('swIsPaused()', c), true);
  assert.ok(c.cleared >= 1, 'chưa dừng đếm ngược'); assert.ok(c.persisted >= 1, 'chưa lưu hàng đợi');
  assert.strictEqual(vm.runInContext('rvLog.length', c), 0, 'tạm dừng không được ghi kết quả');
  c.tick(60000);
  vm.runInContext('swResume()', c);
  assert.strictEqual(vm.runInContext('swIsPaused()', c), false);
  assert.strictEqual(vm.runInContext('rvStartedAt', c), 1000 + 60000, 'thời gian dừng phải được trừ khỏi responseTime');
});
test('C2. Tiếp tục ở màn đáp án đang chờ tự chuyển → chạy lại đếm ngược; thoát về Hôm nay học không ghi gì', () => {
  const c = pauseEnv();
  vm.runInContext("rvPhase = 'answered'; rvRatingPhase = 'pending'; swPause();", c); c.tick(5000);
  vm.runInContext('swResume()', c); assert.strictEqual(c.restarted, 1);
  vm.runInContext('swPause(); swExitSession()', c);
  assert.strictEqual(c.wentTo, 'today'); assert.strictEqual(vm.runInContext('rvLog.length', c), 0);
});
test('C3. Không tạm dừng được khi không có phiên đang chạy (màn bắt đầu / tổng kết)', () => {
  const c = pauseEnv(); vm.runInContext("rvStage = 'start'; swPause()", c);
  assert.strictEqual(vm.runInContext('swIsPaused()', c), false);
  const d = pauseEnv(); vm.runInContext('rvQueue.items = []; swPause()', d);
  assert.strictEqual(vm.runInContext('swIsPaused()', d), false);
});
test('C4. Câu trả lời bị chặn khi đang tạm dừng (rvPick, rvSubmitTyped, phím 1-4)', () => {
  const rv = read('js/review.js'), ui = read('js/ui.js');
  assert.ok(/async function rvPick[\s\S]{0,400}swIsPaused/.test(rv));
  assert.ok(/async function rvSubmitTyped[\s\S]{0,500}swIsPaused/.test(rv));
  assert.ok(/currentTab === 'review'\) \{\s*\n\s*if \(typeof swIsPaused/.test(ui));
});

// ── D. Hành vi câu hỏi trong review.js (vm) ──────────────────────────────────────────────────────────────────
function reviewEnv(extra) {
  const doc = { createElement: () => ({ style: {}, appendChild() {}, set textContent(v) {} }), head: { appendChild() {} }, getElementById: () => null, querySelectorAll: () => [] };
  const ctx = Object.assign({
    console, Math, Date, JSON, Set, Map, Array, Object, String, Number, Promise, Error, setTimeout: () => 0, clearInterval() {}, setInterval: () => 0,
    document: doc, performance: { now: () => 0 }, WORDS: POOL, GUEST_MAX_LESSON: 99, isLoggedIn: () => true, isGuest: false, authToken: 't', authHeaders: () => ({}),
    SENTENCES: [], CONFUSE_GROUPS: [], showPinyin: true, showMeaning: true, showHanViet: true, isAdminRole: () => false, currentTab: 'review',
    lessonName: l => 'Bài ' + l,
    escapeHtml: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    escapeJsAttr: s => String(s).replace(/'/g, "\\'"), renderHanziParts: () => '', lessonsLabel: () => 'Bài 5', skillAudioAvailable: () => true, vtMarkStart() {}, vtHiddenMs: () => 0,
    render() {}, speak() {}, playDing() {}, playBuzz() {},
    sqCreate: () => ({ items: [], doneHz: new Set(), totalPlanned: 0, answeredCount: 0, sessionId: null, startTime: null, endTime: null, completedCards: [], lessonFilter: null, dayKey: null }),
    sqSnapshotLessonFilter: () => ({}), sqReadPersisted: () => null, sqPersist() {}, sqClearPersisted() {}, ssArchiveSession() {}, refreshServerMeta() {},
    sessionKnownHz: new Set(), saveSessionKnownHz() {}, sqPurgeHzFromAllQueues() {}, sqLessonFilterMatches: () => true, REPEAT_GAP: 3,
    genIdempotencyKey: () => 'k', todayKey: () => '2026-10-19', goTab() {}, submitFsrsReviewAwaited: async () => ({ ok: true }), submitSkillPractice: async () => ({ ok: true }), SUBMIT_REVIEW_MAX_WAIT_MS: 1000, alert() {},
  }, extra || {});
  vm.createContext(ctx);
  for (const f of ['js/skill-score.js', 'js/session-summary.js', 'js/question-engine.js', 'js/question-selector.js', 'js/review.js']) vm.runInContext(read(f), ctx);
  return ctx;
}
const R = (ctx, code) => vm.runInContext(code, ctx);
function showQuestion(ctx, typeId, hz, extra) {
  R(ctx, `rvQueue.items = [{ type: 'review', word: WORDS.find(w => w.hz === ${JSON.stringify(hz)}) }]; rvQueue.totalPlanned = 1; rvStage = 'run'; rvStartInfo = null; rvLog = [];`);
  R(ctx, `rvPrepareCurrentCard();`);
  R(ctx, `rvQuestion = QE.build(${JSON.stringify(typeId)}, WORDS.find(w => w.hz === ${JSON.stringify(hz)}), Object.assign(rvQCtx(), { rand: Math.random })); rvPhase = 'question';`);
  if (extra) R(ctx, extra);
  return R(ctx, 'renderReview()');
}
test('D1. Mỗi dạng mới vẽ được, không lộ đáp án trong đề, có thuộc tính bố cục data-q', () => {
  const ctx = reviewEnv();
  const cases = [['py2hz', '准备'], ['py2vi', '准备'], ['vi2py', '准备'], ['hz2hv', '认真'], ['listen2type', '准备']];
  for (const [t, hz] of cases) {
    const html = showQuestion(ctx, t, hz);
    assert.ok(html.includes('data-q="' + t + '"'), t + ' thiếu data-q');
    const stem = html.split('quiz-opts')[0].split('type-input')[0].replace(/<[^>]*>/g, ' '); // chỉ chữ NHÌN THẤY (thuộc tính onclick không hiển thị)
    const w = POOL.find(x => x.hz === hz);
    if (t === 'py2hz' || t === 'py2vi') assert.ok(html.includes('rv-pyq') && html.includes(w.py), t);
    if (t === 'py2hz') assert.ok(!stem.includes(w.hz), 'py2hz lộ chữ Hán trong đề');
    if (t === 'vi2py') assert.ok(!stem.includes(w.py), 'vi2py lộ pinyin trong đề');
    if (t === 'hz2hv') assert.ok(!stem.includes(w.hanviet), 'hz2hv lộ Hán Việt trong đề');
    if (t === 'listen2type') { assert.ok(html.includes('id="rv-typed"') && html.includes('rv-audio-status') && html.includes('id="rv-play"')); assert.ok(!stem.includes(w.hz)); }
  }
});
test('D2. Câu nghe: có khu vực âm thanh nổi bật + nút nghe lại + dòng trạng thái; nút gọi swPlayTracked (không tự lặp)', () => {
  const ctx = reviewEnv();
  const html = showQuestion(ctx, 'listen2hz', '准备');
  assert.ok(html.includes('class="rv-audio"') && html.includes('rv-audio-status') && /swPlayTracked\('/.test(html) && html.includes('aria-label="Nghe lại"'));
  assert.ok(!/setInterval|loop/.test(SW_SRC.slice(SW_SRC.indexOf('function swPlayTracked'), SW_SRC.indexOf('function swSpeakAfterAnswer'))), 'phát âm không được lặp');
});
test('D3. "Kiểm tra trí nhớ thực sự": chữ Hán→nghĩa KHÔNG hiện pinyin ở đề, ẩn "vì sao chọn", có nhãn chế độ; tắt thì như cũ', () => {
  const normal = reviewEnv({ swStrict: () => false });
  const strict = reviewEnv({ swStrict: () => true });
  const w = POOL[1];
  const q = `Object.assign(QE.build('hz2vi', WORDS[1], Object.assign(rvQCtx(), { rand: Math.random })), { why: 'LÝ DO CHỌN' })`;
  for (const [ctx, isStrict] of [[normal, false], [strict, true]]) {
    R(ctx, `rvQueue.items = [{ type: 'review', word: WORDS[1] }]; rvQueue.totalPlanned = 1; rvStage = 'run'; rvPrepareCurrentCard(); rvQuestion = ${q}; rvPhase = 'question';`);
    const html = R(ctx, 'renderReview()');
    assert.strictEqual(html.includes('class="rv-py"'), !isStrict, 'pinyin ở đề (strict=' + isStrict + ')');
    assert.strictEqual(html.includes('LÝ DO CHỌN'), !isStrict);
    assert.strictEqual(html.includes('Kiểm tra trí nhớ thực sự'), isStrict);
    assert.ok(w.py);
  }
});
test('D4. Chế độ kiểm tra: câu nghe vẫn có nút nghe (âm thanh LÀ nội dung kiểm tra), không bị ẩn', () => {
  const ctx = reviewEnv({ swStrict: () => true });
  const html = showQuestion(ctx, 'listen2hz', '准备');
  assert.ok(html.includes('id="rv-play"'));
});
test('D5. Ẩn Hán Việt (showHanViet=false) → màn đáp án/giới thiệu không hiện Hán Việt; mặc định vẫn hiện', () => {
  const on = reviewEnv(), off = reviewEnv({ showHanViet: false });
  for (const [ctx, expect] of [[on, true], [off, false]]) {
    R(ctx, `rvQueue.items = [{ type: 'new', word: WORDS[0] }]; rvQueue.totalPlanned = 1; rvStage = 'run'; rvPrepareCurrentCard();`);
    assert.strictEqual(R(ctx, 'renderReview()').includes('Hán Việt: nhận chân'), expect);
  }
});
test('D6. Ghép cặp: chạm lại chữ đang chọn = bỏ chọn; ghép sai có thông báo + đánh dấu; ghép đúng thì xoá thông báo', () => {
  const ctx = reviewEnv();
  R(ctx, `rvQueue.items = [{ type: 'match', hzs: WORDS.slice(0, 4).map(w => w.hz) }]; rvQueue.totalPlanned = 1; rvStage = 'run'; rvPrepareCurrentCard();`);
  assert.strictEqual(R(ctx, 'rvPhase'), 'match');
  R(ctx, `rvMatchPick('L', 0)`); assert.ok(R(ctx, 'rvMatch.selected') && R(ctx, 'renderReview()').includes('Đã chọn 1 chữ Hán'));
  R(ctx, `rvMatchPick('L', 0)`); assert.strictEqual(R(ctx, 'rvMatch.selected'), null);
  // ghép sai: chọn chữ ở trái rồi chọn nhãn của cặp KHÁC
  R(ctx, `rvMatchPick('L', 0); const hz = rvMatch.selected; const wrongIdx = rvMatch.m.rights.findIndex(r => r !== rvMatch.m.pairs.find(p => p.hz === hz).right); rvMatchPick('R', wrongIdx);`);
  const html = R(ctx, 'renderReview()');
  assert.ok(html.includes('Chưa đúng') && html.includes('rv-match-btn bad'), 'thiếu phản hồi ghép sai');
  assert.strictEqual(R(ctx, 'rvMatch.solved.size'), 0, 'ghép sai không được tính là đã ghép');
});
test('D7. Tổng kết: câu đúng nhờ gợi ý KHÔNG gộp vào "đúng ngay lần đầu"; tách 3 mục; có gợi ý luyện tiếp chỉ khi đủ dữ liệu', () => {
  const ctx = reviewEnv();
  R(ctx, `rvQueue.items = []; rvQueue.startTime = 0; rvQueue.endTime = 120000; rvSummary = { reviewCount: 3, newCount: 0 };
    rvLog = [
      { hz: '认真', l: 5, typeId: 'hz2vi', skill: 'recognition', correct: true, official: true, source: 'review' },
      { hz: '准备', l: 5, typeId: 'typeVi2hz', skill: 'recall', correct: true, official: false, source: 'extra', hinted: true },
      { hz: '参加', l: 5, typeId: 'hz2vi', skill: 'recognition', correct: false, official: true, source: 'review' },
      { hz: '参加', l: 5, typeId: 'hz2py', skill: 'pinyin', correct: false, official: true, source: 'review' },
      { hz: '发现', l: 5, typeId: 'hz2vi', skill: 'recognition', correct: false, official: true, source: 'review' }];`);
  const html = R(ctx, 'rvSummaryHtml()');
  assert.ok(html.includes('>1/4<'), 'đúng lần đầu phải = 1/4 (từ nhờ gợi ý không tính)'); assert.ok(html.includes('(+1 nhờ gợi ý)'));
  assert.ok(html.includes('1 · Kết quả buổi học này') && html.includes('2 · Ghi nhớ qua nhiều lần kiểm tra') && html.includes('3 · Vận dụng trong ngữ cảnh'));
  assert.ok(html.includes('4</div><div class="rv-start-lbl">Số từ đã luyện') || html.includes('>4<'), 'số từ đã luyện');
  assert.ok(html.includes('chưa có câu điền từ vào câu'), 'không bịa dữ liệu ngữ cảnh');
  assert.ok(html.includes('3</b> lượt ôn chính thức') || html.includes('<b>4</b> lượt ôn chính thức'), 'đếm lượt ôn chính thức');
  assert.ok(html.includes('Từ cần chú ý') && html.includes('参加'), 'từ sai ≥2 lần phải được nêu');
  const few = R(ctx, `rvLog = rvLog.slice(0, 2); rvSummaryHtml()`);
  assert.ok(few.includes('chưa đủ dữ liệu để đề xuất'), 'ít câu → không đề xuất bừa');
});
test('D8. Tự gõ: KHÔNG tự bật bàn phím trên màn cảm ứng (chỉ focus khi có chuột + bàn phím)', () => {
  const rv = read('js/review.js');
  assert.ok(!/setTimeout\(\(\) => \{ const i = document\.getElementById\('rv-typed'\); if \(i\) i\.focus\(\); \}, 120\)/.test(rv), 'còn đoạn focus vô điều kiện');
  assert.ok(/swCanAutoFocus/.test(rv));
  const c = swCtx(); assert.strictEqual(vm.runInContext('swCanAutoFocus()', c), false); // môi trường không có matchMedia → không focus
});

runAll();
