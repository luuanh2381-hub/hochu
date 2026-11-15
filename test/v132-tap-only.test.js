#!/usr/bin/env node
// test/v132-tap-only.test.js — V132: các dạng luyện CHỈ BẤM CHỌN (Hán Việt, thanh điệu bằng mắt, ghép cặp Hán Việt).
// Kiểm: câu hỏi hợp lệ (đúng 1 đáp án, không mơ hồ, không lộ đáp án), không cần âm thanh/gõ phím, server biết các dạng bài,
// giao diện "Hôm nay học" có đủ nút và nối đúng hàm.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const QE = require('../js/question-engine.js');
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
  { hz: '认真', py: 'rènzhēn', vi: 'nghiêm túc', l: 5, hanviet: 'nhận chân' },
  { hz: '准备', py: 'zhǔnbèi', vi: 'chuẩn bị', l: 5, hanviet: 'chuẩn bị' },
  { hz: '参加', py: 'cānjiā', vi: 'tham gia', l: 5, hanviet: 'tham gia' },
  { hz: '发现', py: 'fāxiàn', vi: 'phát hiện', l: 5, hanviet: 'phát hiện' },
  { hz: '学校', py: 'xuéxiào', vi: 'trường học', l: 1, hanviet: 'học hiệu' },
  { hz: '学生', py: 'xuésheng', vi: 'học sinh', l: 1, hanviet: 'học sinh' },
  { hz: '休息', py: 'xiūxi', vi: 'nghỉ ngơi', l: 1, hanviet: 'hưu tức' },
  { hz: '天气', py: 'tiānqì', vi: 'thời tiết', l: 2, hanviet: 'thiên khí' },
  // hai chữ CÙNG âm Hán Việt "công" → không được dùng cho đề chỉ có Hán Việt
  { hz: '公', py: 'gōng', vi: 'công cộng', l: 3, hanviet: 'công' },
  { hz: '工', py: 'gōng', vi: 'thợ, công việc', l: 3, hanviet: 'công' },
  // nhiều âm Hán Việt / không có Hán Việt / pinyin số thanh
  { hz: '长', py: 'cháng/zhǎng', vi: 'dài / lớn', l: 3, hanviet: 'trường / trưởng' },
  { hz: '汤', py: 'tāng', vi: 'súp', l: 7 },
  { hz: '的', py: 'de', vi: '(trợ từ)', l: 3, hanviet: 'đích' },
  { hz: '包子', py: 'bāozi', vi: 'bánh bao', l: 7, hanviet: 'bao tử' },
  { hz: '桌子', py: 'zhuōzi', vi: 'cái bàn', l: 2, hanviet: 'trác tử' },
];
const ctx = (seed) => ({ pool: POOL, rand: rng(seed || 1), audioOk: false });
const W = (hz) => POOL.find(w => w.hz === hz);

test('4 dạng mới có trong TYPES, đều chỉ luyện bổ sung (không FSRS) và KHÔNG cần âm thanh', () => {
  for (const id of ['hv2vi', 'hv2hz', 'vi2hv', 'hz2tone']) {
    const T = QE.TYPES[id]; assert.ok(T, id);
    assert.strictEqual(T.practiceOnly, true); assert.strictEqual(T.exerciseFsrs, null);
    assert.ok(!T.needsAudio && !T.typed, id + ' phải là bấm chọn');
  }
  assert.deepStrictEqual(QE.HV_ORDER, ['hv2vi', 'hv2hz', 'vi2hv']);
  // Không lẫn vào bộ chọn tự động: chỉ chạy khi người học chọn chế độ riêng.
  for (const id of ['hv2vi', 'hv2hz', 'vi2hv', 'hz2tone']) assert.ok(![].concat(QE.MCQ_ORDER, QE.PRACTICE_ORDER, QE.TYPED_ORDER, QE.PRACTICE_TYPED_ORDER).includes(id));
});

