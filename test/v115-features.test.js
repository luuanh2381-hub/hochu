#!/usr/bin/env node
// test/v115-features.test.js — kiểm thử V115: vòng sửa lỗi ngay, từ cứng đầu, rating gọn, Hôm nay học gọn + ghi nhớ ước lượng,
// phân tích kỹ năng gộp (trừ đoán mò), luyện thanh điệu, xem nét viết. Chạy: node test/v115-features.test.js
//
// LƯU Ý TRUNG THỰC:
//  • Không có PostgreSQL / ts-fsrs / mạng trong môi trường này. Phần tính toán thuần (memory-forecast, skill-pooled, QE) được chạy thật;
//    phần giao diện chạy NGUYÊN js/*.js trong vm (DOM/mạng giả). Truy vấn SQL mới (getLearnedFsrsCards) và lời gọi ts-fsrs thật
//    (getMemoryForecast) CHƯA được thực thi — chỉ kiểm cấu trúc mã nguồn.
//  • js/stroke.js: chỉ phần tách chữ được test; nạp HanziWriter từ CDN cần mạng thật nên KHÔNG kiểm tra được ở đây.
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
const tick = () => new Promise(r => setImmediate(r));
const near = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-9);

const MF = require('../lib/memory-forecast');
const SP = require('../lib/skill-pooled');
const SKILLS = require('../lib/skills');
const REC = require('../lib/skill-recommend');
const QE = require('../js/question-engine');
const QS = (() => { global.QE = QE; global.SS = require('../js/skill-score'); return require('../js/question-selector'); })();

// ════════════════════════════════════════════════════════════════════════════
section('[A] lib/memory-forecast — chỉ số ghi nhớ ước lượng, dự báo 7 ngày, từ cứng đầu');
const NOW = Date.parse('2026-10-18T16:30:00Z'); // = 23:30 ngày 18/10 giờ Việt Nam
const mk = (hz, r, extra) => Object.assign({ hz, l: 1, lapses: 0, due: new Date(NOW + 864e5 * 30).toISOString(), _r: r }, extra || {});
const rOf = (c) => c._r;
test('trung bình xác suất nhớ + đếm thẻ có nguy cơ quên (<80%), sắp từ thấp nhất lên đầu', () => {
  const m = MF.summarizeMemory([mk('a', .95), mk('b', .9), mk('c', .85), mk('d', .7), mk('e', .6), mk('f', .99)], NOW, rOf);
  assert.strictEqual(m.learned, 6); assert.strictEqual(m.measured, 6);
  assert.ok(near(m.avgRetrievability, 0.832, 1e-9), String(m.avgRetrievability)); // (0.95+0.9+0.85+0.7+0.6+0.99)/6 = 4.99/6 = 0.8317
  assert.strictEqual(m.atRisk, 2);
  assert.deepStrictEqual(m.atRiskWords.map(x => x.hz), ['e', 'd']);
});
test('mẫu quá nhỏ (<5 thẻ) → KHÔNG nêu %, vẫn báo số thẻ', () => {
  const m = MF.summarizeMemory([mk('a', .9), mk('b', .8), mk('c', .7), mk('d', .6)], NOW, rOf);
  assert.strictEqual(m.avgRetrievability, null); assert.strictEqual(m.measured, 4);
});
test('thẻ không tính được xác suất (ném lỗi / NaN / ngoài 0..1) bị BỎ khỏi trung bình, không đoán', () => {
  const cards = [mk('a', .9), mk('b', .9), mk('c', .9), mk('d', .9), mk('e', .9), mk('x', NaN), mk('y', 1.7), mk('z', -1), mk('boom', 0)];
  const m = MF.summarizeMemory(cards, NOW, (c) => { if (c.hz === 'boom') throw new Error('x'); return c._r; });
  assert.strictEqual(m.learned, 9); assert.strictEqual(m.measured, 5); assert.ok(near(m.avgRetrievability, 0.9));
  const none = MF.summarizeMemory([mk('a', .9)], NOW, null);
  assert.strictEqual(none.measured, 0);
});
test('dự báo theo NGÀY GIỜ VIỆT NAM: 23:59 hôm nay → ngày 0, 00:30 hôm sau → ngày 1; quá hạn gộp vào hôm nay; >7 ngày không vào', () => {
  const cards = [
    mk('a', .9, { due: '2026-10-18T16:59:00Z' }),  // 23:59 VN 18/10  → 0
    mk('b', .9, { due: '2026-10-18T17:30:00Z' }),  // 00:30 VN 19/10  → 1
    mk('c', .9, { due: '2026-10-01T00:00:00Z' }),  // quá hạn         → 0 + overdue
    mk('d', .9, { due: '2026-10-24T10:00:00Z' }),  // 24/10 → +6
    mk('e', .9, { due: '2026-10-25T10:00:00Z' }),  // +7: ngoài cửa sổ
  ];
  const m = MF.summarizeMemory(cards, NOW, rOf);
  assert.strictEqual(m.forecast.length, 7);
  assert.deepStrictEqual(m.forecast.map(f => f.count), [2, 1, 0, 0, 0, 0, 1]);
  assert.strictEqual(m.forecast[0].date, '2026-10-18'); assert.strictEqual(m.forecast[1].date, '2026-10-19');
  assert.strictEqual(m.overdue, 1);
});
test('từ cứng đầu: lapses ≥ 4 (đúng ngưỡng), 3 thì chưa', () => {
  assert.strictEqual(MF.LEECH_LAPSES, 4);
  const m = MF.summarizeMemory([mk('a', .9, { lapses: 3 }), mk('b', .9, { lapses: 4 }), mk('c', .9, { lapses: 9 })], NOW, rOf);
  assert.strictEqual(m.leech, 2);
  assert.ok(MF.isLeechCard({ lapses: 4 }) && !MF.isLeechCard({ lapses: 3 }) && !MF.isLeechCard(null));
});
test('lapses KHÔNG bao giờ giảm → từ từng cứng đầu nhưng nay đã VỮNG (stability ≥ 21 ngày) thôi bị gắn cờ; thiếu stability thì vẫn tính (không giấu từ khó)', () => {
  assert.strictEqual(MF.LEECH_MATURE_STABILITY, 21);
  assert.strictEqual(MF.isLeechCard({ lapses: 6, stability: 20.9 }), true);
  assert.strictEqual(MF.isLeechCard({ lapses: 6, stability: 21 }), false);
  assert.strictEqual(MF.isLeechCard({ lapses: 6, stability: 90 }), false);
  assert.strictEqual(MF.isLeechCard({ lapses: 6 }), true); assert.strictEqual(MF.isLeechCard({ lapses: 6, stability: null }), true);
  const m = MF.summarizeMemory([mk('a', .9, { lapses: 6, stability: 3 }), mk('b', .95, { lapses: 6, stability: 40 })], NOW, rOf);
  assert.strictEqual(m.leech, 1);
});
test('danh sách rỗng / sai kiểu: không ném lỗi, dự báo 7 ngày đều 0', () => {
  for (const bad of [[], null, undefined]) {
    const m = MF.summarizeMemory(bad, NOW, rOf);
    assert.strictEqual(m.learned, 0); assert.strictEqual(m.avgRetrievability, null);
    assert.deepStrictEqual(m.forecast.map(f => f.count), [0, 0, 0, 0, 0, 0, 0]);
  }
});
test('danh sách từ sắp quên bị giới hạn (không đẩy hàng trăm từ về trình duyệt)', () => {
  const cards = Array.from({ length: 50 }, (_, i) => mk('w' + i, 0.1 + i / 1000));
  const m = MF.summarizeMemory(cards, NOW, rOf);
  assert.strictEqual(m.atRisk, 50); assert.strictEqual(m.atRiskWords.length, MF.AT_RISK_LIST_MAX);
});

