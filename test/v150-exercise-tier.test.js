#!/usr/bin/env node
// test/v150-exercise-tier.test.js — V150: thêm dạng bài cho "Hôm nay học" cùng FSRS.
//
// (1) Từ CHƯA CÓ câu ví dụ không còn bị bỏ khỏi buổi: thẻ chính thức rơi về dạng từ đơn lẻ có nhãn FSRS (QE.WORD_FALLBACK_ORDER).
// (2) Rating tự động theo BẬC dạng bài: bậc 1 (nhận diện) không được Easy; bậc 2/không nhãn giữ y hệt cũ; baseline thời gian
//     ưu tiên cùng bậc; sai luôn Again. Preview và commit dùng cùng bậc.
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
const SK = require('../lib/skills.js');
const AR = require('../lib/fsrs-auto-rating.js');
const { State } = require('ts-fsrs');

let passed = 0, failed = 0; const pending = [];
const test = (n, f) => pending.push({ n, f });
async function runAll() {
  for (const { n, f } of pending) {
    try { await f(); passed++; console.log('  ✅ ' + n); }
    catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); }
  }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
}
function lcg(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

// ── (1) Dự phòng từ đơn lẻ ─────────────────────────────────────────────────────────────────
const POOL = [
  { hz: '学习', py: 'xué xí', vi: 'học tập', hanviet: 'học tập', l: 1 },
  { hz: '公园', py: 'gōng yuán', vi: 'công viên', hanviet: 'công viên', l: 1 },
  { hz: '音乐', py: 'yīn yuè', vi: 'âm nhạc', hanviet: 'âm nhạc', l: 1 },
  { hz: '下雨', py: 'xià yǔ', vi: 'trời mưa', hanviet: 'há vũ', l: 1 },
  { hz: '朋友', py: 'péng yǒu', vi: 'bạn bè', hanviet: 'bằng hữu', l: 1 },
  { hz: '老师', py: 'lǎo shī', vi: 'giáo viên', hanviet: 'lão sư', l: 1 },
];
const W = POOL[0];
const ctxNoSent = (seed) => ({ pool: POOL, examples: [], sentences: [], audioOk: true, rand: lcg(seed || 7) });

test('WORD_FALLBACK_ORDER: chỉ dạng từ đơn lẻ có nhãn FSRS hợp lệ trên server, không lẫn dạng câu', () => {
  assert.ok(Array.isArray(QE.WORD_FALLBACK_ORDER) && QE.WORD_FALLBACK_ORDER.length >= 4);
  for (const t of QE.WORD_FALLBACK_ORDER) {
    const T = QE.TYPES[t];
    assert.ok(T, 'thiếu TYPES.' + t);
    assert.ok(!T.sentence && !T.needsExample, t + ' không được cần câu');
    assert.ok(!T.practiceOnly, t + ' không được practiceOnly');
    assert.ok(T.exerciseFsrs, t + ' thiếu exerciseFsrs');
    const ex = SK.resolveExercise(T.exerciseFsrs, T.quizType);
    assert.ok(ex && ex.fsrs === true, t + ': server phải nhận nhãn ' + T.exerciseFsrs + ' là FSRS');
  }
  for (const t of QE.SENTENCE_ORDER) assert.ok(!QE.WORD_FALLBACK_ORDER.includes(t), t + ' đã ở SENTENCE_ORDER');
});

test('từ không có câu ví dụ: SENTENCE_ORDER → null nhưng dự phòng vẫn dựng được thẻ chính thức', () => {
  const sent = QS.choose(W, ctxNoSent(), { only: QE.SENTENCE_ORDER, fsrsOnly: true, rand: lcg(1) });
  assert.strictEqual(sent, null, 'V138 giữ nguyên: dạng câu thiếu câu thì null');
  for (let i = 0; i < 20; i++) {
    const q = QS.choose(W, ctxNoSent(i + 1), { only: QE.WORD_FALLBACK_ORDER, fsrsOnly: true, rand: lcg(i + 3) });
    assert.ok(q, 'phải dựng được dạng từ đơn lẻ');
    assert.ok(QE.WORD_FALLBACK_ORDER.includes(q.typeId), 'dạng lạ: ' + q.typeId);
    assert.ok(q.exerciseFsrs, 'phải có nhãn FSRS');
    assert.ok(!q.typed, 'không tự bật dạng gõ khi chưa allowTyped');
  }
});

test('dạng gõ trong dự phòng vẫn bị cổng cứng chặn khi kỹ năng chưa vững / chưa bật gõ', () => {
  for (let i = 0; i < 20; i++) {
    const q = QS.choose(W, ctxNoSent(i + 1), { only: QE.WORD_FALLBACK_ORDER, fsrsOnly: true, allowTyped: false, rand: lcg(i + 9) });
    assert.ok(q && !q.typed);
    const q2 = QS.choose(W, ctxNoSent(i + 1), { only: QE.WORD_FALLBACK_ORDER, fsrsOnly: true, allowTyped: true, profile: {}, rand: lcg(i + 9) });
    assert.ok(q2 && !q2.typed, 'chưa có hồ sơ kỹ năng → không được gõ');
  }
});

test('review.js: thẻ chính thức/check/drill dùng sentence-trước, từ-đơn-lẻ-sau; V138 vẫn ép dạng câu ở nhánh đầu', () => {
  const src = read('js/review.js');
  assert.ok(/fsrsOnly: true, only: QE\.SENTENCE_ORDER/.test(src), 'nhánh câu vẫn còn (khớp test V138)');
  assert.ok(/QE\.WORD_FALLBACK_ORDER/.test(src), 'có dự phòng');
  assert.ok(/if \(item\.type === 'check'\) return officialQ\(\)/.test(src));
  assert.ok(/if \(item\.type === 'drill'\) return officialQ\(\)/.test(src));
  assert.ok(/\n  return officialQ\(\);\n\}/.test(src), 'nhánh cuối (thẻ chính thức) dùng officialQ');
  assert.ok(!/rvQueue\.items\.splice\([^)]*official/.test(src), 'không chèn lại thẻ chính thức');
});

