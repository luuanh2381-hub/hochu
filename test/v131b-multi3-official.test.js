// test/v131b-multi3-official.test.js — V131 giai đoạn 2b: "câu 3 phần" cho thẻ ÔN CHÍNH THỨC (phía trình duyệt), thử nghiệm + mặc định TẮT.
// Kiểm thử luồng nộp → hỏi server gợi ý rating → khoá Easy → gửi `parts` kèm tương thích ngược. KHÔNG kiểm thử được: giao diện thật,
// server/FSRS/Neon thật (không có mạng/module trong môi trường này).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const QE = require('../js/question-engine');

let pass = 0;
function t(name, fn) {
  return Promise.resolve().then(fn).then(() => { pass++; console.log('  ✓ ' + name); }, (e) => { console.error('  ✗ ' + name + '\n    ' + e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; });
}
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const POOL = [
  ['你好', 'nǐ hǎo', 'xin chào', 'nễ hảo'], ['谢谢', 'xièxie', 'cảm ơn', 'tạ tạ'], ['再见', 'zàijiàn', 'tạm biệt', 'tái kiến'],
  ['学生', 'xuésheng', 'học sinh', 'học sinh'], ['老师', 'lǎoshī', 'giáo viên', 'lão sư'], ['朋友', 'péngyou', 'bạn bè', 'bằng hữu'],
  ['中国', 'Zhōngguó', 'Trung Quốc', 'trung quốc'], ['越南', 'Yuènán', 'Việt Nam', 'việt nam'], ['喜欢', 'xǐhuan', 'thích', 'hỉ hoan'],
  ['工作', 'gōngzuò', 'công việc', 'công tác'], ['医院', 'yīyuàn', 'bệnh viện', 'y viện'], ['学校', 'xuéxiào', 'trường học', 'học hiệu'],
  ['电话', 'diànhuà', 'điện thoại', 'điện thoại'], ['火车', 'huǒchē', 'tàu hỏa', 'hỏa xa'], ['银行', 'yínháng', 'ngân hàng', 'ngân hàng'],
].map(([hz, py, vi, hanviet], i) => ({ hz, py, vi, hanviet, l: 3, id: i + 1 }));
const word = POOL[0];
const ctx = { pool: POOL, examples: [], sentences: [], confuseGroups: [], audioOk: false };

// previewReply: hàm trả về JSON giả của /api/study/review/preview (hoặc throw / null)
function load(opts) {
  opts = opts || {};
  const calls = { record: [], skill: [], fetch: [], ding: 0, buzz: 0, render: 0, countdown: 0 };
  const sb = {
    QE, console, performance: { now: () => 5000 },
    rvQCtx: () => ctx, rvQSession: { recentCorrectPositions: [] },
    rvQueue: { items: [], sessionId: 'S1' }, rvPhase: 'question', rvStartedAt: 0, rvLastAnswer: null, rvRatingPhase: null, rvMulti: null,
    rvSubmitting: false, rvAttemptId: 7, rvSystemRating: null, rvUserRating: null, rvFinalRating: null, rvPendingReview: null, currentTab: 'review',
    RV_RATING_ORDER: ['again', 'hard', 'good', 'easy'], rvLog: [],
    rvShouldAutoCommit: () => !!(sb.rvLastAnswer && sb.rvLastAnswer.correct), rvStartCountdown: () => { calls.countdown++; },
    vtHiddenMs: () => 0, playDing: () => { calls.ding++; }, playBuzz: () => { calls.buzz++; },
    swSpeakAfterAnswer: () => {}, speak: () => {}, render: () => { calls.render++; },
    rvRecordAnswer: (item, q, ok, ms, official) => { calls.record.push({ typeId: q.typeId, ok, ms, official });
      sb.rvLog.push({ hz: q.hz, typeId: q.typeId, skill: q.skill, correct: !!ok, ms, official: !!official, source: item.type }); },
    submitSkillPractice: (a) => { calls.skill.push(a); return Promise.resolve({ ok: true }); },
    authHeaders: () => ({}), escapeHtml: (s) => String(s), lessonsLabel: () => 'Bài 3', rvHzHtml: (h) => h,
    fetch: async (url, init) => {
      const body = JSON.parse(init.body); calls.fetch.push({ url, body });
      if (opts.fetchThrows) throw new Error('offline');
      const reply = opts.previewReply ? opts.previewReply(body, sb) : null;
      return { status: 200, json: async () => reply };
    },
    localStorage: { _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); } },
  };
  vm.createContext(sb);
  vm.runInContext(read('js/review-multi.js'), sb);
  return { sb, calls };
}