// ════════════════════════════════════════════════════════════════════════════
section('[B] lib/skill-pooled — gộp theo kỹ năng, trừ đoán mò, khoảng cách kỹ năng');
test('trừ đoán mò: trắc nghiệm 51/60 → 0.80; tự gõ KHÔNG trừ; trộn có trọng số theo số lượt', () => {
  const r = SP.summarizePooled([
    { exercise_type: 'review-hz2vi', n: 60, correct: 51 },
    { exercise_type: 'review-vi2hz', n: 40, correct: 22 }, { exercise_type: 'review-vi2hz-typed', n: 10, correct: 3 },
  ]);
  assert.ok(near(r.skills.recognition.correctedRate, 0.8)); assert.strictEqual(r.skills.recognition.rawRate, 0.85);
  assert.ok(near(r.skills.recall.correctedRate, 0.38, 1e-9), String(r.skills.recall.correctedRate)); // (0.4×40 + 0.3×10)/50
  assert.strictEqual(r.skills.recall.choiceN, 40); assert.strictEqual(r.skills.recall.typedN, 10);
});
test('đoán mò thuần tuý (25% đúng ở trắc nghiệm) → 0 điểm, không âm', () => {
  assert.strictEqual(SP.correctedRate(0.25, 0.25), 0); assert.strictEqual(SP.correctedRate(0.1, 0.25), 0);
  assert.strictEqual(SP.correctedRate(1, 0.25), 1); assert.strictEqual(SP.correctedRate(0.5, 0), 0.5);
});
test('dưới 20 lượt: KHÔNG nêu tỉ lệ (enough=false, rate=null); đủ 20 thì nêu', () => {
  const a = SP.summarizePooled([{ exercise_type: 'review-hz2vi', n: 19, correct: 19 }]).skills.recognition;
  assert.strictEqual(a.enough, false); assert.strictEqual(a.correctedRate, null); assert.strictEqual(a.rawRate, null); assert.strictEqual(a.ci, null);
  const b = SP.summarizePooled([{ exercise_type: 'review-hz2vi', n: 20, correct: 20 }]).skills.recognition;
  assert.strictEqual(b.enough, true); assert.strictEqual(b.correctedRate, 1);
});
test('loại câu lạ/cũ không có trong bảng server → bỏ qua và đếm riêng (không đoán kỹ năng)', () => {
  const r = SP.summarizePooled([{ exercise_type: 'zzz-unknown', n: 7, correct: 7 }, { exercise_type: 'review-hz2vi', n: 25, correct: 20 }, { exercise_type: 'review-hz2vi', n: 0, correct: 0 }]);
  assert.strictEqual(r.skippedN, 7); assert.strictEqual(r.usedN, 25); assert.ok(!r.skills.zzz);
  assert.deepStrictEqual(SP.summarizePooled(null).skills, {});
});
test('khoảng tin cậy Wilson: chứa p, trong [0,1], hẹp dần khi mẫu lớn', () => {
  const s = SP.wilson(15, 20), l = SP.wilson(150, 200);
  assert.ok(s.lo < 0.75 && s.hi > 0.75 && s.lo >= 0 && s.hi <= 1);
  assert.ok((l.hi - l.lo) < (s.hi - s.lo));
  const z = SP.wilson(0, 0); assert.deepStrictEqual([z.lo, z.hi], [0, 1]);
  assert.ok(SP.wilson(20, 20).hi <= 1 && SP.wilson(0, 20).lo >= 0);
});
const POOLED_GAP = SP.summarizePooled([{ exercise_type: 'review-hz2vi', n: 60, correct: 51 }, { exercise_type: 'review-vi2hz', n: 40, correct: 22 }, { exercise_type: 'review-vi2hz-typed', n: 10, correct: 3 }]);
test('khoảng cách nhận diện → nhớ chủ động: chỉ nêu khi cả hai ≥30 lượt VÀ chênh ≥25 điểm', () => {
  const g = SP.recognitionRecallGap(POOLED_GAP); assert.ok(g && near(g.gap, 0.42, 1e-9));
  const few = SP.summarizePooled([{ exercise_type: 'review-hz2vi', n: 60, correct: 51 }, { exercise_type: 'review-vi2hz', n: 25, correct: 6 }]);
  assert.strictEqual(SP.recognitionRecallGap(few), null, 'recall mới 25 lượt (<30)');
  const close = SP.summarizePooled([{ exercise_type: 'review-hz2vi', n: 60, correct: 51 }, { exercise_type: 'review-vi2hz', n: 60, correct: 45 }]);
  assert.strictEqual(SP.recognitionRecallGap(close), null, 'chênh dưới 25 điểm');
  assert.strictEqual(SP.recognitionRecallGap(null), null);
});
test('recommendGlobal: có khuyến nghị khoảng cách (kèm điều kiện dừng); không mâu thuẫn với "ổn định"; không có pooled → không đổi hành vi cũ', () => {
  const overview = { testedWords: 50, skills: {} };
  const g = REC.recommendGlobal({ overview, retention: null, pooled: POOLED_GAP });
  const it = g.items.find(i => i.id === 'recognition-recall-gap');
  assert.ok(it && it.action && it.action.skill === 'recall' && /điểm %/.test(it.stopWhen) && /trừ xác suất đoán mò/.test(it.why));
  assert.ok(!g.items.some(i => i.id === 'stable-overall'));
  const without = REC.recommendGlobal({ overview, retention: null });
  assert.ok(!without.items.some(i => i.id === 'recognition-recall-gap'));
});

