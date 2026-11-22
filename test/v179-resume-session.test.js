#!/usr/bin/env node
// test/v179-resume-session.test.js — V179: audit "tiếp tục phiên học bị bỏ dở" — 3 lỗi đã sửa:
//  (1) Khôi phục phiên THẬT sau buổi luyện tập độc lập từng giữ cờ practiceOnly=true → không lưu tiến trình, không dọn phiên khi xong.
//  (2) Thẻ đã chấm & ghi lên Neon nhưng chưa "sang câu kế" lúc thoát → mở lại bị hỏi & chấm FSRS lần 2.
//  (3) Bản lưu chỉ trên máy → thẻ đã ôn ở máy/tab khác vẫn hiện lại; nay hỏi server (đọc), lỗi/quá thời gian thì bỏ qua.
// Chạy hàm THẬT từ js/review.js, js/study-queue.js, lib/db.js trong vm với đồ giả; KHÔNG thay cho thử trên app + Postgres thật.
const assert = require('assert'); const fs = require('fs'); const path = require('path'); const vm = require('vm'); const Module = require('module');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const RV = read('js/review.js'); const SQ = read('js/study-queue.js');
function grab(src, name) {
  const m = new RegExp('(async\\s+)?function\\s+' + name + '\\s*\\(').exec(src); assert.ok(m, 'không thấy hàm ' + name);
  let d = 0; for (let j = src.indexOf('{', src.indexOf(')', m.index)); j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && !--d) return src.slice(m.index, j + 1); }
}
const J = (x) => JSON.parse(JSON.stringify(x));
const item = (type, hz, extra) => Object.assign({ type, word: { hz, l: 1 } }, extra);
const savedSession = (over) => Object.assign({ sessionId: 'S-real', items: [item('review', '你好'), item('new', '谢谢'), item('extra', '再见')], doneHz: [], totalPlanned: 10, answeredCount: 4, startTime: 1000000, endTime: null, completedCards: [{ hz: '老师', l: 1, correct: true, at: 1 }], lessonFilter: null, dayKey: '2026-11-20', savedAt: 1000500, graded: null, extra: { log: [], summary: {} } }, over);

// Môi trường giả cho các hàm của review.js
function mkEnv(over) {
  const calls = { persist: [], archive: [], clear: [], purge: [], known: 0, fresh: 0, loadFailed: 0, fetch: [] };
  const ctx = Object.assign({
    rvLeechOnly: false, rvLeechMode: false, rvOnlyType: null, rvWeakMode: false, rvStorageMode: () => 'review', authToken: 't', authHeaders: () => ({}),
    sqReadPersisted: () => J(savedSession()), rvSavedSessionIsHollow: () => false, sqClearPersisted: (k) => calls.clear.push(k), sqLessonFilterMatches: () => true,
    sessionKnownHz: new Set(), saveSessionKnownHz: () => { calls.known++; }, sqPurgeHzFromAllQueues: (hz) => calls.purge.push(hz), sqSnapshotLessonFilter: () => null, todayKey: () => '2026-11-20',
    sqCreate: () => ({ items: [], doneHz: new Set(), totalPlanned: 0, answeredCount: 0, sessionId: null, startTime: null, endTime: null, completedCards: [], lessonFilter: null, dayKey: null }),
    sqPersist: (mode, q, extra) => calls.persist.push({ mode, graded: q.graded ? J(q.graded) : null, items: q.items.map((i) => i.word.hz), extra }),
    ssArchiveSession: (k, q) => calls.archive.push(q && q.sessionId), refreshServerMeta() {},
    rvSummary: {}, rvLog: [], rvQSession: null, rvRestoreQSession() {}, rvNormalizeIntroFlags() {}, rvStage: '', rvStartInfo: null, rvMatch: null, rvBlockedByBacklog: false, rvTotalDue: 0, rvCapOffSkipped: 0,
    rvExamplePool: [], rvLastAnswer: null, rvAdaptNote: '', rvLearner: null, goTab() {}, rvLoadExamples: async () => {}, rvPrepareCurrentCard() {}, render() {}, currentTab: 'review',
    document: { getElementById: () => ({ innerHTML: '' }) }, genIdempotencyKey: () => 'S-new', QS: { newSession: () => ({}) },
    rvFetchFreshSession: async () => { calls.fresh++; return { error: 'dừng ở đây' }; }, rvLoadFailed: () => { calls.loadFailed++; },
    setTimeout, clearTimeout, Set, Date, encodeURIComponent,
    fetch: async (url, opts) => { calls.fetch.push({ url, opts }); return { json: async () => ({ ok: true, reviewed: [] }) }; },
    rvQueue: { items: [], doneHz: new Set(), practiceOnly: false },
  }, over);
  vm.createContext(ctx);
  const names = ['rvIsOfficialItem', 'rvMarkGraded', 'rvApplyGradedMarker', 'rvFetchReviewedElsewhere', 'startStudySession'];
  vm.runInContext('const RV_REVALIDATE_MAX_WAIT_MS = 1500, RV_REVALIDATE_SKEW_MS = 60000;\n' + names.map((n) => grab(RV, n)).join('\n') + '\n' + names.map((n) => 'this.' + n + ' = ' + n + ';').join('\n'), ctx);
  return { ctx, calls };
}
// Hàng đợi "luyện tập độc lập" đang nằm trong bộ nhớ (rvBeginPracticeOnly: rvQueue = sqCreate(); rvQueue.practiceOnly = true)
const practiceQueue = () => ({ items: [item('extra', 'x')], doneHz: new Set(), practiceOnly: true, sessionId: 'S-practice', answeredCount: 0, totalPlanned: 1, completedCards: [] });

