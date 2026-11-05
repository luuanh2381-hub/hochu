#!/usr/bin/env node
// test/v133-duel-listen.test.js — V133: "A hay B?" (2 lựa chọn từ đáp án người học HAY NHẦM) + ghép cặp nghe ↔ chữ Hán.
// Kiểm: tìm đúng từ gây nhầm, câu 2 lựa chọn hợp lệ & đúng chiều, không tạo câu mơ hồ, ghép cặp nghe không lộ chữ/không có đồng âm,
// server biết nhãn bài mới, route + câu SQL có mặt, giao diện nối đúng.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.QE = require('../js/question-engine.js'); // question-selector dùng biến toàn cục QE
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
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const POOL = [
  { hz: '买', py: 'mǎi', vi: 'mua', l: 3 }, { hz: '卖', py: 'mài', vi: 'bán', l: 3 },
  { hz: '在', py: 'zài', vi: 'ở, đang', l: 3 }, { hz: '再', py: 'zài', vi: 'lại, nữa', l: 3 },
  { hz: '学习', py: 'xuéxí', vi: 'học, học tập', l: 1 }, { hz: '学', py: 'xué', vi: 'học', l: 1 },
  { hz: '学校', py: 'xuéxiào', vi: 'trường học', l: 1 }, { hz: '老师', py: 'lǎoshī', vi: 'giáo viên', l: 1 },
  { hz: '长', py: 'cháng/zhǎng', vi: 'dài', l: 2 },
  { hz: '谢谢', py: 'xièxie', vi: 'cảm ơn', l: 1 },
];
const GROUPS = [{ chars: [{ hz: '买', py: 'mǎi', vi: 'mua' }, { hz: '卖', py: 'mài', vi: 'bán' }], tip: 'TIP-买卖' }];
const W = (hz) => POOL.find(w => w.hz === hz);
const ctx = (extra, seed) => Object.assign({ pool: POOL, rand: rng(seed || 1), audioOk: true, confuseGroups: GROUPS }, extra || {});

test('findDuelDonor: khớp đúng từ + đúng trường (chữ Hán / pinyin / nghĩa); không khớp → null', () => {
  assert.deepStrictEqual(Object.assign({}, QE.findDuelDonor(W('卖'), 'mua', POOL), { donor: 'x' }), { donor: 'x', field: 'vi' });
  assert.strictEqual(QE.findDuelDonor(W('卖'), 'mua', POOL).donor.hz, '买');
  assert.strictEqual(QE.findDuelDonor(W('在'), '再', POOL).field, 'hz');
  assert.strictEqual(QE.findDuelDonor(W('卖'), 'mǎi', POOL).field, 'py');
  assert.strictEqual(QE.findDuelDonor(W('卖'), ' MUA ', POOL).donor.hz, '买', 'chuẩn hoá hoa/thường + khoảng trắng cho nghĩa');
  assert.strictEqual(QE.findDuelDonor(W('卖'), 'linh tinh', POOL), null);
  assert.strictEqual(QE.findDuelDonor(W('卖'), '卖', POOL), null, 'không tự nhầm với chính nó');
  assert.strictEqual(QE.findDuelDonor(W('卖'), '', POOL), null);
});

test('câu "A hay B?" có đúng 2 lựa chọn: đáp án đúng + từ gây nhầm, đúng chiều, không lộ đáp án', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const a = QE.build('duelHz2vi', W('卖'), ctx({ duelWith: W('买') }, seed));
    assert.deepStrictEqual(a.options.map(o => o.key).sort(), ['bán', 'mua']); assert.strictEqual(a.correctKey, 'bán');
    assert.strictEqual(a.prompt.main, '卖'); assert.strictEqual(a.fsrsEligible, false); assert.ok(!a.typed);
    const b = QE.build('duelVi2hz', W('卖'), ctx({ duelWith: W('买') }, seed));
    assert.deepStrictEqual(b.options.map(o => o.key).sort(), ['买', '卖'].sort()); assert.strictEqual(b.correctKey, '卖');
    assert.ok(!JSON.stringify(b.prompt).includes('卖'));
    const c = QE.build('duelHz2py', W('卖'), ctx({ duelWith: W('买') }, seed));
    assert.deepStrictEqual(c.options.map(o => o.key).sort(), ['mài', 'mǎi'].sort()); assert.strictEqual(c.correctKey, 'mài');
    assert.ok(!JSON.stringify(c.prompt).includes('mài'));
  }
});

