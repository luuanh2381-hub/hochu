// test/v130-multi3.test.js — V130 giai đoạn 1: "câu 3 phần" (Pinyin · Nghĩa · Hán Việt, đúng 2/3) cho câu LUYỆN THÊM.
// Kiểm thử phần dựng câu, cách chấm 2/3, cách gửi từng phần lên server và việc nối vào web. KHÔNG kiểm thử được giao diện thật trên trình duyệt.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const QE = require('../js/question-engine');

let pass = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } }
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

console.log('V130 — câu 3 phần');

const POOL = [
  ['你好', 'nǐ hǎo', 'xin chào', 'nễ hảo'], ['谢谢', 'xièxie', 'cảm ơn', 'tạ tạ'], ['再见', 'zàijiàn', 'tạm biệt', 'tái kiến'],
  ['学生', 'xuésheng', 'học sinh', 'học sinh'], ['老师', 'lǎoshī', 'giáo viên', 'lão sư'], ['朋友', 'péngyou', 'bạn bè', 'bằng hữu'],
  ['中国', 'Zhōngguó', 'Trung Quốc', 'trung quốc'], ['越南', 'Yuènán', 'Việt Nam', 'việt nam'], ['喜欢', 'xǐhuan', 'thích', 'hỉ hoan'],
  ['工作', 'gōngzuò', 'công việc', 'công tác'], ['医院', 'yīyuàn', 'bệnh viện', 'y viện'], ['学校', 'xuéxiào', 'trường học', 'học hiệu'],
  ['电话', 'diànhuà', 'điện thoại', 'điện thoại'], ['火车', 'huǒchē', 'tàu hỏa', 'hỏa xa'], ['银行', 'yínháng', 'ngân hàng', 'ngân hàng'],
].map(([hz, py, vi, hanviet], i) => ({ hz, py, vi, hanviet, l: 1, id: i + 1 }));
const word = POOL[0];
const ctx = { pool: POOL, examples: [], sentences: [], confuseGroups: [], audioOk: false };

// Nạp module như trình duyệt: các hàm/biến cục bộ do review.js cung cấp được giả lập (stub) trong 1 vùng riêng.
function load(extra) {
  const calls = { record: [], skill: [], ding: 0, buzz: 0, speak: 0, render: 0 };
  const sb = Object.assign({
    QE, console, performance: { now: () => 5000 },
    rvQCtx: () => ctx, rvQSession: { recentCorrectPositions: [] },
    rvQueue: { items: [], sessionId: 'S1' }, rvPhase: 'question', rvStartedAt: 0, rvLastAnswer: null, rvRatingPhase: 'x', rvMulti: null,
    vtHiddenMs: () => 0, playDing: () => { calls.ding++; }, playBuzz: () => { calls.buzz++; },
    swSpeakAfterAnswer: () => { calls.speak++; }, speak: () => {}, render: () => { calls.render++; },
    rvRecordAnswer: (item, q, ok, ms, official) => calls.record.push({ typeId: q.typeId, ok, ms, official }),
    submitSkillPractice: (a) => { calls.skill.push(a); return Promise.resolve({ ok: true }); },
    escapeHtml: (s) => String(s), lessonsLabel: () => 'Bài 1', rvHzHtml: (h) => '<b>' + h + '</b>',
    localStorage: { _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); } },
  }, extra || {});
  vm.createContext(sb);
  vm.runInContext(read('js/review-multi.js'), sb);
  return { sb, calls };
}

function freshMulti(sb) {
  const parts = sb.rvmBuildParts(word, ctx, []);
  assert.ok(parts, 'dựng được 3 phần');
  sb.rvMulti = { parts, done: false };
  sb.rvQueue.items = [{ type: 'extra', word }];
  return sb.rvMulti;
}
const pickCorrect = (p) => { p.picked = p.q.correctIndex; };
const pickWrong = (p) => { p.picked = (p.q.correctIndex + 1) % p.q.options.length; };