const tests = []; const test = (n, f) => tests.push([n, f]);

// ───────── (1) cờ practiceOnly
test('(1) "Học tiếp" sau buổi luyện tập độc lập: phiên thật KHÔNG còn cờ practiceOnly, dữ liệu đúng của bản lưu, doneHz khôi phục', async () => {
  const { ctx } = mkEnv({ rvQueue: practiceQueue(), sqReadPersisted: () => J(savedSession({ doneHz: ['老师'] })) });
  await ctx.startStudySession(false, false);
  const q = ctx.rvQueue; assert.ok(!q.practiceOnly, 'cờ luyện tập phải biến mất'); assert.strictEqual(q.sessionId, 'S-real'); assert.deepStrictEqual(J(q.items.map((i) => i.word.hz)), ['你好', '谢谢', '再见']);
  assert.strictEqual(q.answeredCount, 4); assert.deepStrictEqual([...q.doneHz], ['老师']); assert.strictEqual(q.completedCards.length, 1);
});
test('(1) sau khôi phục, rvAdvanceQueue LƯU tiến trình sau mỗi câu và DỌN phiên khi xong (trước đây bỏ qua cả hai)', async () => {
  const { ctx, calls } = mkEnv({ rvQueue: practiceQueue(), sqReadPersisted: () => J(savedSession({ items: [item('review', '你好'), item('review', '谢谢')] })) });
  await ctx.startStudySession(false, false);
  // đồ giả tối thiểu để chạy rvAdvanceQueue THẬT
  Object.assign(ctx, { rvIsPractice: (it) => ['extra', 'redo', 'drill', 'order', 'tone', 'probe'].includes(it && it.type), rvAdaptExtras() {}, SM: { canQueueRedo: () => false }, RV_NEW_GAP: 3, RV_DRILL_GAP: 3, RV_DRILL_MAX_TRIES: 3, RV_CORRECTION_GAP: 3 });
  vm.runInContext(grab(RV, 'rvAdvanceQueue') + '\nthis.rvAdvanceQueue = rvAdvanceQueue;', ctx);
  ctx.rvLastAnswer = { correct: true }; ctx.rvAdvanceQueue(); // còn 1 thẻ → phải lưu
  assert.strictEqual(calls.persist.length, 1, 'lưu sau câu đầu'); assert.deepStrictEqual(calls.persist[0].items, ['谢谢']);
  ctx.rvLastAnswer = { correct: true }; ctx.rvAdvanceQueue(); // hết hàng đợi → lưu trữ + dọn
  assert.deepStrictEqual(calls.archive, ['S-real'], 'đóng sổ phiên'); assert.ok(calls.clear.includes('review'), 'dọn bản lưu khi xong');
});
test('(1) "Học mới" ngay sau buổi luyện tập độc lập: đóng sổ đúng phiên THẬT đang dở (từ bản lưu), không phải hàng đợi luyện tập', async () => {
  const { ctx, calls } = mkEnv({ rvQueue: practiceQueue() });
  await ctx.startStudySession(false, true);
  assert.deepStrictEqual(calls.archive, ['S-real']); assert.ok(calls.clear.includes('review')); assert.strictEqual(calls.fresh, 1, 'rồi nạp phiên mới');
  const m2 = mkEnv({ rvQueue: Object.assign(practiceQueue(), { practiceOnly: false, sessionId: 'S-mem' }) }); await m2.ctx.startStudySession(false, true);
  assert.deepStrictEqual(m2.calls.archive, ['S-mem'], 'hàng đợi thật trong bộ nhớ vẫn được đóng sổ như cũ');
});