test('mọi câu dựng được đều hợp lệ trên nhiều hạt ngẫu nhiên (1 đáp án đúng, không trùng, không lộ)', () => {
  let built = 0;
  for (let seed = 1; seed <= 40; seed++) for (const w of POOL) for (const id of ['hv2vi', 'hv2hz', 'vi2hv', 'hz2tone']) {
    const q = QE.build(id, w, ctx(seed)); if (!q) continue; built++;
    assert.strictEqual(q.options.length >= 3 || id === 'hz2tone' && q.options.length >= 3, true, id + ' ' + w.hz);
    assert.strictEqual(new Set(q.options.map(o => o.key)).size, q.options.length);
    assert.strictEqual(q.options[q.correctIndex].key, q.correctKey);
    assert.strictEqual(q.fsrsEligible, false);
    assert.ok(!q.typed);
    assert.ok(q.prompt.kind === 'text', 'không âm thanh');
  }
  assert.ok(built > 100, 'dựng được đủ nhiều câu: ' + built);
});

test('Hán Việt: từ đồng âm Hán Việt / nhiều âm / thiếu Hán Việt bị bỏ qua (không tạo đề mơ hồ)', () => {
  for (const id of ['hv2vi', 'hv2hz']) {
    assert.strictEqual(QE.build(id, W('公'), ctx()), null, '公 trùng âm "công" với 工');
    assert.strictEqual(QE.build(id, W('工'), ctx()), null);
    assert.strictEqual(QE.build(id, W('长'), ctx()), null, 'nhiều âm Hán Việt');
    assert.strictEqual(QE.build(id, W('汤'), ctx()), null, 'không có Hán Việt');
  }
  assert.strictEqual(QE.build('vi2hv', W('长'), ctx()), null);
  assert.strictEqual(QE.build('vi2hv', W('汤'), ctx()), null);
  assert.ok(QE.build('hv2vi', W('学校'), ctx()), '学校 có Hán Việt duy nhất');
});

test('Hán Việt: đề chỉ hiện Hán Việt; đáp án đúng khớp dữ liệu; nhiễu không phải đáp án đúng', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const a = QE.build('hv2vi', W('学校'), ctx(seed));
    assert.strictEqual(a.prompt.main, 'học hiệu'); assert.strictEqual(a.correctKey, 'trường học');
    assert.ok(!a.options.some((o, i) => i !== a.correctIndex && QE.meaningsOverlap(o.key, 'trường học')));
    const b = QE.build('hv2hz', W('学校'), ctx(seed));
    assert.strictEqual(b.prompt.main, 'học hiệu'); assert.strictEqual(b.correctKey, '学校');
    assert.ok(!JSON.stringify(b.prompt).includes('学校'));
    const c = QE.build('vi2hv', W('学校'), ctx(seed));
    assert.strictEqual(c.prompt.main, 'trường học'); assert.strictEqual(c.correctKey, 'học hiệu');
    assert.ok(!c.options.some((o, i) => i !== c.correctIndex && QE.normText(o.key) === 'học hiệu'));
  }
});

test('thanh điệu bằng mắt: nhìn chữ Hán, nhiễu chỉ đổi thanh, không cần âm thanh', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const q = QE.build('hz2tone', W('准备'), ctx(seed));
    assert.ok(q); assert.strictEqual(q.prompt.main, '准备'); assert.strictEqual(q.correctKey, 'zhǔnbèi');
    assert.ok(!JSON.stringify(q.prompt).includes('zhǔnbèi'), 'đề không lộ pinyin');
    for (const o of q.options) if (o.key !== q.correctKey) {
      assert.strictEqual(o.key.normalize('NFD').replace(/[̀-ͯ]/g, ''), 'zhunbei'.replace('u', 'u'), 'nhiễu cùng âm tiết, chỉ khác thanh');
    }
  }
  assert.strictEqual(QE.build('hz2tone', W('长'), ctx()), null, 'nhiều cách đọc → bỏ qua');
  assert.strictEqual(QE.build('hz2tone', W('的'), ctx()), null, 'âm nhẹ không dấu → bỏ qua');
});

