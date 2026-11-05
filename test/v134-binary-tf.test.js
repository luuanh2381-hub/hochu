#!/usr/bin/env node
// test/v134-binary-tf.test.js — V134: câu ĐÚNG/SAI + sửa lỗi thống kê của câu 2 đáp án (A hay B?, Đúng/Sai):
// đoán mò đúng 50% nên KHÔNG được cộng vào điểm kỹ năng (nguồn 'binary'), nhưng vẫn được lưu để theo dõi lỗi nhầm.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
global.QE = require('../js/question-engine.js');
const SK = require('../lib/skills.js');
let passed = 0, failed = 0; const pending = [];
const test = (n, f) => pending.push({ n, f });
async function runAll() {
  for (const { n, f } of pending) {
    try { await f(); passed++; console.log('  ✅ ' + n); }
    catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); }
  }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
}
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const POOL = [
  { hz: '买', py: 'mǎi', vi: 'mua', l: 3 }, { hz: '卖', py: 'mài', vi: 'bán', l: 3 },
  { hz: '在', py: 'zài', vi: 'ở, đang', l: 3 }, { hz: '再', py: 'zài', vi: 'lại, nữa', l: 3 },
  { hz: '学习', py: 'xuéxí', vi: 'học, học tập', l: 1 }, { hz: '学', py: 'xué', vi: 'học', l: 1 },
  { hz: '学校', py: 'xuéxiào', vi: 'trường học', l: 1 }, { hz: '老师', py: 'lǎoshī', vi: 'giáo viên', l: 1 },
  { hz: '长', py: 'cháng/zhǎng', vi: 'dài', l: 2 }, { hz: '谢谢', py: 'xièxie', vi: 'cảm ơn', l: 1 },
];
const W = (hz) => POOL.find(w => w.hz === hz);
const ctx = (extra, seed) => Object.assign({ pool: POOL, rand: rng(seed || 1), audioOk: true }, extra || {});
const ANS = { tfHz2vi: 'vi', tfVi2hz: 'hz', tfHz2py: 'py' };

test('3 dạng Đúng/Sai có trong TYPES, chỉ luyện bổ sung, không FSRS, không gõ, không âm thanh', () => {
  assert.deepStrictEqual(QE.TF_ORDER, ['tfHz2vi', 'tfVi2hz', 'tfHz2py']);
  for (const id of QE.TF_ORDER) {
    const T = QE.TYPES[id]; assert.ok(T && T.practiceOnly && T.exerciseFsrs === null && !T.typed && !T.needsAudio, id);
    assert.ok(![].concat(QE.MCQ_ORDER, QE.PRACTICE_ORDER, QE.TYPED_ORDER, QE.PRACTICE_TYPED_ORDER).includes(id), 'không lẫn vào bộ chọn tự động');
  }
});

test('khẳng định ĐÚNG = đáp án thật; khẳng định SAI = đáp án của từ khác và thật sự sai (nhiều hạt ngẫu nhiên)', () => {
  let built = 0, trues = 0, falses = 0;
  for (let seed = 1; seed <= 60; seed++) for (const w of POOL) for (const id of QE.TF_ORDER) for (const truth of [true, false]) {
    const q = QE.build(id, w, ctx({ tfTruth: truth }, seed)); if (!q) continue; built++;
    const real = w[ANS[id]], claim = q.tf.claim;
    assert.strictEqual(q.tf.truth, truth); assert.strictEqual(q.tf.correct, real);
    assert.strictEqual(claim === real, truth, `${id} ${w.hz} truth=${truth} claim=${claim}`);
    assert.strictEqual(q.correctKey, truth ? 'true' : 'false');
    assert.deepStrictEqual(q.options.map(o => o.key), ['true', 'false']);
    assert.ok(!q.typed && q.fsrsEligible === false);
    if (!truth) {
      falses++;
      if (id === 'tfHz2vi') assert.ok(!QE.meaningsOverlap(claim, w.vi));
      if (id === 'tfVi2hz') { const d = POOL.find(x => x.hz === claim); assert.ok(d && !QE.meaningsOverlap(d.vi, w.vi), 'chữ Hán sai không được trùng nghĩa'); }
      if (id === 'tfHz2py') assert.notStrictEqual(QE.pyKey(claim), QE.pyKey(w.py));
    } else trues++;
  }
  assert.ok(built > 200 && trues > 50 && falses > 50, `built=${built} trues=${trues} falses=${falses}`);
});

