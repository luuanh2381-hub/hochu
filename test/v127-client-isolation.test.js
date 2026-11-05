// test/v127-client-isolation.test.js — KIỂM TOÁN ĐỘC LẬP V127 (phần A, phía trình duyệt).
// Chạy các hàm THẬT của js/review.js + js/study-queue.js (submitSkillPractice, outbox) + js/question-*.js trong `vm`,
// với `fetch` giả GHI LẠI mọi lời gọi mạng. Chứng minh BẰNG QUAN SÁT MẠNG (không chỉ đọc mã) rằng:
//   • trả lời câu "thăm dò tự gõ" (extra + probe:'typed') chỉ gọi POST /api/skills/practice;
//   • KHÔNG có lời gọi nào tới /api/study/review hoặc /api/study/review/preview (hai đường chạm FSRS);
//   • ĐỐI CHỨNG DƯƠNG: cùng câu tự gõ nhưng là thẻ chính thức (type:'review') thì HARNESS THẤY /api/study/review/preview.
// KHÔNG kiểm tra: giao diện thật trên trình duyệt/điện thoại, server thật, SQL thật.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let passed = 0, failed = 0; const pending = [];
const test = (n, f) => pending.push({ n, f });
const section = (s) => pending.push({ n: null, s });
async function runAll() {
  for (const p of pending) {
    if (p.n === null) { console.log('\n' + p.s); continue; }
    try { await p.f(); passed++; console.log('  ✅ ' + p.n); }
    catch (e) { failed++; console.log('  ❌ ' + p.n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); }
  }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
}
const review = read('js/review.js');
function grab(name) {
  let i = review.indexOf('async function ' + name + '(');
  if (i < 0) i = review.indexOf('function ' + name + '(');
  assert.ok(i >= 0, 'không thấy hàm ' + name);
  // bỏ qua dấu { trong danh sách tham số (vd rvFetchSystemRating({ word, ... })): lấy { đầu tiên SAU dấu ) đóng tham số
  const sig = /\)\s*\{/.exec(review.slice(i)); assert.ok(sig, 'không thấy thân hàm ' + name);
  let depth = 0; const j = i + sig.index + sig[0].length - 1;
  for (let k = j; k < review.length; k++) {
    if (review[k] === '{') depth++; else if (review[k] === '}') { depth--; if (depth === 0) return review.slice(i, k + 1); }
  }
  throw new Error('không đóng được ' + name);
}
const constLine = (name) => { const m = review.match(new RegExp('^const ' + name + '\\b.*$', 'm')); assert.ok(m, name); return m[0]; };

const POOL = [];
'认真 准备 参加 发现 学习 学校 学生 休息 苹果 桌子 天气 买 卖 汤 包子 电影 音乐 书 笔 纸 车 船 飞机 桥 路'.split(' ').forEach((hz, i) =>
  POOL.push({ hz, py: 'py' + i + (i % 2 ? 'ā' : 'è'), vi: 'nghĩa số ' + i, l: 1 + (i % 6) }));

