#!/usr/bin/env node
// test/v128-training-plan.test.js — V128 giai đoạn 1: "Kế hoạch ưu tiên theo năng lực" dùng chung cho màn bắt đầu của "Hôm nay học" và màn
// "Phân tích năng lực". Chạy: node test/v128-training-plan.test.js   (không cần DB/ts-fsrs/express)
//
// Kiểm tra: (1) công thức thuần: thiếu mẫu/không có tham chiếu → không kết luận; ngưỡng; trùng khớp 100% với QS.learnerGap (nguồn sự thật duy nhất)
// (2) màn bắt đầu của Hôm nay học (vm, nạp NGUYÊN review.js) (3) màn Phân tích (vm, nạp NGUYÊN skills-ui + skills-analysis): hiển thị, thoát HTML,
// lỗi tải phần phụ không làm mất khối khác (4) route máy chủ mới CHỈ ĐỌC, cùng cửa sổ 90/14 ngày với phiên học (5) ranh giới giai đoạn 1: CHỈ HIỂN THỊ —
// bộ chọn câu hỏi, hàng đợi, FSRS không gọi TP.
// KHÔNG thay cho thử trên trình duyệt thật và trên Postgres thật.
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
global.QE = require('../js/question-engine.js');
const QS = require('../js/question-selector.js');
const TP = require('../js/training-plan.js');
const W = QS.WEIGHTS;

const cell = (cn, cok, tn, tok, rcn, rcok, rtn, rtok) => ({ c: { n: cn, ok: cok }, t: { n: tn || 0, ok: tok || 0 }, rc: { n: rcn || 0, ok: rcok || 0 }, rt: { n: rtn || 0, ok: rtok || 0 } });
const L = (skills) => ({ v: 1, skills });
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// Người học mẫu: nghe tụt lại rõ so với các kỹ năng khác.
const LISTEN_BEHIND = L({ recognition: cell(80, 72), recall: cell(60, 45), listening: cell(60, 30), pinyin: cell(50, 40), context: cell(5, 3) });