// ════════════════════════════════════════════════════════════════════════════
section('[C] Luyện thanh điệu (question-engine + bảng bài tập server)');
test('toneSequence / toneVariants: mỗi biến thể khác gốc đúng 1 ký tự, không trùng nhau', () => {
  assert.deepStrictEqual(QE.toneSequence('zhǔnbèi'), [3, 4]); assert.deepStrictEqual(QE.toneSequence('ma'), []);
  const base = 'zhǔnbèi', vs = QE.toneVariants(base, 3);
  assert.strictEqual(vs.length, 3); assert.strictEqual(new Set(vs).size, 3); assert.ok(!vs.includes(base));
  for (const v of vs) { const A = [...v], B = [...base]; assert.strictEqual(A.length, B.length); assert.strictEqual(A.filter((c, i) => c !== B[i]).length, 1); }
  assert.strictEqual(QE.toneVariants('hǎo', 9).length, 3, 'một âm tiết chỉ có 3 thanh khác');
});
const W_TONE = { hz: '准备', py: 'zhǔnbèi', vi: 'chuẩn bị', l: 5 };
test('câu nghe → chọn thanh: hợp lệ, đáp án đúng là pinyin chuẩn, đề không lộ chữ/pinyin', () => {
  for (let i = 0; i < 25; i++) {
    const q = QE.build('listen2tone', W_TONE, { audioOk: true, pool: [] });
    assert.ok(q, 'phải dựng được'); assert.strictEqual(q.correctKey, 'zhǔnbèi'); assert.strictEqual(q.options[q.correctIndex].key, 'zhǔnbèi');
    assert.ok(q.options.length >= 3 && q.options.length <= 4); assert.strictEqual(new Set(q.options.map(o => o.key)).size, q.options.length);
    assert.strictEqual(q.prompt.kind, 'audio');
    // audioText giữ chữ Hán để máy ĐỌC (như mọi câu nghe khác) — không hiển thị. Phần HIỂN THỊ (main/sub/ask) không được lộ chữ/pinyin:
    const shown = JSON.stringify({ m: q.prompt.main, s: q.prompt.sub, a: q.prompt.ask }); assert.ok(!shown.includes('准备') && !shown.includes('zhǔnbèi'));
    assert.ok(q.explanation.some(l => /thanh 3 \+ thanh 4/.test(l)));
    assert.strictEqual(q.fsrsEligible, false); assert.strictEqual(q.exerciseFsrs, null);
  }
});
test('KHÔNG dựng khi: không có giọng đọc, nhiều cách đọc, số thanh, âm nhẹ hoàn toàn, thiếu pinyin', () => {
  assert.strictEqual(QE.build('listen2tone', W_TONE, { audioOk: false }), null);
  for (const py of ['cháng / zhǎng', 'cháng, zhǎng', 'ni3hao3', 'de', '', undefined]) assert.strictEqual(QE.build('listen2tone', { hz: '长', py, vi: 'x', l: 1 }, { audioOk: true }), null, String(py));
});
test('khớp bảng bài tập server: exercisePractice có trong EXERCISES, cùng quizType/skill, không đi FSRS; chấm bằng so khớp chuỗi', () => {
  const T = QE.TYPES.listen2tone, ex = SKILLS.EXERCISES[T.exercisePractice];
  assert.ok(ex, 'server chưa có practice-listening-tone');
  assert.strictEqual(ex.quizType, T.quizType); assert.strictEqual(ex.skill, T.skill); assert.strictEqual(ex.fsrs, false);
  const r = SKILLS.resolveExercise(T.exercisePractice, T.quizType); assert.ok(r);
  assert.strictEqual(SKILLS.gradeAnswer('zhǔnbèi', 'zhǔnbèi', r).answerCorrect, true);
  assert.strictEqual(SKILLS.gradeAnswer('zhǔnbèi', 'zhùnbèi', r).answerCorrect, false);
  assert.strictEqual(SKILLS.resolveExercise(T.exercisePractice, 'vi2hz'), null, 'nhãn không khớp chiều câu → bỏ');
});
test('chỉ luyện bổ sung: bộ chọn tự động KHÔNG bao giờ chọn dạng thanh điệu; chọn tường minh thì dựng được', () => {
  const prof = {};
  const auto = QS.rank(W_TONE, { allowPracticeOnly: true, profile: prof }).map(r => r.typeId);
  assert.ok(!auto.includes('listen2tone'));
  const q = QS.choose(W_TONE, { audioOk: true, pool: [] }, { allowPracticeOnly: true, only: ['listen2tone'], forced: true, session: QS.newSession() });
  assert.ok(q && q.typeId === 'listen2tone' && q.why == null);
  assert.strictEqual(QS.choose({ hz: '长', py: 'cháng / zhǎng', vi: 'x', l: 1 }, { audioOk: true, pool: [] }, { allowPracticeOnly: true, only: ['listen2tone'], forced: true }), null, 'không hạ chuẩn sang dạng khác');
});

// ════════════════════════════════════════════════════════════════════════════
const POOL = [
  { hz: '准备', py: 'zhǔnbèi', vi: 'chuẩn bị', l: 5, hanviet: 'chuẩn bị' }, { hz: '认真', py: 'rènzhēn', vi: 'nghiêm túc', l: 5 },
  { hz: '参加', py: 'cānjiā', vi: 'tham gia', l: 5 }, { hz: '发现', py: 'fāxiàn', vi: 'phát hiện', l: 5 },
  { hz: '学习', py: 'xuéxí', vi: 'học tập', l: 1 }, { hz: '休息', py: 'xiūxi', vi: 'nghỉ ngơi', l: 1 },
  { hz: '苹果', py: 'píngguǒ', vi: 'quả táo', l: 2 }, { hz: '桌子', py: 'zhuōzi', vi: 'cái bàn', l: 2 },
];
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function makeEnv(over) {
  const calls = { fetch: [], practice: [], fsrs: [] };
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
    sessionKnownHz: new Set(), saveSessionKnownHz() {}, sqPurgeHzFromAllQueues() {}, sqLessonFilterMatches: () => true, REPEAT_GAP: 10, flushProgressSync: async () => {},
    genIdempotencyKey: () => 'k-123456789', todayKey: () => '2026-10-18', goTab() {}, alert() {}, SUBMIT_REVIEW_MAX_WAIT_MS: 1000,
    submitFsrsReviewAwaited: async (a) => { calls.fsrs.push(a); return { ok: true }; },
    submitSkillPractice: async (a) => { calls.practice.push(a); return { ok: true }; },
    fetch: async (url, opts) => { calls.fetch.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null }); return { json: async () => ({ ok: true, systemRating: 'good' }) }; },
  }, over || {});
  vm.createContext(ctx);
  for (const f of ['js/answer-match.js', 'js/skill-score.js', 'js/session-summary.js', 'js/question-engine.js', 'js/question-selector.js', 'js/review.js']) vm.runInContext(read(f), ctx);
  ctx.__calls = calls;
  return ctx;
}
const R = (ctx, code) => vm.runInContext(code, ctx);
const item = (type, hz, extra) => Object.assign({ type, word: POOL.find(w => w.hz === hz), skillProfile: {} }, extra || {});
function load(ctx, queueItems) {
  R(ctx, `rvQSession = QS.newSession(); rvQueue.items = ${JSON.stringify(queueItems)}; rvQueue.totalPlanned = ${queueItems.length}; rvStage='run'; rvStartInfo=null; rvLog=[]; rvPrepareCurrentCard();`);
}

