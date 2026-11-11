#!/usr/bin/env node
// test/v138-sentence.test.js — V138: "Hôm nay học" hỏi THEO CÂU thay vì trắc nghiệm từ đơn lẻ.
//
// Kiểm: 4 dạng câu mới chỉ dựng từ CÂU THẬT (word_examples / SENTENCES), nhiễu là câu thật khác,
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
const SENT_TYPES = ['sent2vi', 'vi2sent', 'listenSent2vi', 'sentPick'];

// ── Dạng câu mới ───────────────────────────────────────────────────────────────────────────
test('4 dạng câu mới đều khai báo đúng: quizType sentence, đi đường FSRS + luyện bổ sung, cần câu ví dụ', () => {
  for (const t of SENT_TYPES) {
    const T = QE.TYPES[t];
    assert.ok(T, 'thiếu TYPES.' + t);
    assert.strictEqual(T.quizType, 'sentence', t + ' quizType');
    assert.strictEqual(T.sentence, true, t + ' đánh dấu sentence');
    assert.ok(T.needsExample, t + ' phải cần câu ví dụ');
    assert.ok(/^review-/.test(T.exerciseFsrs), t + ' exerciseFsrs');
    assert.ok(/^practice-/.test(T.exercisePractice), t + ' exercisePractice');
  }
  assert.ok(QE.TYPES.listenSent2vi.needsAudio, 'nghe câu cần audio');
  assert.strictEqual(QE.TYPES.sent2vi.sentenceField, 'vi');
  assert.strictEqual(QE.TYPES.vi2sent.sentenceField, 'zh');
});

test('mỗi dạng dựng câu hợp lệ: 4 lựa chọn khác nhau, đúng 1 đáp án, câu nguồn là câu THẬT trong dữ liệu', () => {
  const real = new Set(EXAMPLES.map(e => e.zh).concat(SENTENCES.map(s => s.hz)));
  for (const t of SENT_TYPES) {
    const q = QE.build(t, W, ctx());
    assert.ok(q, t + ' phải dựng được từ dữ liệu mẫu');
    assert.strictEqual(q.typeId, t);
    assert.ok(q.sentence && q.sentence.zh, t + ' phải có câu nguồn');
    assert.ok(real.has(q.sentence.zh), t + ' câu nguồn phải là câu có thật');
    assert.strictEqual(q.options.length, 4, t + ' phải có 4 lựa chọn');
    const keys = q.options.map(o => QE.normText(o.key));
    assert.strictEqual(new Set(keys).size, 4, t + ' lựa chọn phải khác nhau');
    assert.strictEqual(q.options[q.correctIndex].key, q.correctKey, t + ' chỉ số đáp án đúng');
    assert.strictEqual(q.exerciseFsrs, QE.TYPES[t].exerciseFsrs);
    assert.ok(QE.validate(q, {}).ok, t + ' phải qua validate');
  }
});

test('Câu → Nghĩa: đề hiện câu chữ Hán, đáp án là nghĩa của CẢ CÂU, không hiện nghĩa trước khi trả lời', () => {
  const q = QE.build('sent2vi', W, ctx());
  assert.ok(q);
  assert.strictEqual(q.prompt.kind, 'sent');
  assert.strictEqual(q.prompt.main, q.sentence.zh, 'đề phải là câu chữ Hán');
  assert.strictEqual(q.correctKey, q.sentence.vi, 'đáp án phải là nghĩa của cả câu');
  assert.ok(!String(q.prompt.main).includes(q.sentence.vi), 'đề không được lộ nghĩa');
});

test('Nghĩa → Câu: đề là nghĩa cả câu, các lựa chọn là CÂU chữ Hán thật, đáp án đúng là câu nguồn', () => {
  const q = QE.build('vi2sent', W, ctx());
  assert.ok(q);
  assert.strictEqual(q.prompt.main, q.sentence.vi);
  assert.strictEqual(q.correctKey, q.sentence.zh);
  for (const o of q.options) assert.ok(/[一-鿿]/.test(o.key), 'lựa chọn phải là câu chữ Hán: ' + o.key);
});

