#!/usr/bin/env node
// test/v146-session-size.test.js — V146: màn "Hôm nay học" không còn nhận THIẾU thẻ so với số dashboard báo.
//
// Phễu cũ: dashboard "Cần ôn 50 · Từ mới 10" → vào học chỉ có 6 thẻ. 4 nguyên nhân, mỗi nguyên nhân 1 nhóm test:
//   A. Server: backlog chặn từ mới nay tính theo PHẠM VI đang chọn (không còn đếm thẻ ở bài khác/thẻ mồ côi).
//   B. Server: lấy dư rồi khử trùng theo hz → đủ số slot; reviewCount/newCount khớp số thẻ thật trong `session`.
//   C. SQL: cooldown thẻ đang học (state 1/3) chỉ 15 phút, thẻ khác giữ 4 giờ — dùng chung cho đếm + lấy.
//   D. Client: mặc định không cắt 6 thẻ; sessionKnownHz không chặn thẻ đang học đã đến hạn lại; dashboard nói rõ nếu có trần.
// Chạy mã THẬT của reviewService/js/*.js; DB và mạng là giả. KHÔNG cần Postgres/ts-fsrs.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let passed = 0, failed = 0; const pending = [];
const test = (n, f) => pending.push({ n, f });
const section = (s) => pending.push({ n: null, s });
async function runAll() {
  for (const { n, f, s } of pending) {
    if (s) { console.log('\n' + s); continue; }
    try { await f(); passed++; console.log('  ✅ ' + n); }
    catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); }
  }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
}

// ════════════════════════════════════════════════════════════════════════════
// Giả lập db.js (chỉ các hàm reviewService dùng). Trạng thái đổi theo từng test qua `S`.
const S = { accountDue: 0, scopedDue: 0, today: { newToday: 0, reviewToday: 0 }, dueRows: [], newRows: [], calls: null };
function resetState(over) {
  Object.assign(S, { accountDue: 0, scopedDue: 0, today: { newToday: 0, reviewToday: 0 }, dueRows: [], newRows: [], calls: { countDue: [], getDue: [], getNew: [] } }, over || {});
}
const card = (hz, extra) => ({ hz, py: 'p', vi: 'v', l: 1, tag: 't', hanviet: 'h', resolved_word_id: hz.codePointAt(0), state: 2, due: '2026-11-10T00:00:00Z', reps: 3, lapses: 0, ...extra });
const word = (hz) => ({ hz, py: 'p', vi: 'v', l: 1, tag: 't', hanviet: 'h', resolved_word_id: hz.codePointAt(0) });
const hzOf = (prefix, i) => prefix + String.fromCodePoint(0x4e00 + i); // chữ Hán khác nhau cho mỗi i

function mk(rel, exp) { const p = path.join(ROOT, rel); const m = new Module(p); m.filename = p; m.loaded = true; m.exports = exp; require.cache[p] = m; }
mk('lib/db.js', {
  getPool: () => { throw new Error('không được mở DB thật'); },
  vnDateKey: () => '2026-11-11', getVocabCounts: async () => ({ 1: 50, 2: 50 }), getBookDefs: async () => [],
  getTodayStudyCounts: async () => S.today,
  countDueFsrsCards: async (_u, scope) => { S.calls.countDue.push(scope); return Array.isArray(scope) ? S.scopedDue : S.accountDue; },
  getDueFsrsCards: async (_u, lim, scope) => { S.calls.getDue.push({ lim, scope }); return S.dueRows.slice(0, lim); },
  getNewWordsByLessonOrder: async (_u, _order, lim) => { S.calls.getNew.push(lim); return S.newRows.slice(0, lim); },
  countNewWordsInLessons: async () => S.newRows.length, getWeakFsrsCards: async () => [], getLearnedFsrsCards: async () => [], getLearnedLessons: async () => [],
  getLessonsByWordIds: async () => ({}),
  reviewFsrsCard: async () => { throw new Error('không được ghi FSRS'); }, previewAutoRating: async () => { throw new Error('không được ghi FSRS'); },
});
mk('lib/fsrs/scheduler.js', { ALLOWED_RETENTIONS: [0.8, 0.85, 0.9, 0.95], isAllowedRetention: () => true, DEFAULT_RETENTION: 0.9 });
mk('lib/fsrs/optimizer.js', { getUserActiveWeights: async () => null });
mk('lib/fsrs/analytics.js', { recordStudyActivity: async () => {} });
mk('lib/skill-store.js', {
  getProfilesForWords: async () => new Map(), getConfusionsForWords: async () => new Map(),
  getLastExerciseTypes: async () => new Map(), getTypeBreakdown: async () => null,
});
for (const rel of ['lib/fsrs/studyScope.js', 'lib/fsrs/reviewService.js']) delete require.cache[path.join(ROOT, rel)];
const service = require(path.join(ROOT, 'lib/fsrs/reviewService.js'));
const UI = { selectedBookIds: [1], lessonsAllMode: true, dailyReviewLimit: 50, dailyNewLimit: 10 };