section('[1] Công thức thuần (js/training-plan.js)');
test('Không có số liệu (null / sai kiểu) → status none, không có gì để hiển thị', () => {
  for (const bad of [null, undefined, 0, 'x', [], {}, { v: 1 }, { v: 1, skills: 5 }]) {
    const p = TP.build(bad); assert.strictEqual(p.status, 'none'); assert.deepStrictEqual(p.priorities, []);
    const d = TP.describe(p); assert.strictEqual(d.headline, null); assert.deepStrictEqual(d.lines, []);
  }
});
test('Người mới { v:1, skills:{} } → "chưa đủ dữ liệu", cần bao nhiêu lượt được nêu rõ, KHÔNG kết luận yếu', () => {
  const p = TP.build(L({})); assert.strictEqual(p.status, 'insufficient'); assert.deepStrictEqual(p.priorities, []);
  for (const k of TP.SKILLS) { assert.strictEqual(p.skills[k].level, 'insufficient'); assert.strictEqual(p.skills[k].need, W.learnerGapMinN); }
  const d = TP.describe(p); assert.ok(/Chưa đủ dữ liệu/.test(d.headline)); assert.ok(d.rows.every(r => /0\/30 lượt/.test(r.text)));
});
test('Ngưỡng mẫu: 29 lượt → chưa đủ (cần thêm 1); 30 lượt mới được so sánh', () => {
  const base = { recognition: cell(80, 72), recall: cell(60, 45), pinyin: cell(50, 40) };
  const p29 = TP.build(L(Object.assign({ listening: cell(W.learnerGapMinN - 1, 5) }, base)));
  assert.strictEqual(p29.skills.listening.level, 'insufficient'); assert.strictEqual(p29.skills.listening.need, 1);
  assert.ok(!p29.priorities.some(x => x.skill === 'listening'));
  const p30 = TP.build(L(Object.assign({ listening: cell(W.learnerGapMinN, 5) }, base)));
  assert.strictEqual(p30.skills.listening.level, 'behind'); assert.ok(p30.priorities.some(x => x.skill === 'listening'));
});
test('Chỉ có MỘT kỹ năng đủ mẫu → "no-reference": không bịa mức tham chiếu, không ưu tiên gì', () => {
  const p = TP.build(L({ recognition: cell(100, 90), listening: cell(10, 3) }));
  assert.strictEqual(p.skills.recognition.level, 'no-reference'); assert.strictEqual(p.status, 'insufficient'); assert.deepStrictEqual(p.priorities, []);
  assert.ok(/chưa có kỹ năng nào khác đủ lượt/.test(TP.describe(p).rows[0].text));
});
test('Nghe tụt lại → là kỹ năng ưu tiên; số % là mức ĐÃ TRỪ ĐOÁN MÒ (không phải tỉ lệ đúng thô)', () => {
  const p = TP.build(LISTEN_BEHIND); assert.strictEqual(p.status, 'ok');
  assert.deepStrictEqual(p.priorities.map(x => x.skill), ['listening']);
  const raw = 30 / 60, corrected = Math.round(Math.max(0, (((30 + 1) / (60 + 2)) - 0.25) / 0.75) * 100);
  assert.notStrictEqual(corrected, Math.round(raw * 100));
  const d = TP.describe(p); assert.ok(d.lines[0].startsWith('Nghe: ' + corrected + '%'), d.lines[0]);
});
test('Tối đa 2 kỹ năng ưu tiên, kỹ năng chênh nhiều nhất đứng trước', () => {
  const p = TP.build(L({ recognition: cell(90, 85), recall: cell(80, 70), listening: cell(60, 25), pinyin: cell(60, 33), context: cell(60, 40) }));
  assert.ok(p.priorities.length <= TP.MAX_PRIORITIES);
  for (let i = 1; i < p.priorities.length; i++) assert.ok(p.priorities[i - 1].gap >= p.priorities[i].gap);
});
test('Không kỹ năng nào tụt lại → nói rõ "chưa thấy kỹ năng nào tụt lại", không bịa ưu tiên', () => {
  const p = TP.build(L({ recognition: cell(60, 48), recall: cell(60, 47), listening: cell(60, 46), pinyin: cell(60, 47), context: cell(60, 48) }));
  assert.strictEqual(p.status, 'ok'); assert.deepStrictEqual(p.priorities, []);
  assert.ok(/chưa thấy kỹ năng nào tụt lại/.test(TP.describe(p).headline));
});
test('NGUỒN SỰ THẬT DUY NHẤT: 400 người học ngẫu nhiên — tập kỹ năng "behind" và độ chênh trùng QS.learnerGap 100%', () => {
  const r = rng(128); let withGap = 0;
  for (let t = 0; t < 400; t++) {
    const sk = {};
    for (const k of TP.SKILLS) if (r() < 0.85) { const n = Math.floor(r() * 120), ok = Math.floor(n * (0.2 + r() * 0.75)); sk[k] = cell(n, ok, Math.floor(r() * 30), 0); sk[k].t.ok = Math.floor(sk[k].t.n * r()); }
    const learner = L(sk), p = TP.build(learner);
    const expected = TP.SKILLS.filter(k => QS.learnerGap(learner, k));
    const got = TP.SKILLS.filter(k => p.skills[k].level === 'behind');
    assert.deepStrictEqual(got, expected, 'lệch ở người học #' + t);
    for (const k of got) assert.strictEqual(p.skills[k].gap, QS.learnerGap(learner, k).gap);
    if (got.length) withGap++;
  }
  assert.ok(withGap > 20, 'mô phỏng phải có đủ ca "tụt lại" để phép so sánh có ý nghĩa: ' + withGap);
});
test('Dữ liệu hỏng (chuỗi, NaN, âm, thiếu trường) không làm văng lỗi', () => {
  const bad = L({ recognition: { c: { n: 'abc', ok: NaN } }, recall: { c: null }, listening: null, pinyin: { c: { n: -5, ok: 99 } }, context: {} });
  const p = TP.build(bad); assert.ok(['none', 'insufficient', 'ok'].includes(p.status)); TP.describe(p);
  TP.describe(null); TP.describe(undefined); TP.describe({ status: 'ok', priorities: [], skills: {}, minN: 30 });
});
test('Câu thăm dò tự gõ: probe = QS.recallProbeNeeded; tắt khi người học tắt câu tự gõ', () => {
  const learner = L({ recognition: cell(80, 78), recall: cell(60, 54, 5, 3), listening: cell(60, 40), pinyin: cell(50, 35), context: cell(5, 3) });
  assert.strictEqual(QS.recallProbeNeeded(learner), true);
  assert.strictEqual(TP.build(learner).probe, true);
  assert.strictEqual(TP.build(learner, { typedEnabled: false }).probe, false);
  assert.strictEqual(TP.build(LISTEN_BEHIND).probe, QS.recallProbeNeeded(LISTEN_BEHIND));
});
test('describe: probeCount thật được nêu chính xác (0 → không nêu; >0 → nêu số; không truyền → nêu điều kiện chung)', () => {
  const learner = L({ recognition: cell(80, 78), recall: cell(60, 54, 5, 3), listening: cell(60, 40), pinyin: cell(50, 35), context: cell(5, 3) });
  const p = TP.build(learner);
  assert.ok(!TP.describe(p, { probeCount: 0 }).lines.some(l => /tự gõ/.test(l)));
  assert.ok(TP.describe(p, { probeCount: 2 }).lines.some(l => /Buổi này có 2 câu tự gõ/.test(l)));
  assert.ok(TP.describe(p).lines.some(l => /8 thẻ chính thức/.test(l)));
});
test('Chuỗi trả về là văn bản thuần (không HTML) — nơi hiển thị chịu trách nhiệm thoát', () => {
  const d = TP.describe(TP.build(LISTEN_BEHIND));
  for (const s of [d.headline, d.note, ...d.lines, ...d.rows.map(r => r.text)]) assert.ok(!/[<>]/.test(s), s);
});
test('Module thuần: không dùng DOM / mạng / lưu trữ trình duyệt', () => {
  const src = read('js/training-plan.js').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  for (const bad of ['document.', 'window.', 'fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'innerHTML', 'require(\'fs\')', 'require("fs")']) assert.ok(!src.includes(bad), 'không được dùng ' + bad);
});

// ── vm: nạp NGUYÊN file giao diện ────────────────────────────────────────────────────────────────
const POOL = [
  { hz: '认真', py: 'rènzhēn', vi: 'nghiêm túc', l: 5 }, { hz: '准备', py: 'zhǔnbèi', vi: 'chuẩn bị', l: 5 }, { hz: '参加', py: 'cānjiā', vi: 'tham gia', l: 5 },
  { hz: '发现', py: 'fāxiàn', vi: 'phát hiện', l: 5 }, { hz: '学习', py: 'xuéxí', vi: 'học tập', l: 1 }, { hz: '休息', py: 'xiūxi', vi: 'nghỉ ngơi', l: 1 },
];
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function makeEnv(over, files) {
  const ctx = Object.assign({
    console, Math, Date, JSON, Set, Map, Array, Object, String, Number, Promise, Error, setTimeout: () => 0, clearInterval() {}, setInterval: () => 0, clearTimeout() {},
    document: { createElement: () => ({ style: {}, appendChild() {}, set textContent(v) {} }), head: { appendChild() {} }, getElementById: () => null, querySelectorAll: () => [] },
    localStorage: { _m: {}, getItem(k) { return k in this._m ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); } },
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
  for (const f of files) vm.runInContext(read(f), ctx);
  return ctx;
}
const R = (ctx, code) => vm.runInContext(code, ctx);
const BASE_FILES = ['js/answer-match.js', 'js/skill-score.js', 'js/session-summary.js', 'js/question-engine.js', 'js/question-selector.js'];
const rvEnv = (withTP = true, over) => makeEnv(over, BASE_FILES.concat(withTP ? ['js/training-plan.js'] : [], ['js/review.js']));
// Dấu hiệu của khối kế hoạch (KHÔNG dùng 🎯: nút "🎯 Chỉ luyện từ hay sai" của màn bắt đầu cũng có emoji này).
const NO_PLAN = /Theo phân tích năng lực|Chưa đủ dữ liệu để biết kỹ năng/;
const START = "rvStage = 'start'; rvBlockedByBacklog = false; rvStartInfo = { lessons: [5], newCount: 4, reviewCount: 6, extraCount: 2, estimated: 16 };";

section('[2] Màn bắt đầu của "Hôm nay học" (nạp NGUYÊN review.js)');
test('Có số liệu: màn bắt đầu nêu kỹ năng ưu tiên (Nghe) + phần giải thích; các nút cũ vẫn còn', () => {
  const ctx = rvEnv(); R(ctx, START); R(ctx, 'rvLearner = ' + JSON.stringify(LISTEN_BEHIND));
  const h = R(ctx, 'rvStartHtml()');
  assert.ok(h.includes('Theo phân tích năng lực, kỹ năng nên ưu tiên hôm nay') && h.includes('Nghe: '), h);
  assert.ok(h.includes('rvBeginSession()') && h.includes('Từ mới') && h.includes('Thẻ đến hạn ôn (FSRS)'));
});
test('Không có số liệu (rvLearner = null: người mới / mất mạng / phiên lưu từ V126) → không hiện khối kế hoạch, màn bắt đầu như cũ', () => {
  const ctx = rvEnv(); R(ctx, START); R(ctx, 'rvLearner = null');
  const h = R(ctx, 'rvStartHtml()'); assert.ok(!NO_PLAN.test(h) && h.includes('rvBeginSession()'));
});
test('Người mới (learner rỗng) → nói thật "chưa đủ dữ liệu", không bịa kỹ năng yếu', () => {
  const ctx = rvEnv(); R(ctx, START); R(ctx, 'rvLearner = { v: 1, skills: {} }');
  const h = R(ctx, 'rvStartHtml()'); assert.ok(h.includes('Chưa đủ dữ liệu để biết kỹ năng nào cần ưu tiên') && !h.includes('nên ưu tiên hôm nay'));
});
test('Số câu thăm dò tự gõ nêu đúng số THẬT trong hàng đợi (probe:"typed")', () => {
  const ctx = rvEnv(); R(ctx, START);
  R(ctx, 'rvLearner = ' + JSON.stringify(L({ recognition: cell(80, 78), recall: cell(60, 54, 5, 3), listening: cell(60, 40), pinyin: cell(50, 35), context: cell(5, 3) })));
  R(ctx, "rvQueue.items = [{ type: 'extra', probe: 'typed' }, { type: 'extra', probe: 'typed' }, { type: 'extra' }]");
  assert.ok(R(ctx, 'rvStartHtml()').includes('Buổi này có 2 câu tự gõ'));
  R(ctx, "rvQueue.items = [{ type: 'extra' }]");
  assert.ok(!R(ctx, 'rvStartHtml()').includes('Buổi này có'));
});
test('Thiếu module training-plan.js (nạp lỗi/bản cũ) → màn bắt đầu vẫn hiện bình thường, không văng lỗi', () => {
  const ctx = rvEnv(false); R(ctx, START); R(ctx, 'rvLearner = ' + JSON.stringify(LISTEN_BEHIND));
  const h = R(ctx, 'rvStartHtml()'); assert.ok(!NO_PLAN.test(h) && h.includes('rvBeginSession()'));
});
test('Module hỏng giữa chừng (TP ném lỗi) → bị nuốt, không chặn màn bắt đầu', () => {
  const ctx = rvEnv(); R(ctx, START); R(ctx, 'rvLearner = ' + JSON.stringify(LISTEN_BEHIND)); R(ctx, 'TP.build = () => { throw new Error("boom"); }');
  const h = R(ctx, 'rvStartHtml()'); assert.ok(!NO_PLAN.test(h) && h.includes('rvBeginSession()'));
});

test('Thoát HTML ở màn bắt đầu: chuỗi lạ do module trả về không thành thẻ HTML', () => {
  const ctx = rvEnv(); R(ctx, START); R(ctx, 'rvLearner = ' + JSON.stringify(LISTEN_BEHIND));
  R(ctx, 'TP.describe = () => ({ status: "ok", headline: "<img src=x onerror=alert(1)>", lines: ["<b>x</b>"], rows: [], note: "" })');
  const h = R(ctx, 'rvStartHtml()'); assert.ok(!h.includes('<img src=x') && !h.includes('<b>x</b>') && h.includes('&lt;img src=x'));
});

section('[3] Màn "Phân tích năng lực" (nạp NGUYÊN skills-ui + skills-analysis)');
const skFiles = BASE_FILES.concat(['js/training-plan.js', 'js/skills-ui.js', 'js/skills-analysis.js']);
const skEnv = (over) => makeEnv(Object.assign({ currentTab: 'skills', rvTypedEnabled: () => true }, over), skFiles);
test('Có số liệu: khối "Kế hoạch ưu tiên hôm nay" hiện đủ 5 kỹ năng, nêu đúng kỹ năng ưu tiên', () => {
  const ctx = skEnv(); R(ctx, 'saState.learner = ' + JSON.stringify(LISTEN_BEHIND));
  const h = R(ctx, 'saRenderPlan()');
  assert.ok(h.includes('Kế hoạch ưu tiên hôm nay') && h.includes('kỹ năng nên ưu tiên hôm nay') && h.includes('Nghe: '));
  for (const lbl of ['Nhận diện', 'Nhớ chủ động', 'Nghe', 'Pinyin', 'Từ trong câu']) assert.ok(h.includes(lbl), lbl);
  assert.ok(h.includes('Chưa đủ để so sánh (5/30 lượt)') && h.includes('đã trừ xác suất đoán mò'));
});
test('Thoát HTML ở màn phân tích: chuỗi lạ do module trả về không thành thẻ HTML', () => {
  const ctx = skEnv(); R(ctx, 'saState.learner = ' + JSON.stringify(LISTEN_BEHIND));
  R(ctx, 'TP.describe = () => ({ status: "ok", headline: "<img src=x onerror=alert(1)>", lines: ["<b>x</b>"], rows: [{ label: "<i>L</i>", level: "ok", text: "<script>1</script>" }], note: "<u>n</u>" })');
  const h = R(ctx, 'saRenderPlan()');
  for (const bad of ['<img src=x', '<b>x</b>', '<i>L</i>', '<script>1', '<u>n</u>']) assert.ok(!h.includes(bad), bad);
  assert.ok(h.includes('&lt;img src=x') && h.includes('&lt;script&gt;1'));
});
test('Chưa có số liệu → khối kế hoạch không hiện (không báo lỗi, không vẽ khối rỗng)', () => {
  const ctx = skEnv(); assert.strictEqual(R(ctx, 'saRenderPlan()'), '');
});
test('Khối kế hoạch nằm ĐẦU màn phân tích, trước "Gợi ý cho bạn"; chuỗi render cũ giữ nguyên thứ tự', () => {
  const s = read('js/skills-ui.js');
  assert.ok(/saRenderPlan\(\) \+ saRenderRecs\(\) \+ saRenderPooled\(\) \+ skRenderOverview\(\)/.test(s));
});
test('Tải số liệu phụ lỗi (máy chủ cũ/mạng) KHÔNG làm mất các khối khác; thành công thì có số liệu', async () => {
  const mk = (learnerOk) => (async (url) => {
    if (/\/api\/skills\/learner/.test(url)) { if (!learnerOk) throw new Error('404'); return { json: async () => ({ ok: true, learner: LISTEN_BEHIND }) }; }
    return { json: async () => ({ ok: true, items: [], notes: [], buckets: {}, windowDays: 90 }) };
  });
  const a = skEnv({ fetch: mk(false) }); await R(a, 'saLoadExtras()');
  assert.ok(R(a, 'saState.recs') && R(a, 'saState.retention')); assert.strictEqual(R(a, 'saState.learner'), null); assert.strictEqual(R(a, 'saState.error'), null);
  const b = skEnv({ fetch: mk(true) }); await R(b, 'saLoadExtras()');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(R(b, 'saState.learner'))), LISTEN_BEHIND);
});
test('saResetState xoá cả số liệu kế hoạch (đổi tài khoản không dính số liệu người cũ)', () => {
  const ctx = skEnv(); R(ctx, 'saState.learner = ' + JSON.stringify(LISTEN_BEHIND)); R(ctx, 'saResetState()');
  assert.strictEqual(R(ctx, 'saState.learner'), null);
});

