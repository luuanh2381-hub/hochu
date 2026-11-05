#!/usr/bin/env node
// test/v128-phase4-recognition.test.js — V128 giai đoạn 4: luyện thêm cho kỹ năng NHẬN DIỆN.
// Chạy: node test/v128-phase4-recognition.test.js   (không cần DB/ts-fsrs/express)
//
// Kiểm tra: (1) route /api/skills/practice-words — nạp ĐOẠN MÃ THẬT của route vào hàm giả (không cần express/Postgres): 'recognition' chỉ trả khi được yêu cầu
// RIÊNG, KHÔNG lọt vào 'mixed'; mọi tổ hợp khác (kỹ năng × allowListening) cho đúng kết quả của V127; chỉ đọc (2) luồng phía người học: Nhận diện tụt lại →
// được nâng trần và luyện thêm như kỹ năng khác; máy chủ cũ từ chối → không văng lỗi (3) hiển thị (4) ranh giới.
// KHÔNG thay cho thử trên Postgres thật / trình duyệt thật (câu SQL của getPracticeWords không đổi và không chạy ở đây).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let passed = 0, failed = 0; const pending = [];
const test = (n, f) => pending.push({ n, f });
const section = (t) => pending.push({ n: null, f: () => console.log('\n' + t) });
async function runAll() {
  for (const { n, f } of pending) {
    if (n === null) { f(); continue; }
    try { await f(); passed++; console.log('  ✅ ' + n); }
    catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); }
  }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
}

global.SS = require('../js/skill-score.js');
global.AM = require('../js/answer-match.js');
const QE = global.QE = require('../js/question-engine.js');
const QS = require('../js/question-selector.js');
const TP = require('../js/training-plan.js');
const { MEASURABLE_SKILLS } = require('../lib/skills.js');

// ── [1] Route thật, hàm giả ────────────────────────────────────────────────────────────────────────────────────────
// Lấy NGUYÊN văn đoạn app.get('/api/skills/practice-words', ...) trong api/index.js và chạy với app/requireAuth/skillStore/fail giả.
function loadRoute(apiSrc) {
  const start = apiSrc.indexOf("app.get('/api/skills/practice-words'");
  assert.ok(start >= 0, 'không thấy route practice-words');
  const end = apiSrc.indexOf('\n});', start) + 4;
  const src = apiSrc.slice(start, end);
  let handler = null;
  const calls = { store: [], fail: [], auth: 0, throwNext: false };
  const deps = {
    app: { get: (p, h) => { handler = h; } },
    requireAuth: async (req, res) => { calls.auth++; return req.__user === null ? null : { username: 'u1' }; },
    MEASURABLE_SKILLS,
    skillStore: { getPracticeWords: async (user, opts) => { calls.store.push({ user, opts }); if (calls.throwNext) throw new Error('boom'); return [{ hz: '学', l: 1, skill: opts.skill }]; } },
    fail: (res, e) => { calls.fail.push(e.message); res.json({ ok: false, error: 'lỗi' }); },
  };
  new Function('app', 'requireAuth', 'MEASURABLE_SKILLS', 'skillStore', 'fail', src)(deps.app, deps.requireAuth, deps.MEASURABLE_SKILLS, deps.skillStore, deps.fail);
  assert.strictEqual(typeof handler, 'function');
  const call = async (query, user) => { let out; const res = { json: (x) => { out = x; } }; await handler({ query, __user: user }, res); return out; };
  return { call, calls, src };
}
const route = loadRoute(read('api/index.js'));
const lastStore = () => route.calls.store[route.calls.store.length - 1];
const reset = () => { route.calls.store.length = 0; route.calls.fail.length = 0; route.calls.auth = 0; };