t('dựng đủ 3 phần theo thứ tự Pinyin · Nghĩa · Hán Việt, mỗi phần hợp lệ', () => {
  const { sb } = load();
  const parts = sb.rvmBuildParts(word, ctx, []);
  assert.deepStrictEqual(Array.from(parts.map(p => p.typeId)), ['hz2py', 'hz2vi', 'hz2hv']);
  for (const p of parts) {
    assert.ok(p.q.options.length >= 3, p.typeId);
    assert.ok(p.q.correctIndex >= 0 && p.q.correctIndex < p.q.options.length);
    assert.ok(typeof p.q.exercisePractice === 'string' && p.q.exercisePractice, p.typeId);
  }
  assert.strictEqual(parts[0].q.options[parts[0].q.correctIndex].key, word.py);
  assert.strictEqual(parts[1].q.options[parts[1].q.correctIndex].key, word.vi);
  assert.strictEqual(parts[2].q.options[parts[2].q.correctIndex].key, word.hanviet);
});

t('từ không có Hán Việt → không dựng (rơi về câu 1 phần)', () => {
  const { sb } = load();
  assert.strictEqual(sb.rvmBuildParts(Object.assign({}, word, { hanviet: '' }), ctx, []), null);
  assert.strictEqual(sb.rvmBuildParts(null, ctx, []), null);
});

t('kho từ quá ít để dựng đủ 3 phần → null, không tạo câu giả', () => {
  const { sb } = load();
  assert.strictEqual(sb.rvmBuildParts(word, Object.assign({}, ctx, { pool: POOL.slice(0, 2) }), []), null);
});

t('rvmBuild: chỉ câu luyện thêm thường; tắt cài đặt hoặc là câu thăm dò thì không dựng', () => {
  const { sb } = load();
  assert.ok(sb.rvmBuild({ type: 'extra', word }));
  assert.strictEqual(sb.rvmBuild({ type: 'review', word }), null);
  assert.strictEqual(sb.rvmBuild({ type: 'new', word }), null);
  assert.strictEqual(sb.rvmBuild({ type: 'check', word }), null);
  assert.strictEqual(sb.rvmBuild({ type: 'redo', word }), null);
  assert.strictEqual(sb.rvmBuild({ type: 'extra', word, probe: 'typed' }), null);
  sb.rvmSetEnabled(false);
  assert.strictEqual(sb.rvmEnabled(), false);
  assert.strictEqual(sb.rvmBuild({ type: 'extra', word }), null);
  sb.rvmSetEnabled(true);
  assert.ok(sb.rvmBuild({ type: 'extra', word }));
});

t('rvmEvaluate: ngưỡng 2/3 (3/3, 2/3 đúng; 1/3, 0/3 sai; phần chưa chọn = sai)', () => {
  const { sb } = load();
  const mk = (picks) => { const parts = sb.rvmBuildParts(word, ctx, []); parts.forEach((p, i) => { if (picks[i] === 'r') pickCorrect(p); else if (picks[i] === 'w') pickWrong(p); }); return sb.rvmEvaluate(parts); };
  assert.deepStrictEqual(JSON.parse(JSON.stringify(mk(['r', 'r', 'r']))), { right: 3, total: 3, ok: true });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(mk(['r', 'w', 'r']))), { right: 2, total: 3, ok: true });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(mk(['w', 'r', 'w']))), { right: 1, total: 3, ok: false });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(mk(['w', 'w', 'w']))), { right: 0, total: 3, ok: false });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(mk(['r', 'r', null]))), { right: 2, total: 3, ok: true });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(mk([null, null, null]))), { right: 0, total: 3, ok: false });
});

t('nộp 3/3 đúng: câu đúng, gửi 3 bài luyện bổ sung (source extra), không gọi gì khác', () => {
  const { sb, calls } = load();
  const m = freshMulti(sb); m.parts.forEach(pickCorrect);
  sb.rvmSubmit(false);
  assert.strictEqual(sb.rvLastAnswer.correct, true);
  assert.strictEqual(sb.rvLastAnswer.multi.right, 3);
  assert.strictEqual(sb.rvPhase, 'answered');
  assert.strictEqual(sb.rvRatingPhase, null);
  assert.strictEqual(calls.skill.length, 3);
  assert.deepStrictEqual(calls.skill.map(a => a.source), ['extra', 'extra', 'extra']);
  assert.deepStrictEqual(calls.skill.map(a => a.selectedAnswer), [word.py, word.vi, word.hanviet]);
  assert.ok(calls.skill.every(a => a.sessionId === 'S1' && a.word === word));
  assert.deepStrictEqual(calls.record.map(r => r.official), [false, false, false]); // luyện bổ sung: KHÔNG phải lượt FSRS chính thức
  assert.strictEqual(calls.ding, 1); assert.strictEqual(calls.buzz, 0); assert.strictEqual(calls.render, 1);
});