// Trả lời giả của server: chấm theo đúng đáp án thật từ `parts`, giống lib/multi-grade.js
function serverReply(sys) {
  return (body) => {
    const key = { hz2py: word.py, hz2vi: word.vi, hz2hv: word.hanviet };
    const parts = body.parts.map(p => ({ quizType: p.quizType, correct: p.selectedAnswer === key[p.quizType] }));
    const right = parts.filter(p => p.correct).length;
    return { ok: true, answerCorrect: right >= 2, verdict: 'multi', multi: { right, total: 3, partial: right === 2, parts },
      systemRating: (right === 2 && sys === 'easy') ? 'good' : (right >= 2 ? sys : 'again') };
  };
}

function setup(sb, picks) {
  sb.rvmSetOfficialEnabled(true);
  const item = { type: 'review', word };
  sb.rvQueue.items = [item];
  const parts = sb.rvmBuildParts(word, ctx, []);
  sb.rvMulti = { parts, done: false };
  parts.forEach((p, i) => {
    if (picks[i] === 'r') p.picked = p.q.correctIndex;
    else if (picks[i] === 'w') p.picked = (p.q.correctIndex + 1) % p.q.options.length;
  });
  return item;
}

(async () => {
  console.log('V131b — câu 3 phần cho thẻ ôn chính thức');

  await t('mặc định TẮT: thẻ ôn chính thức vẫn là câu 1 phần; bật mới dựng; từ mới/kiểm tra/luyện lại không bao giờ', () => {
    const { sb } = load();
    assert.strictEqual(sb.rvmOfficialEnabled(), false);
    assert.strictEqual(sb.rvmBuild({ type: 'review', word }), null);
    sb.rvmSetOfficialEnabled(true);
    assert.strictEqual(sb.rvmOfficialEnabled(), true);
    assert.ok(sb.rvmBuild({ type: 'review', word }));
    for (const type of ['new', 'check', 'redo', 'match']) assert.strictEqual(sb.rvmBuild({ type, word }), null, type);
    assert.strictEqual(sb.rvmBuild({ type: 'review', word, probe: 'typed' }), null);
    sb.rvmSetOfficialEnabled(false);
    assert.strictEqual(sb.rvmBuild({ type: 'review', word }), null);
    assert.ok(sb.rvmBuild({ type: 'extra', word })); // công tắc luyện thêm (giai đoạn 1) độc lập
  });

  await t('tắt công tắc thì rvmSubmit bỏ qua thẻ chính thức (không nộp, không gọi server)', () => {
    const { sb, calls } = load();
    const item = setup(sb, ['r', 'r', 'r']);
    sb.rvmSetOfficialEnabled(false);
    sb.rvmSubmit(false);
    assert.strictEqual(sb.rvMulti.done, false);
    assert.strictEqual(calls.fetch.length, 0); assert.strictEqual(calls.skill.length, 0);
    assert.strictEqual(item.type, 'review');
  });

  await t('nộp 3/3: hỏi server bằng `parts` (đúng thứ tự, tổng thời gian, answerChanges 0) và nhận rating server', async () => {
    const { sb, calls } = load({ previewReply: serverReply('good') });
    setup(sb, ['r', 'r', 'r']);
    await sb.rvmSubmit(false);
    assert.strictEqual(calls.fetch.length, 1);
    const f = calls.fetch[0];
    assert.strictEqual(f.url, '/api/study/review/preview');
    assert.deepStrictEqual(f.body.wordId, { hz: word.hz, l: 3 });
    assert.deepStrictEqual(f.body.parts.map(p => p.quizType), ['hz2py', 'hz2vi', 'hz2hv']);
    assert.deepStrictEqual(f.body.parts.map(p => p.selectedAnswer), [word.py, word.vi, word.hanviet]);
    assert.strictEqual(f.body.responseTimeMs, 5000); assert.strictEqual(f.body.answerChanges, 0);
    assert.ok(!('quizType' in f.body) && !('selectedAnswer' in f.body)); // preview chỉ dùng parts
    assert.strictEqual(sb.rvPhase, 'answered'); assert.strictEqual(sb.rvRatingPhase, 'pending'); assert.strictEqual(sb.rvSystemRating, 'good');
    assert.strictEqual(sb.rvLastAnswer.correct, true); assert.strictEqual(sb.rvLastAnswer.multi.right, 3);
    assert.strictEqual(calls.ding, 1); assert.strictEqual(calls.countdown, 1);
    assert.strictEqual(sb.rvmEasyLocked(), false);
  });

  await t('chuẩn bị đúng dữ liệu để commit: rvPendingReview có parts + quizType/selectedAnswer 1 phần (tương thích server cũ)', async () => {
    const { sb } = load({ previewReply: serverReply('good') });
    setup(sb, ['r', 'r', 'r']);
    await sb.rvmSubmit(false);
    const p = sb.rvPendingReview;
    assert.strictEqual(p.parts.length, 3);
    assert.deepStrictEqual(Array.from(p.parts.map(x => x.quizType)), ['hz2py', 'hz2vi', 'hz2hv']);
    assert.ok(['hz2py', 'hz2vi', 'hz2hv'].includes(p.legacyQuizType) && p.selectedAnswer);
    assert.strictEqual(p.responseTimeMs, 5000); assert.strictEqual(p.answerChanges, 0);
  });

  await t('nhật ký phiên: ĐÚNG 1 dòng official cho cả thẻ (phần Nghĩa, mang kết quả cả thẻ); mỗi phần còn lại không-official', async () => {
    const { sb, calls } = load({ previewReply: serverReply('good') });
    setup(sb, ['w', 'r', 'r']); // pinyin sai, nghĩa + Hán Việt đúng → cả thẻ ĐÚNG (2/3)
    await sb.rvmSubmit(false);
    assert.strictEqual(sb.rvLog.length, 3);
    const off = sb.rvLog.filter(e => e.official);
    assert.strictEqual(off.length, 1);
    assert.strictEqual(off[0].typeId, 'hz2vi'); assert.strictEqual(off[0].correct, true);
    const py = sb.rvLog.find(e => e.typeId === 'hz2py');
    assert.strictEqual(py.official, false); assert.strictEqual(py.correct, false); // kỹ năng Pinyin giữ kết quả riêng của phần đó
    assert.deepStrictEqual(calls.record.map(r => r.ms), [1667, 1667, 1667]);
  });

  await t('mỗi phần đã trả lời cũng gửi như bài luyện bổ sung (source extra) — server chấm riêng từng phần', async () => {
    const { sb, calls } = load({ previewReply: serverReply('good') });
    setup(sb, ['r', 'w', 'r']);
    await sb.rvmSubmit(false);
    assert.strictEqual(calls.skill.length, 3);
    assert.deepStrictEqual(calls.skill.map(a => a.source), ['extra', 'extra', 'extra']);
    assert.ok(calls.skill.every(a => a.sessionId === 'S1' && a.word === word));
  });

  await t('đúng 2/3: khoá Easy ngay (kể cả trước khi server trả lời), server gợi ý tối đa Good', async () => {
    const { sb } = load({ previewReply: serverReply('easy') }); // hệ thống muốn Easy → server hạ xuống Good
    setup(sb, ['r', 'w', 'r']);
    const pr = sb.rvmSubmit(false);
    assert.strictEqual(sb.rvmEasyLocked(), true); // khoá ngay khi đang chờ server
    await pr;
    assert.strictEqual(sb.rvLastAnswer.correct, true);
    assert.strictEqual(sb.rvSystemRating, 'good');
    assert.strictEqual(sb.rvmEasyLocked(), true);
  });

  await t('≤1/3: câu SAI → gợi ý Again, không tự động chuyển, Easy không bị "khoá" (đã là sai)', async () => {
    const { sb, calls } = load({ previewReply: serverReply('good') });
    setup(sb, ['r', 'w', 'w']);
    await sb.rvmSubmit(false);
    assert.strictEqual(sb.rvLastAnswer.correct, false);
    assert.strictEqual(sb.rvSystemRating, 'again');
    assert.strictEqual(calls.buzz, 1); assert.strictEqual(calls.countdown, 0);
    assert.strictEqual(sb.rvmEasyLocked(), false);
  });

  await t('server là nguồn sự thật: nếu chấm khác kết quả tạm thì màn đáp án theo server', async () => {
    const { sb } = load({ previewReply: () => ({ ok: true, answerCorrect: false, multi: { right: 1, total: 3, partial: false, parts: [{ quizType: 'hz2py', correct: false }, { quizType: 'hz2vi', correct: true }, { quizType: 'hz2hv', correct: false }] }, systemRating: 'again' }) });
    setup(sb, ['r', 'r', 'r']); // trình duyệt tưởng 3/3
    await sb.rvmSubmit(false);
    assert.strictEqual(sb.rvLastAnswer.correct, false);
    assert.strictEqual(sb.rvLastAnswer.multi.right, 1);
    assert.deepStrictEqual(Array.from(sb.rvLastAnswer.multi.parts.map(p => p.ok)), [false, true, false]);
    assert.strictEqual(sb.rvSystemRating, 'again');
  });

  await t('mất mạng / server cũ không hiểu parts: mặc định bảo thủ (đúng → Good, sai → Again), KHÔNG BAO GIỜ Easy', async () => {
    for (const mode of [{ fetchThrows: true }, { previewReply: () => null }, { previewReply: () => ({ ok: false, error: 'Thiếu selectedAnswer' }) }]) {
      let { sb } = load(mode);
      setup(sb, ['r', 'r', 'r']);
      await sb.rvmSubmit(false);
      assert.strictEqual(sb.rvSystemRating, 'good'); assert.strictEqual(sb.rvRatingPhase, 'pending');
      ({ sb } = load(mode));
      setup(sb, ['w', 'w', 'w']);
      await sb.rvmSubmit(false);
      assert.strictEqual(sb.rvSystemRating, 'again');
    }
  });

  await t('"Không nhớ" cả 3 phần: vẫn có 1 dòng official sai, không gửi kỹ năng, vẫn hỏi server (parts rỗng = sai)', async () => {
    const { sb, calls } = load({ previewReply: serverReply('good') });
    setup(sb, [null, null, null]);
    await sb.rvmSubmit(true);
    assert.strictEqual(calls.skill.length, 0);
    assert.strictEqual(sb.rvLog.filter(e => e.official).length, 1);
    assert.strictEqual(sb.rvLog.find(e => e.official).correct, false);
    assert.deepStrictEqual(calls.fetch[0].body.parts.map(p => p.selectedAnswer), ['', '', '']);
    assert.strictEqual(sb.rvLastAnswer.correct, false); assert.strictEqual(sb.rvSystemRating, 'again');
  });

  await t('người học đã bấm rating / chuyển câu trong lúc chờ server → không ghi đè trạng thái', async () => {
    const { sb } = load({ previewReply: (b, s) => { s.rvRatingPhase = 'committing'; return serverReply('good')(b); } });
    setup(sb, ['r', 'r', 'r']);
    await sb.rvmSubmit(false);
    assert.strictEqual(sb.rvRatingPhase, 'committing');
    assert.strictEqual(sb.rvSystemRating, null);
  });

  await t('bấm nộp 2 lần / đang nộp: chỉ hỏi server 1 lần', async () => {
    const { sb, calls } = load({ previewReply: serverReply('good') });
    setup(sb, ['r', 'r', 'r']);
    const a = sb.rvmSubmit(false); const b = sb.rvmSubmit(false);
    await Promise.all([a, b]);
    assert.strictEqual(calls.fetch.length, 1); assert.strictEqual(calls.skill.length, 3);
  });

  await t('payload gửi lên /api/study/review (study-queue.js): có parts + quizType/selectedAnswer 1 phần; câu 1 phần y như cũ', async () => {
    const sent = [];
    const sb = {
      console, localStorage: { _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
      fetch: async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { status: 200, json: async () => ({ ok: true, answerCorrect: true }) }; },
      authHeaders: () => ({}), isLoggedIn: () => true, document: { addEventListener() {}, getElementById: () => null }, window: { addEventListener() {} },
      addEventListener() {}, setTimeout, clearTimeout, setInterval: () => 0, bumpStudySessionCounters() {}, navigator: { onLine: true },
    };
    sb.window = sb; vm.createContext(sb);
    vm.runInContext(read('js/study-queue.js'), sb);
    const parts = [{ quizType: 'hz2py', selectedAnswer: 'a' }, { quizType: 'hz2vi', selectedAnswer: 'b' }, { quizType: 'hz2hv', selectedAnswer: 'c' }];
    await vm.runInContext('submitFsrsReview', sb)({ word, quizType: 'hz2vi', selectedAnswer: 'b', responseTimeMs: 9000, answerChanges: 0, rating: 'good', parts });
    await vm.runInContext('submitFsrsReview', sb)({ word, quizType: 'hz2vi', selectedAnswer: 'b', responseTimeMs: 3000, answerChanges: 1, rating: 'good', exerciseType: 'review-hz2vi' });
    assert.strictEqual(sent.length, 2);
    const [multi, single] = sent.map(s => s.body);
    assert.deepStrictEqual(multi.parts, parts);
    assert.strictEqual(multi.quizType, 'hz2vi'); assert.strictEqual(multi.selectedAnswer, 'b'); assert.strictEqual(multi.responseTimeMs, 9000);
    assert.ok(!('parts' in single)); assert.strictEqual(single.exerciseType, 'review-hz2vi'); assert.strictEqual(single.answerChanges, 1);
    assert.ok(multi.idempotencyKey && multi.idempotencyKey !== single.idempotencyKey);
  });

  await t('V131 2c: nhật ký phiên khớp kết quả SERVER (dòng official = cả thẻ; từng phần theo server)', async () => {
    const { sb } = load({ previewReply: () => ({ ok: true, answerCorrect: false, multi: { right: 1, total: 3, partial: false, parts: [{ quizType: 'hz2py', correct: false }, { quizType: 'hz2vi', correct: true }, { quizType: 'hz2hv', correct: false }] }, systemRating: 'again' }) });
    setup(sb, ['r', 'r', 'r']); // trình duyệt tạm tính 3/3, server chấm 1/3
    await sb.rvmSubmit(false);
    const off = sb.rvLog.filter(e => e.official);
    assert.strictEqual(off.length, 1); assert.strictEqual(off[0].typeId, 'hz2vi'); assert.strictEqual(off[0].correct, false);
    assert.strictEqual(sb.rvLog.find(e => e.typeId === 'hz2py').correct, false);
    assert.strictEqual(sb.rvLog.find(e => e.typeId === 'hz2hv').correct, false);
    assert.strictEqual(sb.rvLog.filter(e => e.official).length, 1);
  });

  await t('V131 2c: thời gian đọc phản hồi của câu 3 phần dài hơn (×2); câu thường/điền từ giữ nguyên', () => {
    const src = read('js/review.js').match(/function rvAutoMs\(\) \{[\s\S]*?\n\}/);
    assert.ok(src, 'tìm thấy rvAutoMs');
    const run = (state) => vm.runInNewContext(src[0] + '; rvAutoMs()', Object.assign({ rvBaseAutoMs: () => 2000, rvMulti: null, rvQuestion: null }, state));
    assert.strictEqual(run({}), 2000);
    assert.strictEqual(run({ rvQuestion: { typeId: 'hz2vi' } }), 2000);
    assert.strictEqual(run({ rvQuestion: { typeId: 'cloze' } }), 6000);
    assert.strictEqual(run({ rvQuestion: { typed: true } }), 6000);
    assert.strictEqual(run({ rvMulti: { parts: [] }, rvQuestion: { typeId: 'hz2vi' } }), 4000);
  });

  await t('V131 2c: thanh đánh giá gọn nói rõ vì sao tối đa Good khi đúng 2/3', () => {
    const r = read('js/review.js');
    assert.ok(r.includes('đúng 2/3 phần nên tối đa Good') && r.includes('rvmEasyLocked()) hint +='));
  });

  await t('đã nối vào web: nút Easy bị khoá, commit gửi parts, công tắc thử nghiệm, vẫn không đụng rvPick', () => {
    const r = read('js/review.js');
    assert.ok(r.includes('parts: pending.parts }') && r.includes('pending.legacyQuizType'));
    assert.ok(r.includes('rvmEasyLocked()') && (r.match(/rvmEasyLocked/g) || []).length >= 4);
    assert.ok(r.includes('multi: rvLastAnswer && rvLastAnswer.multi'));
    assert.ok(read('js/lesson.js').includes('rvmSetOfficialEnabled'));
    assert.ok(read('js/study-queue.js').includes('payload.parts'));
    const pick = r.slice(r.indexOf('async function rvPick('), r.indexOf('function rvPickPractice('));
    assert.ok(!/rvMulti|rvmSubmit/.test(pick), 'rvPick (câu 1 phần) không đổi');
    const m = read('js/review-multi.js').split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
    assert.ok(!/\/api\/study\/review(?!\/preview)/.test(m), 'review-multi.js chỉ gọi preview (chỉ đọc); việc ghi FSRS đi qua submitFsrsReview/outbox');
  });

  console.log(process.exitCode ? '\nCó lỗi.' : `\nOK — ${pass} kiểm thử đạt.`);
})();