section('[4] Route máy chủ mới /api/skills/learner (kiểm tra tĩnh — chưa chạy được trên Postgres thật)');
const api = read('api/index.js');
const routeStart = api.indexOf("app.get('/api/skills/learner'");
const routeSrc = routeStart < 0 ? '' : api.slice(routeStart, api.indexOf('\n});', routeStart) + 4);
test('Route tồn tại, bắt buộc đăng nhập, dùng đúng 2 cửa sổ 90 và 14 ngày + learnerCounts như phiên học', () => {
  assert.ok(routeSrc, 'thiếu route');
  assert.ok(/requireAuth\(req, res\)/.test(routeSrc) && /getTypeBreakdown\(authed\.username, \{ days: 90 \}\)/.test(routeSrc) && /getTypeBreakdown\(authed\.username, \{ days: 14 \}\)/.test(routeSrc));
  assert.ok(/skillPooled\.learnerCounts\(long, recent \|\| \[\]\)/.test(routeSrc));
  const rs = read('lib/fsrs/reviewService.js');
  assert.ok(/getTypeBreakdown\(userId, \{ days: 90 \}\)/.test(rs) && /getTypeBreakdown\(userId, \{ days: 14 \}\)/.test(rs) && /learnerCounts\(learnerLong, learnerRecent \|\| \[\]\)/.test(rs), 'phiên học phải dùng cùng cửa sổ');
});
test('Route CHỈ ĐỌC: không ghi DB, không gọi hàm ôn FSRS/ghi luyện tập', () => {
  assert.ok(!/\b(INSERT|UPDATE|DELETE)\b/i.test(routeSrc));
  for (const bad of ['reviewFsrsCard', 'recordPractice', 'submitReview', 'pool.query', 'client.query', 'saveProgress', 'setUserSettings']) assert.ok(!routeSrc.includes(bad), bad);
});
test('Cửa sổ dài lỗi → trả lỗi (không bịa số liệu); cửa sổ gần đây lỗi → vẫn dùng cửa sổ dài', () => {
  assert.ok(/fail\(res, e\)/.test(routeSrc));
  assert.ok(/getTypeBreakdown\(authed\.username, \{ days: 14 \}\)\.catch\(\(\) => null\)/.test(routeSrc));
  assert.ok(!/getTypeBreakdown\(authed\.username, \{ days: 90 \}\)\.catch/.test(routeSrc));
});

