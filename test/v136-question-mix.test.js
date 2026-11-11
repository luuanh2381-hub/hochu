#!/usr/bin/env node
// test/v136-question-mix.test.js — V136: tỷ lệ dạng bài trong "Hôm nay học".
//
// Kiểm: hệ số mix nhân vào điểm bộ chọn (không truyền mix → y hệt trước), 0 làm dạng gần như biến mất,
// 2 làm dạng chiếm ưu thế, chỉ áp cho câu hệ thống tự chọn (không ép câu "chỉ đúng 1 dạng"), chuẩn hoá
// 0–2 ở client (auth.js) và server (/api/progress chỉ nhận khoá đã biết), và ô chọn có trong Cài đặt.
// KHÔNG cần Postgres, KHÔNG gọi mạng.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

global.QE = require('../js/question-engine.js');
const QE = global.QE;
global.SS = require('../js/skill-score.js');
const QS = require('../js/question-selector.js');

let passed = 0, failed = 0; const pending = [];
const test = (n, f) => pending.push({ n, f });
async function runAll() {
  for (const { n, f } of pending) {
    try { await f(); passed++; console.log('  ✅ ' + n); }
    catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); }
  }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
}

// Kho từ đủ lớn để mọi dạng trắc nghiệm dựng được; mỗi từ có 1 câu ví dụ chứa nó đúng 1 lần.
// Chữ phải KHÁC nhau từng ký tự: bộ dựng cloze loại nhiễu có chung chữ với đáp án.
const HZ = '的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义';
const POOL = HZ.split('').map((c, i) => ({ hz: c, py: 'pinyin' + i, vi: 'nghĩa ' + i, l: 1 }));
const EXAMPLES = POOL.map(w => ({ hz: w.hz, zh: '我们' + w.hz + '。', vi: 'x' }));
const ctx = { pool: POOL, examples: EXAMPLES, sentences: [], audioOk: true };
function rate(mix, n) {
  const seen = {};
  let rnd = 1; const rand = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
  for (let k = 0; k < (n || 200); k++) {
    const q = QS.choose(POOL[k % POOL.length], ctx, { mix, rand, remaining: 0 });
    assert.ok(q, 'phải dựng được câu');
    seen[q.typeId] = (seen[q.typeId] || 0) + 1;
  }
  return seen;
}

test('không truyền mix → điểm y hệt bản cũ (hệ số 1)', () => {
  const w = POOL[0];
  const a = QS.scoreType('cloze', 'context', null, null, w, {});
  const b = QS.scoreType('cloze', 'context', null, null, w, { mix: {} });
  const c = QS.scoreType('cloze', 'context', null, null, w, { mix: { cloze: 1 } });
  assert.strictEqual(a, b); assert.strictEqual(a, c);
  assert.ok(QS.scoreType('cloze', 'context', null, null, w, { mix: { cloze: 2 } }) > a, 'hệ số 2 phải nâng điểm');
  assert.ok(QS.scoreType('cloze', 'context', null, null, w, { mix: { cloze: 0 } }) < a, 'hệ số 0 phải hạ điểm');
});

test('mix khoá 1 dạng → dạng đó áp đảo; = 0 → gần như không còn xuất hiện', () => {
  const on = rate({ hz2vi: 2 });
  assert.strictEqual(on.hz2vi, 200, 'Nhiều: dạng được nâng phải chiếm gần hết');
  const off = rate({ cloze: 0 });
  assert.strictEqual(off.cloze, undefined, 'Tắt: không còn câu điền từ');
  assert.ok(off.hz2vi > 0 || off.vi2hz > 0, 'các dạng khác vẫn chạy');
});

test('"Điền từ vào câu" mặc định Nhiều (cloze: 2) — điểm khởi đầu cao hơn mức "Vừa"', () => {
  const w = POOL[0];
  const base = QS.scoreType('cloze', 'context', null, null, w, { mix: { cloze: 1 } });
  assert.ok(QS.scoreType('cloze', 'context', null, null, w, { mix: { cloze: 2 } }) > base);
  const auth = read('js/auth.js');
  assert.ok(/const QUESTION_MIX_DEFAULT = \{ cloze: 2 \}/.test(auth), 'mặc định cloze = 2');
  // Từ KHÔNG có câu ví dụ thì vẫn không có câu điền từ — trọng số không bịa được dữ liệu.
  const noExample = QS.choose(POOL[0], Object.assign({}, ctx, { examples: [], sentences: [] }), { mix: { cloze: 2 }, remaining: 0 });
  assert.ok(noExample && noExample.typeId !== 'cloze');
});