section('[D] review.js — vòng sửa lỗi ngay');
const ten = () => ['准备', '认真', '参加', '发现', '学习', '休息', '苹果', '桌子'].map(h => item('review', h));
test('thẻ chính thức SAI (hàng đợi dài): thẻ quay lại sau REPEAT_GAP và có thêm câu "redo" ở vị trí RV_CORRECTION_GAP, đổi dạng, không phải lượt FSRS', () => {
  const ctx = makeEnv();
  const items = ten().concat(['准备', '认真', '参加', '发现'].map(h => item('review', h + '')));
  // 12 thẻ: tạo từ khác nhau bằng cách đổi hz giả để không trùng
  const many = Array.from({ length: 12 }, (_, i) => Object.assign(item('review', '准备'), { word: Object.assign({}, POOL[i % 8], { hz: POOL[i % 8].hz + (i >= 8 ? i : '') }) }));
  load(ctx, many);
  const first = R(ctx, 'rvQuestion.typeId'), hz = R(ctx, 'rvQueue.items[0].word.hz');
  R(ctx, `rvRecordAnswer(rvQueue.items[0], rvQuestion, false, 1000, true); rvLastAnswer = { correct: false }; rvAdvanceQueue();`);
  const arr = JSON.parse(R(ctx, 'JSON.stringify(rvQueue.items.map(i => ({ t: i.type, hz: i.word.hz, c: !!i.correction, f: i.failedTypes })))'));
  const redoIdx = arr.findIndex(x => x.t === 'redo' && x.hz === hz);
  assert.strictEqual(redoIdx, 2, 'redo phải ở vị trí RV_CORRECTION_GAP=2'); assert.strictEqual(arr[redoIdx].c, true); assert.deepStrictEqual(arr[redoIdx].f, [first]);
  const offIdx = arr.findIndex(x => x.t === 'review' && x.hz === hz);
  assert.strictEqual(offIdx, 11, 'thẻ chính thức quay lại sau REPEAT_GAP=10 thẻ chính thức khác (+1 câu redo xen giữa)');
  assert.strictEqual(R(ctx, 'rvIsPractice(rvQueue.items[2])'), true); assert.strictEqual(R(ctx, 'rvIsOfficial(rvQueue.items[2])'), false);
});
test('hàng đợi sắp hết (thẻ chính thức quay lại ngay): KHÔNG chèn redo thừa; trả lời ĐÚNG: không chèn', () => {
  const ctx = makeEnv();
  load(ctx, [item('review', '准备'), item('review', '认真'), item('review', '参加')]);
  R(ctx, `rvRecordAnswer(rvQueue.items[0], rvQuestion, false, 1000, true); rvLastAnswer = { correct: false }; rvAdvanceQueue();`);
  assert.strictEqual(R(ctx, "rvQueue.items.some(i => i.type === 'redo')"), false);
  const ctx2 = makeEnv(); const many = Array.from({ length: 12 }, (_, i) => Object.assign(item('review', '准备'), { word: Object.assign({}, POOL[i % 8], { hz: POOL[i % 8].hz + (i >= 8 ? i : '') }) }));
  load(ctx2, many);
  R(ctx2, `rvRecordAnswer(rvQueue.items[0], rvQuestion, true, 1000, true); rvLastAnswer = { correct: true }; rvAdvanceQueue();`);
  assert.strictEqual(R(ctx2, "rvQueue.items.some(i => i.type === 'redo')"), false);
});
test('câu "redo" sửa lỗi là LUYỆN BỔ SUNG: đi đường submitSkillPractice (source=redo, server không cộng điểm kỹ năng), không gọi FSRS', async () => {
  const ctx = makeEnv();
  load(ctx, [Object.assign(item('redo', '准备'), { failedTypes: ['hz2vi'], correction: true })]);
  const q = R(ctx, 'rvQuestion'); assert.ok(q && q.typeId !== 'hz2vi', 'đổi dạng so với lần sai');
  assert.strictEqual(R(ctx, 'rvPracticeSource(rvQueue.items[0])'), 'redo');
  assert.ok(SKILLS.SHOWN_ANSWER_SOURCES.includes('redo'), 'server tính redo là lượt vừa xem đáp án');
  R(ctx, `rvPickPractice({ dataset: { v: rvQuestion.correctKey }, _correct: true, classList: { add() {} } })`);
  await tick();
  assert.strictEqual(ctx.__calls.fsrs.length, 0); assert.strictEqual(ctx.__calls.practice.length, 1); assert.strictEqual(ctx.__calls.practice[0].source, 'redo');
});