section('[5] Ranh giới: thẻ FSRS/bộ chọn không đụng TP (giai đoạn 1 chỉ hiển thị; giai đoạn 2 chỉ đổi phần luyện thêm)');
test('index.html nạp training-plan.js SAU question-selector.js và TRƯỚC review.js / skills-analysis.js', () => {
  const h = read('index.html'); const i = (n) => h.indexOf('/js/' + n);
  assert.ok(i('training-plan.js') > i('question-selector.js') && i('training-plan.js') < i('review.js') && i('training-plan.js') < i('skills-analysis.js'));
});
test('Bộ chọn câu hỏi, hàng đợi, FSRS và máy chủ KHÔNG gọi TP (không đổi lịch ôn)', () => {
  for (const f of ['js/question-selector.js', 'js/question-engine.js', 'js/study-queue.js', 'js/skill-score.js', 'lib/fsrs.js', 'lib/fsrs-auto-rating.js', 'lib/fsrs/scheduler.js', 'lib/fsrs/reviewService.js', 'lib/db.js', 'lib/skill-store.js']) {
    assert.ok(!/\bTP\b/.test(read(f)), f + ' không được dùng TP');
  }
});
test('Trong review.js, TP chỉ nằm ở phần hiển thị, chọn câu LUYỆN THÊM (giai đoạn 2) và thích ứng giữa buổi (giai đoạn 3); không đụng tới thẻ FSRS chính thức', () => {
  const src = read('js/review.js');
  const body = (name) => { const s = src.indexOf('function ' + name + '('); assert.ok(s >= 0, name); const e = src.indexOf('\n}\n', s); return src.slice(s, e); };
  for (const fn of ['rvBuildQuestionFor', 'rvAdvanceQueue', 'rvFetchFreshSession', 'rvInsertMatch', 'rvBuildStartInfo']) assert.ok(!/\bTP\b/.test(body(fn)), fn);
  const uses = src.split('\n').filter(l => /\bTP\./.test(l) && !/^\s*\/\//.test(l));
  assert.ok(uses.length && uses.every(l => /TP\.(describe|build|actionable|extraCap|allocate|applyAnswer|adaptExtras|describeAdapt)/.test(l)));
  assert.strictEqual((src.match(/rvPlanHtml\(\)/g) || []).length, 2, 'chỉ định nghĩa + 1 chỗ gọi trong rvStartHtml');
});
test('package.json: có script test:v128 và được nối vào test:v110', () => {
  const p = JSON.parse(read('package.json'));
  assert.strictEqual(p.scripts['test:v128'], 'node test/v128-training-plan.test.js'); assert.ok(/test:v127 && npm run test:v128/.test(p.scripts['test:v110']));
});

runAll();
