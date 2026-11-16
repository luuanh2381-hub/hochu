#!/usr/bin/env node
// test/v167-listen-sent-zh.test.js — V167: dạng "Nghe câu → Chọn câu" (FSRS chính thức) ở "Hôm nay học".
//
// Kiểm: dạng mới dựng từ CÂU THẬT (word_examples / SENTENCES), nhiễu là câu thật khác,
// sentPick loại nhiễu chứa từ mục tiêu, SENTENCE_ORDER không chứa dạng từ đơn lẻ, bộ chọn KHÔNG rơi về
// hz2vi khi thiếu dữ liệu câu, nhãn exercise kỹ năng khớp server (lib/skills), chấm server theo câu,
// số câu/buổi kẹp 0–15 (mặc định 6), và âm thanh đọc CẢ CÂU chứ không phải từ.
// KHÔNG cần Postgres, KHÔNG gọi mạng.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

global.QE = require('../js/question-engine.js');
const QE = global.QE;
global.SS = require('../js/skill-score.js');
const QS = require('../js/question-selector.js');
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

// ── Dữ liệu thật thu nhỏ ────────────────────────────────────────────────────────────────────
const W = { hz: '学习', py: 'xué xí', vi: 'học tập', l: 1 };
const EXAMPLES = [
  { hz: '学习', zh: '我每天学习汉语。', vi: 'Tôi học tiếng Trung mỗi ngày.' },
  { hz: '学习', zh: '他在学校学习很认真。', vi: 'Cậu ấy học rất nghiêm túc ở trường.' },
];
const SENTENCES = [
  { hz: '我们去公园散步。', vi: 'Chúng tôi đi dạo trong công viên.', hint: '公园' },
  { hz: '妈妈做的菜很好吃。', vi: 'Món ăn mẹ nấu rất ngon.', hint: '菜' },
  { hz: '明天可能会下雨。', vi: 'Ngày mai có thể sẽ mưa.', hint: '下雨' },
  { hz: '他喜欢听音乐。', vi: 'Anh ấy thích nghe nhạc.', hint: '音乐' },
];
const POOL = [W, { hz: '公园', py: 'gōng yuán', vi: 'công viên', l: 1 }];
function lcg(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
const ctx = (extra) => Object.assign({ pool: POOL, examples: EXAMPLES, sentences: SENTENCES, audioOk: true, rand: lcg(7) }, extra || {});
const SENT_TYPES = ['sent2vi', 'vi2sent', 'listenSent2vi', 'listenSent2zh', 'sentPick'];

// ── Dạng câu mới ───────────────────────────────────────────────────────────────────────────


test('dựng được: đề chỉ có âm thanh (không lộ chữ), 4 lựa chọn là câu chữ Hán, đúng 1 đáp án, hợp lệ', () => {
  for (let i = 1; i <= 25; i++) {
    const q = QE.build('listenSent2zh', W, ctx({ rand: lcg(i) }));
    assert.ok(q, 'phải dựng được');
    assert.strictEqual(q.prompt.kind, 'audio'); assert.ok(q.prompt.audioText && /[一-鿿]/.test(q.prompt.audioText));
    assert.ok(!JSON.stringify(q.prompt).replace(q.prompt.audioText, '').includes(q.sentence.zh), 'đề không hiện câu');
    assert.strictEqual(q.options.length, 4);
    assert.strictEqual(q.correctKey, q.sentence.zh); assert.strictEqual(q.prompt.audioText, q.sentence.zh);
    assert.strictEqual(q.options.filter((o) => o.key === q.correctKey).length, 1);
    assert.strictEqual(new Set(q.options.map((o) => o.key)).size, 4);
    assert.deepStrictEqual(QE.validate(q), { ok: true });
  }
});

test('nhãn FSRS CHÍNH THỨC: exerciseFsrs hợp lệ phía server, quizType sentence, sentField zh, kỹ năng listening; nhãn luyện thêm không đi FSRS', () => {
  const q = QE.build('listenSent2zh', W, ctx());
  assert.strictEqual(q.exerciseFsrs, 'review-listen-sent-zh'); assert.strictEqual(q.fsrsEligible, true); assert.strictEqual(q.skill, 'listening');
  const f = SK.resolveExercise('review-listen-sent-zh', 'sentence');
  assert.ok(f && f.fsrs === true && f.sentField === 'zh' && f.skill === 'listening');
  const p = SK.resolveExercise('practice-listen-sent-zh', 'sentence');
  assert.ok(p && p.fsrs === false && p.sentField === 'zh');
  assert.strictEqual(SK.resolveExercise('review-listen-sent-zh', 'hz2vi'), null, 'sai quizType bị từ chối');
});

test('không dựng khi: máy không có giọng đọc / chưa có câu ví dụ / không đủ nhiễu (KHÔNG bịa, KHÔNG rơi về từ đơn)', () => {
  assert.strictEqual(QE.build('listenSent2zh', W, ctx({ audioOk: false })), null);
  assert.strictEqual(QE.build('listenSent2zh', W, ctx({ examples: [], sentences: [] })), null);
  assert.strictEqual(QE.build('listenSent2zh', W, ctx({ sentences: [] })), null, 'chỉ 2 câu < 4 lựa chọn');
});

test('nằm trong SENTENCE_ORDER + có trọng số; trong 1 buổi học (có luân phiên dạng) bộ chọn thật sự ra dạng mới, không ra dạng nghe khi máy không có giọng đọc', () => {
  assert.ok(QE.SENTENCE_ORDER.includes('listenSent2zh'));
  assert.ok(QS.WEIGHTS.base.listenSent2zh > 0, 'có trọng số');
  // Cùng kỹ năng 'listening' với listenSent2vi nên khi hoà điểm dạng cũ đứng trước — dạng mới đến lượt nhờ luân phiên dạng trong buổi (diversity).
  const seen = {};
  const sess = QS.newSession();
  for (let i = 1; i <= 40; i++) {
    const q = QS.choose(W, ctx({ rand: lcg(i) }), { only: QE.SENTENCE_ORDER, fsrsOnly: true, rand: lcg(i + 1), session: sess });
    assert.ok(q && QE.SENTENCE_ORDER.includes(q.typeId));
    QS.record(sess, q, true, 3000);
    seen[q.typeId] = (seen[q.typeId] || 0) + 1;
  }
  assert.ok(seen.listenSent2zh > 0, 'phải có lúc ra dạng mới: ' + JSON.stringify(seen));
  const sess2 = QS.newSession();
  for (let i = 1; i <= 30; i++) {
    const q = QS.choose(W, ctx({ audioOk: false, rand: lcg(i) }), { only: QE.SENTENCE_ORDER, fsrsOnly: true, rand: lcg(i + 1), session: sess2 });
    assert.ok(q && q.typeId !== 'listenSent2zh' && q.typeId !== 'listenSent2vi', 'không có giọng đọc thì không ra dạng nghe: ' + q.typeId);
    QS.record(sess2, q, true, 3000);
  }
});

test('server chấm theo câu thật: resolveSentenceAnswer dùng sentField zh (đáp án = cả câu chữ Hán), không tin client', () => {
  const api = read('api/index.js');
  const i = api.indexOf('async function resolveSentenceAnswer');
  const blk = api.slice(i, i + 700);
  assert.ok(/sentField === 'vi'/.test(blk) && /return \{ correctAnswer: found\.zh \}/.test(blk));
});

test('sau khi trả lời vẫn đọc CẢ CÂU và hiện "Câu đầy đủ" (q.sentence có zh/vi)', () => {
  const q = QE.build('listenSent2zh', W, ctx());
  assert.ok(q.sentence && q.sentence.zh && q.sentence.vi);
  assert.ok(q.explanation.some((l) => /^Câu đầy đủ: /.test(l)));
});

runAll();