test('đề không lộ đáp án: câu Nghĩa→Chữ Hán không chứa chữ Hán thật; câu pinyin chỉ hiện khẳng định', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const q = QE.build('tfVi2hz', W('卖'), ctx({ tfTruth: false }, seed));
    assert.ok(q && !q.prompt.main.includes('卖'));
    const p = QE.build('tfHz2py', W('卖'), ctx({ tfTruth: true }, seed));
    assert.ok(p.prompt.ask.includes('mài') && p.tf.truth === true);
  }
});

test('ca mơ hồ bị loại: thiếu nghĩa, nhiều cách đọc; từ trùng nghĩa không được làm khẳng định sai', () => {
  assert.strictEqual(QE.build('tfHz2py', W('长'), ctx({ tfTruth: true })), null, 'nhiều cách đọc');
  assert.strictEqual(QE.build('tfHz2vi', { hz: '无', py: 'wú', vi: '', l: 1 }, ctx()), null, 'thiếu nghĩa');
  for (let seed = 1; seed <= 60; seed++) { // 学习 ("học, học tập") không bao giờ bị khẳng định sai bằng nghĩa "học" của 学
    const q = QE.build('tfHz2vi', W('学习'), ctx({ tfTruth: false }, seed));
    if (q) assert.ok(!['học'].includes(q.tf.claim), q.tf.claim);
  }
  // ép từ gây nhầm (tfDonor) được dùng khi hợp lệ
  const q = QE.build('tfHz2vi', W('卖'), ctx({ tfTruth: false, tfDonor: W('买') }));
  assert.strictEqual(q.tf.claim, 'mua');
});

test('validateTf chặn câu hỏng: nhãn đúng/sai lệch, khẳng định sai lại đúng nghĩa, thiếu khẳng định', () => {
  const good = QE.build('tfHz2vi', W('卖'), ctx({ tfTruth: false }));
  assert.strictEqual(QE.validate(good, {}).ok, true);
  const bad1 = Object.assign({}, good, { tf: Object.assign({}, good.tf, { truth: true }) }); assert.strictEqual(QE.validate(bad1, {}).ok, false);
  const bad2 = Object.assign({}, good, { tf: Object.assign({}, good.tf, { claim: 'bán' }) }); assert.strictEqual(QE.validate(bad2, {}).ok, false);
  const bad3 = Object.assign({}, good, { tf: { claim: '', correct: 'bán', truth: false } }); assert.strictEqual(QE.validate(bad3, {}).ok, false);
  const bad4 = Object.assign({}, good, { options: [good.options[0]] }); assert.strictEqual(QE.validate(bad4, {}).ok, false);
});

test('server chấm Đúng/Sai: 4 tổ hợp (khẳng định đúng/sai × Đúng/Sai); wrongAnswer chỉ khi chấp nhận khẳng định sai', () => {
  const g = SK.gradeBinaryVerdict;
  assert.deepStrictEqual(g('bán', 'bán', 'true'), { ok: true, claimIsTrue: true, answerCorrect: true, wrongAnswer: null });
  assert.deepStrictEqual(g('bán', 'bán', 'false'), { ok: true, claimIsTrue: true, answerCorrect: false, wrongAnswer: null }); // bác bỏ nhầm khẳng định đúng: KHÔNG ghi đáp án sai
  assert.deepStrictEqual(g('bán', 'mua', 'true'), { ok: true, claimIsTrue: false, answerCorrect: false, wrongAnswer: 'mua' }); // chấp nhận khẳng định sai: đúng là "nhầm"
  assert.deepStrictEqual(g('bán', 'mua', 'false'), { ok: true, claimIsTrue: false, answerCorrect: true, wrongAnswer: null });
  assert.strictEqual(g('bán', 'bán', 'maybe').ok, false); assert.strictEqual(g('bán', 'bán', undefined).ok, false); assert.strictEqual(g('bán', 'bán', true).ok, false);
  assert.strictEqual(g(' bán ', 'bán', 'true').answerCorrect, true, 'so sánh sau trim');
});

