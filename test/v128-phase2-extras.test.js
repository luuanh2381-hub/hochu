#!/usr/bin/env node
// test/v128-phase2-extras.test.js — V128 giai đoạn 2: "Hôm nay học" dùng kế hoạch năng lực để quyết định SỐ câu và TỪ của phần LUYỆN THÊM.
// Chạy: node test/v128-phase2-extras.test.js   (không cần DB/ts-fsrs/express)
//
// Kiểm tra: (1) hàm thuần extraCap/allocate (2) rvAddExtras chạy NGUYÊN trong vm với máy chủ giả: trần 40%/≤10 chỉ khi có kỹ năng tụt lại ĐÁNG TIN;
// không có bằng chứng → y như V127 (25%/≤6, 1 lần gọi máy chủ); đúng hạn mức từng kỹ năng; không trùng từ/không chen từ đã đúng hôm nay; thẻ chính thức
// giữ nguyên thứ tự; lỗi/thiếu ứng viên → nhường cho "từ hay sai"; câu thăm dò tự gõ vẫn ≤ 2 (3) lời giải thích trong câu hỏi + màn bắt đầu + màn phân tích
// (4) ranh giới: không đụng FSRS/máy chủ. (Giai đoạn 4 — luyện thêm Nhận diện — có file test riêng: v128-phase4-recognition.test.js.)
// KHÔNG thay cho thử trên trình duyệt thật / Postgres thật.
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

const cell = (cn, cok, tn, tok) => ({ c: { n: cn, ok: cok }, t: { n: tn || 0, ok: tok || 0 }, rc: { n: 0, ok: 0 }, rt: { n: 0, ok: 0 } });
const L = (skills) => ({ v: 1, skills });
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// Người học mẫu
const NO_LAG = L({ recognition: cell(60, 48), recall: cell(60, 47), listening: cell(60, 46), pinyin: cell(60, 47), context: cell(60, 48) });
const LISTEN_LAG = L({ recognition: cell(80, 72), recall: cell(60, 45), listening: cell(60, 30), pinyin: cell(50, 40), context: cell(5, 3) });
const TWO_LAG = L({ recognition: cell(90, 85), recall: cell(80, 70), listening: cell(60, 25), pinyin: cell(60, 33), context: cell(60, 50) });
const RECOG_LAG = L({ recognition: cell(60, 25), recall: cell(80, 72), listening: cell(60, 50), pinyin: cell(60, 48), context: cell(40, 30) });
const PROBE_AND_LISTEN_LAG = L({ recognition: cell(80, 78), recall: cell(60, 54, 5, 3), listening: cell(60, 25), pinyin: cell(50, 38), context: cell(5, 3) });

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
  ctx.__store = store;
  return ctx;
}
const R = (ctx, code) => vm.runInContext(code, ctx);

