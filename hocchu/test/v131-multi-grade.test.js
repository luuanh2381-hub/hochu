// test/v131-multi-grade.test.js — V131 giai đoạn 2a: chấm "câu 3 phần" (đúng 2/3) phía SERVER cho thẻ FSRS chính thức.
// Kiểm thử logic thuần (lib/multi-grade.js) + việc nối vào 2 route. KHÔNG chạy được ở đây: ts-fsrs/Neon/Express thật
// (môi trường không có mạng) — nên đường FSRS thật chưa được chạy đầu-cuối; phần này chỉ chứng minh các giá trị đưa vào FSRS đúng như thiết kế.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const MG = require('../lib/multi-grade');
const { gradeAnswer } = require('../lib/skills');

let pass = 0;
function t(name, fn) {
  return Promise.resolve().then(fn).then(() => { pass++; console.log('  ✓ ' + name); }, (e) => { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; });
}
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

// Dùng ĐÚNG hàm correctAnswerForQuizType đang có trong api/index.js (trích nguyên văn) để test không lệch với bản thật.
const apiSrc = read('api/index.js');
const fnSrc = apiSrc.match(/function correctAnswerForQuizType\(word, quizType\) \{[\s\S]*?\n\}/);
assert.ok(fnSrc, 'tìm thấy correctAnswerForQuizType trong api/index.js');
const correctAnswerForQuizType = (0, eval)('(' + fnSrc[0] + ')');
const helpers = { correctAnswerForQuizType, gradeAnswer };

const word = { hz: '银行', py: 'yínháng', vi: 'ngân hàng', hanviet: 'ngân hàng' };
const wordB = { hz: '你好', py: 'nǐ hǎo', vi: 'xin chào', hanviet: 'nễ hảo' };
const ans = (py, vi, hv) => [
  { quizType: 'hz2py', selectedAnswer: py }, { quizType: 'hz2vi', selectedAnswer: vi }, { quizType: 'hz2hv', selectedAnswer: hv },
];