// ════════════════════════════════════════════════════════════════════════════
section('[A] Backlog chặn từ mới: tính theo PHẠM VI đang chọn');
test('chọn 1 bài: 30 thẻ đến hạn trong phạm vi + 100 thẻ ở bài khác → KHÔNG khoá từ mới (trước đây 130 > 50 → khoá)', async () => {
  resetState({ accountDue: 130, scopedDue: 30, dueRows: Array.from({ length: 30 }, (_, i) => card(hzOf('', i))), newRows: Array.from({ length: 40 }, (_, i) => word(hzOf('', 100 + i))) });
  const r = await service.getStudySession('u', UI);
  assert.strictEqual(r.blockedByBacklog, false);
  assert.strictEqual(r.reviewCount, 30); assert.strictEqual(r.newCount, 10, 'đủ 10 từ mới theo giới hạn ngày');
  assert.strictEqual(r.session.length, 40);
  assert.strictEqual(r.totalDue, 30, 'totalDue nay là số thẻ đến hạn TRONG phạm vi');
  assert.ok(S.calls.countDue.length >= 1 && S.calls.countDue.every(a => Array.isArray(a)), 'mọi lượt đếm backlog đều truyền phạm vi bài: ' + JSON.stringify(S.calls.countDue));
});
test('backlog THẬT trong phạm vi vượt số slot ôn → vẫn khoá từ mới (hành vi "chỉ học từ mới sau khi hết backlog" được giữ)', async () => {
  resetState({ accountDue: 80, scopedDue: 80, dueRows: Array.from({ length: 80 }, (_, i) => card(hzOf('', i))), newRows: Array.from({ length: 40 }, (_, i) => word(hzOf('', 200 + i))) });
  const r = await service.getStudySession('u', UI);
  assert.strictEqual(r.blockedByBacklog, true); assert.strictEqual(r.newCount, 0);
  assert.strictEqual(r.reviewCount, 50, 'vẫn đủ 50 thẻ ôn theo giới hạn ngày');
  const off = await service.getStudySession('u', { ...UI, newOnlyAfterDue: false });
  assert.strictEqual(off.blockedByBacklog, false, 'tắt cài đặt → không khoá'); assert.strictEqual(off.newCount, 10);
});
test('đã ôn hết slot trong ngày nhưng phạm vi không còn thẻ đến hạn → không khoá từ mới', async () => {
  resetState({ accountDue: 500, scopedDue: 0, today: { newToday: 0, reviewToday: 50 }, newRows: Array.from({ length: 20 }, (_, i) => word(hzOf('', i))) });
  const r = await service.getStudySession('u', UI);
  assert.strictEqual(r.blockedByBacklog, false); assert.strictEqual(r.newCount, 10);
});
test('getTodayOverview: dueInScope lấy từ CÙNG 1 lượt đếm theo phạm vi (không đếm lần 2), số hiển thị khớp phiên', async () => {
  resetState({ accountDue: 130, scopedDue: 30, dueRows: Array.from({ length: 30 }, (_, i) => card(hzOf('', i))), newRows: Array.from({ length: 40 }, (_, i) => word(hzOf('', 100 + i))) });
  const o = await service.getTodayOverview('u', UI);
  assert.strictEqual(S.calls.countDue.length, 1, 'chỉ 1 truy vấn đếm thẻ đến hạn');
  assert.ok(Array.isArray(S.calls.countDue[0]));
  assert.strictEqual(o.dueInScope, 30); assert.strictEqual(o.dueCount, 30);
  assert.strictEqual(o.newInCurrentLesson, 10); assert.strictEqual(o.blockedByBacklog, false);
  const s = await service.getStudySession('u', UI);
  assert.strictEqual(o.dueCount + o.newInCurrentLesson, s.session.length, 'dashboard = số thẻ phiên thật');
});