// Máy chủ giả cho /api/skills/practice-words: mỗi nguồn (mixed / từng kỹ năng / recall-probe) có dải từ RIÊNG → biết chính xác từ nào đến từ đâu.
// Thẻ chính thức dùng 字0..字49 (buổi ≤ 50 thẻ). mixed: 字60..字89 (skill: 'pinyin'); listening: 字90..109; pinyin: 字110..129; recall: 字130..149; recognition: 字150..169; kỹ năng khác: rỗng. (oldServer: mô phỏng máy chủ V127 từ chối recognition.)
function mkFetch(opts) {
  const o = Object.assign({ perSkill: {}, failSkills: [], mixed: null }, opts || {});
  const calls = [];
  const range = (a, b, skill) => Array.from({ length: b - a }, (_, i) => ({ hz: '字' + (a + i), l: 1 + ((a + i) % 5), skill, score: skill === 'recall' ? null : 0.2 }));
  const f = async (url) => {
    calls.push(url);
    const q = Object.fromEntries(new URLSearchParams(url.split('?')[1]));
    const skill = q.skill, lim = Number(q.limit);
    if (o.failSkills.includes(skill)) throw new Error('mạng lỗi');
    let words;
    if (skill === 'mixed') words = o.mixed || range(60, 90, 'pinyin');
    else if (skill === 'recognition' && o.oldServer) return { json: async () => ({ ok: false, error: 'Dạng luyện này hiện chưa khả dụng' }) }; // máy chủ V127
    else if (skill === 'recognition') words = o.perSkill.recognition || range(150, 170, 'recognition'); // máy chủ V128 giai đoạn 4
    else if (skill === 'listening' && q.allowListening !== '1') return { json: async () => ({ ok: false, error: 'Dạng luyện này hiện chưa khả dụng' }) };
    else if (o.perSkill[skill]) words = o.perSkill[skill];
    else words = { listening: range(90, 110, 'listening'), pinyin: range(110, 130, 'pinyin'), recall: range(130, 150, 'recall'), context: [] }[skill] || [];
    return { json: async () => ({ ok: true, words: words.slice(0, lim) }) };
  };
  f.calls = calls; return f;
}
const official = (n) => Array.from({ length: n }, (_, i) => ({ type: i % 4 === 0 ? 'new' : 'review', word: POOL[i] }));
// Chạy rvAddExtras trong vm; trả { out, extras, urls }.
async function runExtras(n, learner, env) {
  const e = env || {};
  const fetch = e.fetch || mkFetch();
  const ctx = makeEnv(Object.assign({ fetch }, e.over || {}));
  if (e.noTyped !== false) ctx.__store.rvAllowTyped = '0'; // mặc định tắt tự gõ → không có câu thăm dò, dễ đếm; ca thăm dò bật riêng
  R(ctx, 'rvLearner = ' + JSON.stringify(learner));
  if (e.known) for (const h of e.known) ctx.sessionKnownHz.add(h);
  ctx.__items = official(n);
  const out = await R(ctx, 'rvAddExtras(__items)');
  const items = Array.from(out.items);
  return { ctx, out, items, extras: items.filter(i => i.type === 'extra'), urls: fetch.calls, fetch };
}
const hzs = (xs) => xs.map(x => x.word.hz);
const baseCap = (n) => n ? Math.min(6, Math.max(n >= 4 ? 1 : 0, Math.floor(n / 4))) : 6; // công thức V127

section('[1] Hàm thuần extraCap / allocate (js/training-plan.js)');
const PRI = [{ skill: 'listening', gap: 0.3 }];
test('extraCap: nâng lên 40% số thẻ, tối đa 10 — chỉ khi có kỹ năng tụt lại và buổi có ≥ 4 thẻ', () => {
  const table = { 4: 1, 8: 3, 10: 4, 16: 6, 20: 8, 25: 10, 30: 10, 60: 10 };
  for (const [n, want] of Object.entries(table)) assert.strictEqual(TP.extraCap(+n, baseCap(+n), PRI), want, 'N=' + n);
  assert.strictEqual(TP.extraCap(20, 5, []), 5); assert.strictEqual(TP.extraCap(20, 5, null), 5); assert.strictEqual(TP.extraCap(3, 0, PRI), 0);
});
test('extraCap (400 ca ngẫu nhiên): không bao giờ thấp hơn trần cũ, không quá max(trần cũ, 10), không tăng nếu không có bằng chứng', () => {
  const r = rng(1282);
  for (let t = 0; t < 400; t++) {
    const n = Math.floor(r() * 80), b = baseCap(n), has = r() < 0.6;
    const c = TP.extraCap(n, b, has ? PRI : []);
    assert.ok(c >= b && c <= Math.max(b, 10), `N=${n} base=${b} → ${c}`);
    if (!has || n < 4) assert.strictEqual(c, b);
    else assert.ok(c <= Math.max(b, Math.floor(n * 0.4)));
  }
});
test('allocate: tổng chỗ = planSlots ≤ slots; ≥ 1 chỗ nếu có chỗ; 2 kỹ năng đều ≥ 1 khi planSlots ≥ 2; kỹ năng chênh nhiều được nhiều chỗ hơn', () => {
  const r = rng(77);
  for (let t = 0; t < 400; t++) {
    const slots = Math.floor(r() * 14), two = r() < 0.5;
    const pri = [{ skill: 'listening', gap: 0.15 + r() * 0.5 }].concat(two ? [{ skill: 'pinyin', gap: 0.15 + r() * 0.5 }] : []);
    const a = TP.allocate(pri, slots), sum = Object.values(a.bySkill).reduce((x, y) => x + y, 0);
    assert.strictEqual(sum, a.planSlots); assert.ok(a.planSlots <= slots);
    if (slots >= 1) assert.ok(a.planSlots >= 1 && a.planSlots <= Math.ceil(slots * TP.PLAN_SHARE) + 0);
    else assert.strictEqual(a.planSlots, 0);
    if (two && a.planSlots >= 2) for (const k of ['listening', 'pinyin']) assert.ok(a.bySkill[k] >= 1);
    if (two && a.planSlots >= 3 && pri[0].gap > pri[1].gap * 3) assert.ok(a.bySkill.listening >= a.bySkill.pinyin);
  }
  assert.deepStrictEqual(TP.allocate([], 5), { planSlots: 0, bySkill: {} }); assert.deepStrictEqual(TP.allocate(PRI, 0), { planSlots: 0, bySkill: {} });
});
test('actionable: chỉ bỏ kỹ năng bị loại vì hoàn cảnh (vd. Nghe khi không có giọng đọc); Nhận diện nay luyện thêm được', () => {
  const plan = TP.build(TWO_LAG); assert.deepStrictEqual(plan.priorities.map(p => p.skill).sort(), ['listening', 'pinyin']);
  assert.deepStrictEqual(TP.actionable(plan, ['listening']).map(p => p.skill), ['pinyin']);
  assert.deepStrictEqual(TP.actionable(TP.build(RECOG_LAG), []).map(p => p.skill), ['recognition']);
  assert.deepStrictEqual(TP.actionable(TP.build(NO_LAG), []), []); assert.deepStrictEqual(TP.actionable(null, []), []);
});