// ───────── (2) dấu "đã chấm"
test('(2) rvMarkGraded: ghi dấu vào bản lưu khi thẻ ở đầu hàng; bỏ qua khi luyện tập / không phải thẻ chính thức / không còn ở đầu hàng', () => {
  const head = item('review', '你好'); const { ctx, calls } = mkEnv({ rvQueue: { items: [head, item('new', '谢谢')], sessionId: 'S1', practiceOnly: false } });
  ctx.rvMarkGraded(head, true);
  assert.strictEqual(calls.persist.length, 1); assert.deepStrictEqual(calls.persist[0].graded && { hz: calls.persist[0].graded.hz, type: calls.persist[0].graded.type, correct: calls.persist[0].graded.correct, sid: calls.persist[0].graded.sid }, { hz: '你好', type: 'review', correct: true, sid: 'S1' });
  ctx.rvMarkGraded(head, null); assert.strictEqual(calls.persist[1].graded.correct, null, 'chưa biết đúng/sai → null');
  const n = calls.persist.length; ctx.rvMarkGraded(item('extra', 'x'), true); ctx.rvMarkGraded(ctx.rvQueue.items[1], true); assert.strictEqual(calls.persist.length, n, 'extra / không ở đầu hàng → không ghi');
  const p = mkEnv({ rvQueue: { items: [head], practiceOnly: true } }); p.ctx.rvMarkGraded(head, true); assert.strictEqual(p.calls.persist.length, 0, 'buổi luyện tập không lưu');
});
test('(2) sqPersist (study-queue.js) lưu kèm trường graded; không có thì null', () => {
  const store = {}; const ctx = { authUsername: 'u', localStorage: { setItem: (k, v) => { store[k] = v; } }, sqSnapshotLessonFilter: () => null, todayKey: () => 'd', Date, JSON };
  vm.createContext(ctx); vm.runInContext(grab(SQ, 'sqStorageKey') + '\n' + grab(SQ, 'sqPersist') + '\nthis.sqPersist = sqPersist;', ctx);
  const q = { sessionId: 'S', items: [], doneHz: new Set(), answeredCount: 1, totalPlanned: 2, completedCards: [] };
  ctx.sqPersist('review', Object.assign({ graded: { hz: '你好', type: 'review', correct: true } }, q), {}); assert.deepStrictEqual(JSON.parse(store.sqState_review_u).graded, { hz: '你好', type: 'review', correct: true });
  ctx.sqPersist('review', q, {}); assert.strictEqual(JSON.parse(store.sqState_review_u).graded, null);
});
test('(2) rvApplyGradedMarker: thẻ đã chấm ở đầu hàng bị bỏ, đếm 1 câu xong; đúng → vào danh sách đã biết; sai/chưa rõ → không', () => {
  const { ctx } = mkEnv();
  const ok = J(ctx.rvApplyGradedMarker(savedSession({ graded: { hz: '你好', l: 1, type: 'review', correct: true, at: 5, sid: 'S-real' } })));
  assert.deepStrictEqual(ok.items.map((i) => i.word.hz), ['谢谢', '再见']); assert.strictEqual(ok.answeredCount, 5); assert.strictEqual(ok.knownHz, '你好');
  assert.deepStrictEqual(ok.completedCards.map((c) => [c.hz, c.correct]), [['老师', true], ['你好', true]]);
  const wrong = J(ctx.rvApplyGradedMarker(savedSession({ graded: { hz: '你好', l: 1, type: 'review', correct: false, sid: 'S-real' } }))); assert.strictEqual(wrong.knownHz, null); assert.strictEqual(wrong.answeredCount, 5); assert.strictEqual(wrong.completedCards[1].correct, false);
  const unknown = J(ctx.rvApplyGradedMarker(savedSession({ graded: { hz: '你好', type: 'review', correct: null, sid: 'S-real' } }))); assert.strictEqual(unknown.knownHz, null); assert.strictEqual(unknown.items.length, 2);
});
test('(2) rvApplyGradedMarker KHÔNG bỏ nhầm: dấu của thẻ khác / dạng khác / phiên khác / không có dấu → giữ nguyên', () => {
  const { ctx } = mkEnv();
  for (const g of [{ hz: '谢谢', type: 'review', sid: 'S-real' }, { hz: '你好', type: 'new', sid: 'S-real' }, { hz: '你好', type: 'review', sid: 'S-khac' }, null]) {
    const r = J(ctx.rvApplyGradedMarker(savedSession({ graded: g }))); assert.strictEqual(r.items.length, 3, JSON.stringify(g)); assert.strictEqual(r.answeredCount, 4); assert.strictEqual(r.knownHz, null);
  }
  assert.strictEqual(J(ctx.rvApplyGradedMarker(savedSession({ items: [item('extra', '你好')], graded: { hz: '你好', type: 'extra', sid: 'S-real' } }))).items.length, 1, 'câu luyện bổ sung không bao giờ bị coi là đã chấm FSRS');
});
test('(2) khôi phục thật: thẻ đã chấm KHÔNG bị hỏi lại; câu đã đúng vào sessionKnownHz và bị loại khỏi các hàng đợi khác; tiến độ +1', async () => {
  const { ctx, calls } = mkEnv({ sqReadPersisted: () => J(savedSession({ graded: { hz: '你好', l: 1, type: 'review', correct: true, at: 7, sid: 'S-real' } })) });
  await ctx.startStudySession(false, false);
  assert.deepStrictEqual(J(ctx.rvQueue.items.map((i) => i.word.hz)), ['谢谢', '再见']); assert.strictEqual(ctx.rvQueue.answeredCount, 5);
  assert.ok(ctx.sessionKnownHz.has('你好')); assert.deepStrictEqual(calls.purge, ['你好']); assert.strictEqual(calls.known, 1);
});
test('(2) rvAdvanceQueue xoá dấu graded TRƯỚC khi lưu → bản lưu sau khi sang câu kế không còn dấu cũ', () => {
  const head = item('review', '你好'); const q = { items: [head, item('review', '谢谢')], doneHz: new Set(), practiceOnly: false, graded: { hz: '你好', type: 'review' }, answeredCount: 0, completedCards: [], sessionId: 'S' };
  const { ctx, calls } = mkEnv({ rvQueue: q, rvLastAnswer: { correct: true }, rvIsPractice: () => false, rvAdaptExtras() {}, SM: { canQueueRedo: () => false }, RV_NEW_GAP: 3, RV_DRILL_GAP: 3, RV_DRILL_MAX_TRIES: 3, RV_CORRECTION_GAP: 3 });
  vm.runInContext(grab(RV, 'rvAdvanceQueue') + '\nthis.rvAdvanceQueue = rvAdvanceQueue;', ctx); ctx.rvAdvanceQueue();
  assert.strictEqual(calls.persist.length, 1); assert.strictEqual(calls.persist[0].graded, null);
});
test('(2) nối dây: rvMarkGraded được gọi NGAY sau khi gửi kết quả (đồng bộ, trước await đầu tiên) và khi server xác nhận', () => {
  const body = grab(RV, 'rvCommitRating'); const submit = body.indexOf('submitFsrsReviewAwaited('); const first = body.indexOf('rvMarkGraded(item, rvLastAnswer'); const firstAwait = body.indexOf('await ', submit);
  assert.ok(submit > 0 && first > submit && first < firstAwait, 'ghi dấu phải nằm giữa lúc gửi và await đầu tiên'); assert.ok(/rvMarkGraded\(item, data\.answerCorrect\)/.test(body));
});