function makeEnv(opts) {
  opts = opts || {}; const routes = { fn: null };
  const net = []; const store = new Map(); const dom = { 'rv-typed': { value: '', focus() {} } };
  const ctx = {
    console, Math, Date, JSON, Set, Map, Array, Object, String, Number, Promise, Error, RegExp, Symbol,
    WORDS: opts.words || POOL, GUEST_MAX_LESSON: 99, isLoggedIn: () => true, isGuest: false, authToken: 't', authUsername: 'u1', authHeaders: () => ({ Authorization: 'Bearer t' }),
    SENTENCES: [], CONFUSE_GROUPS: [], skillAudioAvailable: () => true,
    setTimeout, clearTimeout, setInterval: () => 0, performance: { now: () => 0 }, vtMarkStart() {}, vtHiddenMs: () => 0, render() {},
    sessionKnownHz: new Set(), saveSessionKnownHz() {}, sqPurgeHzFromAllQueues() {}, REPEAT_GAP: 3, currentTab: 'review',
    ssArchiveSession() {}, refreshServerMeta() {}, sqClearPersisted() {}, sqPersist() {}, rvStorageMode: () => 'review',
    escapeHtml: (s) => String(s == null ? '' : s), todayKey: () => '2026-10-29', sqSnapshotLessonFilter: () => ({}),
    sqCreate: () => ({ items: [], doneHz: new Set(), totalPlanned: 0, answeredCount: 0, sessionId: 'sess-x', startTime: null, endTime: null, completedCards: [], lessonFilter: null, dayKey: null }),
    alert() {}, rvClearCountdown() {}, rvFindExample: () => null, lessonsLabel: () => 'Bài', playDing() {}, playBuzz() {}, speak() {},
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) }, // trình duyệt thật có sẵn `crypto` toàn cục (genIdempotencyKey dùng)
    window: { addEventListener() {}, crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) } },
    document: { visibilityState: 'visible', addEventListener() {}, getElementById: (id) => dom[id] || null },
    flushProgressSync: async () => {},
    fetch: async (url, init) => {
      net.push({ url: String(url).split('?')[0], full: String(url), method: (init && init.method) || 'GET', body: init && init.body ? JSON.parse(init.body) : null });
      const custom = routes.fn ? routes.fn(String(url)) : undefined; if (custom instanceof Error) throw custom;
      return { ok: true, json: async () => (custom !== undefined ? custom : { ok: true, systemRating: 'good', recorded: true }) };
    },
    rvDedupeSession: (l) => l, rvDedupeByHzOnly: (l) => l, rvLeechOnly: false,
    rvStartCountdown() {}, rvLeechInfo: () => null,
  };
  vm.createContext(ctx);
  for (const f of ['js/skill-score.js', 'js/session-summary.js', 'js/question-engine.js', 'js/question-selector.js', 'js/answer-match.js']) vm.runInContext(read(f), ctx);
  vm.runInContext(read('js/study-queue.js'), ctx); // submitSkillPractice + outbox THẬT
  const consts = ['RV_AUTO_COMMIT_MS', 'RV_NEW_GAP', 'RV_DRILL_GAP', 'RV_DRILL_MAX_TRIES', 'RV_EXTRA_MAX', 'RV_PROBE_MAX', 'RV_PRACTICE_TYPES', 'RV_CORRECTION_GAP', 'RV_RATING_ORDER', 'RV_BLANK_MARK'].map(constLine).join('\n');
  const fns = ['rvIsPractice', 'rvIsOfficial', 'rvIsIntroExposure', 'rvQCtx', 'rvSkillTypes', 'rvTypedEnabled', 'rvPracticeSource', 'rvBuildQuestionFor', 'rvStageLabel', 'rvRecordAnswer', 'rvBaseAutoMs',
    'rvPrepareCurrentCard', 'rvPickPractice', 'rvSubmitTyped', 'rvFetchSystemRating', 'rvShouldAutoCommit', 'rvFetchWeakWords', 'rvFetchProbeWords', 'rvFetchSkillWords', 'rvPlanPriorities', 'rvWordOf', 'rvAddExtras', 'rvFetchFreshSession'].map(grab).join('\n');
  vm.runInContext(`
    let rvQueue = sqCreate(), rvQuestion = null, rvQSession = QS.newSession(), rvLog = [], rvStage = 'run', rvStartInfo = null, rvMatch = null,
        rvPhase = 'question', rvLastAnswer = null, rvAnswerChanges = 0, rvRatingPhase = null, rvSystemRating = null, rvUserRating = null,
        rvFinalRating = null, rvPendingReview = null, rvStartedAt = 0, rvExamplePool = [], rvLearner = null, rvSummary = { reviewCount: 0, newCount: 0 },
        rvWeakMode = false, rvBlockedByBacklog = false, rvTotalDue = 0, rvAttemptId = 0, rvSubmitting = false, rvCardSeq = 0, rvRatingExpanded = false;
    ${consts}
    ${fns}
    globalThis.__env = { get q() { return rvQueue; }, set q(v) { rvQueue = v; }, get question() { return rvQuestion; }, set question(v) { rvQuestion = v; }, get phase() { return rvPhase; }, set phase(v) { rvPhase = v; },
      set learner(v) { rvLearner = v; }, get ratingPhase() { return rvRatingPhase; }, f: { rvPrepareCurrentCard, rvSubmitTyped, rvBuildQuestionFor, rvAddExtras, rvFetchFreshSession } };`, ctx);
  return { ctx, net, store, dom, routes, env: ctx.__env, f: ctx.__env.f };
}
const wordOf = (hz) => POOL.find(w => w.hz === hz);
const FSRS_ENDPOINTS = /^\/api\/study\/review(\/preview)?$/;
const tick = () => new Promise(r => setTimeout(r, 5));