test('câu bị ÉP đúng 1 dạng không bị mix đổi (thăm dò tự gõ vẫn là tự gõ)', () => {
  const q = QS.choose(POOL[0], ctx, { only: ['vi2hz'], forced: true, mix: { vi2hz: 0 }, remaining: 0 });
  assert.ok(q && q.typeId === 'vi2hz');
});

test('auth.js: chuẩn hoá questionMix về 6 dạng, kẹp 0–2, giá trị lạ → mặc định', () => {
  const vm = require('vm');
  const src = read('js/auth.js');
  const part = src.slice(src.indexOf('const QUESTION_MIX_TYPES'), src.indexOf('function defaultProgress')) +
    src.slice(src.indexOf('function normalizeProgress'), src.indexOf('let progressState = defaultProgress()'));
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(part, sandbox);
  const m = vm.runInContext('normalizeQuestionMix({ hz2vi: 5, vi2hz: -3, listen2hz: "x", cloze: 0, bogus: 9 })', sandbox);
  assert.strictEqual(m.hz2vi, 2); assert.strictEqual(m.vi2hz, 0); assert.strictEqual(m.listen2hz, 1);
  assert.strictEqual(m.cloze, 0); assert.strictEqual(m.bogus, undefined);
  for (const k of ['hz2vi', 'vi2hz', 'listen2hz', 'listen2vi', 'hz2py', 'cloze']) assert.ok(k in m, k);
  const p = vm.runInContext('normalizeProgress({ ui: {} })', sandbox);
  assert.strictEqual(p.ui.questionMix.cloze, 2, 'mặc định cloze Nhiều');
});

test('server /api/progress: chỉ nhận 6 khoá đã biết, kẹp 0–2, giữ giá trị cũ khi thiếu', () => {
  const api = read('api/index.js');
  assert.ok(/questionMix: \(\(\) => \{/.test(api));
  for (const k of ['hz2vi', 'vi2hz', 'listen2hz', 'listen2vi', 'hz2py', 'cloze']) assert.ok(api.includes(`'${k}'`), k);
  assert.ok(/Math\.max\(0, Math\.min\(2, v\)\)/.test(api), 'kẹp 0–2');
});

test('3 danh sách dạng bài (auth.js, /api/progress, QE.MCQ_ORDER) phải khớp nhau', () => {
  const list = read('js/auth.js').match(/const QUESTION_MIX_TYPES = \[([^\]]*)\]/);
  assert.ok(list, 'auth.js có QUESTION_MIX_TYPES');
  const fromAuth = list[1].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean);
  assert.deepStrictEqual(fromAuth, QE.MCQ_ORDER);
});

test('giao diện: Cài đặt hằng ngày có ô chọn tỷ lệ cho từng dạng; review.js truyền mix cho bộ chọn', () => {
  const lesson = read('js/lesson.js'), review = read('js/review.js');
  assert.ok(lesson.includes('rvQuestionMixHtml()'), 'lesson.js chèn khối tỷ lệ');
  assert.ok(/function rvQuestionMixHtml\(/.test(review) && /rvSetQuestionMix\('\$\{t\}'/.test(review), 'mỗi dạng 1 ô chọn');
  assert.ok(/mix: rvQuestionMix\(\)/.test(review), 'review.js truyền mix vào bộ chọn');
  const vm = require('vm');
  const src = read('js/review.js');
  const slice = src.slice(src.indexOf('function rvQuestionMixHtml'), src.indexOf('function rvPracticeSource'));
  assert.ok(slice.length > 0, 'không trích được rvQuestionMixHtml');
  const h = vm.runInNewContext(slice + '\nrvQuestionMixHtml();', { progressState: { ui: { questionMix: { cloze: 2 } } }, QE });
  assert.ok(typeof h === 'string' && h.includes("rvSetQuestionMix('cloze', this.value)") && /value="2" selected/.test(h), 'ô cloze hiện đúng Nhiều');
  assert.strictEqual((h.match(/rvSetQuestionMix\(/g) || []).length, QE.MCQ_ORDER.length, 'mỗi dạng trắc nghiệm 1 ô chọn');
});

runAll();