// ───────── (3) hỏi server thẻ đã ôn ở nơi khác
test('(3) rvFetchReviewedElsewhere: chỉ gửi thẻ chính thức, mốc = bắt đầu phiên − 60 giây, noRetry, mã hoá đúng; trả về tập hz', async () => {
  const { ctx, calls } = mkEnv({ fetch: async (url, opts) => { calls.fetch.push({ url, opts }); return { json: async () => ({ ok: true, reviewed: ['谢谢'] }) }; } });
  const set = await ctx.rvFetchReviewedElsewhere([item('review', '你好'), item('new', '谢谢'), item('extra', '再见'), item('review', '你好')], 1000000);
  assert.deepStrictEqual([...set], ['谢谢']); assert.strictEqual(calls.fetch.length, 1);
  const u = new URL('http://x' + calls.fetch[0].url); assert.strictEqual(u.pathname, '/api/study/session/reviewed-since'); assert.strictEqual(u.searchParams.get('since'), '940000');
  assert.deepStrictEqual(u.searchParams.get('cards').split(',').map(decodeURIComponent), ['你好', '谢谢'], 'bỏ extra và trùng'); assert.strictEqual(calls.fetch[0].opts.noRetry, true);
  const none = mkEnv(); assert.strictEqual((await none.ctx.rvFetchReviewedElsewhere([item('extra', 'x')], 1)).size, 0); assert.strictEqual(none.calls.fetch.length, 0, 'không có thẻ chính thức → không gọi server');
});
test('(3) lỗi mạng / phản hồi hỏng / ok:false / quá thời gian → tập rỗng (không ném lỗi, vẫn mở phiên)', async () => {
  const bad = [async () => { throw new Error('mạng'); }, async () => ({ json: async () => { throw new Error('không phải JSON'); } }), async () => ({ json: async () => ({ ok: false }) }), async () => ({ json: async () => ({ ok: true, reviewed: 'x' }) })];
  for (const f of bad) { const { ctx } = mkEnv({ fetch: f }); assert.strictEqual((await ctx.rvFetchReviewedElsewhere([item('review', '你好')], 1)).size, 0); }
  const fire = []; const hang = mkEnv({ fetch: () => new Promise(() => {}), setTimeout: (fn, ms) => { fire.push(ms); Promise.resolve().then(fn); return 1; }, clearTimeout() {} });
  assert.strictEqual((await hang.ctx.rvFetchReviewedElsewhere([item('review', '你好')], 1)).size, 0); assert.deepStrictEqual(fire, [1500], 'chờ tối đa 1,5 giây');
});
test('(3) khôi phục thật: thẻ đã ôn ở nơi khác bị bỏ khỏi hàng đợi và tính vào tiến độ; câu luyện bổ sung không bị đụng', async () => {
  const { ctx } = mkEnv({ fetch: async () => ({ json: async () => ({ ok: true, reviewed: ['你好', '再见'] }) }) });
  await ctx.startStudySession(false, false);
  assert.deepStrictEqual(J(ctx.rvQueue.items.map((i) => i.word.hz)), ['谢谢', '再见'], '你好 bị bỏ; 再见 là extra nên giữ'); assert.strictEqual(ctx.rvQueue.answeredCount, 5);
});
test('(3) mọi thẻ chính thức đã ôn ở nơi khác và không còn gì → rơi xuống nạp phiên mới từ server (không mở phiên rỗng)', async () => {
  const { ctx, calls } = mkEnv({ sqReadPersisted: () => J(savedSession({ items: [item('review', '你好'), item('new', '谢谢')] })), fetch: async () => ({ json: async () => ({ ok: true, reviewed: ['你好', '谢谢'] }) }) });
  await ctx.startStudySession(false, false); assert.strictEqual(calls.fresh, 1); assert.strictEqual(calls.loadFailed, 1);
});
test('(3) server lỗi → khôi phục như cũ, không mất gì', async () => {
  const { ctx } = mkEnv({ fetch: async () => { throw new Error('Neon đang ngủ'); } });
  await ctx.startStudySession(false, false); assert.deepStrictEqual(J(ctx.rvQueue.items.map((i) => i.word.hz)), ['你好', '谢谢', '再见']); assert.strictEqual(ctx.rvQueue.answeredCount, 4);
});