section('[2] rvAddExtras (nạp NGUYÊN review.js, máy chủ giả)');
test('Điều kiện tiên quyết của các ca mẫu (nếu đổi ngưỡng V127 thì test báo ở đây, không báo sai ở chỗ khác)', () => {
  assert.deepStrictEqual(TP.build(NO_LAG).priorities, []);
  assert.deepStrictEqual(TP.build(LISTEN_LAG).priorities.map(p => p.skill), ['listening']);
  assert.deepStrictEqual(TP.build(RECOG_LAG).priorities.map(p => p.skill), ['recognition']);
  assert.ok(QS.recallProbeNeeded(PROBE_AND_LISTEN_LAG) && TP.build(PROBE_AND_LISTEN_LAG).priorities.some(p => p.skill === 'listening'));
});
test('KHÔNG có kỹ năng tụt lại (hoặc không có số liệu) → y như V127: 1 lần gọi máy chủ, trần 25%/≤6, không câu theo kế hoạch', async () => {
  for (const learner of [NO_LAG, null, { v: 1, skills: {} }]) {
    for (const n of [8, 20, 40]) {
      const r = await runExtras(n, learner);
      assert.strictEqual(r.urls.length, 1, 'N=' + n); assert.ok(/skill=mixed&weakOnly=1&limit=/.test(r.urls[0]));
      assert.ok(r.urls[0].includes('limit=' + (baseCap(n) + 3)));
      assert.strictEqual(r.extras.length, baseCap(n)); assert.ok(r.extras.every(e => !e.fromPlan));
    }
  }
});
test('Nghe tụt lại, buổi 20 thẻ: trần nâng lên 8; 5 chỗ cho Nghe (đúng allocate), 3 chỗ "từ hay sai"; gọi đúng đường lấy từ theo kỹ năng', async () => {
  const r = await runExtras(20, LISTEN_LAG);
  assert.strictEqual(r.extras.length, 8);
  const plan = r.extras.filter(e => e.fromPlan);
  assert.strictEqual(plan.length, TP.allocate(TP.build(LISTEN_LAG).priorities, 8).bySkill.listening); assert.strictEqual(plan.length, 5);
  assert.ok(plan.every(e => e.targetSkill === 'listening'));
  assert.ok(r.urls.some(u => /skill=listening&weakOnly=0&limit=8&allowListening=1/.test(u)), r.urls.join('\n'));
  assert.ok(r.urls.some(u => u.includes('skill=mixed&weakOnly=1&limit=11')));
  const wk = r.extras.filter(e => !e.fromPlan); assert.strictEqual(wk.length, 3);
});
test('Trần theo cỡ buổi: 25 thẻ → 10 câu; 8 thẻ → 3; 4 thẻ → 1; 3 thẻ → không có câu nào và KHÔNG gọi máy chủ', async () => {
  for (const [n, want] of [[25, 10], [40, 10], [8, 3], [4, 1]]) assert.strictEqual((await runExtras(n, LISTEN_LAG)).extras.length, want, 'N=' + n);
  const r3 = await runExtras(3, LISTEN_LAG); assert.strictEqual(r3.extras.length, 0); assert.strictEqual(r3.urls.length, 0);
});
test('Thẻ FSRS chính thức giữ NGUYÊN thứ tự và số lượng; câu luyện thêm chỉ xen vào giữa', async () => {
  const r = await runExtras(25, LISTEN_LAG);
  const offs = r.items.filter(i => i.type === 'review' || i.type === 'new');
  assert.deepStrictEqual(hzs(offs), hzs(official(25))); assert.deepStrictEqual(offs.map(i => i.type), official(25).map(i => i.type));
  assert.strictEqual(r.out.extraCount, r.extras.length);
  assert.ok(r.items[0].type !== 'extra', 'không chen lên trước thẻ chính thức đầu tiên');
});
test('Không trùng từ; không chèn từ đã có trong buổi; không chèn từ đã trả lời ĐÚNG hôm nay (sessionKnownHz)', async () => {
  const known = ['字90', '字91', '字60', '字61'];
  const r = await runExtras(25, LISTEN_LAG, { known });
  const all = hzs(r.items.filter(i => i.word)); assert.strictEqual(new Set(all).size, all.length);
  for (const k of known) assert.ok(!hzs(r.extras).includes(k), k);
  assert.strictEqual(r.extras.length, 10);
});
test('Ứng viên theo kế hoạch trùng thẻ chính thức / trùng "từ hay sai" / lặp trong chính danh sách → mỗi từ chỉ xuất hiện MỘT lần, không chen từ đã có trong buổi', async () => {
  const lst = (hz, l) => ({ hz, l, skill: 'listening' });
  const r = await runExtras(20, LISTEN_LAG, { fetch: mkFetch({ perSkill: { listening: [lst('字0', 1), lst('字60', 1), lst('字90', 1), lst('字90', 1), lst('字91', 2), lst('字60', 1), lst('字92', 3)] } }) });
  const ex = hzs(r.extras); assert.strictEqual(new Set(ex).size, ex.length, ex.join(','));
  assert.ok(!ex.includes('字0'), 'từ đã nằm trong buổi bị chen lại');
  const all = hzs(r.items.filter(i => i.word)); assert.strictEqual(new Set(all).size, all.length);
});
test('Xen kẽ câu theo kế hoạch với "từ hay sai" (không dồn một loại vào nửa đầu buổi)', async () => {
  const r = await runExtras(25, LISTEN_LAG);
  const seq = r.extras.map(e => !!e.fromPlan);
  for (let i = 0; i + 1 < Math.min(seq.length, 8); i += 2) assert.notStrictEqual(seq[i], seq[i + 1], 'vị trí ' + i + ': ' + seq.join(','));
});
test('Hai kỹ năng tụt lại (Nghe + Pinyin): gọi cả hai đường, chia hạn mức đúng TP.allocate, tổng ≤ trần', async () => {
  const r = await runExtras(25, TWO_LAG);
  const alloc = TP.allocate(TP.build(TWO_LAG).priorities, 10);
  assert.ok(r.urls.some(u => /skill=listening&weakOnly=0/.test(u)) && r.urls.some(u => /skill=pinyin&weakOnly=0/.test(u)));
  const cnt = (k) => r.extras.filter(e => e.fromPlan && e.targetSkill === k).length;
  for (const k of Object.keys(alloc.bySkill)) assert.strictEqual(cnt(k), alloc.bySkill[k], k);
  assert.ok(r.extras.length <= 10);
});
test('Không có giọng đọc → KHÔNG luyện Nghe: không gọi đường Nghe và KHÔNG nâng trần (giữ trần cũ)', async () => {
  const r = await runExtras(20, LISTEN_LAG, { over: { skillAudioAvailable: () => false } });
  assert.ok(!r.urls.some(u => /skill=listening/.test(u))); assert.strictEqual(r.extras.length, baseCap(20)); assert.ok(r.extras.every(e => !e.fromPlan));
});
test('Chỉ Nhận diện tụt lại → gọi đường lấy từ riêng skill=recognition, nâng trần như kỹ năng khác', async () => {
  const r = await runExtras(20, RECOG_LAG);
  assert.ok(r.urls.some(u => /skill=recognition&weakOnly=0&limit=8/.test(u)), r.urls.join('\n'));
  assert.strictEqual(r.extras.length, 8);
  const plan = r.extras.filter(e => e.fromPlan); assert.strictEqual(plan.length, 5); assert.ok(plan.every(e => e.targetSkill === 'recognition'));
});
test('Đường lấy từ theo kỹ năng trả rỗng / lỗi mạng → không văng lỗi; chỗ trống nhường cho "từ hay sai" (vẫn đủ trần nếu đủ ứng viên)', async () => {
  const empty = await runExtras(20, LISTEN_LAG, { fetch: mkFetch({ perSkill: { listening: [] } }) });
  assert.strictEqual(empty.extras.length, 8); assert.ok(empty.extras.every(e => !e.fromPlan));
  const boom = await runExtras(20, LISTEN_LAG, { fetch: mkFetch({ failSkills: ['listening'] }) });
  assert.strictEqual(boom.extras.length, 8); assert.ok(boom.extras.every(e => !e.fromPlan));
  const noAuth = await runExtras(20, LISTEN_LAG, { over: { authToken: '' } }); assert.strictEqual(noAuth.extras.length, 0);
});
test('Thiếu ứng viên cho kỹ năng (chỉ 2 từ) → chỉ lấy 2, phần còn lại là từ hay sai; không vượt trần', async () => {
  const r = await runExtras(20, LISTEN_LAG, { fetch: mkFetch({ perSkill: { listening: [{ hz: '字90', l: 1, skill: 'listening' }, { hz: '字91', l: 2, skill: 'listening' }] } }) });
  assert.strictEqual(r.extras.filter(e => e.fromPlan).length, 2); assert.strictEqual(r.extras.length, 8);
});
test('Câu thăm dò tự gõ vẫn ≤ 2 và chỉ khi bật tự gõ; tổng không vượt trần; vẫn còn chỗ cho kỹ năng tụt lại', async () => {
  const on = await runExtras(20, PROBE_AND_LISTEN_LAG, { noTyped: false });
  const probes = on.extras.filter(e => e.probe === 'typed');
  assert.ok(probes.length >= 1 && probes.length <= 2, 'probes=' + probes.length); assert.ok(on.extras.length <= 8);
  assert.ok(on.extras.some(e => e.fromPlan && e.targetSkill === 'listening'));
  assert.ok(on.extras.filter(e => e.fromPlan).length <= Math.ceil((8 - probes.length) * TP.PLAN_SHARE));
  const off = await runExtras(20, PROBE_AND_LISTEN_LAG); assert.strictEqual(off.extras.filter(e => e.probe).length, 0);
});
test('Module TP hỏng giữa chừng (ném lỗi) → rơi về đúng V127: 1 lần gọi máy chủ, trần cũ, không văng lỗi', async () => {
  const fetch = mkFetch(); const ctx = makeEnv({ fetch }); ctx.__store.rvAllowTyped = '0';
  R(ctx, 'rvLearner = ' + JSON.stringify(LISTEN_LAG)); R(ctx, 'TP.build = () => { throw new Error("boom"); }');
  ctx.__items = official(20); const out = await R(ctx, 'rvAddExtras(__items)');
  assert.strictEqual(Array.from(out.items).filter(i => i.type === 'extra').length, baseCap(20)); assert.strictEqual(fetch.calls.length, 1);
});