section('[E] review.js — trả lời sai không tự chuyển câu; thanh rating gọn');
test('rvShouldAutoCommit: đúng → tự chuyển; sai → KHÔNG; đã bấm "Đổi đánh giá" → KHÔNG', () => {
  const ctx = makeEnv();
  R(ctx, 'rvLastAnswer = { correct: true }; rvRatingExpanded = false'); assert.strictEqual(R(ctx, 'rvShouldAutoCommit()'), true);
  R(ctx, 'rvLastAnswer = { correct: false }'); assert.strictEqual(R(ctx, 'rvShouldAutoCommit()'), false);
  R(ctx, 'rvLastAnswer = { correct: true }; rvRatingExpanded = true'); assert.strictEqual(R(ctx, 'rvShouldAutoCommit()'), false);
  R(ctx, 'rvLastAnswer = null; rvRatingExpanded = false'); assert.strictEqual(R(ctx, 'rvShouldAutoCommit()'), false);
});
async function answerVia(ctx, correct, rating) {
  ctx.fetch = async (url) => ({ json: async () => ({ ok: true, systemRating: rating }) });
  load(ctx, [item('review', '准备'), item('review', '认真')]);
  R(ctx, 'var __cd = 0; rvStartCountdown = function () { __cd++; };');
  await R(ctx, `rvPick({ dataset: { v: 'x' }, _correct: ${correct}, classList: { add() {} } })`);
}
test('trả lời SAI: không khởi động đếm ngược, dừng ở "pending" chờ bấm Tiếp tục; trả lời ĐÚNG: có đếm ngược', async () => {
  const bad = makeEnv(); await answerVia(bad, false, 'again');
  assert.strictEqual(R(bad, '__cd'), 0); assert.strictEqual(R(bad, 'rvRatingPhase'), 'pending'); assert.strictEqual(R(bad, 'rvSystemRating'), 'again');
  const ok = makeEnv(); await answerVia(ok, true, 'good');
  assert.strictEqual(R(ok, '__cd'), 1); assert.strictEqual(R(ok, 'rvRatingPhase'), 'pending');
});
test('thanh rating mặc định GỌN: có "Đổi đánh giá" + "Tiếp tục", KHÔNG có 4 nút; câu sai không nói "tự sang câu sau"', async () => {
  const ctx = makeEnv(); await answerVia(ctx, true, 'good');
  let h = R(ctx, 'rvRenderRatingBar()');
  assert.ok(h.includes('Đổi đánh giá') && h.includes('Tiếp tục') && !h.includes('rv-rate-again') && h.includes('Hệ thống chấm: <b>Good</b>') && h.includes('rv-countdown-num'));
  const bad = makeEnv(); await answerVia(bad, false, 'again');
  h = R(bad, 'rvRenderRatingBar()');
  assert.ok(h.includes('xem kỹ đáp án') && !h.includes('rv-countdown-num') && !h.includes('tự sang câu sau'));
});
test('đang tải gợi ý: nút "Tiếp tục" bị khoá (chưa có rating hệ thống để chốt), vẫn đổi được', () => {
  const ctx = makeEnv(); R(ctx, "rvRatingPhase = 'loading'; rvSystemRating = null; rvLastAnswer = { correct: true };");
  const h = R(ctx, 'rvRenderRatingBar()'); assert.ok(h.includes('Đang chấm') && /rv-rate-go"\s+disabled/.test(h) && h.includes('Đổi đánh giá'));
});
test('bấm "Đổi đánh giá" → hiện đủ 4 nút + dừng tự chuyển; chế độ chấm thủ công luôn hiện 4 nút', async () => {
  const ctx = makeEnv(); await answerVia(ctx, true, 'good');
  R(ctx, 'rvExpandRating()');
  const h = R(ctx, 'rvRenderRatingBar()');
  for (const k of ['rv-rate-again', 'rv-rate-hard', 'rv-rate-good', 'rv-rate-easy']) assert.ok(h.includes(k), k);
  assert.strictEqual(R(ctx, 'rvShouldAutoCommit()'), false);
  const m = makeEnv(); R(m, 'rvSetManualRating(true)'); R(m, "rvRatingPhase = 'pending'; rvSystemRating = 'good'; rvLastAnswer = { correct: true };");
  assert.ok(R(m, 'rvRenderRatingBar()').includes('rv-rate-again') && R(m, 'rvManualRating()') === true);
  R(m, 'rvSetManualRating(false)'); assert.strictEqual(R(m, 'rvManualRating()'), false);
});
test('"Tiếp tục" chốt đúng rating hệ thống đã đề xuất (sai → again); "Đổi" rồi chọn → rating người học thắng', async () => {
  const ctx = makeEnv(); await answerVia(ctx, false, 'again');
  R(ctx, 'rvContinueRating()'); await tick();
  assert.strictEqual(ctx.__calls.fsrs.length, 1); assert.strictEqual(ctx.__calls.fsrs[0].rating, 'again');
  const ctx2 = makeEnv(); await answerVia(ctx2, false, 'again');
  R(ctx2, 'rvExpandRating(); rvChooseRating("hard")'); await tick();
  assert.strictEqual(ctx2.__calls.fsrs[0].rating, 'hard');
});
test('rvContinueRating không làm gì khi chưa có rating hệ thống (không commit rating rỗng)', async () => {
  const ctx = makeEnv(); load(ctx, [item('review', '准备')]);
  R(ctx, "rvRatingPhase = 'loading'; rvSystemRating = null; rvPendingReview = { selectedAnswer: 'x', responseTimeMs: 1, answerChanges: 0 };");
  R(ctx, 'rvContinueRating()'); await tick(); assert.strictEqual(ctx.__calls.fsrs.length, 0);
});

section('[F] review.js — từ cứng đầu, phiên ngắn');
test('ngưỡng cứng đầu của giao diện khớp lib/memory-forecast (số lần quên và độ vững)', () => { const c = makeEnv(); assert.strictEqual(R(c, 'RV_LEECH_LAPSES'), MF.LEECH_LAPSES); assert.strictEqual(R(c, 'RV_LEECH_MATURE'), MF.LEECH_MATURE_STABILITY); });
test('rvLeechInfo: lapses ≥4 (từ phiên server hoặc thẻ vừa chốt) hoặc sai ≥2 lượt chính thức trong buổi; còn lại không', () => {
  const ctx = makeEnv();
  assert.strictEqual(R(ctx, "rvLeechInfo({ hz: 'a', lapses: 4 }, null).isLeech"), true);
  assert.strictEqual(R(ctx, "rvLeechInfo({ hz: 'a', lapses: 3 }, null).isLeech"), false);
  assert.strictEqual(R(ctx, "rvLeechInfo({ hz: 'a', lapses: 1 }, { lapses: 5 }).isLeech"), true);
  R(ctx, "rvLog = [{ hz: 'a', official: true, correct: false }, { hz: 'a', official: true, correct: false }, { hz: 'b', official: true, correct: false }, { hz: 'a', official: false, correct: false }]");
  assert.strictEqual(R(ctx, "rvLeechInfo({ hz: 'a' }, null).isLeech"), true); assert.strictEqual(R(ctx, "rvLeechInfo({ hz: 'b' }, null).isLeech"), false);
  assert.strictEqual(R(ctx, "rvLeechInfo(null, null).isLeech"), false);
});
test('khối sửa lỗi: từ thường → 1 dòng nhắc; từ cứng đầu → khối 🧲 có nút viết mẹo + xem nét viết, thoát HTML, nói đúng lý do', () => {
  const ctx = makeEnv();
  const normal = R(ctx, "rvCorrectionHtml({ hz: '准备', lapses: 0 }, { correct: false })");
  assert.ok(normal === '' && !normal.includes('🧲'));
  const leech = R(ctx, "rvCorrectionHtml({ hz: '准备', lapses: 5, hanviet: '<b>x</b>' }, { correct: false })");
  // V116: bỏ tính năng mẹo nhớ → khối cứng đầu chỉ còn gợi ý Hán Việt / đọc to / nét viết, KHÔNG còn nút hay lời khuyên viết mẹo
  assert.ok(leech.includes('🧲') && leech.includes("strokeOpen('准备')") && leech.includes('đã quên 5 lần') && leech.includes('Đọc to từ này'));
  assert.ok(!/wnOpenEditor|mẹo/i.test(leech), 'không còn nhắc mẹo nhớ');
  assert.ok(!leech.includes('<b>x</b>'), 'Hán Việt từ dữ liệu phải được thoát HTML');
});
test('màn đáp án của thẻ SAI có khối sửa lỗi; thẻ ĐÚNG thì không', () => {
  const ctx = makeEnv(); load(ctx, [item('review', '准备', { word: Object.assign({}, POOL[0], { lapses: 6 }) })]);
  R(ctx, "rvPhase = 'answered'; rvRatingPhase = 'pending'; rvSystemRating = 'again'; rvLastAnswer = { correct: false, card: null };");
  assert.ok(R(ctx, 'renderReview()').includes('🧲 Từ cứng đầu'));
  R(ctx, "rvSystemRating = 'good'; rvLastAnswer = { correct: true, card: null };");
  assert.ok(!R(ctx, 'renderReview()').includes('🧲'));
});
test('phiên "chỉ từ cứng đầu": lọc theo số lần quên VÀ chưa vững (từ đã vững lại bị loại), cờ chỉ dùng 1 lần', async () => {
  const ctx = makeEnv({ fetch: async () => ({ json: async () => ({ ok: true, words: [{ hz: 'A', lapses: 5, stability: 2 }, { hz: 'B', lapses: 1 }, { hz: 'C', lapses: 4 }, { hz: 'D', lapses: 3 }, { hz: 'E', lapses: 7, stability: 55 }] }) }) });
  R(ctx, 'rvWeakMode = true; rvLeechOnly = true;');
  const a = await R(ctx, 'rvFetchFreshSession(true)'); assert.deepStrictEqual(a.list.map(i => i.word.hz), ['A', 'C']); assert.strictEqual(R(ctx, 'rvLeechOnly'), false);
  const b = await R(ctx, 'rvFetchFreshSession(true)'); assert.strictEqual(b.list.length, 5, 'lần sau không còn lọc');
  assert.ok(/function startLeechSession\(\) \{ rvLeechOnly = true; rvLeechMode = true; return startStudySession\(true, true\); \}/.test(read('js/review.js')));
});
test('"Học tiếp" sau phiên cứng đầu tiếp tục đúng chế độ cứng đầu; vào bằng đường khác thì thoát chế độ', async () => {
  const ctx = makeEnv({ fetch: async () => ({ json: async () => ({ ok: true, words: [{ hz: 'A', lapses: 5, stability: 2 }] }) }) });
  await R(ctx, 'startLeechSession()');
  assert.strictEqual(R(ctx, 'rvLeechMode'), true);
  R(ctx, "rvQueue.items = []; rvLog = [{ hz: 'A', l: 1, typeId: 'hz2vi', skill: 'recognition', correct: true, ms: 1, official: true }]; rvSummary = { reviewCount: 1, newCount: 0 };");
  assert.ok(R(ctx, 'rvSummaryHtml()').includes('onclick="startLeechSession()">▶️ Học tiếp'));
  await R(ctx, 'startStudySession(true, true)');
  assert.strictEqual(R(ctx, 'rvLeechMode'), false);
  assert.ok(R(ctx, 'rvSummaryHtml()').includes('startStudySession(true, true)">▶️ Học tiếp'));
});
const fetchSession = (n) => async (url) => ({ json: async () => (/\/api\/study\/session/.test(url)
  ? { ok: true, session: Array.from({ length: n }, (_, i) => ({ type: i < n - 5 ? 'review' : 'new', word: { hz: '字' + i, py: 'zì', vi: 'chữ ' + i, l: 5 } })), reviewCount: n - 5, newCount: 5, blockedByBacklog: false, totalDue: 0, scopeLessons: [5] }
  : { ok: false }) });
test('phiên ngắn: mặc định KHÔNG cắt (giữ hành vi cũ); chọn 20 thì chỉ lấy 20 thẻ đầu theo thứ tự FSRS và cập nhật số liệu', async () => {
  const a = makeEnv({ fetch: fetchSession(30) });
  assert.strictEqual(R(a, 'rvSessionCards()'), 0);
  await R(a, 'startStudySession(false, true)');
  assert.strictEqual(R(a, 'rvQueue.items.filter(rvIsOfficial).length'), 30);
  const b = makeEnv({ fetch: fetchSession(30) }); R(b, "rvSetSessionCards('20')"); assert.strictEqual(R(b, 'rvSessionCards()'), 20);
  await R(b, 'startStudySession(false, true)');
  assert.strictEqual(R(b, 'rvQueue.items.filter(rvIsOfficial).length'), 20);
  assert.strictEqual(R(b, "rvQueue.items.filter(rvIsOfficial)[0].word.hz"), '字0', 'giữ thứ tự (thẻ đến hạn trước)');
  assert.strictEqual(R(b, 'rvSummary.reviewCount + rvSummary.newCount'), 20); assert.strictEqual(R(b, 'rvQueue.totalPlanned'), 20);
});
test('cài đặt độ dài phiên: chỉ nhận 10/20/30, giá trị lạ → không giới hạn', () => {
  const ctx = makeEnv();
  for (const [v, exp] of [['10', 10], ['30', 30], ['15', 0], ['abc', 0], ['0', 0]]) { R(ctx, `rvSetSessionCards('${v}')`); assert.strictEqual(R(ctx, 'rvSessionCards()'), exp, v); }
});

// ════════════════════════════════════════════════════════════════════════════
section('[G] "Hôm nay học" — bố cục gọn + ghi nhớ ước lượng');
function lessonEnv() { const ctx = makeEnv({ currentTab: 'today', progressState: { ui: { unlimitedStudy: false, dailyReviewLimit: 50, dailyNewLimit: 10, newOnlyAfterDue: true } } }); vm.runInContext(read('js/lesson.js'), ctx); return ctx; }
const FORECAST = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'].map((d, i) => ({ dayOffset: i, date: d, count: [14, 3, 0, 5, 2, 8, 1][i] }));
const MEM = { learned: 40, measured: 40, avgRetrievability: 0.874, atRisk: 3, atRiskWords: [{ hz: '准备', l: 5, r: 0.7 }, { hz: '<img src=x onerror=1>', l: 1, r: 0.6 }], overdue: 12, leech: 2, forecast: FORECAST, thresholds: { atRisk: 0.8, leechLapses: 4, minCards: 5 } };
const TODAY = (over) => Object.assign({
  ok: true, hasScope: true, dueCount: 12, dueInScope: 20, newInCurrentLesson: 5, currentLesson: 7, weakCount: 3, blockedByBacklog: false, totalDue: 20,
  breakdown: { knownWords: 100, due: 20, reinforce: 8, weakSkill: 15, delayed: 6, overlap: { weakAndDue: 4, reinforceAndDue: 2 }, uniqueWords: 40, delayedAfterDays: 7, stableWords: 9 },
  progress: { officialAnswers: 10, practiceAnswers: 6, durationSeconds: 780, measuredAnswers: 8, measuredCorrect: 6 },
  daily: { reviewLimit: 50, newLimit: 10, unlimited: false, reviewToday: 8, newToday: 2 }, memory: MEM,
}, over || {});
const render = (ctx, d) => R(ctx, `renderTodayPanel(${JSON.stringify(d)})`);
test('nút "Bắt đầu học" + 3 số chính đứng TRƯỚC phần chi tiết; chi tiết gập sẵn (không có thuộc tính open)', () => {
  const h = render(lessonEnv(), TODAY());
  const iStart = h.indexOf('▶️ Bắt đầu học'), iSum = h.indexOf('class="td-summary"'), iDetail = h.indexOf('📊 Chi tiết số liệu'), iGrid = h.indexOf('Thẻ đến hạn ôn');
  assert.ok(iStart > 0 && iStart < iSum && iSum < iDetail && iDetail < iGrid, [iStart, iSum, iDetail, iGrid].join(','));
  assert.ok(/<details style="margin-top:12px"><summary[^>]*>📊 Chi tiết số liệu/.test(h), 'chi tiết phải gập sẵn');
  assert.ok(h.includes('Cần ôn') && h.includes('Từ mới') && h.includes('Dự kiến nhớ'));
});
test('ô trí nhớ: nêu ~87% kèm "ước lượng"; mẫu nhỏ/không có dữ liệu → "—", không số giả', () => {
  const h = render(lessonEnv(), TODAY());
  assert.ok(h.includes('🧠 ~87%') && h.includes('Dự kiến nhớ (ước lượng)') && h.includes('không phải điểm kiểm tra'));
  const few = render(lessonEnv(), TODAY({ memory: Object.assign({}, MEM, { avgRetrievability: null, measured: 3 }) }));
  assert.ok(few.includes('🧠 —') && few.includes('chưa đủ dữ liệu') && !few.includes('~87%') && few.includes('cần ≥ 5 từ đã học'));
  const none = render(lessonEnv(), TODAY({ memory: null }));
  assert.ok(none.includes('🧠 —') && !none.includes('Trí nhớ (ước lượng)'), 'thiếu phần memory: vẫn vẽ được, không bịa số');
});
test('dự báo 7 ngày: đủ 7 cột, ngày đầu ghi "Nay" + số thẻ quá hạn; từ sắp quên hiện kèm %, được thoát HTML', () => {
  const h = render(lessonEnv(), TODAY());
  assert.strictEqual((h.match(/border-radius:3px/g) || []).length, 7); assert.ok(h.includes('>Nay<') && h.includes('12 thẻ đã quá hạn'));
  assert.ok(h.includes('3 từ đang có nguy cơ quên') && h.includes('70%') && h.includes('60%'));
  assert.ok(!h.includes('<img src=x'), 'từ từ dữ liệu phải thoát HTML');
});
test('nút "Học riêng N từ cứng đầu" chỉ hiện khi có từ cứng đầu', () => {
  assert.ok(render(lessonEnv(), TODAY()).includes('startLeechSession()') && render(lessonEnv(), TODAY()).includes('Học riêng 2 từ cứng đầu'));
  assert.ok(!render(lessonEnv(), TODAY({ memory: Object.assign({}, MEM, { leech: 0 }) })).includes('startLeechSession()'));
  assert.ok(!render(lessonEnv(), TODAY({ memory: null })).includes('startLeechSession()'));
});
test('hết thẻ: không có nút Bắt đầu học, vẫn có thông báo + chế độ luyện (gồm "Luyện thanh điệu")', () => {
  const h = render(lessonEnv(), TODAY({ dueCount: 0, dueInScope: 0, newInCurrentLesson: 0 }));
  assert.ok(!h.includes('▶️ Bắt đầu học') && h.includes('Bạn đã ôn hết thẻ đến hạn') && h.includes('<details open') && h.includes("skStartPractice('tone')"));
});
test('chế độ thanh điệu khoá khi máy không có giọng đọc, nói rõ lý do', () => {
  const ctx = makeEnv({ currentTab: 'today', skillAudioAvailable: () => false }); vm.runInContext(read('js/lesson.js'), ctx);
  const h = render(ctx, TODAY()); assert.ok(!h.includes("skStartPractice('tone')") && h.includes('không có giọng đọc'));
});
test('cài đặt hằng ngày có thêm "độ dài phiên" và "tự chấm đánh giá" (mặc định tự chấm = bật)', () => {
  const ctx = lessonEnv(); const h = R(ctx, 'renderToday()');
  assert.ok(h.includes('rvSetSessionCards(this.value)') && h.includes('<option value="0" selected>') && h.includes('rvSetManualRating(!this.checked)'));
  assert.ok(/rvSetManualRating\(!this\.checked\)"/.test(h) && /<input type="checkbox" checked onchange="rvSetManualRating/.test(h), 'mặc định (không thủ công) → checkbox tự chấm được tích');
  R(ctx, "rvSetSessionCards('20'); rvSetManualRating(true)");
  const h2 = R(ctx, 'renderToday()'); assert.ok(h2.includes('<option value="20" selected>') && /<input type="checkbox"  ?onchange="rvSetManualRating/.test(h2) && !h2.includes('checked onchange="rvSetManualRating'));
});

section('[H] "Phân tích năng lực" — mức kỹ năng gộp');
function skEnv() { const ctx = makeEnv({ currentTab: 'skills', skFetchJson: async () => ({ ok: true }) }); for (const f of ['js/skills-ui.js', 'js/skills-analysis.js']) vm.runInContext(read(f), ctx); return ctx; }
test('hiển thị tỉ lệ đã trừ đoán mò + khoảng tin cậy + số lượt; thiếu dữ liệu → nêu mẫu số; kỹ năng chưa có lượt → nói thẳng', () => {
  const ctx = skEnv();
  R(ctx, `saState.retention = ${JSON.stringify({ windowDays: 90, buckets: {}, byType: [], pooled: SP.summarizePooled([{ exercise_type: 'review-hz2vi', n: 60, correct: 51 }, { exercise_type: 'review-vi2hz', n: 12, correct: 5 }]) })}`);
  const h = R(ctx, 'saRenderPooled()');
  assert.ok(h.includes('80%') && h.includes('Đúng thô 85%') && h.includes('51/60') && h.includes('trừ xác suất đoán mò'));
  assert.ok(h.includes('Chưa đủ dữ liệu (12/20 lượt)') && h.includes('Chưa có lượt nào'));
  assert.ok(h.includes('đừng so con số tuyệt đối giữa các kỹ năng'));
});
test('chưa tải / server cũ không có pooled → không vẽ gì; renderSkills đặt khối này ngay sau gợi ý', () => {
  const ctx = skEnv(); assert.strictEqual(R(ctx, 'saRenderPooled()'), '');
  R(ctx, 'saState.retention = { windowDays: 90, buckets: {}, byType: [] }'); assert.strictEqual(R(ctx, 'saRenderPooled()'), '');
  assert.ok(/saRenderRecs\(\) \+ saRenderPooled\(\) \+ skRenderOverview\(\)/.test(read('js/skills-ui.js')));
});
test('màn luyện có nút "Luyện thanh điệu" (khoá khi không có giọng đọc)', () => {
  const ctx = skEnv(); R(ctx, "skState.overview = null");
  const h = R(ctx, 'skRenderPracticeLauncher()'); assert.ok(h.includes("skStartPractice('tone')"));
  const ctx2 = makeEnv({ currentTab: 'skills', skillAudioAvailable: () => false }); for (const f of ['js/skills-ui.js', 'js/skills-analysis.js']) vm.runInContext(read(f), ctx2);
  assert.ok(!R(ctx2, 'skRenderPracticeLauncher()').includes("skStartPractice('tone')"));
  assert.ok(/tone: \['listen2tone'\]/.test(read('js/skills-ui.js')));
});

section('[I] js/stroke.js — xem nét viết');
const ST = require('../js/stroke');
test('tách chữ Hán: bỏ ký tự khác và chữ trùng, tối đa 6 chữ', () => {
  assert.deepStrictEqual(ST.strokeChars('准备'), ['准', '备']); assert.deepStrictEqual(ST.strokeChars('abc 123 ，。'), []);
  assert.deepStrictEqual(ST.strokeChars('哈哈哈'), ['哈']); assert.strictEqual(ST.strokeChars('一二三四五六七八九').length, 6); assert.deepStrictEqual(ST.strokeChars(null), []);
});
test('thư viện ghim phiên bản cố định (không latest/range), nạp với crossorigin vì trang bật COEP', () => {
  for (const u of ST.STROKE_LIB_URLS) { assert.ok(/^https:\/\/cdn\.jsdelivr\.net\/npm\/hanzi-writer@\d+\.\d+\.\d+\//.test(u), u); assert.ok(!/latest|\^|~/.test(u)); }
  const src = read('js/stroke.js'); assert.ok(/crossOrigin = 'anonymous'/.test(src));
  assert.ok(/Cross-Origin-Embedder-Policy/.test(read('vercel.json')), 'điều kiện đang áp dụng');
});
test('index.html nạp stroke.js trước app.js; xem nét hiện ở màn giới thiệu từ cứng đầu', () => {
  const html = read('index.html'); assert.ok(html.indexOf('/js/stroke.js') > 0 && html.indexOf('/js/stroke.js') < html.indexOf('/js/app.js'));
});

section('[J] Nối dây server (kiểm cấu trúc mã nguồn — SQL/ts-fsrs chưa chạy thật)');
test('/api/study/today trả thêm memory (lỗi phần này không làm hỏng dashboard); /retention trả pooled; /recommendations truyền pooled', () => {
  const api = read('api/index.js');
  assert.ok(/reviewService\.getMemoryForecast\(authed\.username, new Date\(\)\)/.test(api) && /res\.json\(\{ ok: true, \.\.\.publicOverview, breakdown, progress, memory \}\)/.test(api));
  assert.ok(/try \{ memory = await reviewService\.getMemoryForecast[\s\S]{0,200}catch \(memErr\)/.test(api), 'phải bọc try/catch riêng');
  assert.ok(/pooled: skillPooled\.summarizePooled\(byType\)/.test(api) && /recommendGlobal\(\{ overview, retention: retention\.buckets, pooled:/.test(api));
});
test('getMemoryForecast dùng đúng scheduler FSRS của người học (retention + weights cá nhân); getLearnedFsrsCards chỉ ĐỌC thẻ đã học, có LIMIT', () => {
  const svc = read('lib/fsrs/reviewService.js'), db = read('lib/db.js');
  assert.ok(/fsrs\.getRetrievability\(fsrs\.rowToCard\(row\), when, desiredRetention, personalWeights\)/.test(svc) && /getLearnedFsrsCards/.test(svc));
  const fn = db.slice(db.indexOf('async function getLearnedFsrsCards'), db.indexOf('// ── GHI 1 LƯỢT REVIEW'));
  assert.ok(/FROM fsrs_cards WHERE user_id = \$1 AND reps > 0 LIMIT 20000/.test(fn) && !/INSERT|UPDATE|DELETE/i.test(fn));
  assert.ok(/getLearnedFsrsCards, reviewFsrsCard/.test(db));
});
test('thuần: memory-forecast và skill-pooled không phụ thuộc ts-fsrs/DB (nạp được trong Node trần)', () => {
  for (const f of ['lib/memory-forecast.js', 'lib/skill-pooled.js']) { const src = read(f); assert.ok(!/require\('ts-fsrs'\)|require\('\.\/db'\)|require\('pg'\)/.test(src), f); }
});
test('package.json có test:v115 và đã nối vào test:v110', () => {
  const pkg = JSON.parse(read('package.json')); assert.strictEqual(pkg.scripts['test:v115'], 'node test/v115-features.test.js'); assert.ok(/npm run test:v115/.test(pkg.scripts['test:v110']));
});

runAll();