test('giải thích nêu từ hay nhầm và chú giải của nhóm chữ dễ nhầm (nếu có)', () => {
  const q = QE.build('duelHz2vi', W('卖'), ctx({ duelWith: W('买') }));
  const text = q.explanation.join('\n');
  assert.ok(text.includes('买') && text.includes('mua'), text); assert.ok(text.includes('TIP-买卖'));
  const q2 = QE.build('duelHz2vi', W('学校'), ctx({ duelWith: W('老师') }));
  assert.ok(q2 && !q2.explanation.join('\n').includes('TIP'));
});

test('không dựng câu mơ hồ: thiếu từ gây nhầm, tự nhầm chính mình, trùng nghĩa, đồng âm, nhiều cách đọc', () => {
  for (const id of ['duelHz2vi', 'duelVi2hz', 'duelHz2py']) {
    assert.strictEqual(QE.build(id, W('卖'), ctx()), null, id + ' thiếu duelWith');
    assert.strictEqual(QE.build(id, W('卖'), ctx({ duelWith: W('卖') })), null, id + ' tự nhầm chính mình');
  }
  assert.strictEqual(QE.build('duelHz2py', W('在'), ctx({ duelWith: W('再') })), null, '在/再 đồng âm zài → không có đáp án pinyin khác biệt');
  assert.ok(QE.build('duelHz2vi', W('在'), ctx({ duelWith: W('再') })), 'nhưng hỏi nghĩa thì phân biệt được');
  assert.strictEqual(QE.build('duelVi2hz', W('学习'), ctx({ duelWith: W('学') })), null, '"học, học tập" trùng nghĩa "học" → không phân biệt được');
  assert.strictEqual(QE.build('duelHz2vi', W('学习'), ctx({ duelWith: W('学') })), null);
  assert.strictEqual(QE.build('duelHz2py', W('长'), ctx({ duelWith: W('买') })), null, 'nhiều cách đọc');
});

test('dạng duel chỉ chạy khi chọn tường minh: không lẫn vào bộ chọn tự động; QS.choose(only) dựng được', () => {
  assert.deepStrictEqual(QE.DUEL_ORDER, ['duelHz2vi', 'duelVi2hz', 'duelHz2py']);
  for (const id of QE.DUEL_ORDER) { assert.ok(QE.TYPES[id].practiceOnly); assert.ok(![].concat(QE.MCQ_ORDER, QE.PRACTICE_ORDER, QE.TYPED_ORDER, QE.PRACTICE_TYPED_ORDER).includes(id)); }
  const s = QS.newSession();
  const q = QS.choose(W('卖'), ctx({ duelWith: W('买') }), { allowPracticeOnly: true, allowTyped: true, session: s, forced: true, only: ['duelHz2py'] });
  assert.ok(q && q.typeId === 'duelHz2py' && q.options.length === 2);
  // không có duelWith → không có câu (không rơi về dạng khác khi forced)
  assert.strictEqual(QS.choose(W('卖'), ctx(), { allowPracticeOnly: true, allowTyped: true, session: s, forced: true, only: ['duelHz2py'] }), null);
});