// ── (2) Rating theo bậc ────────────────────────────────────────────────────────────────────
test('exerciseTier: nhận diện = 1, tự gõ = 3, còn lại/nhãn lạ/thiếu = 2; mọi nhãn trong bảng là nhãn FSRS thật', () => {
  assert.strictEqual(AR.exerciseTier('review-hz2vi'), 1);
  assert.strictEqual(AR.exerciseTier('review-listen-vi'), 1);
  assert.strictEqual(AR.exerciseTier('review-vi2hz-typed'), 3);
  assert.strictEqual(AR.exerciseTier('review-sent2vi'), 2);
  assert.strictEqual(AR.exerciseTier('review-cloze'), 2);
  assert.strictEqual(AR.exerciseTier('nhan-la'), 2);
  assert.strictEqual(AR.exerciseTier(undefined), 2);
  assert.strictEqual(AR.exerciseTier(null), 2);
  for (const label of Object.keys(AR.EXERCISE_TIER)) {
    const ex = SK.resolveExercise(label);
    assert.ok(ex && ex.fsrs === true, label + ' phải là nhãn FSRS trong lib/skills');
  }
});

const NOW = Date.now();
const hist = (rows) => rows.map((r, i) => Object.assign({ answer_correct: true, reviewed_at: new Date(NOW - (i + 1) * 86400000).toISOString() }, r));
const matureCard = { state: State.Review, stability: 5, difficulty: 3, reps: 6, last_review: new Date(NOW - 86400000).toISOString() };
const fastHistory = hist([1, 2, 3, 4, 5].map(() => ({ response_time_ms: 3000, exercise_type: 'review-hz2vi' })));

test('bậc 1: cùng tín hiệu cho Easy ở bậc 2 nhưng bị hạ còn Good', () => {
  const base = { answerCorrect: true, responseTimeMs: 1500, card: matureCard, reviewHistory: fastHistory, answerChanges: 0 };
  assert.strictEqual(AR.getAutomaticFSRSRating(Object.assign({}, base, { exerciseType: 'review-sent2vi' })), 'easy', 'bậc 2 giữ Easy');
  assert.strictEqual(AR.getAutomaticFSRSRating(base), 'easy', 'không có nhãn = hành vi cũ');
  assert.strictEqual(AR.getAutomaticFSRSRating(Object.assign({}, base, { exerciseType: 'review-vi2hz-typed' })), 'easy', 'bậc 3 được Easy');
  const t1 = AR.getAutomaticFSRSRating(Object.assign({}, base, { exerciseType: 'review-hz2vi' }));
  assert.strictEqual(t1, 'good', 'bậc 1 tối đa Good');
});

test('bậc 1 chỉ chặn Easy: Hard giữ nguyên, sai luôn Again ở mọi bậc', () => {
  const slow = { answerCorrect: true, responseTimeMs: 9000, card: matureCard, reviewHistory: fastHistory, answerChanges: 0 };
  assert.strictEqual(AR.getAutomaticFSRSRating(Object.assign({}, slow, { exerciseType: 'review-hz2vi' })), 'hard');
  for (const t of ['review-hz2vi', 'review-sent2vi', 'review-vi2hz-typed', undefined]) {
    assert.strictEqual(AR.getAutomaticFSRSRating({ answerCorrect: false, responseTimeMs: 500, card: matureCard, reviewHistory: fastHistory, answerChanges: 0, exerciseType: t }), 'again', String(t));
  }
});