test('nhãn bài 2 đáp án khai báo binary; tf khai báo tf; nguồn binary không được tính điểm', () => {
  for (const k of ['practice-duel-recognition', 'practice-duel-recall', 'practice-duel-pinyin', 'practice-tf-recognition', 'practice-tf-recall', 'practice-tf-pinyin']) {
    const ex = SK.resolveExercise(k, null); assert.ok(ex && ex.binary === true && ex.fsrs === false, k);
    assert.strictEqual(!!ex.tf, k.includes('-tf-'));
  }
  for (const id of QE.TF_ORDER) { const T = QE.TYPES[id], ex = SK.resolveExercise(T.exercisePractice, T.quizType); assert.ok(ex, id); assert.strictEqual(ex.skill, T.skill); }
  assert.ok(SK.PRACTICE_SOURCES.includes('binary'));
  assert.deepStrictEqual(SK.UNSCORED_SOURCES, ['binary']);
  assert.deepStrictEqual(SK.SHOWN_ANSWER_SOURCES, ['check', 'redo'], 'hành vi cũ của check/redo không đổi');
  assert.deepStrictEqual(SK.NOT_SCORED_SOURCES.slice().sort(), ['binary', 'check', 'redo']);
  // các nhãn 4 đáp án / gõ cũ KHÔNG bị gắn binary
  for (const k of ['practice-recognition', 'practice-hz2tone', 'practice-hv2vi', 'practice-match-vi', 'practice-confusable']) assert.ok(!SK.resolveExercise(k, null).binary, k);
});

// ── recordPractice chạy THẬT với database giả: ghi nhật ký nhưng KHÔNG cộng điểm kỹ năng cho nguồn 'binary' ──
function loadStoreWithFakeDb() {
  const calls = [];
  const fakeClient = { query: async (sql, params) => { calls.push({ sql: String(sql), params }); if (/INSERT INTO skill_practice_log/.test(sql)) return { rows: [{ id: 1 }] }; return { rows: [] }; }, release() {} };
  const fakeDb = { getPool: () => ({ connect: async () => fakeClient }), resolveCanonicalWordId: async () => 7, ensureVocabTable: async () => {}, ensureFsrsTables: async () => {} };
  const dbPath = require.resolve('../lib/db.js');
  const saved = require.cache[dbPath];
  const fake = new Module(dbPath); fake.filename = dbPath; fake.loaded = true; fake.exports = fakeDb;
  require.cache[dbPath] = fake;
  delete require.cache[require.resolve('../lib/skill-store.js')];
  const store = require('../lib/skill-store.js');
  return { store, calls, restore() { if (saved) require.cache[dbPath] = saved; else delete require.cache[dbPath]; delete require.cache[require.resolve('../lib/skill-store.js')]; } };
}
const base = { userId: 'u', hz: '卖', answerCorrect: false, selectedAnswer: 'mua', responseTimeMs: 900, attemptKey: 'key-12345678', sessionId: 's1' };

test('recordPractice (DB giả): bài 2 đáp án luôn ghi source "binary" dù client gửi "mode", và KHÔNG cộng vào word_skill_stats', async () => {
  const h = loadStoreWithFakeDb();
  try {
    const out = await h.store.recordPractice(Object.assign({}, base, { exerciseType: 'practice-duel-recognition', source: 'mode' }));
    assert.strictEqual(out.ok, true); assert.strictEqual(out.recorded, true); assert.strictEqual(out.countedInSkill, false);
    const ins = h.calls.find(c => /INSERT INTO skill_practice_log/.test(c.sql));
    assert.ok(ins, 'vẫn ghi nhật ký'); assert.strictEqual(ins.params[8], 'binary'); assert.strictEqual(ins.params[9], 'mua', 'đáp án sai (nhầm) được lưu');
    assert.ok(!h.calls.some(c => /INSERT INTO word_skill_stats/.test(c.sql)), 'không cộng điểm kỹ năng');
  } finally { h.restore(); }
});