test('ghép cặp nghe ↔ chữ Hán: cần âm thanh, chữ Hán không lộ ở đề, không có đồng âm trong cùng bài', () => {
  assert.strictEqual(QE.buildMatch(POOL, 'listen', ctx({ audioOk: false })), null, 'không có giọng đọc → không dựng');
  for (let seed = 1; seed <= 40; seed++) {
    const m = QE.buildMatch(POOL, 'listen', ctx({}, seed));
    assert.ok(m && m.kind === 'listen' && m.pairs.length >= 3 && m.pairs.length <= 4);
    assert.strictEqual(m.skill, 'listening'); assert.strictEqual(m.exercisePractice, 'practice-match-listen');
    assert.strictEqual(new Set(m.pairs.map(p => QE.pyKey(p.word.py))).size, m.pairs.length, 'không đồng âm');
    for (const p of m.pairs) assert.strictEqual(p.right, p.hz);
    const hz = m.pairs.map(p => p.hz); assert.ok(!(hz.includes('在') && hz.includes('再')), 'đồng âm không chung bài');
  }
  // các loại cũ giữ nguyên
  assert.strictEqual(QE.buildMatch(POOL, 'vi', ctx()).exercisePractice, 'practice-match-vi');
  assert.strictEqual(QE.buildMatch(POOL, 'py', ctx()).exercisePractice, 'practice-match-py');
  assert.strictEqual(QE.buildMatch(POOL, 'hv', ctx({}, 1)), null, 'POOL không có Hán Việt');
});

test('server (lib/skills.js) nhận 4 nhãn mới, đúng kỹ năng + chiều câu hỏi, không FSRS', () => {
  const want = { 'practice-duel-recognition': ['recognition', 'hz2vi'], 'practice-duel-recall': ['recall', 'vi2hz'], 'practice-duel-pinyin': ['pinyin', 'hz2py'], 'practice-match-listen': ['listening', 'vi2hz'] };
  for (const [k, [skill, qt]] of Object.entries(want)) { const ex = SK.resolveExercise(k, null); assert.ok(ex, k); assert.strictEqual(ex.skill, skill); assert.strictEqual(ex.quizType, qt); assert.strictEqual(ex.fsrs, false); }
  for (const id of QE.DUEL_ORDER) { const T = QE.TYPES[id], ex = SK.resolveExercise(T.exercisePractice, T.quizType); assert.ok(ex, id); assert.strictEqual(ex.skill, T.skill); }
});

test('route + SQL: /api/skills/confusion-pairs đăng nhập bắt buộc, chỉ đọc theo user trong token; SQL gộp 2 nguồn, ≥2 lần, 180 ngày', () => {
  const api = fs.readFileSync(path.join(ROOT, 'api/index.js'), 'utf8');
  const i = api.indexOf("app.get('/api/skills/confusion-pairs'"); assert.ok(i > 0);
  const body = api.slice(i, i + 400);
  assert.ok(body.includes('requireAuth') && body.includes('authed.username') && !/req\.(query|body)\.(userId|user)/.test(body));
  assert.ok(!/INSERT|UPDATE|DELETE/i.test(body));
  const st = fs.readFileSync(path.join(ROOT, 'lib/skill-store.js'), 'utf8');
  const sql = st.match(/const CONFUSION_PAIRS_SQL = `([\s\S]*?)`;/)[1];
  for (const frag of ['review_history', 'skill_practice_log', 'UNION ALL', 'user_id = $1', "interval '180 days'", 'HAVING COUNT(*) >= 2', 'LIMIT $2']) assert.ok(sql.includes(frag), frag);
  assert.ok(!/INSERT|UPDATE|DELETE/i.test(sql));
});

test('giao diện: nút "A hay B?" ở Hôm nay học + tab Phân tích; ghép cặp nghe ẩn chữ Hán bên trái và phát âm khi chạm', () => {
  const lesson = fs.readFileSync(path.join(ROOT, 'js/lesson.js'), 'utf8');
  assert.ok(lesson.includes("skStartPractice('duel')"));
  const ui = fs.readFileSync(path.join(ROOT, 'js/skills-ui.js'), 'utf8');
  assert.ok(ui.includes("skStartPractice('duel')") && ui.includes('/api/skills/confusion-pairs') && ui.includes('QE.findDuelDonor') && ui.includes('duelWith'));
  const rv = fs.readFileSync(path.join(ROOT, 'js/review.js'), 'utf8');
  assert.ok(rv.includes("m.kind === 'listen' ? (st.solved.has(hz) ?") && rv.includes("st.m.kind === 'listen'") && rv.includes('speak(hz)'));
  // đề nghe chỉ bật khi máy có giọng đọc
  assert.ok(rv.includes("ctx.audioOk ? ['vi', 'py', 'hv', 'listen']"));
});

runAll();
