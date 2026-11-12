#!/usr/bin/env node
// test/v149-legacy-cap.test.js — V149: sửa lỗi "hệ thống không trả thẻ ôn tập".
//
// Triệu chứng (ảnh chụp thực tế): màn "Hôm nay học" báo "Cần ôn 100 · Từ mới 20", nhưng bấm "Bắt đầu học" thì màn bắt đầu chỉ có
// "0 Từ mới · 0 Thẻ đến hạn ôn (FSRS) · 1 Từ cần luyện thêm".
// Nguyên nhân gốc: khoá localStorage cũ `rvSessionCards` TRƯỚC V138 có nghĩa "0 = KHÔNG giới hạn" (và là mặc định); từ V138 số 0 đổi nghĩa
// thành "TẮT thẻ chính thức", và V146 vẫn giữ nguyên '0' cũ khi chuyển sang khoá mới → startStudySession cắt list = [] (chỉ còn câu luyện
// bổ sung), trong khi dashboard (điều kiện `sessionCap > 0`) không hề báo gì. Phiên rỗng đó còn được sqPersist lưu → "Bắt đầu học" lần sau
// trong ngày khôi phục lại đúng phiên rỗng ấy.
// Chạy NGUYÊN js/review.js + js/lesson.js trong vm (DOM/mạng giả). Không cần Postgres/ts-fsrs.
'use strict';
const assert = require('assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0, failed = 0; const pending = [];
const test = (n, f) => pending.push({ n, f });
const section = (t) => pending.push({ section: t });
async function runAll() {
  for (const it of pending) {
    if (it.section) { console.log('\n' + it.section); continue; }
    try { await it.f(); passed++; console.log('  ✅ ' + it.n); }
    catch (e) { failed++; console.log('  ❌ ' + it.n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n     ') : e)); }
  }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Phiên server giả: `due` thẻ ôn + `fresh` từ mới (đúng như dashboard báo 100 + 20).
const serverSession = (due, fresh) => async (url) => ({ json: async () => (/\/api\/study\/session/.test(url)
  ? { ok: true, reviewCount: due, newCount: fresh, blockedByBacklog: false, totalDue: due, scopeLessons: [35, 36],
      session: Array.from({ length: due + fresh }, (_, i) => ({ type: i < due ? 'review' : 'new', word: { hz: '字' + i, py: 'zì', vi: 'chữ ' + i, l: 35, state: i < due ? 2 : 0, lessons: [35] }, skillProfile: {} })) }
  : { ok: true, examples: [] }) });

function makeEnv(over) {
  const calls = { fetch: [], cleared: [], persisted: [] };
  const base = {
    console, Math, Date, JSON, Set, Map, Array, Object, String, Number, Promise, Error, setTimeout: () => 0, clearInterval() {}, setInterval: () => 0, clearTimeout() {},
    document: { createElement: () => ({ style: {}, appendChild() {}, set textContent(v) {} }), head: { appendChild() {} }, getElementById: () => null, querySelectorAll: () => [] },
    localStorage: { _m: {}, getItem(k) { return k in this._m ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); } },
    performance: { now: () => 0 }, WORDS: [], GUEST_MAX_LESSON: 99, isLoggedIn: () => true, isGuest: false, authToken: 't', authHeaders: () => ({}),
    SENTENCES: [], CONFUSE_GROUPS: [], showPinyin: true, showMeaning: true, isAdminRole: () => false, currentTab: 'review',
    escapeHtml: esc, escapeJsAttr: s => String(s).replace(/'/g, "\\'"), lessonName: l => 'Bài ' + l, renderHanziParts: () => '', wnBlockHtml: () => '', lessonsLabel: () => 'Bài 35',
    skillAudioAvailable: () => true, vtMarkStart() {}, vtHiddenMs: () => 0, render() {}, speak() {}, playDing() {}, playBuzz() {},
    sqCreate: () => ({ items: [], doneHz: new Set(), totalPlanned: 0, answeredCount: 0, sessionId: 'sess-1234567', startTime: null, endTime: null, completedCards: [], lessonFilter: null, dayKey: null }),
    sqSnapshotLessonFilter: () => ({}), sqReadPersisted: () => null, sqPersist(k, q) { calls.persisted.push(q.items.length); }, sqClearPersisted(k) { calls.cleared.push(k); },
    ssArchiveSession() {}, refreshServerMeta() {}, sessionKnownHz: new Set(), saveSessionKnownHz() {}, sqPurgeHzFromAllQueues() {}, sqLessonFilterMatches: () => true,
    REPEAT_GAP: 10, flushProgressSync: async () => {}, genIdempotencyKey: () => 'k-123456789', todayKey: () => '2026-11-12', goTab() {}, alert() {}, SUBMIT_REVIEW_MAX_WAIT_MS: 1000,
    submitFsrsReviewAwaited: async () => ({ ok: true }), submitSkillPractice: async () => ({ ok: true }), invalidateTodayDashboardCache() {},
    fetch: serverSession(100, 20),
  };
  const ctx = Object.assign(base, over || {});
  const origFetch = ctx.fetch;
  ctx.fetch = async (url, opts) => { calls.fetch.push(String(url)); return origFetch(url, opts); };
  vm.createContext(ctx);
  for (const f of ['js/answer-match.js', 'js/skill-score.js', 'js/session-summary.js', 'js/question-engine.js', 'js/question-selector.js', 'js/review.js']) vm.runInContext(read(f), ctx);
  ctx.__calls = calls;
  return ctx;
}
const R = (ctx, code) => vm.runInContext(code, ctx);
const sessionFetches = (ctx) => ctx.__calls.fetch.filter(u => /\/api\/study\/session/.test(u)).length;

// ════════════════════════════════════════════════════════════════════════════
section('[A] Khoá cũ `rvSessionCards`: 0 (nghĩa cũ "không giới hạn") không được tắt thẻ chính thức');
test('khoá cũ = 0 / số âm / rác / 6 → "all" (đủ thẻ); 2/10/15 vẫn là lựa chọn thật được giữ', () => {
  for (const [old, exp] of [['0', Infinity], ['-3', Infinity], ['rác', Infinity], ['6', Infinity], ['2', 2], ['10', 10], ['15', 15]]) {
    const ctx = makeEnv(); R(ctx, `rvLsSet('rvSessionCards', '${old}')`);
    assert.strictEqual(R(ctx, 'rvSentenceCount()'), exp, 'khoá cũ ' + JSON.stringify(old));
  }
});
test('người học TỰ CHỌN "Tắt" ở Cài đặt (khoá mới V2) vẫn là 0 — lựa chọn tường minh được tôn trọng, và khoá mới thắng khoá cũ', () => {
  const ctx = makeEnv(); R(ctx, "rvSetSentenceCount('0')");
  assert.strictEqual(R(ctx, 'rvSentenceCount()'), 0);
  const ctx2 = makeEnv(); R(ctx2, "rvLsSet('rvSessionCards', '0')"); R(ctx2, "rvSetSentenceCount('10')");
  assert.strictEqual(R(ctx2, 'rvSentenceCount()'), 10);
});

section('[B] Tái hiện lỗi: dashboard báo 100 ôn + 20 mới → "Bắt đầu học" phải có đủ thẻ');
test('khoá cũ rvSessionCards = 0 → buổi học có ĐỦ 100 thẻ ôn + 20 từ mới (trước đây: 0 + 0, chỉ còn câu luyện bổ sung)', async () => {
  const ctx = makeEnv(); R(ctx, "rvLsSet('rvSessionCards', '0')");
  await R(ctx, 'startStudySession(false, true)');
  assert.strictEqual(R(ctx, "rvQueue.items.filter(i => i.type === 'review').length"), 100);
  assert.strictEqual(R(ctx, "rvQueue.items.filter(i => i.type === 'new').length"), 20);
  assert.strictEqual(R(ctx, 'rvSummary.reviewCount'), 100); assert.strictEqual(R(ctx, 'rvSummary.newCount'), 20);
  assert.strictEqual(R(ctx, 'rvCapOffSkipped'), 0);
  assert.strictEqual(R(ctx, 'rvStage'), 'start');
  const h = R(ctx, 'rvStartHtml()');
  assert.ok(h.includes('Thẻ đến hạn ôn (FSRS)') && !h.includes('KHÔNG được đưa vào buổi này'), 'không có cảnh báo khi thẻ đã vào đủ');
  assert.strictEqual(R(ctx, 'rvStartInfo.reviewCount'), 100); assert.strictEqual(R(ctx, 'rvStartInfo.newCount'), 20);
});
test('người học ĐANG đặt "Tắt" (V2=0): vẫn không đưa thẻ vào (tôn trọng lựa chọn) NHƯNG màn bắt đầu nói rõ lý do + nút "Bật lại thẻ ôn tập"', async () => {
  const ctx = makeEnv({ WORDS: [] }); R(ctx, "rvSetSentenceCount('0')");
  await R(ctx, 'startStudySession(false, true)');
  assert.strictEqual(R(ctx, 'rvCapOffSkipped'), 120, 'ghi nhận 120 thẻ bị loại vì cài đặt');
  assert.strictEqual(R(ctx, 'rvQueue.items.filter(rvIsOfficial).length'), 0);
  // Cả 2 đường hiển thị: có câu luyện bổ sung (màn bắt đầu) hoặc không có gì (màn "Chưa có gì để học") — đều phải giải thích.
  const html = R(ctx, "rvStage === 'start' ? rvStartHtml() : renderReview()");
  assert.ok(html.includes('Tắt') && html.includes('120') && html.includes('rvEnableOfficialCards()'), 'thiếu cảnh báo/nút bật lại: ' + html.slice(0, 300));
});
test('màn bắt đầu có câu luyện bổ sung (như ảnh chụp: "1 Từ cần luyện thêm") + trần Tắt → cảnh báo hiện ngay trên màn bắt đầu', () => {
  const ctx = makeEnv();
  R(ctx, "rvCapOffSkipped = 120; rvStage = 'start'; rvStartInfo = { lessons: [35, 36], newCount: 0, reviewCount: 0, extraCount: 1, estimated: 1 };");
  const h = R(ctx, 'rvStartHtml()');
  assert.ok(h.includes('rvEnableOfficialCards()') && h.includes('120 thẻ ôn/từ mới KHÔNG được đưa vào buổi này'));
});
test('rvEnableOfficialCards(): về "all", bỏ phiên đã lưu, nạp lại từ server → đủ thẻ', async () => {
  const ctx = makeEnv(); R(ctx, "rvSetSentenceCount('0')");
  await R(ctx, 'startStudySession(false, true)');
  assert.strictEqual(R(ctx, 'rvQueue.items.filter(rvIsOfficial).length'), 0);
  ctx.__calls.cleared.length = 0;
  await R(ctx, 'rvEnableOfficialCards()');
  assert.strictEqual(R(ctx, 'rvSentenceCountSetting()'), 'all');
  assert.ok(ctx.__calls.cleared.length >= 1, 'phải xoá phiên rỗng đã lưu');
  assert.strictEqual(R(ctx, "rvQueue.items.filter(i => i.type === 'review').length"), 100);
  assert.strictEqual(R(ctx, 'rvCapOffSkipped'), 0);
});

section('[C] Phiên rỗng đã lưu (chỉ toàn câu luyện bổ sung) không được khôi phục');
const hollow = () => ({ sessionId: 's-old', items: [{ type: 'extra', word: { hz: '旧', l: 35 } }], totalPlanned: 0, answeredCount: 0, startTime: 1, completedCards: [], lessonFilter: {}, dayKey: '2026-11-12', extra: {} });
test('phiên đã lưu rỗng (0 câu đã trả lời, 0 thẻ chính thức) → bị bỏ, xoá khỏi bộ nhớ, nạp phiên mới từ server (đủ 100 + 20)', async () => {
  const ctx = makeEnv({ sqReadPersisted: () => hollow() });
  await R(ctx, 'startStudySession(false, false)'); // đường "Bắt đầu học" thường (không forceNew)
  assert.strictEqual(sessionFetches(ctx), 1, 'phải hỏi server thay vì khôi phục phiên rỗng');
  assert.ok(ctx.__calls.cleared.length >= 1);
  assert.strictEqual(R(ctx, "rvQueue.items.filter(i => i.type === 'review').length"), 100);
});
test('phiên đã lưu CÓ thẻ chính thức → vẫn khôi phục như cũ (không gọi server)', async () => {
  const saved = Object.assign(hollow(), { items: [{ type: 'review', word: { hz: '甲', l: 35, state: 2 } }, { type: 'extra', word: { hz: '旧', l: 35 } }], totalPlanned: 1 });
  const ctx = makeEnv({ sqReadPersisted: () => saved });
  await R(ctx, 'startStudySession(false, false)');
  assert.strictEqual(sessionFetches(ctx), 0, 'khôi phục phiên đang dở, không gọi server');
  assert.strictEqual(R(ctx, 'rvQueue.sessionId'), 's-old', 'đúng phiên đã lưu được khôi phục');
  assert.strictEqual(ctx.__calls.cleared.length, 0, 'không xoá phiên hợp lệ');
});
test('phiên đã lưu chỉ còn câu bổ sung NHƯNG đã trả lời ≥1 thẻ (đang làm dở thật) → vẫn khôi phục', async () => {
  const saved = Object.assign(hollow(), { answeredCount: 30, totalPlanned: 30 });
  const ctx = makeEnv({ sqReadPersisted: () => saved });
  await R(ctx, 'startStudySession(false, false)');
  assert.strictEqual(sessionFetches(ctx), 0);
  assert.strictEqual(R(ctx, 'rvQueue.sessionId'), 's-old', 'đúng phiên đã lưu được khôi phục');
  assert.strictEqual(ctx.__calls.cleared.length, 0, 'không xoá phiên đang làm dở');
});

section('[D] Dashboard "Hôm nay học": trần Tắt không còn im lặng');
function lessonEnv(cap) {
  const ctx = { console, Math, Date, JSON, Set, Map, isLoggedIn: () => true, escapeHtml: esc, invalidateTodayDashboardCache() {}, loadStudyDashboard() {}, render() {},
    progressState: { ui: { unlimitedStudy: true, dailyReviewLimit: 100, dailyNewLimit: 20, newOnlyAfterDue: true } },
    rvSentenceCountSetting: () => cap, rvSentenceCount: () => (cap === 'all' ? Infinity : cap),
    rvManualRating: () => false, rvQuestionMixHtml: () => '', rvTypedEnabled: () => false, rvOrderPerSession: () => 1, lessonName: l => 'Bài ' + l };
  vm.createContext(ctx); vm.runInContext(read('js/lesson.js'), ctx); return ctx;
}
const TODAY = { ok: true, hasScope: true, dueCount: 100, dueInScope: 100, newInCurrentLesson: 20, currentLesson: 35, weakCount: 183, blockedByBacklog: false, totalDue: 100, breakdown: null, progress: null, memory: null, daily: { reviewLimit: 100, newLimit: 20, unlimited: true, reviewToday: 0, newToday: 0 } };
test('trần = Tắt + có thẻ để học → hiện cảnh báo có số thẻ 120 và nút "Bật lại"', () => {
  const h = vm.runInContext(`renderTodayPanel(${JSON.stringify(TODAY)})`, lessonEnv(0));
  assert.ok(h.includes('đang là <b>Tắt</b>') && h.includes('120 thẻ') && h.includes("rvSetSentenceCount('all')"), 'thiếu cảnh báo trần Tắt');
});
test('mặc định "all" hoặc trần > 0 vẫn như V146 (không cảnh báo Tắt); trần 6 vẫn nói "tối đa 6 thẻ"', () => {
  const all = vm.runInContext(`renderTodayPanel(${JSON.stringify(TODAY)})`, lessonEnv('all'));
  assert.ok(!all.includes('đang là <b>Tắt</b>') && !all.includes('Mỗi buổi chỉ lấy tối đa'));
  const six = vm.runInContext(`renderTodayPanel(${JSON.stringify(TODAY)})`, lessonEnv(6));
  assert.ok(six.includes('Mỗi buổi chỉ lấy tối đa 6 thẻ') && !six.includes('đang là <b>Tắt</b>'));
});
test('trần Tắt nhưng không có thẻ nào để học (planned = 0) → không cảnh báo thừa', () => {
  const h = vm.runInContext(`renderTodayPanel(${JSON.stringify(Object.assign({}, TODAY, { dueCount: 0, dueInScope: 0, newInCurrentLesson: 0 }))})`, lessonEnv(0));
  assert.ok(!h.includes('đang là <b>Tắt</b>'));
});

runAll();