test('recordPractice (DB giả): bài 4 đáp án thường VẪN cộng điểm như cũ; check/redo vẫn không cộng', async () => {
  let h = loadStoreWithFakeDb();
  try {
    const out = await h.store.recordPractice(Object.assign({}, base, { exerciseType: 'practice-recognition', source: 'mode' }));
    assert.strictEqual(out.countedInSkill, true);
    assert.ok(h.calls.some(c => /INSERT INTO word_skill_stats/.test(c.sql)), 'có cộng điểm');
    assert.strictEqual(h.calls.find(c => /INSERT INTO skill_practice_log/.test(c.sql)).params[8], 'mode');
  } finally { h.restore(); }
  h = loadStoreWithFakeDb();
  try {
    const out = await h.store.recordPractice(Object.assign({}, base, { exerciseType: 'practice-recognition', source: 'check' }));
    assert.strictEqual(out.countedInSkill, false); assert.ok(!h.calls.some(c => /INSERT INTO word_skill_stats/.test(c.sql)));
  } finally { h.restore(); }
});

test('recordPractice (DB giả): wrongAnswer ghi đè — Đúng/Sai bác bỏ nhầm khẳng định đúng KHÔNG lưu đáp án sai; chấp nhận khẳng định sai thì lưu', async () => {
  let h = loadStoreWithFakeDb();
  try {
    await h.store.recordPractice(Object.assign({}, base, { exerciseType: 'practice-tf-recognition', selectedAnswer: 'bán', answerCorrect: false, wrongAnswer: null }));
    assert.strictEqual(h.calls.find(c => /INSERT INTO skill_practice_log/.test(c.sql)).params[9], null);
  } finally { h.restore(); }
  h = loadStoreWithFakeDb();
  try {
    await h.store.recordPractice(Object.assign({}, base, { exerciseType: 'practice-tf-recognition', selectedAnswer: 'mua', answerCorrect: false, wrongAnswer: 'mua' }));
    assert.strictEqual(h.calls.find(c => /INSERT INTO skill_practice_log/.test(c.sql)).params[9], 'mua');
    await h.store.recordPractice(Object.assign({}, base, { attemptKey: 'key-99999999', exerciseType: 'practice-tf-recognition', selectedAnswer: 'bán', answerCorrect: true }));
    assert.strictEqual(h.calls.filter(c => /INSERT INTO skill_practice_log/.test(c.sql))[1].params[9], null, 'đúng → không có đáp án sai');
  } finally { h.restore(); }
});

test('các truy vấn thống kê kỹ năng loại nguồn binary (xu hướng, theo dạng bài, hôm nay, trí nhớ); route Đúng/Sai bắt buộc verdict', () => {
  const st = fs.readFileSync(path.join(ROOT, 'lib/skill-store.js'), 'utf8');
  assert.strictEqual((st.match(/NOT_SCORED_SOURCES\]/g) || []).length, 3, 'trend + breakdown + today-progress');
  assert.ok(/SHOWN_ANSWER_SOURCES, UNSCORED_SOURCES\]/.test(st), 'retention loại binary');
  assert.ok(/COALESCE\(source, 'practice'\) <> ALL\(\$4::text\[\]\)/.test(st));
  const api = fs.readFileSync(path.join(ROOT, 'api/index.js'), 'utf8');
  assert.ok(api.includes("ex.tf && verdict !== 'true' && verdict !== 'false'") && api.includes('gradeBinaryVerdict(correctAnswer, selectedAnswer, verdict)'));
  const sq = fs.readFileSync(path.join(ROOT, 'js/study-queue.js'), 'utf8');
  assert.ok(sq.includes('payload.verdict = verdict'));
});

test('giao diện: nút Đúng/Sai ở Hôm nay học + tab Phân tích; duel/tf gửi source binary; Đúng/Sai gửi khẳng định + verdict; xen kẽ đúng/sai', () => {
  const lesson = fs.readFileSync(path.join(ROOT, 'js/lesson.js'), 'utf8');
  assert.ok(lesson.includes("skStartPractice('tf')"));
  const ui = fs.readFileSync(path.join(ROOT, 'js/skills-ui.js'), 'utf8');
  assert.ok(ui.includes("skStartPractice('tf')") && ui.includes('QE.TF_ORDER') && ui.includes('tfTruth'));
  assert.ok(ui.includes("p.kind === 'duel' || p.kind === 'tf')) ? 'binary'"));
  assert.ok(ui.includes('selectedAnswer: q.tf ? q.tf.claim : chosen, verdict: q.tf ? chosen : undefined'));
  assert.ok(ui.includes('wantTrue = !wantTrue'));
});

runAll();