test('Nghe câu → Nghĩa: thiếu audio → không dựng; có audio → audioText là CẢ CÂU, đề không hiện chữ Hán', () => {
  assert.strictEqual(QE.build('listenSent2vi', W, ctx({ audioOk: false })), null, 'không có audio thì bỏ dạng này');
  const q = QE.build('listenSent2vi', W, ctx());
  assert.ok(q);
  assert.strictEqual(q.prompt.kind, 'audio');
  assert.strictEqual(q.prompt.audioText, q.sentence.zh, 'phải đọc cả câu');
  assert.ok(!String(q.prompt.main || '').includes(W.hz), 'đề không được hiện chữ Hán');
  assert.strictEqual(q.correctKey, q.sentence.vi);
});

test('Chọn câu có dùng từ: đáp án chứa từ mục tiêu đúng 1 lần, KHÔNG nhiễu nào chứa từ mục tiêu', () => {
  const q = QE.build('sentPick', W, ctx());
  assert.ok(q);
  assert.ok(q.correctKey.includes(W.hz), 'đáp án phải là câu có từ');
  assert.strictEqual(q.correctKey.split(W.hz).length - 1, 1, 'từ xuất hiện đúng 1 lần');
  q.options.forEach((o, i) => {
    if (i === q.correctIndex) return;
    assert.ok(!String(o.key).includes(W.hz), 'nhiễu không được chứa từ mục tiêu: ' + o.key);
  });
});

test('Không có câu ví dụ → cả 4 dạng trả null (KHÔNG bịa câu, KHÔNG rơi về trắc nghiệm từ)', () => {
  const bare = ctx({ examples: [], sentences: [] });
  for (const t of SENT_TYPES) assert.strictEqual(QE.build(t, W, bare), null, t + ' phải trả null');
});

test('SENTENCE_ORDER chỉ gồm câu hỏi theo câu/điền từ và không có dạng từ đơn lẻ', () => {
  assert.deepStrictEqual(QE.SENTENCE_ORDER, ['sent2vi', 'vi2sent', 'listenSent2vi', 'cloze', 'sentPick']);
  for (const t of QE.SENTENCE_ORDER) assert.ok(!['hz2vi', 'vi2hz', 'listen2hz', 'listen2vi', 'hz2py'].includes(t), t);
});

test('Bộ chọn với SENTENCE_ORDER: không bao giờ trả trắc nghiệm từ đơn lẻ; thiếu câu → null', () => {
  for (let i = 0; i < 20; i++) {
    const q = QS.choose(W, ctx({ rand: lcg(i + 1) }), { only: QE.SENTENCE_ORDER, fsrsOnly: true, rand: lcg(i + 3) });
    assert.ok(q, 'phải dựng được một dạng câu');
    assert.ok(QE.SENTENCE_ORDER.includes(q.typeId), 'dạng lạ: ' + q.typeId);
  }
  const none = QS.choose(W, ctx({ examples: [], sentences: [], rand: lcg(1) }), { only: QE.SENTENCE_ORDER, fsrsOnly: true, rand: lcg(1) });
  assert.strictEqual(none, null, 'không được hạ chuẩn về hz2vi');
});

// ── Nhãn kỹ năng + chấm server ─────────────────────────────────────────────────────────────
test('lib/skills: 8 nhãn câu hỏi theo câu khớp quizType sentence; nhãn sai chiều bị từ chối', () => {
  const fsrs = { 'review-sent2vi': 'vi', 'review-vi2sent': 'zh', 'review-listen-sent': 'vi', 'review-sent-pick': 'zh' };
  const prac = { 'practice-sent2vi': 'vi', 'practice-vi2sent': 'zh', 'practice-listen-sent': 'vi', 'practice-sent-pick': 'zh' };
  for (const [k, f] of Object.entries(Object.assign({}, fsrs, prac))) {
    const ex = SK.resolveExercise(k, 'sentence');
    assert.ok(ex, k + ' phải hợp lệ');
    assert.strictEqual(ex.sentField, f, k + ' sentField');
    assert.strictEqual(ex.fsrs, !!fsrs[k], k + ' fsrs');
    assert.strictEqual(SK.resolveExercise(k, 'hz2vi'), null, k + ' phải từ chối quizType sai');
  }
  const ex = SK.resolveExercise('review-sent2vi', 'sentence');
  assert.strictEqual(SK.gradeAnswer('Tôi học mỗi ngày.', 'Tôi học mỗi ngày.', ex).answerCorrect, true);
  assert.strictEqual(SK.gradeAnswer('Tôi học mỗi ngày.', 'câu khác', ex).answerCorrect, false);
});