test('ghép cặp Hán Việt: 3–4 cặp, Hán Việt khác nhau, loại từ đồng âm/nhiều âm/thiếu', () => {
  const m = QE.buildMatch(POOL, 'hv', { rand: rng(3) });
  assert.ok(m && m.kind === 'hv' && m.pairs.length >= 3 && m.pairs.length <= 4);
  assert.strictEqual(new Set(m.pairs.map(p => QE.normText(p.right))).size, m.pairs.length);
  assert.ok(!m.pairs.some(p => ['长', '汤'].includes(p.hz)));
  assert.strictEqual(m.exercisePractice, 'practice-match-hv'); assert.strictEqual(m.skill, 'recognition');
  // 公 và 工 cùng "công": không bao giờ xuất hiện cùng nhau
  for (let s = 1; s <= 50; s++) { const x = QE.buildMatch([W('公'), W('工'), W('学校'), W('学生')], 'hv', { rand: rng(s) }); const hz = x.pairs.map(p => p.hz); assert.ok(!(hz.includes('公') && hz.includes('工'))); }
  // hành vi cũ không đổi
  assert.strictEqual(QE.buildMatch(POOL, 'vi', { rand: rng(1) }).exercisePractice, 'practice-match-vi');
  assert.strictEqual(QE.buildMatch(POOL, 'py', { rand: rng(1) }).exercisePractice, 'practice-match-py');
  assert.strictEqual(QE.buildMatch(POOL, 'vi', { rand: rng(1) }).skill, 'recognition');
  assert.strictEqual(QE.buildMatch(POOL, 'py', { rand: rng(1) }).skill, 'pinyin');
});

test('server (lib/skills.js) nhận đủ 5 nhãn bài mới, đúng kỹ năng + chiều câu hỏi, và là bài luyện bổ sung (không FSRS)', () => {
  const want = { 'practice-hv2vi': ['recognition', 'hz2vi'], 'practice-hv2hz': ['recall', 'vi2hz'], 'practice-vi2hv': ['recall', 'hz2hv'], 'practice-hz2tone': ['pinyin', 'hz2py'], 'practice-match-hv': ['recognition', 'hz2hv'] };
  for (const [k, [skill, qt]] of Object.entries(want)) {
    const ex = SK.resolveExercise(k, null); assert.ok(ex, k);
    assert.strictEqual(ex.skill, skill); assert.strictEqual(ex.quizType, qt); assert.strictEqual(ex.fsrs, false); assert.ok(!ex.typed);
  }
  // mọi dạng QE mới khai báo đúng nhãn + chiều câu hỏi mà server biết (client không thể gửi nhãn lệch)
  for (const id of ['hv2vi', 'hv2hz', 'vi2hv', 'hz2tone']) {
    const T = QE.TYPES[id], ex = SK.resolveExercise(T.exercisePractice, T.quizType);
    assert.ok(ex, id); assert.strictEqual(ex.skill, T.skill);
  }
});

test('giao diện: màn Hôm nay học có nhóm "Chỉ chạm chọn" nối đúng hàm; không có ô gõ/ghi âm', () => {
  const lesson = fs.readFileSync(path.join(ROOT, 'js/lesson.js'), 'utf8');
  assert.ok(lesson.includes('Chỉ chạm chọn — không gõ phím, không ghi âm'));
  for (const call of ['rvStartMatchDrill()', "skStartPractice('hanviet')", "skStartPractice('tonevis')"]) assert.ok(lesson.includes(call), call);
  const review = fs.readFileSync(path.join(ROOT, 'js/review.js'), 'utf8');
  assert.ok(/async function rvStartMatchDrill\(/.test(review));
  const ui = fs.readFileSync(path.join(ROOT, 'js/skills-ui.js'), 'utf8');
  assert.ok(/SK_FORCED\s*=/.test(ui) && ui.includes('hanviet') && ui.includes('tonevis'));
  // bài ghép cặp nhanh chỉ dựng item 'match' (chạm), không dùng ô gõ/micro
  const drill = review.slice(review.indexOf('async function rvStartMatchDrill'), review.indexOf('async function rvStartWeakPractice'));
  assert.ok(!/SpeechRecognition|getUserMedia|MediaRecorder|<input/.test(drill));
});

runAll();