t('nộp 2/3 đúng vẫn là câu ĐÚNG; 1/3 là câu SAI', () => {
  let { sb } = load();
  let m = freshMulti(sb); pickCorrect(m.parts[0]); pickWrong(m.parts[1]); pickCorrect(m.parts[2]);
  sb.rvmSubmit(false);
  assert.strictEqual(sb.rvLastAnswer.correct, true);
  assert.deepStrictEqual(Array.from(sb.rvLastAnswer.multi.parts.map(p => p.ok)), [true, false, true]);
  ({ sb } = load());
  m = freshMulti(sb); pickWrong(m.parts[0]); pickCorrect(m.parts[1]); pickWrong(m.parts[2]);
  sb.rvmSubmit(false);
  assert.strictEqual(sb.rvLastAnswer.correct, false);
});

t('chưa chọn đủ 3 phần mà bấm Kiểm tra → không nộp; "Không nhớ" nộp được, phần trống tính sai và KHÔNG gửi server', () => {
  const { sb, calls } = load();
  const m = freshMulti(sb); pickCorrect(m.parts[0]);
  sb.rvmSubmit(false);
  assert.strictEqual(m.done, false); assert.strictEqual(calls.skill.length, 0); assert.strictEqual(sb.rvPhase, 'question');
  sb.rvmSubmit(true);
  assert.strictEqual(m.done, true);
  assert.strictEqual(sb.rvLastAnswer.correct, false);
  assert.strictEqual(sb.rvLastAnswer.multi.right, 1);
  assert.deepStrictEqual(Array.from(sb.rvLastAnswer.multi.parts.map(p => p.blank)), [false, true, true]);
  assert.strictEqual(calls.skill.length, 1); // chỉ phần đã trả lời
});

t('nộp 2 lần / sai trạng thái không gửi trùng', () => {
  const { sb, calls } = load();
  const m = freshMulti(sb); m.parts.forEach(pickCorrect);
  sb.rvmSubmit(false); sb.rvmSubmit(false);
  assert.strictEqual(calls.skill.length, 3);
  const { sb: sb2, calls: c2 } = load();
  const m2 = freshMulti(sb2); m2.parts.forEach(pickCorrect);
  sb2.rvQueue.items = [{ type: 'review', word }]; // thẻ FSRS chính thức → câu 3 phần không được nộp
  sb2.rvmSubmit(false);
  assert.strictEqual(c2.skill.length, 0); assert.strictEqual(m2.done, false);
});

t('V138: câu 3 phần KHÔNG còn nối vào "Hôm nay học"; file vẫn còn và không tự ghi FSRS', () => {
  const r = read('js/review.js');
  // V138 thay mọi trắc nghiệm từ đơn lẻ (kể cả câu 3 phần) bằng câu hỏi theo câu → không dựng rvMulti nữa.
  assert.ok(r.includes('let rvMulti = null'));
  assert.ok(!r.includes('rvmBuild(item)'), 'không còn dựng câu 3 phần trong buổi học');
  assert.ok(read('index.html').includes('/js/review-multi.js'));
  assert.ok(!read('js/lesson.js').includes('rvmSetEnabled'), 'không còn công tắc câu 3 phần');
  // đường FSRS chính thức (rvPick → /api/study/review) không được nhắc tới câu 3 phần
  const pick = r.slice(r.indexOf('async function rvPick('), r.indexOf('function rvPickPractice('));
  assert.ok(!/rvMulti|rvmSubmit/.test(pick));
  // file này chỉ gọi /api/study/review/preview (CHỈ ĐỌC); việc GHI FSRS vẫn đi qua submitFsrsReview/outbox.
  assert.ok(!/\/api\/study\/review(?!\/preview)/.test(read('js/review-multi.js').split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')));
});

console.log(process.exitCode ? '\nCó lỗi.' : `\nOK — ${pass} kiểm thử đạt.`);