(async () => {
  console.log('V131 — chấm câu 3 phần (server)');

  await t('parseParts: không có parts → đường cũ (parts = null)', () => {
    assert.deepStrictEqual(MG.parseParts(undefined), { ok: true, parts: null });
    assert.deepStrictEqual(MG.parseParts(null), { ok: true, parts: null });
  });

  await t('parseParts: chỉ nhận đúng 3 phần, mỗi dạng 1 lần; sắp xếp theo thứ tự cố định', () => {
    const ok = MG.parseParts([{ quizType: 'hz2hv', selectedAnswer: 'c' }, { quizType: 'hz2py', selectedAnswer: 'a' }, { quizType: 'hz2vi', selectedAnswer: 'b' }]);
    assert.strictEqual(ok.ok, true);
    assert.deepStrictEqual(ok.parts.map(p => p.quizType), ['hz2py', 'hz2vi', 'hz2hv']);
    assert.deepStrictEqual(ok.parts.map(p => p.selectedAnswer), ['a', 'b', 'c']);
    assert.strictEqual(MG.parseParts([]).ok, false);
    assert.strictEqual(MG.parseParts('x').ok, false);
    assert.strictEqual(MG.parseParts(ans('a', 'b', 'c').slice(0, 2)).ok, false);
    assert.strictEqual(MG.parseParts([{ quizType: 'hz2py', selectedAnswer: 'a' }, { quizType: 'hz2py', selectedAnswer: 'b' }, { quizType: 'hz2vi', selectedAnswer: 'c' }]).ok, false); // trùng dạng
    assert.strictEqual(MG.parseParts([{ quizType: 'vi2hz', selectedAnswer: 'a' }, { quizType: 'hz2py', selectedAnswer: 'a' }, { quizType: 'hz2vi', selectedAnswer: 'c' }]).ok, false); // dạng lạ
    assert.strictEqual(MG.parseParts([null, 1, 2]).ok, false);
    assert.strictEqual(MG.parseParts(ans('a', 'b', 'x'.repeat(501))).ok, false);
    assert.strictEqual(MG.parseParts(ans('a', 'b', 5)).ok, false);
  });

  await t('parseParts: phần bỏ trống (thiếu/rỗng) hợp lệ', () => {
    const r = MG.parseParts([{ quizType: 'hz2py' }, { quizType: 'hz2vi', selectedAnswer: '' }, { quizType: 'hz2hv', selectedAnswer: null }]);
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(r.parts.map(p => p.selectedAnswer), ['', '', '']);
  });

  await t('gradeParts: server tự chấm từ DB — 3/3, 2/3, 1/3, 0/3', () => {
    const g = (a) => { const r = MG.gradeParts(word, MG.parseParts(a).parts, helpers); assert.strictEqual(r.ok, true); return r; };
    let r = g(ans('yínháng', 'ngân hàng', 'ngân hàng'));
    assert.deepStrictEqual([r.right, r.answerCorrect, r.partial], [3, true, false]);
    r = g(ans('yínháng', 'sai', 'ngân hàng'));
    assert.deepStrictEqual([r.right, r.answerCorrect, r.partial], [2, true, true]);
    r = g(ans('sai', 'sai', 'ngân hàng'));
    assert.deepStrictEqual([r.right, r.answerCorrect, r.partial], [1, false, false]);
    r = g(ans('sai', 'sai', 'sai'));
    assert.deepStrictEqual([r.right, r.answerCorrect, r.partial], [0, false, false]);
  });

  await t('gradeParts: phần bỏ trống tính SAI; đáp án phải khớp đúng chuỗi (không dùng gợi ý của client)', () => {
    let r = MG.gradeParts(word, MG.parseParts([{ quizType: 'hz2py', selectedAnswer: 'yínháng' }, { quizType: 'hz2vi', selectedAnswer: '' }, { quizType: 'hz2hv', selectedAnswer: '  ngân hàng ' }]).parts, helpers);
    assert.strictEqual(r.right, 2); // trống = sai; khoảng trắng đầu/cuối được bỏ như đường cũ
    r = MG.gradeParts(word, MG.parseParts(ans('yinhang', 'Ngân hàng', 'ngan hang')).parts, helpers);
    assert.strictEqual(r.right, 0); // pinyin thiếu thanh / khác chữ hoa không được tính đúng ở trắc nghiệm
    r = MG.gradeParts(wordB, MG.parseParts(ans('yínháng', 'ngân hàng', 'ngân hàng')).parts, helpers);
    assert.strictEqual(r.right, 0); // đáp án của từ khác
  });

  await t('gradeParts: từ thiếu dữ liệu (không có Hán Việt) → lỗi, không chấm bừa', () => {
    const r = MG.gradeParts(Object.assign({}, word, { hanviet: '' }), MG.parseParts(ans('a', 'b', 'c')).parts, helpers);
    assert.strictEqual(r.ok, false);
    assert.ok(typeof r.error === 'string' && r.error.length > 0);
  });

  await t('capRating: chỉ chặn Easy khi đúng 2/3', () => {
    assert.strictEqual(MG.capRating('easy', true), 'good');
    assert.strictEqual(MG.capRating('easy', false), 'easy');
    for (const r of ['again', 'hard', 'good']) assert.strictEqual(MG.capRating(r, true), r);
  });

  await t('perPartMs: chia tổng thời gian cho số phần; không có số → null', () => {
    assert.strictEqual(MG.perPartMs(9000, 3), 3000);
    assert.strictEqual(MG.perPartMs(10, 3), 3);
    assert.strictEqual(MG.perPartMs(null, 3), null);
    assert.strictEqual(MG.perPartMs(NaN, 3), null);
    assert.strictEqual(MG.perPartMs(0, 3), 0);
  });

  const run = (a, extra) => {
    const calls = [];
    const previewRating = async (x) => { calls.push(x); return (extra && extra.sys) || 'good'; };
    return MG.resolveMultiReview(Object.assign({ parts: MG.parseParts(a).parts, word, responseTimeMs: 9000, ratingOverride: null, helpers, previewRating }, extra && extra.args))
      .then(r => Object.assign(r, { calls }));
  };

  await t('resolveMultiReview 3/3: đúng, thời gian ÷3, answerChanges 0, giữ nguyên rating (kể cả Easy), không xem trước', async () => {
    const r = await run(ans('yínháng', 'ngân hàng', 'ngân hàng'), { args: { ratingOverride: 'easy' } });
    assert.deepStrictEqual([r.ok, r.answerCorrect, r.responseTimeMs, r.answerChanges, r.ratingOverride], [true, true, 3000, 0, 'easy']);
    assert.strictEqual(r.calls.length, 0);
    assert.deepStrictEqual([r.multi.right, r.multi.total, r.multi.partial, r.multi.capped], [3, 3, false, false]);
  });

  await t('resolveMultiReview 2/3: vẫn ĐÚNG nhưng Easy bị hạ xuống Good (cả khi người dùng chọn tay)', async () => {
    let r = await run(ans('yínháng', 'sai', 'ngân hàng'), { args: { ratingOverride: 'easy' } });
    assert.deepStrictEqual([r.answerCorrect, r.ratingOverride, r.multi.partial, r.multi.capped], [true, 'good', true, true]);
    r = await run(ans('yínháng', 'sai', 'ngân hàng'), { args: { ratingOverride: 'hard' } });
    assert.deepStrictEqual([r.answerCorrect, r.ratingOverride, r.multi.capped], [true, 'hard', false]);
    r = await run(ans('yínháng', 'sai', 'ngân hàng'), { args: { ratingOverride: 'good' } });
    assert.strictEqual(r.ratingOverride, 'good');
  });

  await t('resolveMultiReview 2/3 không chọn tay: hệ thống gợi ý Easy → Good; gợi ý khác → để FSRS tự tính như cũ', async () => {
    let r = await run(ans('yínháng', 'sai', 'ngân hàng'), { sys: 'easy' });
    assert.deepStrictEqual([r.ratingOverride, r.multi.capped], ['good', true]);
    assert.deepStrictEqual(r.calls, [{ answerCorrect: true, responseTimeMs: 3000, answerChanges: 0 }]); // xem trước bằng đúng thời gian đã chia
    r = await run(ans('yínháng', 'sai', 'ngân hàng'), { sys: 'hard' });
    assert.deepStrictEqual([r.ratingOverride, r.multi.capped], [null, false]);
    r = await run(ans('yínháng', 'sai', 'ngân hàng'), { sys: 'good' });
    assert.strictEqual(r.ratingOverride, null);
  });

  await t('resolveMultiReview 2/3: không xem trước được → mặc định an toàn Good (không để lọt Easy)', async () => {
    const r = await MG.resolveMultiReview({ parts: MG.parseParts(ans('yínháng', 'sai', 'ngân hàng')).parts, word, responseTimeMs: 9000, ratingOverride: null, helpers, previewRating: async () => { throw new Error('db down'); } });
    assert.deepStrictEqual([r.ok, r.answerCorrect, r.ratingOverride, r.multi.capped], [true, true, 'good', true]);
  });

  await t('resolveMultiReview ≤1/3: SAI (answerCorrect=false), không xem trước, rating giữ như client gửi', async () => {
    let r = await run(ans('sai', 'ngân hàng', 'sai'));
    assert.deepStrictEqual([r.answerCorrect, r.ratingOverride, r.multi.right, r.multi.partial], [false, null, 1, false]);
    assert.strictEqual(r.calls.length, 0);
    r = await run(ans('', '', ''), { args: { ratingOverride: 'again' } });
    assert.deepStrictEqual([r.answerCorrect, r.ratingOverride, r.multi.right], [false, 'again', 0]);
  });

  await t('resolveMultiReview: không có thời gian → null; từ thiếu dữ liệu → lỗi', async () => {
    const r = await run(ans('yínháng', 'ngân hàng', 'ngân hàng'), { args: { responseTimeMs: null } });
    assert.strictEqual(r.responseTimeMs, null);
    const bad = await run(ans('a', 'b', 'c'), { args: { word: Object.assign({}, word, { hanviet: '' }) } });
    assert.strictEqual(bad.ok, false);
  });

  await t('kết quả gửi lại client không lộ đáp án đúng của từng phần', async () => {
    const r = await run(ans('yínháng', 'sai', 'ngân hàng'));
    assert.deepStrictEqual(Object.keys(r.multi.parts[0]).sort(), ['correct', 'quizType']);
  });

  await t('module KHÔNG đụng FSRS/DB (chỉ quy về answerCorrect, thời gian, rating)', () => {
    const src = read('lib/multi-grade.js').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    assert.ok(!/require\(/.test(src));
  });

  await t('đã nối vào 2 route: có parts mới đi nhánh mới, không có parts giữ nguyên đường cũ', () => {
    assert.ok(apiSrc.includes("require('../lib/multi-grade')"));
    assert.strictEqual((apiSrc.match(/multiGrade\.parseParts\(req\.body && req\.body\.parts\)/g) || []).length, 2); // preview + review
    assert.strictEqual((apiSrc.match(/if \(!multiP\.parts && \(typeof selectedAnswer !== 'string' \|\| !selectedAnswer\.trim\(\)\)\)/g) || []).length, 2); // đường cũ vẫn bắt buộc selectedAnswer
    assert.ok(apiSrc.includes('answerCorrect: multi ? multi.answerCorrect : answerCorrect,'));
    assert.ok(apiSrc.includes('responseTimeMs: multi ? multi.responseTimeMs : rt,'));
    assert.ok(apiSrc.includes('answerChanges: multi ? multi.answerChanges : changes,'));
    assert.ok(apiSrc.includes('ratingOverride: multi ? multi.ratingOverride : ratingOverride,'));
    assert.ok(apiSrc.includes('skillRecord: multi ? null : skillRecord,'));
    assert.ok(apiSrc.includes('systemRating: multiGrade.capRating(sysM, mg.partial)'));
  });

  console.log(process.exitCode ? '\nCó lỗi.' : `\nOK — ${pass} kiểm thử đạt.`);
})();