// Chuẩn đối chiếu = logic của V127 cho MỌI kỹ năng khác recognition (chép nguyên từ V127 để làm "thước đo").
function v127(query) {
  const wantListening = query.allowListening === '1';
  const allowed = MEASURABLE_SKILLS.filter(s => s !== 'recognition' && (s !== 'listening' || wantListening));
  const skill = query.skill === 'mixed' ? 'mixed' : query.skill;
  if (skill !== 'mixed' && !allowed.includes(skill)) return { rejected: true };
  return { rejected: false, skill, allowedSkills: allowed, weakOnly: query.weakOnly === '1', limit: query.limit };
}

section('[1] Route /api/skills/practice-words (đoạn mã thật, hàm giả)');
test('skill=recognition (yêu cầu riêng) → được phép, chỉ truy vấn đúng kỹ năng recognition', async () => {
  reset(); const out = await route.call({ skill: 'recognition', weakOnly: '0', limit: '8', allowListening: '0' });
  assert.strictEqual(out.ok, true); assert.strictEqual(route.calls.store.length, 1);
  const o = lastStore().opts; assert.strictEqual(o.skill, 'recognition'); assert.deepStrictEqual(o.allowedSkills, ['recognition']); assert.strictEqual(o.weakOnly, false); assert.strictEqual(o.limit, '8');
  assert.strictEqual(lastStore().user, 'u1');
});
test("'recognition' KHÔNG lọt vào 'mixed' ở bất kỳ tổ hợp nào (allowListening 0/1/thiếu, weakOnly 0/1) → \"từ hay sai\" và tab Phân tích nhận đúng danh sách như V127", async () => {
  for (const al of ['0', '1', undefined]) for (const wo of ['0', '1', undefined]) {
    reset(); await route.call({ skill: 'mixed', weakOnly: wo, limit: '10', allowListening: al });
    assert.ok(!lastStore().opts.allowedSkills.includes('recognition'), `al=${al} wo=${wo}`);
    assert.deepStrictEqual(lastStore().opts.allowedSkills, MEASURABLE_SKILLS.filter(s => s !== 'recognition' && (s !== 'listening' || al === '1')));
  }
});
test('Mọi tổ hợp (kỹ năng × allowListening × weakOnly) KHÁC recognition cho kết quả GIỐNG HỆT V127 (kể cả trường hợp bị từ chối)', async () => {
  const skills = ['mixed', 'recall', 'pinyin', 'context', 'listening', undefined, '', 'pronunciation', 'RECALL', 'x', 'constructor', '__proto__'];
  let n = 0;
  for (const skill of skills) for (const al of ['0', '1', undefined, 'true']) for (const wo of ['0', '1', undefined]) for (const limit of [undefined, '5', '30']) {
    const q = { skill, allowListening: al, weakOnly: wo, limit }; const want = v127(q); reset(); const out = await route.call(q); n++;
    if (want.rejected) { assert.strictEqual(out.ok, false, JSON.stringify(q)); assert.strictEqual(out.error, 'Dạng luyện này hiện chưa khả dụng'); assert.strictEqual(route.calls.store.length, 0, 'bị từ chối thì không được truy vấn: ' + JSON.stringify(q)); }
    else { assert.strictEqual(out.ok, true); const o = lastStore().opts; assert.deepStrictEqual({ skill: o.skill, allowedSkills: o.allowedSkills, weakOnly: o.weakOnly, limit: o.limit }, { skill: want.skill, allowedSkills: want.allowedSkills, weakOnly: want.weakOnly, limit: want.limit }, JSON.stringify(q)); }
  }
  assert.ok(n >= 12 * 4 * 3 * 3);
});
test('Nghe vẫn cần allowListening=1 (không có giọng đọc → bị từ chối, không truy vấn)', async () => {
  reset(); assert.strictEqual((await route.call({ skill: 'listening', allowListening: '0' })).ok, false); assert.strictEqual(route.calls.store.length, 0);
  reset(); assert.strictEqual((await route.call({ skill: 'listening', allowListening: '1' })).ok, true); assert.strictEqual(route.calls.store.length, 1);
});
test('Chưa đăng nhập → không truy vấn, không trả dữ liệu', async () => {
  reset(); const out = await route.call({ skill: 'recognition' }, null); assert.strictEqual(out, undefined); assert.strictEqual(route.calls.store.length, 0);
});
test('Lỗi kho dữ liệu → đi qua fail() (không lộ dữ liệu); lỗi này không làm hỏng các lần gọi sau', async () => {
  reset(); route.calls.throwNext = true; const out = await route.call({ skill: 'recognition' }); route.calls.throwNext = false;
  assert.strictEqual(out.ok, false); assert.deepStrictEqual(route.calls.fail, ['boom']);
  assert.strictEqual((await route.call({ skill: 'recognition' })).ok, true);
});
test('Route CHỈ ĐỌC: chỉ gọi skillStore.getPracticeWords; không ghi DB, không đụng FSRS', () => {
  assert.ok(!/\b(INSERT|UPDATE|DELETE)\b/i.test(route.src));
  const calls = [...route.src.matchAll(/skillStore\.(\w+)/g)].map(m => m[1]); assert.deepStrictEqual([...new Set(calls)], ['getPracticeWords']);
  for (const bad of ['reviewFsrsCard', 'recordPractice', 'pool.query', 'client.query', 'saveProgress']) assert.ok(!route.src.includes(bad), bad);
});
test('Câu SQL của getPracticeWords KHÔNG đổi ở giai đoạn này (nhận diện dùng đúng ngưỡng "yếu"/"thiếu dữ liệu" như các kỹ năng khác)', () => {
  const s = read('lib/skill-store.js'); const i = s.indexOf('async function getPracticeWords');
  assert.ok(i > 0 && /target = skill === 'mixed' \? allowed : allowed\.filter\(s => s === skill\)/.test(s.slice(i, i + 700)));
  assert.ok(MEASURABLE_SKILLS.includes('recognition'));
});