// ════════════════════════════════════════════════════════════════════════════
section('[B] Lấy dư rồi khử trùng theo hz: đủ slot, đếm khớp');
test('chữ Hán trùng không làm phiên hụt thẻ: 60 dòng (5 trùng), slot 50 → đúng 50 thẻ khác nhau', async () => {
  const rows = [];
  for (let i = 0; i < 55; i++) { rows.push(card(hzOf('', i))); if (i < 5) rows.push(card(hzOf('', i), { l: 2 })); } // 5 chữ xuất hiện 2 lần ở 2 bài
  resetState({ accountDue: 60, scopedDue: 60, dueRows: rows });
  const r = await service.getStudySession('u', UI);
  const hzs = r.session.map(it => it.word.hz);
  assert.strictEqual(new Set(hzs).size, hzs.length, 'không trùng hz');
  assert.strictEqual(r.session.length, 50, 'đủ 50 thẻ (trước đây LIMIT 50 rồi mới khử trùng → hụt)');
  assert.ok(S.calls.getDue[0].lim > 50, 'phải lấy dư: ' + S.calls.getDue[0].lim);
});
test('reviewCount/newCount khớp ĐÚNG số thẻ từng loại trong session (kể cả khi có trùng); thẻ ôn thắng từ mới trùng hz', async () => {
  const dup = hzOf('', 7);
  resetState({ accountDue: 20, scopedDue: 20, dueRows: Array.from({ length: 20 }, (_, i) => card(hzOf('', i))), newRows: [word(dup), ...Array.from({ length: 12 }, (_, i) => word(hzOf('', 300 + i)))] });
  const r = await service.getStudySession('u', UI);
  assert.strictEqual(r.session.filter(i => i.type === 'review').length, r.reviewCount);
  assert.strictEqual(r.session.filter(i => i.type === 'new').length, r.newCount);
  assert.strictEqual(r.newCount, 10, 'bỏ từ mới trùng rồi vẫn đủ 10');
  assert.ok(!r.session.some(i => i.type === 'new' && i.word.hz === dup), 'từ mới trùng với thẻ ôn bị bỏ');
});
test('không quá số slot: slot ôn còn 5, từ mới còn 2 → đúng 5 + 2 dù server có nhiều hơn', async () => {
  resetState({ accountDue: 5, scopedDue: 5, today: { newToday: 8, reviewToday: 45 }, dueRows: Array.from({ length: 30 }, (_, i) => card(hzOf('', i))), newRows: Array.from({ length: 30 }, (_, i) => word(hzOf('', 400 + i))) });
  const r = await service.getStudySession('u', UI);
  assert.strictEqual(r.reviewCount, 5); assert.strictEqual(r.newCount, 2);
});

