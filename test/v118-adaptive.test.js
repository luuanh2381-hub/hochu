#!/usr/bin/env node
// test/v118-adaptive.test.js — V118: đổi chiều truy xuất sau khi sai, trần luyện lại, tổng kết dựa trên bằng chứng hợp lệ,
// phản hồi thanh điệu cụ thể. Kiểm bằng mã thật (QE/QS/SM/AM chạy thật; review.js nạp vào vm với DOM giả).
// KHÔNG thay cho thử trên trình duyệt thật và KHÔNG chạm DB thật.
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
const AM = require('../js/answer-match');
const SM = require('../js/session-summary');
global.SS = SS; global.QE = QE;
const QS = require('../js/question-selector');
const SK = require('../lib/skills');

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const POOL = [
  { hz: '认真', py: 'rènzhēn', vi: 'nghiêm túc', l: 5, hanviet: 'nhận chân' }, { hz: '准备', py: 'zhǔnbèi', vi: 'chuẩn bị', l: 5, hanviet: 'chuẩn bị' },
  { hz: '参加', py: 'cānjiā', vi: 'tham gia', l: 5, hanviet: 'tham gia' }, { hz: '发现', py: 'fāxiàn', vi: 'phát hiện', l: 5, hanviet: 'phát hiện' },
  { hz: '学习', py: 'xuéxí', vi: 'học tập', l: 1, hanviet: 'học tập' }, { hz: '休息', py: 'xiūxi', vi: 'nghỉ ngơi', l: 1 },
  { hz: '苹果', py: 'píngguǒ', vi: 'quả táo', l: 2, hanviet: 'bình quả' }, { hz: '桌子', py: 'zhuōzi', vi: 'cái bàn', l: 2 }, { hz: '天气', py: 'tiānqì', vi: 'thời tiết', l: 2, hanviet: 'thiên khí' },
  { hz: '是', py: 'shì', vi: 'là', l: 1 }, { hz: '事', py: 'shì', vi: 'việc', l: 1 },
];
const ctxOf = (over) => Object.assign({ pool: POOL, examples: [], sentences: [], confuseGroups: [], audioOk: true, heavy: null }, over || {});
const prof = (over) => { // hồ sơ kỹ năng như server gửi: mỗi kỹ năng { status, level, score, attempts, ... }
  const mk = (att, cor) => SS.toProfileEntry({ attempts: att, correct: cor, w_attempts: att, w_correct: cor });
  const base = { recognition: mk(0, 0), recall: mk(0, 0), listening: mk(0, 0), pinyin: mk(0, 0), context: mk(0, 0) };
  for (const k of Object.keys(over || {})) base[k] = mk(over[k][0], over[k][1]);
  for (const k of Object.keys(base)) { base[k].score = base[k].score == null ? null : Math.round(base[k].score * 100) / 100; base[k].daysSince = base[k].attempts ? 1 : null; }
  return base;
};
const W = (hz) => POOL.find(w => w.hz === hz);