test('thẻ mới vẫn không bao giờ Easy (hành vi cũ), kể cả bậc 3', () => {
  for (const t of ['review-hz2vi', 'review-sent2vi', 'review-vi2hz-typed']) {
    const r = AR.getAutomaticFSRSRating({ answerCorrect: true, responseTimeMs: 400, card: null, reviewHistory: [], answerChanges: 0, exerciseType: t });
    assert.strictEqual(r, 'good', t);
  }
});

test('baseline thời gian ưu tiên cùng bậc; thiếu mẫu cùng bậc thì dùng toàn bộ như cũ', () => {
  const mixed = hist([
    ...[1, 2, 3, 4].map(() => ({ response_time_ms: 3000, exercise_type: 'review-sent2vi' })),   // bậc 2
    ...[1, 2, 3, 4].map(() => ({ response_time_ms: 12000, exercise_type: 'review-vi2hz-typed' })), // bậc 3
  ]);
  assert.strictEqual(AR.personalBaselineMs(mixed, 2), 3000);
  assert.strictEqual(AR.personalBaselineMs(mixed, 3), 12000);
  const allMedian = AR.personalBaselineMs(mixed);
  assert.ok(allMedian > 3000 && allMedian < 12000, 'không truyền bậc = median toàn bộ (cũ): ' + allMedian);
  const fewT3 = hist([
    ...[1, 2, 3, 4].map(() => ({ response_time_ms: 3000, exercise_type: 'review-sent2vi' })),
    ...[1, 2].map(() => ({ response_time_ms: 12000, exercise_type: 'review-vi2hz-typed' })),
  ]);
  assert.strictEqual(AR.personalBaselineMs(fewT3, 3), AR.personalBaselineMs(fewT3), 'chỉ 2 mẫu bậc 3 → dùng toàn bộ');
  // dòng cũ chưa có exercise_type = bậc 2
  const legacy = hist([1, 2, 3, 4].map(() => ({ response_time_ms: 4000 })));
  assert.strictEqual(AR.personalBaselineMs(legacy, 2), 4000);
  assert.strictEqual(AR.personalBaselineMs([], 2), null);
});

test('tách baseline đổi kết quả thật: gõ chậm (bậc 3) không làm câu chọn nhanh (bậc 2) bị coi là "nhanh bất thường"', () => {
  const mixed = hist([
    ...[1, 2, 3, 4].map(() => ({ response_time_ms: 3000, exercise_type: 'review-sent2vi' })),
    ...[1, 2, 3, 4].map(() => ({ response_time_ms: 12000, exercise_type: 'review-vi2hz-typed' })),
  ]);
  // 2500ms ở bậc 2: so với baseline cùng bậc 3000 → ratio 0.83 → Good (không Easy). Nếu trộn median ~7500 thì ratio 0.33 → Easy sai.
  const r = AR.getAutomaticFSRSRating({ answerCorrect: true, responseTimeMs: 2500, card: matureCard, reviewHistory: mixed, answerChanges: 0, exerciseType: 'review-sent2vi' });
  assert.strictEqual(r, 'good');
});

test('nối dây: commit + preview + reviewService + route truyền exerciseType; SELECT lịch sử không vỡ khi thiếu cột', () => {
  const db = read('lib/db.js'), svc = read('lib/fsrs/reviewService.js'), api = read('api/index.js');
  assert.ok(/exerciseType: skillRecord && skillRecord\.exerciseType/.test(db), 'commit truyền bậc');
  assert.ok(/exerciseType: typeof exerciseType === 'string' \? exerciseType : null/.test(db), 'preview truyền bậc');
  assert.ok(/async function previewAutoRating\(\{[^}]*exerciseType/.test(db));
  assert.ok(/async function previewRating\(\{[^}]*exerciseType/.test(svc) && /dbPreviewAutoRating\(\{[^}]*exerciseType/.test(svc));
  assert.ok(/exerciseType: exPrev \? exPrev\.exerciseType : null/.test(api), 'route preview lấy nhãn đã xác thực');
  const n = (db.match(/to_jsonb\(review_history\) ->> 'exercise_type' AS exercise_type/g) || []).length;
  assert.strictEqual(n, 2, 'cả 2 truy vấn lịch sử đều lấy exercise_type an toàn (to_jsonb: thiếu cột → NULL, không abort transaction)');
});

runAll();