// ── vm cho phía người học ──────────────────────────────────────────────────────────────────────────────────────────
const cell = (cn, cok, tn, tok) => ({ c: { n: cn, ok: cok }, t: { n: tn || 0, ok: tok || 0 }, rc: { n: 0, ok: 0 }, rt: { n: 0, ok: 0 } });
const L = (skills) => ({ v: 1, skills });
const RECOG_LAG = L({ recognition: cell(60, 25), recall: cell(80, 72), listening: cell(60, 50), pinyin: cell(60, 48), context: cell(40, 30) });
const RECOG_AND_PINYIN_LAG = L({ recognition: cell(60, 26), recall: cell(80, 72), listening: cell(60, 52), pinyin: cell(60, 30), context: cell(60, 50) });
const POOL = Array.from({ length: 200 }, (_, i) => ({ hz: '字' + i, py: 'zì' + i, vi: 'nghĩa ' + i, l: 1 + (i % 5) }));
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function makeEnv(over) {
  const store = {};
  const ctx = Object.assign({
    console, Math, Date, JSON, Set, Map, Array, Object, String, Number, Promise, Error, setTimeout: () => 0, clearInterval() {}, setInterval: () => 0, clearTimeout() {},
    document: { createElement: () => ({ style: {}, appendChild() {}, set textContent(v) {} }), head: { appendChild() {} }, getElementById: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    performance: { now: () => 0 }, WORDS: POOL, GUEST_MAX_LESSON: 99, isLoggedIn: () => true, isGuest: false, authToken: 't', authHeaders: () => ({}),
    SENTENCES: [], CONFUSE_GROUPS: [], showPinyin: true, showMeaning: true, isAdminRole: () => false, currentTab: 'review',
    escapeHtml: esc, escapeJsAttr: s => String(s).replace(/'/g, "\\'"), lessonName: l => 'Bài ' + l, renderHanziParts: () => '', wnBlockHtml: () => '', lessonsLabel: () => 'Bài 5',
    skillAudioAvailable: () => true, vtMarkStart() {}, vtHiddenMs: () => 0, render() {}, speak() {}, playDing() {}, playBuzz() {},
    sqCreate: () => ({ items: [], doneHz: new Set(), totalPlanned: 0, answeredCount: 0, sessionId: 'sess-1234567', startTime: null, endTime: null, completedCards: [], lessonFilter: null, dayKey: null }),
    sqSnapshotLessonFilter: () => ({}), sqReadPersisted: () => null, sqPersist() {}, sqClearPersisted() {}, ssArchiveSession() {}, refreshServerMeta() {},
    sessionKnownHz: new Set(), saveSessionKnownHz() {}, sqPurgeHzFromAllQueues() {}, sqLessonFilterMatches: () => true, REPEAT_GAP: 3,
    genIdempotencyKey: () => 'k-123456789', todayKey: () => '2026-10-30', goTab() {}, alert() {}, SUBMIT_REVIEW_MAX_WAIT_MS: 1000,
    submitFsrsReviewAwaited: async () => ({ ok: true }), submitSkillPractice: async () => ({ ok: true }),
  }, over || {});
  vm.createContext(ctx);
  for (const f of ['js/answer-match.js', 'js/skill-score.js', 'js/session-summary.js', 'js/question-engine.js', 'js/question-selector.js', 'js/training-plan.js', 'js/review.js']) vm.runInContext(read(f), ctx);
  ctx.__store = store; return ctx;
}
const R = (ctx, code) => vm.runInContext(code, ctx);
// Máy chủ giả đi qua ĐÚNG route thật ở [1] → phía người học và phía máy chủ được kiểm cùng nhau.
function fetchViaRoute(opts) {
  const o = Object.assign({ oldServer: false }, opts || {}); const calls = [];
  const range = (a, b, skill) => Array.from({ length: b - a }, (_, i) => ({ hz: '字' + (a + i), l: 1 + ((a + i) % 5), skill, score: 0.2 }));
  const f = async (url) => {
    calls.push(url); const q = Object.fromEntries(new URLSearchParams(url.split('?')[1]));
    if (o.oldServer && q.skill === 'recognition') return { json: async () => ({ ok: false, error: 'Dạng luyện này hiện chưa khả dụng' }) };
    const out = await route.call(q);
    if (!out.ok) return { json: async () => out };
    const lim = Number(q.limit);
    const words = { mixed: range(60, 90, 'pinyin'), recognition: range(150, 170, 'recognition'), pinyin: range(110, 130, 'pinyin'), listening: range(90, 110, 'listening'), recall: range(130, 150, 'recall') }[q.skill] || [];
    return { json: async () => ({ ok: true, words: words.slice(0, lim) }) };
  };
  f.calls = calls; return f;
}
const official = (n) => Array.from({ length: n }, (_, i) => ({ type: i % 4 === 0 ? 'new' : 'review', word: POOL[i] }));
async function runExtras(n, learner, env) {
  const e = env || {}; const fetch = e.fetch || fetchViaRoute();
  const ctx = makeEnv(Object.assign({ fetch }, e.over || {})); ctx.__store.rvAllowTyped = '0';
  R(ctx, 'rvLearner = ' + JSON.stringify(learner)); ctx.__items = official(n);
  const out = await R(ctx, 'rvAddExtras(__items)'); const items = Array.from(out.items);
  return { ctx, out, items, extras: items.filter(i => i.type === 'extra'), urls: fetch.calls };
}
const baseCap = (n) => n ? Math.min(6, Math.max(n >= 4 ? 1 : 0, Math.floor(n / 4))) : 6;

section('[2] Luồng phía người học: Nhận diện tụt lại → luyện thêm (qua route thật)');
test('Điều kiện tiên quyết: ca mẫu thật sự là Nhận diện tụt lại (và Nhận diện + Pinyin)', () => {
  assert.deepStrictEqual(TP.build(RECOG_LAG).priorities.map(p => p.skill), ['recognition']);
  assert.deepStrictEqual(TP.build(RECOG_AND_PINYIN_LAG).priorities.map(p => p.skill).sort(), ['pinyin', 'recognition']);
  assert.deepStrictEqual(TP.actionable(TP.build(RECOG_LAG), []).map(p => p.skill), ['recognition']);
});
test('Buổi 20 thẻ: trần 8; 5 câu Nhận diện (đúng allocate) + 3 từ hay sai; gọi skill=recognition rồi nhận từ thật từ route', async () => {
  const r = await runExtras(20, RECOG_LAG);
  assert.ok(r.urls.some(u => /skill=recognition&weakOnly=0&limit=8&allowListening=1/.test(u)), r.urls.join('\n'));
  assert.strictEqual(r.extras.length, 8);
  const plan = r.extras.filter(e => e.fromPlan); assert.strictEqual(plan.length, TP.allocate(TP.build(RECOG_LAG).priorities, 8).bySkill.recognition); assert.strictEqual(plan.length, 5);
  assert.ok(plan.every(e => e.targetSkill === 'recognition' && /^字1[5-6]\d$/.test(e.word.hz)));
  assert.ok(r.extras.filter(e => !e.fromPlan).every(e => /^字[6-8]\d$/.test(e.word.hz)), 'từ hay sai phải đến từ nguồn mixed');
});
test('Nhận diện KHÔNG cần giọng đọc: máy không có âm thanh vẫn luyện được (khác với Nghe)', async () => {
  const r = await runExtras(20, RECOG_LAG, { over: { skillAudioAvailable: () => false } });
  assert.ok(r.urls.some(u => /skill=recognition&weakOnly=0&limit=8&allowListening=0/.test(u))); assert.strictEqual(r.extras.filter(e => e.fromPlan).length, 5); assert.strictEqual(r.extras.length, 8);
});
test('Nhận diện + Pinyin cùng tụt lại: cả hai đường được gọi, chia hạn mức đúng TP.allocate, tổng ≤ 10', async () => {
  const r = await runExtras(25, RECOG_AND_PINYIN_LAG);
  const alloc = TP.allocate(TP.build(RECOG_AND_PINYIN_LAG).priorities, 10);
  assert.ok(r.urls.some(u => /skill=recognition&weakOnly=0/.test(u)) && r.urls.some(u => /skill=pinyin&weakOnly=0/.test(u)));
  for (const k of Object.keys(alloc.bySkill)) assert.strictEqual(r.extras.filter(e => e.fromPlan && e.targetSkill === k).length, alloc.bySkill[k], k);
  assert.ok(r.extras.length <= 10);
});
test('Máy chủ cũ (từ chối recognition, ok:false) → không văng lỗi; chỗ trống nhường cho "từ hay sai"; không có câu theo kế hoạch', async () => {
  const r = await runExtras(20, RECOG_LAG, { fetch: fetchViaRoute({ oldServer: true }) });
  assert.strictEqual(r.extras.length, 8); assert.ok(r.extras.every(e => !e.fromPlan)); assert.strictEqual(r.items.filter(i => i.type === 'review' || i.type === 'new').length, 20);
});
test('Không có kỹ năng tụt lại / người mới → KHÔNG gọi skill=recognition (không phát sinh lời gọi mới)', async () => {
  const NO_LAG = L({ recognition: cell(60, 48), recall: cell(60, 47), listening: cell(60, 46), pinyin: cell(60, 47), context: cell(60, 48) });
  for (const learner of [NO_LAG, null, { v: 1, skills: {} }]) {
    const r = await runExtras(20, learner); assert.ok(!r.urls.some(u => /skill=recognition/.test(u))); assert.strictEqual(r.urls.length, 1); assert.strictEqual(r.extras.length, baseCap(20));
  }
});
test('Thẻ FSRS chính thức giữ nguyên thứ tự/số lượng; câu Nhận diện luyện thêm không phải thẻ chính thức', async () => {
  const r = await runExtras(25, RECOG_LAG);
  const offs = r.items.filter(i => i.type === 'review' || i.type === 'new'); assert.deepStrictEqual(offs.map(i => i.word.hz), official(25).map(i => i.word.hz));
  r.ctx.__x = r.extras.find(e => e.fromPlan); assert.strictEqual(R(r.ctx, 'rvIsOfficial(__x)'), false);
});
test('Câu dựng được cho Nhận diện (hz2vi / py2vi / hz2hv), kèm lý do nêu đúng kỹ năng', () => {
  assert.deepStrictEqual(QE.MCQ_ORDER.concat(QE.PRACTICE_ORDER).filter(t => QE.TYPES[t].skill === 'recognition').sort(), ['hz2hv', 'hz2vi', 'py2vi']);
  const ctx = makeEnv({}); ctx.__it = { type: 'extra', word: POOL[150], targetSkill: 'recognition', fromPlan: true };
  const q = R(ctx, 'rvBuildQuestionFor(__it)');
  assert.ok(q && q.skill === 'recognition', 'skill=' + (q && q.skill)); assert.ok(q.why.includes('Nhận diện') && q.why.includes('Phân tích năng lực') && q.why.includes('không đổi lịch ôn'), q.why);
});

section('[3] Hiển thị');
test('Màn bắt đầu: "Luyện thêm theo kế hoạch: Nhận diện 5 câu"; màn Phân tích không còn câu "chưa có câu luyện thêm riêng"', async () => {
  const r = await runExtras(20, RECOG_LAG);
  R(r.ctx, 'rvQueue.items = ' + JSON.stringify(r.items) + '; rvStage = "start"; rvBlockedByBacklog = false; rvStartInfo = { lessons: [5], newCount: 5, reviewCount: 15, extraCount: ' + r.extras.length + ', estimated: 30 }');
  assert.ok(R(r.ctx, 'rvStartHtml()').includes('Luyện thêm theo kế hoạch: Nhận diện 5 câu'));
  const t = TP.describe(TP.build(RECOG_LAG)).lines.join(' ');
  assert.ok(/tối đa 40% số thẻ chính thức/.test(t) && !/chưa có câu luyện thêm riêng/.test(t) && !/giai đoạn sau/.test(t));
});
test('Không còn cơ chế "kỹ năng chưa hỗ trợ" trong module kế hoạch (không để lại mã chết)', () => {
  assert.ok(!('UNSUPPORTED_EXTRA' in TP)); assert.ok(!/UNSUPPORTED/.test(read('js/training-plan.js')) && !/UNSUPPORTED/.test(read('js/review.js')));
});

section('[4] Ranh giới');
test("Các nơi gọi cũ KHÔNG đổi: 'từ hay sai' vẫn gọi skill=mixed; tab Phân tích không bao giờ yêu cầu skill=recognition", () => {
  const rv = read('js/review.js'), ui = read('js/skills-ui.js');
  assert.ok(rv.includes('practice-words?skill=mixed&weakOnly=1&limit=${limit}&allowListening=${audio}') && rv.includes('practice-words?skill=recall&weakOnly=0&limit=${limit}'));
  assert.ok(!/skill=recognition/.test(ui) && !/'recognition'/.test(ui.split('\n').filter(l => /practice-words/.test(l)).join('\n')));
});
test('FSRS/lịch ôn không bị đụng: mã luyện thêm chỉ gọi practice-words (GET); không POST, không submitFsrsReview', () => {
  const src = read('js/review.js'); const body = (n) => { const s = src.indexOf('function ' + n + '('); return src.slice(s, src.indexOf('\n}\n', s)); };
  const add = body('rvAddExtras') + body('rvFetchSkillWords') + body('rvPlanPriorities');
  for (const bad of ['submitFsrsReviewAwaited', '/api/fsrs', '/api/study/', 'recordPractice', "method: 'POST'"]) assert.ok(!add.includes(bad), bad);
});

runAll();