// ─────────────────────────────────────────────────────────────────────────────────────────────────
section('[C1] Câu thăm dò tự gõ (extra + probe:\'typed\') — quan sát mạng');
for (const [label, typed, skip, expectOk] of [['trả lời ĐÚNG', '学习', false, true], ['trả lời SAI', '学校', false, false], ['bấm "Bỏ qua"', '', true, false]]) {
  test(`Thăm dò — ${label}: chỉ 1 POST /api/skills/practice (practice-recall-typed, source extra); 0 lời gọi tới /api/study/review(/preview)`, async () => {
    const E = makeEnv(); E.env.learner = { v: 1, skills: {} };
    E.env.q.items = [{ type: 'extra', word: wordOf('学习'), targetSkill: 'recall', probe: 'typed' }];
    E.f.rvPrepareCurrentCard();
    const q = E.env.question; assert.ok(q, 'phải dựng được câu'); assert.strictEqual(q.typeId, 'typeVi2hz'); assert.ok(q.typed, 'phải là câu tự gõ'); assert.strictEqual(q.exercisePractice, 'practice-recall-typed');
    assert.ok(/đo thêm|không đổi lịch ôn/.test(q.why || ''), 'có dòng lý do nói rõ KHÔNG đổi lịch ôn');
    E.dom['rv-typed'].value = typed; await E.f.rvSubmitTyped(skip); await tick(); await tick();
    const fsrsCalls = E.net.filter(n => FSRS_ENDPOINTS.test(n.url)); assert.deepStrictEqual(fsrsCalls, [], 'KHÔNG được chạm endpoint FSRS: ' + JSON.stringify(fsrsCalls));
    const prac = E.net.filter(n => n.url === '/api/skills/practice'); assert.strictEqual(prac.length, 1, 'đúng 1 lượt luyện bổ sung, thực tế: ' + JSON.stringify(E.net));
    assert.strictEqual(prac[0].body.exerciseType, 'practice-recall-typed'); assert.strictEqual(prac[0].body.source, 'extra');
    assert.deepStrictEqual(prac[0].body.wordId, { hz: '学习', l: wordOf('学习').l });
    assert.strictEqual(E.env.ratingPhase, null, 'luyện bổ sung không mở pha chọn rating FSRS');
    void expectOk;
  });
}
test('Nhiều lượt thăm dò liên tiếp: tổng 0 lời gọi chạm FSRS, mỗi lượt đúng 1 POST luyện bổ sung', async () => {
  const E = makeEnv(); E.env.learner = { v: 1, skills: {} };
  for (const hz of ['认真', '准备', '参加', '发现', '学生']) {
    E.env.q.items = [{ type: 'extra', word: wordOf(hz), targetSkill: 'recall', probe: 'typed' }]; E.env.phase = 'question'; E.f.rvPrepareCurrentCard();
    E.dom['rv-typed'].value = hz; await E.f.rvSubmitTyped(false); await tick();
  }
  assert.strictEqual(E.net.filter(n => FSRS_ENDPOINTS.test(n.url)).length, 0);
  assert.strictEqual(E.net.filter(n => n.url === '/api/skills/practice').length, 5);
});
test('Probe bị tắt khi người học tắt câu tự gõ: không dựng câu tự gõ (rơi về luồng extra thường, vẫn là luyện bổ sung)', async () => {
  const E = makeEnv(); E.store.set('rvAllowTyped', '0'); E.env.learner = { v: 1, skills: {} };
  E.env.q.items = [{ type: 'extra', word: wordOf('学习'), targetSkill: 'recall', probe: 'typed' }]; E.f.rvPrepareCurrentCard();
  assert.ok(E.env.question && !E.env.question.typed, 'không được ép câu tự gõ khi người học đã tắt');
});