section('[3] Hiển thị: lý do trong câu hỏi, màn bắt đầu, màn phân tích');
test('Câu luyện thêm theo kế hoạch ghi lý do (nêu đúng kỹ năng, nêu nguồn là Phân tích năng lực, nói rõ không đổi lịch ôn); câu thường thì không', () => {
  const ctx = makeEnv({});
  const w = POOL[100];
  const mk = (extra) => { ctx.__it = Object.assign({ type: 'extra', word: w, targetSkill: 'listening' }, extra); return R(ctx, 'rvBuildQuestionFor(__it)'); };
  const q1 = mk({ fromPlan: true });
  assert.ok(q1 && q1.skill === 'listening', 'cần dựng được câu Nghe: ' + (q1 && q1.skill));
  assert.ok(q1.why.includes('Nghe') && q1.why.includes('Phân tích năng lực') && q1.why.includes('không đổi lịch ôn'), q1.why);
  const q2 = mk({}); assert.ok(!(q2.why || '').includes('Phân tích năng lực'));
});
test('Màn bắt đầu nêu đúng số câu luyện thêm theo kế hoạch từng kỹ năng; không có thì nói thẳng', async () => {
  const r = await runExtras(20, LISTEN_LAG);
  R(r.ctx, 'rvQueue.items = ' + JSON.stringify(r.items) + '; rvStage = "start"; rvBlockedByBacklog = false; rvStartInfo = { lessons: [5], newCount: 5, reviewCount: 15, extraCount: ' + r.extras.length + ', estimated: 30 }');
  const h = R(r.ctx, 'rvStartHtml()');
  assert.ok(h.includes('Luyện thêm theo kế hoạch: Nghe 5 câu'), h);
  R(r.ctx, 'rvQueue.items = rvQueue.items.filter(i => !i.fromPlan)');
  assert.ok(R(r.ctx, 'rvStartHtml()').includes('Hôm nay chưa thêm câu luyện thêm riêng cho kỹ năng này.'));
});
test('Màn phân tích nêu quy tắc trần 40%/10 (kể cả khi kỹ năng tụt lại là Nhận diện); không có kỹ năng tụt lại thì không nêu', () => {
  const t = TP.describe(TP.build(LISTEN_LAG)).lines.join(' ');
  assert.ok(/tối đa 40% số thẻ chính thức và không quá 10 câu/.test(t) && /25%, không quá 6/.test(t));
  const t2 = TP.describe(TP.build(RECOG_LAG)).lines.join(' ');
  assert.ok(/tối đa 40% số thẻ chính thức/.test(t2) && !/chưa có câu luyện thêm riêng/.test(t2));
  const t3 = TP.describe(TP.build(NO_LAG)).lines.join(' '); assert.ok(!/40%/.test(t3));
});