// ════════════════════════════════════════════════════════════════════════════
section('[C] SQL cooldown: thẻ đang học quay lại sau 15 phút, thẻ khác 4 giờ');
const DB = read('lib/db.js');
function cooldownClause() {
  const m = DB.match(/const REVIEW_COOLDOWN_HOURS = (\d+);\s*const LEARNING_COOLDOWN_MINUTES = (\d+);\s*const REVIEW_COOLDOWN_CLAUSE = (`[^`]*`);/);
  assert.ok(m, 'không tìm thấy khai báo cooldown');
  const REVIEW_COOLDOWN_HOURS = +m[1], LEARNING_COOLDOWN_MINUTES = +m[2];
  return { hours: REVIEW_COOLDOWN_HOURS, minutes: LEARNING_COOLDOWN_MINUTES, sql: eval(m[3]) }; // eslint-disable-line no-eval -- template literal của chính repo
}
test('cooldown thẻ state 1/3 = 15 phút (ngắn hơn nhiều so với 4 giờ của thẻ khác), SQL hợp lệ dạng CASE', () => {
  const c = cooldownClause();
  assert.strictEqual(c.hours, 4); assert.strictEqual(c.minutes, 15);
  assert.ok(c.minutes < c.hours * 60);
  assert.strictEqual(c.sql, " AND (f.last_review IS NULL OR f.last_review <= now() - CASE WHEN f.state IN (1, 3) THEN interval '15 minutes' ELSE interval '4 hours' END)");
});
test('MỘT mệnh đề dùng chung cho đếm + lấy thẻ đến hạn (số hiển thị luôn khớp số thật)', () => {
  assert.strictEqual((DB.match(/\$\{REVIEW_COOLDOWN_CLAUSE\}/g) || []).length, 2, 'countDueFsrsCards + getDueFsrsCards');
  assert.ok(/async function countDueFsrsCards[\s\S]*?\$\{REVIEW_COOLDOWN_CLAUSE\}[\s\S]*?async function getDueFsrsCards/.test(DB));
});

// ════════════════════════════════════════════════════════════════════════════
section('[D] Client: không cắt 6 thẻ, thẻ đang học quay lại, dashboard nói rõ trần');
function reviewSnippetEnv(known) {
  const src = read('js/review.js');
  const a = src.indexOf('function rvIsLearningDue'), b = src.indexOf('function rvDedupeByHzOnly');
  assert.ok(a > 0 && b > a, 'không trích được rvDedupeSession');
  const ctx = { sessionKnownHz: new Set(known), Set };
  vm.createContext(ctx); vm.runInContext(src.slice(a, b), ctx); return ctx;
}
test('rvDedupeSession: hz đã trả lời đúng hôm nay vẫn bị loại, TRỪ thẻ state 1/3 đã đến hạn lại; trùng hz vẫn gộp', () => {
  const ctx = reviewSnippetEnv(['甲', '乙', '丙', '丁']);
  const out = vm.runInContext('rvDedupeSession', ctx)([
    { type: 'review', word: { hz: '甲', state: 1 } },  // đang học, đến hạn lại → GIỮ
    { type: 'review', word: { hz: '乙', state: 3 } },  // học lại → GIỮ
    { type: 'review', word: { hz: '丙', state: 2 } },  // ôn bình thường, đã đúng hôm nay → loại
    { type: 'new', word: { hz: '丁' } },               // từ mới đã học → loại
    { type: 'review', word: { hz: '戊', state: 2 } },  // chưa biết → giữ
    { type: 'review', word: { hz: '戊', state: 2 } },  // trùng hz → loại
  ]);
  assert.deepStrictEqual(out.map(i => i.word.hz), ['甲', '乙', '戊']);
});
test('sqLoad (Flashcard/Trắc nghiệm/Gõ chữ/Nghe-chọn): cùng quy tắc — thẻ state 1/3 không bị sessionKnownHz chặn', async () => {
  const store = {}; let n = 0;
  const session = [
    { type: 'review', word: { hz: '甲', l: 1, state: 1 } }, { type: 'review', word: { hz: '乙', l: 1, state: 2 } },
    { type: 'review', word: { hz: '丙', l: 1, state: 3 } }, { type: 'new', word: { hz: '丁', l: 1 } },
  ];
  const ctx = {
    console, Math, Date, JSON, Set, Map, Array, Object, String, Number, Promise, Error, setInterval: () => 0, setTimeout,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    window: { addEventListener() {}, crypto: { randomUUID: () => 'uuid-' + (++n) } }, crypto: { randomUUID: () => 'uuid-' + (++n) },
    document: { addEventListener() {}, visibilityState: 'visible' }, navigator: {},
    authUsername: 'u', isLoggedIn: () => true, authHeaders: () => ({}), flushProgressSync: async () => {}, bumpStudySessionCounters() {},
    selectedBookIds: [1], selectedLessons: [], lessonsAllMode: true,
    fetch: async () => ({ status: 200, json: async () => ({ ok: true, session, blockedByBacklog: false, totalDue: 0 }) }),
  };
  vm.createContext(ctx); vm.runInContext(read('js/study-queue.js'), ctx);
  vm.runInContext("sessionKnownHz.add('甲'); sessionKnownHz.add('乙'); sessionKnownHz.add('丙'); sessionKnownHz.add('丁');", ctx);
  const sq = vm.runInContext('sqCreate()', ctx);
  const r = await vm.runInContext('sqLoad', ctx)(sq, 50);
  assert.ok(r.ok);
  assert.deepStrictEqual(sq.items.map(w => w.hz), ['甲', '丙'], 'chỉ giữ thẻ đang học đã đến hạn lại; 乙 (ôn thường) và 丁 (từ mới) vẫn bị loại');
});
test('startStudySession: mặc định lấy ĐỦ số thẻ server trả (50 ôn + 10 mới = 60), không còn 6; chọn 6 vẫn cắt như cũ', () => {
  const src = read('js/review.js');
  const a = src.indexOf('function rvSentenceCountSetting()'), b = src.indexOf('function rvSetSentenceCount');
  const end = src.indexOf('\n', src.indexOf('}', b)) + 1;
  const store = {};
  const box = { parseInt, Number, Infinity, Math, rvLsGet: (k) => (k in store ? store[k] : null), rvLsSet: (k, v) => { store[k] = String(v); } };
  vm.createContext(box); vm.runInContext(src.slice(a, end), box);
  assert.strictEqual(box.rvSentenceCount(), Infinity);
  const list = Array.from({ length: 60 }, (_, i) => ({ type: i < 50 ? 'review' : 'new' }));
  assert.ok(!(list.length > box.rvSentenceCount()), 'điều kiện cắt `list.length > cap` không bao giờ đúng khi mặc định');
  assert.ok(/if \(!rvWeakMode && list\.length > cap\)/.test(src), 'nhánh cắt vẫn còn cho người đã chọn trần');
  box.rvSetSentenceCount('6'); assert.strictEqual(box.rvSentenceCount(), 6);
});
function lessonEnv(cap) {
  const ctx = { console, Math, Date, JSON, Set, Map, isLoggedIn: () => true, escapeHtml: s => String(s == null ? '' : s), invalidateTodayDashboardCache() {}, loadStudyDashboard() {},
    progressState: { ui: { unlimitedStudy: false, dailyReviewLimit: 50, dailyNewLimit: 10, newOnlyAfterDue: true } },
    rvSentenceCountSetting: () => cap, rvSentenceCount: () => (cap === 'all' ? Infinity : cap),
    rvManualRating: () => false, rvQuestionMixHtml: () => '', rvTypedEnabled: () => false, rvOrderPerSession: () => 1, lessonName: l => 'Bài ' + l };
  vm.createContext(ctx); vm.runInContext(read('js/lesson.js'), ctx); return ctx;
}
const TODAY = (over) => Object.assign({ ok: true, hasScope: true, dueCount: 50, dueInScope: 60, newInCurrentLesson: 10, currentLesson: 7, weakCount: 0, blockedByBacklog: false, totalDue: 60, breakdown: null, progress: null, memory: null, daily: { reviewLimit: 50, newLimit: 10, unlimited: false, reviewToday: 0, newToday: 0 } }, over || {});
test('dashboard: mặc định ("all") không có dòng trần; đã đặt trần 6 → nói rõ "tối đa 6 thẻ" + còn bao nhiêu thẻ', () => {
  const none = vm.runInContext(`renderTodayPanel(${JSON.stringify(TODAY())})`, lessonEnv('all'));
  assert.ok(!none.includes('Mỗi buổi chỉ lấy tối đa'), 'mặc định không được hiện dòng trần');
  const capped = vm.runInContext(`renderTodayPanel(${JSON.stringify(TODAY())})`, lessonEnv(6));
  assert.ok(capped.includes('Mỗi buổi chỉ lấy tối đa 6 thẻ') && capped.includes('còn 60 thẻ'), 'thiếu dòng giải thích trần');
  const small = vm.runInContext(`renderTodayPanel(${JSON.stringify(TODAY({ dueCount: 3, newInCurrentLesson: 2 }))})`, lessonEnv(6));
  assert.ok(!small.includes('Mỗi buổi chỉ lấy tối đa'), 'ít hơn trần thì không cần nhắc');
});
test('ô chọn trong Cài đặt hằng ngày: có "Tất cả (theo giới hạn ngày)" được chọn sẵn; đặt 10 → 10 được chọn', () => {
  const a = vm.runInContext('renderToday()', lessonEnv('all'));
  assert.ok(a.includes('<option value="all" selected>') && a.includes('Tất cả (theo giới hạn ngày)'));
  const b = vm.runInContext('renderToday()', lessonEnv(10));
  assert.ok(b.includes('<option value="10" selected>') && !b.includes('<option value="all" selected>'));
});
test('thông báo khoá từ mới nói đúng phạm vi (không còn "có thể ở Quyển/bài khác")', () => {
  const h = vm.runInContext(`renderTodayPanel(${JSON.stringify(TODAY({ blockedByBacklog: true, totalDue: 80 }))})`, lessonEnv('all'));
  assert.ok(h.includes('phạm vi đang chọn còn 80 thẻ đến hạn') && !h.includes('có thể ở Quyển/bài khác'));
});

runAll();
