#!/usr/bin/env node
// test/v137-tone-recognition.test.js — V137: "🎵 Nhận biết thanh điệu" trong buổi "Hôm nay học".
//
// Kiểm: dạng hz2tone vẫn là luyện bổ sung (không đụng FSRS), câu dựng được đúng 1 đáp án và nhiễu chỉ
// đổi thanh; rvInsertToneRecognition chèn đúng số câu vào buổi, dải rác, không lặp từ, không sửa mảng gốc;
// các điểm nối giao diện (RV_PRACTICE_TYPES, nhãn, ép đúng dạng, không hỏi lại câu sai).
// KHÔNG cần Postgres, KHÔNG gọi mạng.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

global.QE = require('../js/question-engine.js');
const QE = global.QE;
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
  { hz: '天气', py: 'tiānqì', vi: 'thời tiết', l: 2 },
  { hz: '准备', py: 'zhǔnbèi', vi: 'chuẩn bị', l: 3 },
  { hz: '汉语', py: 'hànyǔ', vi: 'tiếng Hán', l: 2 },
  { hz: '老师', py: 'lǎoshī', vi: 'giáo viên', l: 1 },
  { hz: '学生', py: 'xuésheng', vi: 'học sinh', l: 2 },
  // Nhiều cách đọc / không có dấu thanh → hz2tone phải bỏ qua.
  { hz: '长', py: 'cháng / zhǎng', vi: 'dài / lớn', l: 3 },
  { hz: '的', py: 'de', vi: '(trợ từ)', l: 3 },
];
const W = (hz) => POOL.find(w => w.hz === hz);
const ctx = (seed) => ({ pool: POOL, audioOk: false, rand: rng(seed || 1) });

test('hz2tone: chỉ luyện bổ sung, không âm thanh, nhiễu chỉ đổi thanh, luôn có đúng 1 đáp án', () => {
  const T = QE.TYPES.hz2tone;
  assert.ok(T && T.practiceOnly === true && T.exerciseFsrs === null && !T.needsAudio);
  const ex = SK.resolveExercise(T.exercisePractice, T.quizType);
  assert.ok(ex, 'server biết nhãn bài');
  assert.strictEqual(ex.skill, 'pinyin'); assert.strictEqual(ex.fsrs, false);
  let built = 0;
  for (let seed = 1; seed <= 20; seed++) for (const w of POOL) {
    const q = QE.build('hz2tone', w, ctx(seed)); if (!q) continue; built++;
    assert.ok(q.prompt.kind === 'text', 'không cần âm thanh');
    assert.strictEqual(q.options[q.correctIndex].key, q.correctKey);
    assert.strictEqual(new Set(q.options.map(o => o.key)).size, q.options.length, 'không trùng đáp án');
    assert.ok(q.options.length >= 3, 'đủ lựa chọn');
    for (const o of q.options) assert.strictEqual(QE.toneSequence(o.key).length, QE.toneSequence(w.py).length, 'cùng số âm tiết: ' + o.key);
    assert.ok(QE.validate(q).ok, 'câu hợp lệ: ' + w.hz);
  }
  assert.ok(built > 40, 'dựng được đủ nhiều câu: ' + built);
  assert.strictEqual(QE.build('hz2tone', W('长'), ctx()), null, 'nhiều cách đọc → bỏ qua');
  assert.strictEqual(QE.build('hz2tone', W('的'), ctx()), null, 'pinyin không dấu thanh → bỏ qua');
});

// Chạy CHÍNH rvInsertToneRecognition của review.js trong sandbox tối thiểu.
function loadInsert(review) {
  const src = review.slice(review.indexOf('function rvInsertToneRecognition('), review.indexOf('// Bài hiện tại của màn bắt đầu'));
  const constSrc = review.slice(review.indexOf('const RV_TONE_PER_SESSION'), review.indexOf('\n', review.indexOf('const RV_TONE_PER_SESSION')));
  const sandbox = { QE };
  vm.createContext(sandbox);
  vm.runInContext(constSrc + ';', sandbox);
  vm.runInContext('function rvIsOfficial(it){return !!it && (it.type === "review" || it.type === "new");}', sandbox);
  vm.runInContext('function rvQCtx(){return { pool: ' + JSON.stringify(POOL) + ', examples: [], sentences: [], audioOk: false }; }', sandbox);
  vm.runInContext(src, sandbox);
  return sandbox;
}

test('rvInsertToneRecognition: chèn đúng số câu, rải rác, không lặp từ, không sửa mảng gốc', () => {
  const review = fs.readFileSync(path.join(ROOT, 'js/review.js'), 'utf8');
  const sb = loadInsert(review);
  const mk = () => POOL.filter(w => w.hz !== '长' && w.hz !== '的').map(w => ({ type: 'review', word: w }));
  const items = mk();
  const out = sb.rvInsertToneRecognition(items);
  const tones = out.filter(i => i.type === 'tone');
  assert.strictEqual(tones.length, 2, 'mặc định 2 câu');
  assert.strictEqual(items.filter(i => i.type === 'tone').length, 0, 'không sửa mảng gốc');
  const pos = out.map((it, i) => (it.type === 'tone' ? i : -1)).filter(i => i >= 0);
  assert.ok(pos[0] >= 1 && pos[1] < out.length, 'nằm trong buổi, không đứng đầu');
  const hzs = tones.map(i => i.word.hz);
  assert.strictEqual(new Set(hzs).size, hzs.length, 'không lặp cùng một từ');
  assert.ok(hzs.every(h => QE.build('hz2tone', W(h), ctx(2))), 'mỗi câu dùng được từ có pinyin đúng 1 cách đọc');
  // Không có từ nào dựng được → trả nguyên mảng, không ném lỗi.
  const bad = [{ type: 'review', word: W('长') }, { type: 'review', word: W('的') }];
  assert.strictEqual(sb.rvInsertToneRecognition(bad), bad, 'không dựng được câu nào → giữ nguyên');
});

test('điểm nối giao diện: hàng đợi, nhãn, chèn vào buổi, ép đúng dạng, không hỏi lại khi sai', () => {
  const review = fs.readFileSync(path.join(ROOT, 'js/review.js'), 'utf8');
  assert.ok(/RV_PRACTICE_TYPES = \[[^\]]*'tone'/.test(review), "'tone' là bài luyện bổ sung");
  assert.ok(/rvInsertToneRecognition\(sessionItems\)/.test(review), 'được chèn vào buổi Hôm nay học');
  assert.ok(/if \(item\.type === 'tone'\)[\s\S]{0,200}only: \['hz2tone'\]/.test(review), 'ép đúng dạng hz2tone');
  assert.ok(/item\.type === 'tone'\) return '🎵 Nhận biết thanh điệu'/.test(review), 'có nhãn giai đoạn');
  assert.ok(/it\.type !== 'tone' && !ok/.test(review), 'câu sai không bị xếp lại hàng đợi');
  assert.ok(/const toneN = items\.filter\(i => i\.type === 'tone'\)/.test(review), 'số câu dự kiến tính cả câu thanh điệu');
});

runAll();