test('server: đáp án theo câu được tra lại từ dữ liệu thật (không tin client)', () => {
  const api = read('api/index.js');
  assert.ok(/async function resolveSentenceAnswer\(word, sentField, sentence\)/.test(api), 'có resolveSentenceAnswer');
  assert.ok(/orderSentence\.fromSentences\(word, PROGRAM_SENTENCES\)/.test(api), 'tra SENTENCES');
  assert.ok(/orderSentence\.fromExamples\(word, examples\)/.test(api), 'tra word_examples');
  assert.ok(/if \(!found\) return null/.test(api), 'câu không có thật → không chấm');
  // Cả preview và review đều dùng nhánh sentField.
  const hits = (api.match(/sentField\) \{/g) || []).length;
  assert.ok(hits >= 3, 'preview + review + practice phải có nhánh sentField (có ' + hits + ')');
});

// ── Số câu/buổi 0–15 + chống lặp + âm thanh cả câu ────────────────────────────────────────
test('số câu luyện/buổi: kẹp 0–15 hoặc "all" (V146: mặc định không còn là 6)', () => {
  const src = read('js/review.js');
  const a = src.indexOf('function rvSentenceCountSetting()');
  const b = src.indexOf('function rvSetSentenceCount');
  const end = src.indexOf('\n', src.indexOf('}', b)) + 1;
  assert.ok(a > 0 && b > a, 'không trích được rvSentenceCount/rvSetSentenceCount');
  let store = {};
  const box = {
    parseInt, Number,
    rvLsGet: (k) => (k in store ? store[k] : null),
    rvLsSet: (k, v) => { store[k] = String(v); },
  };
  vm.createContext(box);
  vm.runInContext(src.slice(a, end), box);
  assert.strictEqual(box.rvSentenceCount(), Infinity, 'V146: mặc định = không cắt (theo giới hạn ngày)');
  // Giá trị rác (ô chọn không bao giờ gửi) → 0, KHÔNG âm thầm thành 6.
  for (const [raw, want] of [['0', 0], ['2', 2], ['15', 15], ['16', 15], ['99', 15], ['-4', 0], ['x', 0]]) {
    box.rvSetSentenceCount(raw);
    assert.strictEqual(box.rvSentenceCount(), want, 'nhập ' + raw);
  }
  assert.ok(/const cap = rvSentenceCount\(\)/.test(src), 'buổi học dùng đúng số câu này');
});

test('âm thanh sau khi trả lời: đọc CẢ CÂU (không chỉ từ), đọc lại được', () => {
  const src = read('js/review.js');
  const a = src.indexOf('function rvAnswerSentence(q)');
  const b = src.indexOf('function rvReplaySentence');
  const end = src.indexOf('\n', src.indexOf('}', a)) + 1;
  const box = {};
  vm.createContext(box);
  vm.runInContext(src.slice(a, end), box);
  const q = { typeId: 'sent2vi', word: W, sentence: { zh: '我每天学习汉语。' }, correctKey: 'Tôi học tiếng Trung mỗi ngày.' };
  assert.strictEqual(box.rvAnswerSentence(q), '我每天学习汉语。', 'phải đọc cả câu');
  assert.strictEqual(box.rvAnswerSentence({ typeId: 'vi2sent', word: W, sentence: null, correctKey: '我每天学习汉语。' }), '我每天学习汉语。');
  assert.strictEqual(box.rvAnswerSentence(null), '');
  // Các chỗ chấm phải đọc câu trả về, không đọc mỗi từ.
  assert.ok((src.match(/swSpeakAfterAnswer\(rvAnswerSentence\(/g) || []).length >= 3, 'mọi nhánh chấm đều đọc câu');
  assert.ok(!/swSpeakAfterAnswer\(w\.hz\)/.test(src), 'không còn đọc từ đơn lẻ');
  assert.ok(/function rvReplaySentence/.test(src) && /speak\(t\)/.test(src), 'có nút nghe lại');
});

test('chống lặp FSRS: một thẻ chỉ trả lời 1 lần/buổi — không chèn lại thẻ chính thức khi sai', () => {
  const src = read('js/review.js');
  assert.ok(/fsrsOnly: true, only: QE\.SENTENCE_ORDER/.test(src), 'thẻ chính thức chỉ hỏi dạng câu');
  // Không còn đoạn chèn lại thẻ chính thức vào hàng đợi sau khi trả lời sai.
  assert.ok(!/rvQueue\.items\.splice\([^)]*official/.test(src), 'không chèn lại thẻ chính thức');
});

runAll();