// ── 1. Hồ sơ kỹ năng (tái dùng SS, KHÔNG tạo hệ thống thứ hai) ───────────────────────────────────────────────
test('1a. Từ chưa có dữ liệu: mọi kỹ năng "chưa đủ dữ liệu" và KHÔNG có điểm', () => {
  const p = SK.profileForClient({}, Date.now());
  for (const k of SK.MEASURABLE_SKILLS) { assert.strictEqual(p[k].status, 'insufficient'); assert.strictEqual(p[k].score, null); }
});
test('1b. Một câu sai không kết luận "yếu"; cần ≥ MIN_ATTEMPTS lượt (độ tin cậy thấp khi ít dữ liệu)', () => {
  const one = SS.advanceProfileEntry(undefined, false);
  assert.strictEqual(one.status, 'insufficient'); assert.ok(one.confidence < 0.5);
  let e = one; for (let i = 0; i < 2; i++) e = SS.advanceProfileEntry(e, false);
  assert.strictEqual(e.status, 'weak', '3 lượt sai liên tiếp mới đủ tín hiệu');
});
test('1c. Điểm kỹ năng nằm ở js/skill-score.js + bảng word_skill_stats; hồ sơ KHÔNG chứa stability/difficulty/due của FSRS', () => {
  const entry = SS.toProfileEntry({ attempts: 5, correct: 4, w_attempts: 4, w_correct: 3 });
  for (const k of ['stability', 'difficulty', 'due', 'state', 'retrievability']) assert.ok(!(k in entry), k);
  const src = read('js/skill-score.js') + read('js/session-summary.js');
  assert.ok(!/stability|ts-fsrs|scheduler|schedule\(/i.test(src.replace(/\/\/.*$/gm, '')), 'module điểm/tổng kết không được đụng thuật toán FSRS');
});
test('1d. Hồ sơ cục bộ cập nhật 1 lần/câu (không nhân đôi khi gọi learn trên bản sao)', () => {
  const s = QS.newSession(), p0 = prof({ recall: [3, 1] });
  const q = QE.build('vi2hz', W('准备'), ctxOf({ rand: rng(1) }));
  const p1 = QS.learn(p0, s, q, false, 1000);
  assert.strictEqual(p1.recall.attempts, p0.recall.attempts + 1); assert.strictEqual(p0.recall.attempts, 3, 'không sửa bản cũ');
});

// ── 2. Bộ chọn thích ứng ─────────────────────────────────────────────────────────────────────────────────
test('2a. Nhận diện tốt + nhớ chủ động yếu → Nghĩa→Chữ Hán đứng trước Chữ Hán→Nghĩa', () => {
  const p = prof({ recognition: [8, 8], recall: [6, 1] });
  const r = QS.rank(W('准备'), { profile: p, session: QS.newSession(), rand: () => 0 });
  assert.strictEqual(r[0].typeId, 'vi2hz');
  assert.ok(r.findIndex(x => x.typeId === 'vi2hz') < r.findIndex(x => x.typeId === 'hz2vi'));
});
test('2b. Nghe yếu → bài nghe đứng đầu khi có âm thanh; KHÔNG có âm thanh → không bao giờ dựng câu nghe', () => {
  const p = prof({ recognition: [8, 8], listening: [6, 1] });
  const withAudio = QS.choose(W('准备'), ctxOf({ rand: rng(3) }), { profile: p, session: QS.newSession(), rand: () => 0 });
  assert.ok(/^listen/.test(withAudio.typeId), withAudio.typeId);
  for (let i = 0; i < 30; i++) {
    const q = QS.choose(W('准备'), ctxOf({ audioOk: false, rand: rng(i + 1) }), { profile: p, session: QS.newSession(), rand: rng(i + 9) });
    assert.ok(q && !/^listen/.test(q.typeId), 'không âm thanh mà vẫn ra câu nghe: ' + (q && q.typeId));
  }
});
test('2c. Câu nghe-chọn KHÔNG đưa từ đồng âm vào làm đáp án nhiễu (tránh đáp án không duy nhất)', () => {
  for (let i = 0; i < 40; i++) {
    const q = QE.build('listen2hz', W('是'), ctxOf({ rand: rng(i + 1) }));
    if (!q) continue; // không dựng được còn hơn dựng câu mơ hồ
    const hzs = q.options.map(o => (typeof o === 'string' ? o : (o.hz || o.text || o.v || '')));
    assert.ok(!hzs.some(h => String(h).includes('事')), 'đáp án nhiễu là từ đồng âm: ' + JSON.stringify(q.options));
  }
  assert.strictEqual(QE.build('listen2type', W('是'), ctxOf()), null, 'nghe→tự gõ với từ đồng âm phải bị bỏ qua');
});
test('2d. Chưa đủ dữ liệu: kỹ năng thiếu dữ liệu được hỏi thăm dò, nhưng KHÔNG bị gán là yếu (điểm thăm dò < điểm kỹ năng yếu thật)', () => {
  const thin = QS.scoreType('vi2hz', 'recall', prof({ recognition: [8, 8] }), QS.newSession(), W('准备'), {});
  const weak = QS.scoreType('vi2hz', 'recall', prof({ recognition: [8, 8], recall: [6, 1] }), QS.newSession(), W('准备'), {});
  const strong = QS.scoreType('vi2hz', 'recall', prof({ recall: [10, 10] }), QS.newSession(), W('准备'), {});
  assert.ok(thin > strong, 'thiếu dữ liệu vẫn được thăm dò'); assert.ok(weak > thin, 'yếu thật phải ưu tiên hơn thiếu dữ liệu');
});
test('2e. SAI → ĐỔI CHIỀU: vừa sai Chữ Hán→Nghĩa thì dạng kế của từ đó KHÔNG phải nhận diện; sai ≥2 lần mạnh hơn', () => {
  const s = QS.newSession(); const q1 = QE.build('hz2vi', W('准备'), ctxOf({ rand: rng(5) }));
  QS.record(s, q1, false, 3000);
  const r1 = QS.rank(W('准备'), { profile: prof(), session: s, rand: () => 0 });
  assert.notStrictEqual(QE.TYPES[r1[0].typeId].skill, 'recognition', 'vẫn hỏi lại cùng chiều: ' + r1[0].typeId);
  const sc1 = QS.scoreType('vi2hz', 'recall', prof(), s, W('准备'), {});
  const q2 = QE.build('vi2hz', W('准备'), ctxOf({ rand: rng(6) })); QS.record(s, q2, false, 3000);
  const sc2 = QS.scoreType('listen2hz', 'listening', prof(), s, W('准备'), {});
  const noShift = QS.scoreType('listen2hz', 'listening', prof(), QS.newSession(), W('准备'), {});
  assert.ok(sc1 > QS.scoreType('vi2hz', 'recall', prof(), QS.newSession(), W('准备'), {}), 'có cộng đổi chiều');
  assert.ok(sc2 - noShift >= QS.WEIGHTS.shiftBonusRepeat - 1.1, 'sai ≥2 lần: cộng mạnh (đã trừ diversity/prev)');
});
test('2f. Từ KHÁC chưa sai thì không bị ảnh hưởng bởi lịch sử sai của từ này', () => {
  const s = QS.newSession(); QS.record(s, QE.build('hz2vi', W('准备'), ctxOf({ rand: rng(5) })), false, 3000);
  const a = QS.scoreType('vi2hz', 'recall', prof(), s, W('参加'), {}), b = QS.scoreType('vi2hz', 'recall', prof(), QS.newSession(), W('参加'), {});
  assert.ok(Math.abs(a - b) < QS.WEIGHTS.diversityPerUse * 5 + 1e-9, 'điểm của từ khác không được cộng đổi chiều');
  assert.strictEqual(QS.wordTrail(s, '参加').lastWrongSkill, null);
});
test('2g. Không lặp (từ, dạng) trong buổi; không dạng nào chiếm hết phiên; không dồn 1 từ liên tiếp (mô phỏng 60 câu)', () => {
  const rand = rng(42), s = QS.newSession(); const typeCount = {}; let sameAdjacent = 0, prevHz = null, repeated = 0; const seen = new Set();
  const p = prof({ recognition: [8, 8], recall: [6, 2], listening: [5, 2] });
  const words = POOL.slice(0, 9);
  for (let i = 0; i < 60; i++) {
    const w = words[i % words.length];
    const q = QS.choose(w, ctxOf({ rand }), { profile: p, session: s, rand, allowPracticeOnly: true });
    assert.ok(q, 'không dựng được câu');
    const key = w.hz + '|' + q.typeId; if (seen.has(key)) repeated++; seen.add(key);
    typeCount[q.typeId] = (typeCount[q.typeId] || 0) + 1; if (prevHz === w.hz) sameAdjacent++; prevHz = w.hz;
    QS.record(s, q, rand() < 0.6, 2500);
  }
  const maxShare = Math.max(...Object.values(typeCount)) / 60;
  assert.ok(maxShare < 0.5, 'một dạng chiếm ' + Math.round(maxShare * 100) + '%: ' + JSON.stringify(typeCount));
  assert.ok(Object.keys(typeCount).length >= 4, 'quá ít dạng: ' + JSON.stringify(typeCount));
  assert.ok(repeated <= 3, 'lặp cặp (từ, dạng) ' + repeated + ' lần (chỉ chấp nhận khi hết dạng khác)');
  assert.strictEqual(sameAdjacent, 0);
});
test('2h. Thẻ chính thức chỉ dùng dạng server tự chấm (fsrsOnly) — bộ chọn mới không thể đẩy câu luyện bổ sung vào lượt FSRS', () => {
  const s = QS.newSession(); QS.record(s, QE.build('hz2vi', W('准备'), ctxOf({ rand: rng(5) })), false, 3000);
  for (let i = 0; i < 30; i++) {
    const q = QS.choose(W('准备'), ctxOf({ rand: rng(i + 1) }), { profile: prof({ recall: [6, 1] }), session: s, fsrsOnly: true, rand: rng(i + 3) });
    assert.ok(q && QE.TYPES[q.typeId].exerciseFsrs, 'dạng không đi đường FSRS: ' + (q && q.typeId));
  }
});

// ── 3. Luyện lại ────────────────────────────────────────────────────────────────────────────────────────
function reviewEnv(extra) {
  const doc = { createElement: () => ({ style: {}, appendChild() {}, set textContent(v) {} }), head: { appendChild() {} }, getElementById: () => null, querySelectorAll: () => [] };
  const ctx = Object.assign({
    console, Math, Date, JSON, Set, Map, Array, Object, String, Number, Promise, Error, setTimeout: () => 0, clearInterval() {}, setInterval: () => 0,
    document: doc, performance: { now: () => 0 }, WORDS: POOL, GUEST_MAX_LESSON: 99, isLoggedIn: () => true, isGuest: false, authToken: 't', authHeaders: () => ({}),
    SENTENCES: [], CONFUSE_GROUPS: [], showPinyin: true, showMeaning: true, showHanViet: true, isAdminRole: () => false, currentTab: 'review',
    escapeHtml: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    escapeJsAttr: s => String(s).replace(/'/g, "\\'"), renderHanziParts: () => '', lessonsLabel: () => 'Bài 5', skillAudioAvailable: () => true, vtMarkStart() {}, vtHiddenMs: () => 0,
    render() {}, speak() {}, playDing() {}, playBuzz() {},
    sqCreate: () => ({ items: [], doneHz: new Set(), totalPlanned: 0, answeredCount: 0, sessionId: null, startTime: null, endTime: null, completedCards: [], lessonFilter: null, dayKey: null }),
    sqSnapshotLessonFilter: () => ({}), sqReadPersisted: () => null, sqPersist() {}, sqClearPersisted() {}, ssArchiveSession() {}, refreshServerMeta() {},
    sessionKnownHz: new Set(), saveSessionKnownHz() {}, sqPurgeHzFromAllQueues() {}, sqLessonFilterMatches: () => true, REPEAT_GAP: 6,
    genIdempotencyKey: () => 'k', todayKey: () => '2026-10-20', goTab() {}, submitFsrsReviewAwaited: async () => ({ ok: true }), submitSkillPractice: async () => ({ ok: true }), SUBMIT_REVIEW_MAX_WAIT_MS: 1000, alert() {},
  }, extra || {});
  vm.createContext(ctx);
  for (const f of ['js/answer-match.js', 'js/skill-score.js', 'js/session-summary.js', 'js/question-engine.js', 'js/question-selector.js', 'js/review.js']) vm.runInContext(read(f), ctx);
  return ctx;
}
const R = (ctx, code) => vm.runInContext(code, ctx);
function wrongOfficialThenAdvance(ctx, redoAlreadyAnswered) {
  R(ctx, `rvLog = ${JSON.stringify(Array.from({ length: redoAlreadyAnswered }, () => ({ hz: '准备', l: 5, typeId: 'vi2hz', skill: 'recall', correct: false, official: false, source: 'redo' })))};
    rvQueue.items = [{ type: 'review', word: WORDS.find(w => w.hz === '准备') }].concat(WORDS.filter(w => w.hz !== '准备').slice(0, 8).map(w => ({ type: 'review', word: w })));
    rvQueue.completedCards = []; rvQuestion = QE.build('hz2vi', WORDS.find(w => w.hz === '准备'), Object.assign(rvQCtx(), { rand: Math.random }));
    rvLastAnswer = { correct: false }; rvPhase = 'answered'; rvAdvanceQueue();`);
  return R(ctx, `rvQueue.items.filter(i => i.type === 'redo' && i.word.hz === '准备').length`);
}
test('3a. Thẻ chính thức sai → chèn 1 câu luyện lại (đổi dạng) và thẻ chính thức vẫn quay lại hàng đợi', () => {
  const ctx = reviewEnv();
  assert.strictEqual(wrongOfficialThenAdvance(ctx, 0), 1);
  const redo = R(ctx, `rvQueue.items.find(i => i.type === 'redo')`);
  assert.deepStrictEqual(Array.from(redo.failedTypes), ['hz2vi'], 'phải ghi nhớ dạng đã sai để đổi dạng');
  assert.strictEqual(R(ctx, `rvQueue.items.filter(i => i.type === 'review' && i.word.hz === '准备').length`), 1, 'thẻ chính thức phải quay lại');
});
test('3b. Trần luyện lại: từ đã có ≥ MAX câu redo trong phiên thì KHÔNG sinh thêm redo (không lặp vô hạn)', () => {
  const ctx = reviewEnv();
  assert.strictEqual(wrongOfficialThenAdvance(reviewEnv(), SM.MAX_REDO_ANSWERS_PER_WORD - 1), 1, 'dưới trần vẫn được');
  assert.strictEqual(wrongOfficialThenAdvance(ctx, SM.MAX_REDO_ANSWERS_PER_WORD), 0, 'chạm trần: không thêm');
  assert.strictEqual(R(ctx, `rvQueue.items.filter(i => i.type === 'review' && i.word.hz === '准备').length`), 1, 'thẻ chính thức vẫn quay lại dù chạm trần');
});
test('3c. canQueueRedo tính cả redo ĐANG CHỜ trong hàng đợi; chỉ đếm đúng từ đó', () => {
  const items = [{ type: 'redo', word: { hz: 'A' } }, { type: 'redo', word: { hz: 'A' } }, { type: 'redo', word: { hz: 'B' } }];
  assert.strictEqual(SM.canQueueRedo([], items, 'A', 3), true); assert.strictEqual(SM.canQueueRedo([{ hz: 'A', source: 'redo' }], items, 'A', 3), false);
  assert.strictEqual(SM.canQueueRedo([{ hz: 'A', source: 'review' }], [], 'A', 1), true, 'lượt chính thức không tính vào trần redo');
});
test('3d. Mô phỏng người học sai MÃI: phiên luôn kết thúc, số câu redo của 1 từ ≤ trần', () => {
  const ctx = reviewEnv();
  R(ctx, `rvLog = []; rvQueue.items = [{ type: 'review', word: WORDS.find(w => w.hz === '准备') }, ...WORDS.filter(w => w.hz !== '准备').slice(0, 6).map(w => ({ type: 'review', word: w }))]; rvQueue.completedCards = []; rvPrepareCurrentCard();`);
  let steps = 0, redoAnswered = 0;
  while (R(ctx, 'rvQueue.items.length') && steps++ < 400) {
    const it = R(ctx, 'rvQueue.items[0]');
    if (R(ctx, 'rvPhase') === 'intro') { R(ctx, 'rvIntroDone()'); continue; }
    const isTarget = it.word && it.word.hz === '准备';
    const wrong = isTarget && steps < 150; // từ này luôn sai trong 150 bước đầu rồi đúng
    if (it.type === 'redo' && isTarget) redoAnswered++;
    R(ctx, `rvLastAnswer = { correct: ${!wrong} }; rvPhase = 'answered'; rvLog.push({ hz: ${JSON.stringify(it.word ? it.word.hz : 'x')}, typeId: rvQuestion && rvQuestion.typeId, skill: rvQuestion && rvQuestion.skill, correct: ${!wrong}, official: ${it.type === 'review'}, source: ${JSON.stringify(it.type)} }); rvAdvanceQueue();`);
  }
  assert.ok(steps < 400, 'phiên không kết thúc');
  assert.ok(redoAnswered <= SM.MAX_REDO_ANSWERS_PER_WORD + 2, 'redo của 1 từ vượt trần: ' + redoAnswered);
});
test('3e. Thẻ chính thức quay lại KHÔNG hỏi lại đúng (từ, dạng) vừa sai — đổi chiều thật sự', () => {
  const s = QS.newSession(); QS.record(s, QE.build('hz2vi', W('准备'), ctxOf({ rand: rng(5) })), false, 3000);
  for (let i = 0; i < 20; i++) {
    const q = QS.choose(W('准备'), ctxOf({ rand: rng(i + 1) }), { profile: prof(), session: s, fsrsOnly: true, rand: rng(i + 7) });
    assert.notStrictEqual(q.typeId, 'hz2vi');
  }
});

// ── 4. Tổng kết ─────────────────────────────────────────────────────────────────────────────────────────
const e = (hz, skill, correct, extra) => Object.assign({ hz, typeId: skill, skill, correct, official: true, source: 'review' }, extra || {});
test('4a. Số câu trả lời và số từ duy nhất tính RIÊNG; lượt chính thức / luyện bổ sung tách riêng', () => {
  const L = [e('认真', 'recognition', true), e('认真', 'recall', false, { official: false, source: 'extra' }), e('认真', 'pinyin', true), e('准备', 'recognition', true), e('准备', 'recall', false, { official: false, source: 'redo' })];
  const S = SM.summarize(L);
  assert.strictEqual(S.totalAnswers, 5); assert.strictEqual(S.uniqueWords, 2); assert.strictEqual(S.officialAnswers, 3); assert.strictEqual(S.practiceAnswers, 2);
  assert.strictEqual(S.correct, 3); assert.strictEqual(S.accuracy, 60);
});
test('4b. Câu check / redo / lượt đầu sau giới thiệu KHÔNG là bằng chứng kỹ năng (nhưng vẫn tính vào tổng câu)', () => {
  const L = [e('A', 'recall', false, { source: 'redo', official: false }), e('B', 'recall', false, { source: 'check', official: false }), e('C', 'recall', false, { intro: true })];
  const S = SM.summarize(L);
  assert.strictEqual(S.totalAnswers, 3); assert.strictEqual(S.skills.recall.answers, 3); assert.strictEqual(S.skills.recall.evidenceAnswers, 0);
  assert.strictEqual(S.skills.recall.level, 'insufficient', 'toàn câu vừa xem đáp án → không được kết luận yếu');
  assert.ok(!S.tips.some(t => t.kind === 'weak' || t.kind === 'recall'));
});
test('4c. Không kết luận khi < MIN_ANSWERS câu hoặc chỉ 1 từ duy nhất (3 lần sai CÙNG 1 từ ≠ kỹ năng yếu)', () => {
  assert.strictEqual(SM.summarize([e('A', 'recall', false), e('B', 'recall', false)]).skills.recall.level, 'insufficient');
  assert.strictEqual(SM.summarize([e('A', 'recall', false), e('A', 'recall', false), e('A', 'recall', false)]).skills.recall.level, 'insufficient');
  assert.strictEqual(SM.summarize([e('A', 'recall', false), e('B', 'recall', false), e('C', 'recall', false)]).skills.recall.level, 'weak');
});
test('4d. Nhận diện tốt + nhớ chủ động yếu → đề xuất Nghĩa → Chữ Hán; nhận diện tốt + nghe yếu → Nghe → Nghĩa', () => {
  const rec = ['A', 'B', 'C', 'D'].map(h => e(h, 'recognition', true));
  const S1 = SM.summarize(rec.concat(['A', 'B', 'C'].map(h => e(h, 'recall', false))));
  assert.ok(S1.tips[0].text.includes('Nghĩa → Chữ Hán') && S1.tips[0].kind === 'recall');
  assert.deepStrictEqual(Array.from(S1.recognizedNotRecalled).sort(), ['A', 'B', 'C']);
  const S2 = SM.summarize(rec.concat(['A', 'B', 'C'].map(h => e(h, 'listening', false))));
  assert.ok(S2.tips[0].text.includes('Nghe → Nghĩa')); assert.deepStrictEqual(Array.from(S2.listeningWeak).sort(), ['A', 'B', 'C']);
});
test('4e. Kỹ năng cần cải thiện nhưng nhận diện KHÔNG tốt → không dùng câu "nhận diện khá tốt" (không bịa so sánh)', () => {
  const S = SM.summarize(['A', 'B', 'C'].map(h => e(h, 'recognition', false)).concat(['A', 'B', 'C'].map(h => e(h, 'recall', false))));
  assert.ok(!S.tips.some(t => t.text.includes('nhận diện chữ Hán khá tốt')));
});
test('4f. Ít dữ liệu → nói rõ chưa đủ dữ liệu, không khen/chê; không có chỉ số "% ghi nhớ"', () => {
  const S = SM.summarize([e('A', 'recognition', true), e('B', 'recall', true)]);
  assert.strictEqual(S.tips.length, 1); assert.strictEqual(S.tips[0].kind, 'insufficient'); assert.ok(S.tips[0].text.includes('chưa đủ dữ liệu'));
  assert.ok(!/ghi nhớ \d+%|khả năng nhớ/i.test(JSON.stringify(S)));
});
test('4g. Giao diện tổng kết (review.js): hiện số câu/số từ/lượt chính thức & bổ sung, bảng kỹ năng, lời đề xuất chỉ khi có dữ liệu', () => {
  const ctx = reviewEnv();
  R(ctx, `rvQueue.items = []; rvQueue.startTime = 0; rvQueue.endTime = 60000; rvSummary = { reviewCount: 4, newCount: 0 };
    rvLog = ${JSON.stringify(['A', 'B', 'C', 'D'].map(h => e(h, 'recognition', true)).concat(['A', 'B', 'C'].map(h => e(h, 'recall', false))).map(x => Object.assign(x, { l: 1 })))};`);
  const html = R(ctx, 'rvSummaryHtml()');
  assert.ok(html.includes('Lượt ôn chính thức:</b> 7') && html.includes('Luyện bổ sung:</b> 0'));
  assert.ok(html.includes('Nhớ chủ động') && html.includes('Cần luyện thêm') && html.includes('Nhận diện'));
  assert.ok(html.includes('Hãy ưu tiên luyện Nghĩa → Chữ Hán'));
  assert.ok(html.includes('Nhận diện được nhưng chưa tự nhớ (3)'));
  assert.ok(html.includes('chưa phải mức độ ghi nhớ lâu dài'));
});

// ── 5. Pinyin / thanh điệu / âm thanh ────────────────────────────────────────────────────────────────────
test('5a. Dấu thanh, số thanh, hoa/thường, khoảng trắng, ü/v đều được hiểu đúng', () => {
  for (const v of ['zhǔnbèi', 'zhǔn bèi', 'Zhǔnbèi', 'ZHUN3BEI4', 'zhun3 bei4', ' zhǔn  bèi ']) assert.strictEqual(AM.matchPinyin(v, 'zhǔnbèi').correct, true, v);
  assert.strictEqual(AM.matchPinyin('lv4', 'lǜ').correct, true); assert.strictEqual(AM.matchPinyin('nü3', 'nǚ').correct, true);
});
test('5b. Sai thanh điệu KHÔNG bị bỏ qua và được phản hồi CỤ THỂ (âm tiết nào, gõ thanh mấy, đáp án thanh mấy)', () => {
  const r = AM.matchPinyin('zhǔnbēi', 'zhǔnbèi'); assert.strictEqual(r.verdict, 'tone_mismatch'); assert.strictEqual(r.correct, false);
  const d = AM.toneDiff('zhǔnbēi', 'zhǔnbèi'); assert.deepStrictEqual(d.map(x => [x.n, x.got, x.want]), [[2, 1, 4]]);
  const f = AM.toneFeedback('zhǔnbēi', 'zhǔnbèi'); assert.ok(f.includes('Âm tiết 2') && f.includes('thanh 1') && f.includes('thanh 4'), f);
  const two = AM.toneDiff('rènzhěn', 'rènzhēn'); assert.strictEqual(two.length, 1);
  assert.strictEqual(AM.toneDiff('zhun4bei1', 'zhǔnbèi').length, 2, 'sai cả 2 âm tiết phải báo cả 2');
});
test('5c. Từ 1 âm tiết: không ghi "Âm tiết 1"; thanh nhẹ ↔ có thanh được mô tả rõ', () => {
  assert.ok(!AM.toneFeedback('mā', 'má').includes('Âm tiết') && AM.toneFeedback('mā', 'má').includes('thanh 2'));
  assert.ok(AM.toneFeedback('xiūxī', 'xiūxi').includes('thanh nhẹ'));
});
test('5d. Gõ thiếu thanh hoàn toàn vẫn là "toneless" (không đúng); khác âm là "wrong"; không có phản hồi thanh khi khác âm', () => {
  assert.strictEqual(AM.matchPinyin('zhunbei', 'zhǔnbèi').verdict, 'toneless');
  assert.strictEqual(AM.matchPinyin('zhanbei', 'zhǔnbèi').verdict, 'wrong'); assert.strictEqual(AM.toneFeedback('zhanbei', 'zhǔnbèi'), '');
});
test('5e. Đáp án chuẩn nhiều cách đọc ("cháng / zhǎng"): chấp nhận bất kỳ cách đọc → câu mơ hồ không bị chấm sai', () => {
  for (const v of ['cháng', 'zhǎng', 'chang2', 'zhang3']) assert.strictEqual(AM.matchPinyin(v, 'cháng / zhǎng').correct, true, v);
  assert.strictEqual(AM.toneFeedback('chāng', 'cháng / zhǎng').includes('thanh 2'), true, 'phản hồi dùng cách đọc cùng chữ cái');
});
test('5f. Server (lib/skills.gradeAnswer) vẫn chấm pinyin tự nhập đúng và trả verdict', () => {
  const ex = SK.resolveExercise('review-hz2py-typed', 'hz2py');
  const g = SK.gradeAnswer('zhǔnbèi', 'zhǔnbēi', ex); assert.strictEqual(g.answerCorrect, false); assert.strictEqual(g.verdict, 'tone_mismatch');
  assert.strictEqual(SK.gradeAnswer('zhǔnbèi', 'zhun3bei4', ex).answerCorrect, true);
});
test('5g. Giao diện câu tự nhập pinyin hiện phản hồi thanh điệu cụ thể', () => {
  const ctx = reviewEnv();
  R(ctx, `rvQueue.items = [{ type: 'review', word: WORDS.find(w => w.hz === '准备') }]; rvStage = 'run'; rvStartInfo = null; rvLog = []; rvPrepareCurrentCard();
    rvQuestion = QE.build('typeHz2py', WORDS.find(w => w.hz === '准备'), Object.assign(rvQCtx(), { rand: Math.random })); rvPhase = 'answered';
    rvLastAnswer = { correct: false, typed: { value: 'zhǔnbēi', verdict: 'tone_mismatch', correct: false } };`);
  const html = R(ctx, 'rvExplainHtml()');
  assert.ok(html.includes('Âm tiết 2') && html.includes('thanh 4'), html.slice(0, 400));
});

// ── 6. Tương thích ───────────────────────────────────────────────────────────────────────────────────────
test('6a. Luyện bổ sung KHÔNG gọi đường FSRS: rvPickPractice chỉ dùng submitSkillPractice', () => {
  const rv = read('js/review.js'); const a = rv.indexOf('function rvPickPractice'), b = rv.indexOf('function rvSubmitTyped');
  const body = rv.slice(a, b).replace(/\/\/.*$/gm, ''); assert.ok(body.includes('submitSkillPractice') && !/submitFsrsReview|\/api\/study\/review/.test(body));
});
test('6b. session-summary.js thuần (không DOM/mạng/DB) và được nạp TRƯỚC review.js; package.json nối test:v118', () => {
  assert.ok(!/\bdocument\b|\bwindow\b|\bfetch\(|require\(/.test(read('js/session-summary.js').replace(/\/\/.*$/gm, '')));
  const h = read('index.html'); assert.ok(h.indexOf('session-summary.js') > 0 && h.indexOf('session-summary.js') < h.indexOf('review.js'));
  const pk = JSON.parse(read('package.json')); assert.ok(pk.scripts['test:v118'] && pk.scripts['test:v110'].includes('test:v118'));
});
test('6c. Hồ sơ/hàng đợi cũ (không có trường intro, không có lịch sử) vẫn tổng kết được', () => {
  const S = SM.summarize([{ hz: 'A', skill: 'recognition', correct: true, official: true, source: 'review' }]);
  assert.strictEqual(S.totalAnswers, 1); assert.strictEqual(SM.summarize(undefined).totalAnswers, 0); assert.strictEqual(SM.summarize([]).accuracy, null);
  assert.strictEqual(QS.wordTrail(QS.newSession(), 'x').lastWrongSkill, null); assert.strictEqual(QS.wordTrail(undefined, 'x').wrongTotal, 0);
});

runAll();