// ───────── (3) phía server
function loadDb(holder) {
  for (const k of Object.keys(require.cache)) if (k.startsWith(path.join(ROOT, 'lib'))) delete require.cache[k];
  const orig = Module._load; const stub = () => new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : (k === Symbol.toPrimitive ? () => '' : stub())), apply: () => stub(), construct: () => stub() });
  Module._load = function (req) { try { return orig.apply(this, arguments); } catch (e) { if (e && e.code === 'MODULE_NOT_FOUND' && !req.startsWith('.') && !req.startsWith('/')) { if (req === 'pg') return { Pool: class { on() {} connect() { return Promise.resolve(holder.client); } } }; if (req === 'ts-fsrs') return new Proxy({ generatorParameters: () => ({ w: new Array(21).fill(0.5) }) }, { get: (t, k) => (k in t ? t[k] : stub()) }); return stub(); } throw e; } };
  try { return require('../lib/db'); } finally { Module._load = orig; }
}
test('server: getCardsReviewedSince — CHỈ ĐỌC, tham số đúng, khử trùng, trần 200, since sai/danh sách rỗng → [] không chạm database', async () => {
  const holder = {}; process.env.DATABASE_URL = 'postgresql://u:p@ep-x-123-pooler.ap-southeast-2.aws.neon.tech/db'; const db = loadDb(holder); const seen = [];
  const client = { query: async (sql, params) => { seen.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params }); if (/^SELECT hz FROM fsrs_cards/.test(String(sql))) return { rows: [{ hz: '你好' }] }; if (/^\s*SELECT COUNT\(\*\)/.test(String(sql))) return { rows: [{ c: 5 }] }; return { rows: [], rowCount: 0 }; }, release() {} };
  holder.client = client; // db.js tự gọi getPool() nội bộ → giả lập ở tầng thư viện pg
  const since = new Date('2026-11-20T01:00:00Z'); const out = await db.getCardsReviewedSince('阿英', ['你好', '你好', '谢谢', '', null, 5], since);
  assert.deepStrictEqual(out, ['你好']); const q = seen.find((s) => /^SELECT hz FROM fsrs_cards/.test(s.sql));
  assert.strictEqual(q.sql, 'SELECT hz FROM fsrs_cards WHERE user_id = $1 AND hz = ANY($2::text[]) AND last_review > $3'); assert.deepStrictEqual(q.params.slice(0, 2), ['阿英', ['你好', '谢谢']]); assert.strictEqual(q.params[2], since);
  assert.ok(!seen.some((s) => /^(INSERT|UPDATE|DELETE)/i.test(s.sql) && !/schema_state/.test(s.sql)), 'không ghi vào bảng dữ liệu');
  seen.length = 0; assert.deepStrictEqual(await db.getCardsReviewedSince('u', [], since), []); assert.deepStrictEqual(await db.getCardsReviewedSince('u', ['x'], new Date('hỏng')), []); assert.deepStrictEqual(await db.getCardsReviewedSince('u', ['x'], 123), []); assert.strictEqual(seen.length, 0);
  await db.getCardsReviewedSince('u', Array.from({ length: 500 }, (_, i) => 'w' + i), since); assert.strictEqual(seen.find((s) => /^SELECT hz FROM fsrs_cards/.test(s.sql)).params[1].length, 200);
});
test('server: route GET /api/study/session/reviewed-since cần đăng nhập, giải mã hz, gọi đúng hàm, lỗi qua fail(); đã nhập khẩu hàm', () => {
  const s = read('api/index.js'); const i = s.indexOf("app.get('/api/study/session/reviewed-since'"); assert.ok(i > 0); const body = s.slice(i, s.indexOf('\n});', i));
  assert.ok(/requireAuth\(req, res\)/.test(body) && /if \(!authed\) return;/.test(body) && /getCardsReviewedSince\(authed\.username, hzs, since\)/.test(body) && /decodeURIComponent/.test(body) && /catch \(e\) \{ fail\(res, e\); \}/.test(body));
  assert.ok(/^\s*getCardsReviewedSince,/m.test(s.slice(0, s.indexOf('const app'))) || s.slice(0, 4000).includes('getCardsReviewedSince,'), 'đã nhập khẩu từ db'); assert.ok(read('lib/db.js').includes('countDueFsrsCards, getCardsReviewedSince,'), 'đã xuất khẩu');
});
test('đường GHI không đổi: không có lệnh ghi mới nào ngoài localStorage — submitFsrsReview và /api/study/review giữ nguyên', () => {
  const body = grab(RV, 'rvCommitRating'); assert.ok(/submitFsrsReviewAwaited\(Object\.assign\(\{/.test(body));
  const mark = grab(RV, 'rvMarkGraded'); assert.ok(!/fetch\(|submitFsrsReview/.test(mark), 'rvMarkGraded chỉ ghi localStorage');
});

(async () => {
  let passed = 0, failed = 0;
  for (const [n, f] of tests) { try { await f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.message)); } }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