section('[C2] ĐỐI CHỨNG DƯƠNG — harness có thật sự thấy đường FSRS không?');
test('Cùng câu tự gõ nhưng là THẺ CHÍNH THỨC (type:review): harness THẤY POST /api/study/review/preview và KHÔNG thấy /api/skills/practice', async () => {
  const E = makeEnv();
  E.env.q.items = [{ type: 'review', word: wordOf('学习') }];
  E.env.question = vm.runInContext('QE', E.ctx).build('typeVi2hz', wordOf('学习'), E.ctx.rvQCtx ? E.ctx.rvQCtx() : {}) || (() => { throw new Error('không dựng được câu tự gõ'); })();
  E.env.phase = 'question';
  E.dom['rv-typed'].value = '学习'; await E.f.rvSubmitTyped(false); await tick();
  assert.ok(E.net.some(n => n.url === '/api/study/review/preview'), 'harness phải quan sát được đường FSRS, thực tế: ' + JSON.stringify(E.net.map(n => n.url)));
  assert.strictEqual(E.net.filter(n => n.url === '/api/skills/practice').length, 0);
});

section('[C3] Thẻ chính thức không bao giờ bị V127 biến thành câu tự gõ mới');
test('rank(): với mọi hồ sơ ngẫu nhiên, TẬP dạng ứng viên của thẻ chính thức giống hệt khi có/không có `learner` (learner chỉ đổi điểm, không đổi cổng tự gõ)', () => {
  const E = makeEnv(); const QS = vm.runInContext('QS', E.ctx); const QE = vm.runInContext('QE', E.ctx);
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const SK = ['recognition', 'recall', 'listening', 'pinyin', 'context']; let checked = 0, typedSeen = 0;
  for (let n = 0; n < 600; n++) {
    const profile = {}; for (const s of SK) { const r = rnd(); profile[s] = r < 0.25 ? null : { status: ['weak', 'ok', 'insufficient'][Math.floor(rnd() * 3)], score: rnd(), attempts: Math.floor(rnd() * 12), fragile: rnd() < 0.15, daysSince: Math.floor(rnd() * 20) }; if (profile[s] === null) delete profile[s]; }
    const learner = { v: 1, skills: {} }; for (const s of SK) learner.skills[s] = { c: { n: Math.floor(rnd() * 80), ok: 0 }, t: { n: Math.floor(rnd() * 50), ok: 0 }, rc: { n: Math.floor(rnd() * 20), ok: 0 }, rt: { n: Math.floor(rnd() * 10), ok: 0 } };
    for (const s of SK) for (const k of ['c', 't', 'rc', 'rt']) learner.skills[s][k].ok = Math.floor(rnd() * (learner.skills[s][k].n + 1));
    const base = { profile, allowTyped: true, remaining: Math.floor(rnd() * 20), session: QS.newSession() };
    const a = QS.rank(wordOf('学习'), Object.assign({}, base, { rand: () => 0 })).map(x => x.typeId).sort();
    const b = QS.rank(wordOf('学习'), Object.assign({}, base, { rand: () => 0, learner, lastExerciseType: 'review-hz2vi' })).map(x => x.typeId).sort();
    assert.deepStrictEqual(b, a, 'learner không được thêm/bớt dạng ứng viên');
    checked++; if (a.some(t => QE.TYPES[t].typed)) typedSeen++;
  }
  assert.strictEqual(checked, 600); assert.ok(typedSeen > 0 && typedSeen < 600, 'mẫu phải có cả hồ sơ cho phép lẫn không cho phép tự gõ (typedSeen=' + typedSeen + ')');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
section('[C4] Chọn câu thăm dò khi có từ trùng lặp / thiếu ứng viên / mạng lỗi (rvAddExtras thật)');
const PROBE_LEARNER = { v: 1, skills: { recall: { c: { n: 60, ok: 54 }, t: { n: 0, ok: 0 }, rc: { n: 0, ok: 0 }, rt: { n: 0, ok: 0 } } } }; // nhận diện vững, chưa có bằng chứng tự gõ
const rowOf = (i, extra) => Object.assign({ hz: POOL[i].hz, l: POOL[i].l }, extra || {});
const official = (n) => POOL.slice(0, n).map(w => ({ type: 'review', word: w }));
function serverFor(weakRows, probeRows) { return (url) => (/weakOnly=1/.test(url) ? { ok: true, words: weakRows } : /skill=recall/.test(url) ? (probeRows instanceof Error ? probeRows : { ok: true, words: probeRows }) : undefined); }
const extrasOf = (items) => items.filter(i => i.type === 'extra');
const hzList = (items) => items.map(i => i.word.hz);
test('20 thẻ chính thức (cap=5): ≤ 2 câu thăm dò, tổng ≤ cap, KHÔNG trùng từ nào (kể cả từ trùng giữa 2 danh sách và trùng thẻ chính thức), thăm dò chỉ lấy từ chưa có điểm', async () => {
  const E = makeEnv(); E.env.learner = PROBE_LEARNER;
  E.routes.fn = serverFor([rowOf(22, { skill: 'recall', score: 0.2 }), rowOf(23, { skill: 'pinyin', score: 0.3 }), rowOf(24, { skill: 'recall', score: 0.1 }), rowOf(0, { skill: 'recall', score: 0.1 })],
    // Cố ý đặt LÊN ĐẦU: từ trùng với danh sách từ yếu (22), từ trùng thẻ chính thức (1), từ đã trả lời đúng hôm nay (21) — phải bị bỏ qua
    [rowOf(22, { score: null }), rowOf(1, { score: null }), rowOf(21, { score: null }), rowOf(20, { score: null }), rowOf(23, { score: 0.4 })]);
  vm.runInContext('sessionKnownHz.add(' + JSON.stringify(POOL[21].hz) + ')', E.ctx); // tập THẬT do js/study-queue.js khai báo (không phải thuộc tính ctx)
  const { items, extraCount } = await E.f.rvAddExtras(official(20));
  const ex = extrasOf(items), probes = ex.filter(x => x.probe === 'typed');
  assert.strictEqual(items.length, 20 + ex.length); assert.strictEqual(extraCount, ex.length); assert.ok(ex.length <= 5, 'vượt cap: ' + ex.length);
  assert.ok(probes.length >= 1 && probes.length <= 2, 'số thăm dò ' + probes.length); assert.ok(probes.every(p => p.targetSkill === 'recall'));
  assert.strictEqual(new Set(hzList(items)).size, items.length, 'có từ bị trùng trong hàng đợi: ' + hzList(items).join(','));
  assert.ok(ex.every(x => !official(20).some(o => o.word.hz === x.word.hz)), 'extra không được trùng thẻ chính thức');
  assert.ok(!probes.some(p => p.word.hz === POOL[23].hz), 'từ đã có điểm (score != null) không được làm thăm dò');
  assert.ok(!ex.some(x => x.word.hz === POOL[21].hz), 'từ đã trả lời đúng hôm nay (sessionKnownHz) không được chèn lại');
  assert.deepStrictEqual(Array.from(probes.map(p => p.word.hz)), [POOL[20].hz], 'chỉ từ 20 là ứng viên thăm dò hợp lệ'); // Array.from: mảng sinh trong vm khác "realm" nên deepStrictEqual chặt sẽ so cả prototype
});
test('Ứng viên thăm dò đều đã có điểm (hoặc rỗng) → 0 thăm dò, chỗ để dành được NHƯỜNG lại cho từ yếu (không để trống), không trùng', async () => {
  for (const probeRows of [[rowOf(20, { score: 0.5 }), rowOf(21, { score: 0.6 })], []]) {
    const E = makeEnv(); E.env.learner = PROBE_LEARNER;
    E.routes.fn = serverFor([20, 21, 22, 23, 24].map(i => rowOf(i, { skill: 'recall', score: 0.2 })), probeRows);
    const { items } = await E.f.rvAddExtras(official(20)); const ex = extrasOf(items);
    assert.strictEqual(ex.filter(x => x.probe).length, 0); assert.strictEqual(ex.length, 5, 'phải lấp đủ cap bằng từ yếu'); assert.strictEqual(new Set(hzList(items)).size, items.length);
  }
});
test('Không cần thăm dò thì KHÔNG gọi API thăm dò: learner=null; người học tắt câu tự gõ; phiên nhỏ (cap < 2); đã có đủ bằng chứng tự gõ', async () => {
  const calls = (E) => E.net.filter(n => /skill=recall/.test(n.full)).length;
  const weak = serverFor([rowOf(22, { skill: 'recall', score: 0.2 })], [rowOf(20, { score: null })]);
  let E = makeEnv(); E.routes.fn = weak; await E.f.rvAddExtras(official(20)); assert.strictEqual(calls(E), 0, 'learner=null');
  E = makeEnv(); E.store.set('rvAllowTyped', '0'); E.env.learner = PROBE_LEARNER; E.routes.fn = weak; await E.f.rvAddExtras(official(20)); assert.strictEqual(calls(E), 0, 'tắt tự gõ');
  E = makeEnv(); E.env.learner = PROBE_LEARNER; E.routes.fn = weak; await E.f.rvAddExtras(official(6)); assert.strictEqual(calls(E), 0, 'cap < 2');
  E = makeEnv(); E.env.learner = { v: 1, skills: { recall: { c: { n: 60, ok: 54 }, t: { n: 40, ok: 36 }, rc: { n: 0, ok: 0 }, rt: { n: 0, ok: 0 } } } }; E.routes.fn = weak; await E.f.rvAddExtras(official(20)); assert.strictEqual(calls(E), 0, 'đã đủ bằng chứng tự gõ');
});
test('API thăm dò lỗi mạng / trả ok:false / trả rác → không ném lỗi, vẫn có câu luyện bổ sung từ danh sách từ yếu', async () => {
  for (const bad of [new Error('mất mạng'), { ok: false }, { ok: true, words: 'rác' }, null]) {
    const E = makeEnv(); E.env.learner = PROBE_LEARNER;
    E.routes.fn = (url) => (/weakOnly=1/.test(url) ? { ok: true, words: [20, 21, 22, 23, 24].map(i => rowOf(i, { skill: 'recall', score: 0.2 })) } : bad);
    const { items } = await E.f.rvAddExtras(official(20)); assert.ok(extrasOf(items).length >= 1, 'phải còn extra từ danh sách yếu'); assert.strictEqual(extrasOf(items).filter(x => x.probe).length, 0);
  }
});

section('[C5] Phiên học từ server: field learner thiếu / hỏng / server cũ');
test('/api/study/session được gọi với ?adaptive=1; learner hợp lệ → giữ; thiếu/sai phiên bản/sai kiểu → null; list & lastExerciseType đi qua nguyên vẹn', async () => {
  const sess = [{ type: 'review', word: { hz: '学习', l: 1 }, lastExerciseType: 'review-hz2vi', skillProfile: {} }];
  for (const [learner, expectNull] of [[undefined, true], [null, true], [{ v: 2, skills: {} }, true], [{ v: 1 }, true], [{ v: 1, skills: null }, true], ['rác', true], [{ v: 1, skills: {} }, false], [PROBE_LEARNER, false]]) {
    const E = makeEnv(); E.routes.fn = () => ({ ok: true, session: sess, reviewCount: 1, newCount: 0, learner });
    const r = await E.f.rvFetchFreshSession(false);
    assert.ok(E.net.some(n => n.url === '/api/study/session' && /adaptive=1/.test(n.full)), 'phải gọi ?adaptive=1');
    assert.deepStrictEqual(r.list, sess); assert.strictEqual(r.reviewCount, 1); assert.strictEqual(r.learner === null, expectNull, JSON.stringify(learner));
  }
});
test('Server lỗi (ok:false hoặc mạng): trả { error } như V126, không ném lỗi', async () => {
  let E = makeEnv(); E.routes.fn = () => ({ ok: false, error: 'lỗi giả' }); assert.strictEqual((await E.f.rvFetchFreshSession(false)).error, 'lỗi giả');
  E = makeEnv(); E.routes.fn = () => new Error('mất mạng'); assert.ok((await E.f.rvFetchFreshSession(false)).error);
});

section('[C6] Không dựng được câu hỏi nào cho thẻ');
test('Kho từ chỉ 1 từ: thẻ chính thức bị BỎ QUA trong phiên (hành vi có từ trước V127), hàng đợi không kẹt, và KHÔNG có lời gọi nào tới /api/study/review(/preview) (thẻ vẫn đến hạn trong FSRS)', async () => {
  const E = makeEnv({ words: [POOL[0]] }); E.env.learner = PROBE_LEARNER;
  E.env.q.items = [{ type: 'review', word: POOL[0] }]; E.f.rvPrepareCurrentCard();
  assert.strictEqual(E.env.q.items.length, 0); assert.strictEqual(E.env.question, null);
  assert.deepStrictEqual(E.net.filter(n => FSRS_ENDPOINTS.test(n.url) || n.url === '/api/skills/practice'), []);
});

runAll();