section('[4] Ranh giới');
test('Hằng số trần đúng mức người chốt: 40% số thẻ, tối đa 10 câu; trần cũ V127 (25%, ≤ 6) giữ nguyên làm mức nền', () => {
  assert.strictEqual(TP.EXTRA_SHARE, 0.4); assert.strictEqual(TP.EXTRA_MAX, 10);
  assert.ok(/const RV_EXTRA_MAX = 6;/.test(read('js/review.js')));
  assert.ok(/Math\.floor\(officialN \/ 4\)/.test(read('js/review.js')));
});
test('Không đổi máy chủ/FSRS: câu luyện thêm vẫn là loại "extra" (luyện bổ sung); câu theo kế hoạch không có đường ghi FSRS riêng', () => {
  const src = read('js/review.js');
  const body = (name) => { const s = src.indexOf('function ' + name + '('); const e = src.indexOf('\n}\n', s); return src.slice(s, e); };
  const add = body('rvAddExtras') + body('rvFetchSkillWords') + body('rvPlanPriorities');
  for (const bad of ['submitFsrsReviewAwaited', '/api/fsrs', '/api/study/', 'recordPractice', "type: 'review'", "type: 'new'"]) assert.ok(!add.includes(bad), bad);
  assert.ok(/practice-words/.test(add) && !/method:\s*'POST'/.test(add));
  assert.ok(src.includes("const RV_PRACTICE_TYPES = ['drill', 'extra', 'check', 'redo'];"));
});
test('rvIsOfficial: câu luyện thêm theo kế hoạch KHÔNG phải thẻ chính thức (không vào ngân sách/lịch ôn)', async () => {
  const r = await runExtras(20, LISTEN_LAG); R(r.ctx, '1');
  r.ctx.__x = r.extras.filter(e => e.fromPlan)[0]; assert.strictEqual(R(r.ctx, 'rvIsOfficial(__x)'), false);
  assert.strictEqual(R(r.ctx, 'rvQueue.totalPlanned = (' + JSON.stringify(official(20).length) + ')'), 20);
});

runAll();
