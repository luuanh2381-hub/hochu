// test/v127-adaptive-learner.test.js — V127: nối số liệu cấp NGƯỜI HỌC vào bộ chọn dạng câu hỏi.
// Chạy: node test/v127-adaptive-learner.test.js   (không cần DB/ts-fsrs/express)
//
// Kiểm tra: (1) learnerCounts (server, thuần) (2) tính toán learner trong QS: trừ đoán mò, thiếu mẫu → không kết luận, MỘT lần sai không đổi
// kết luận (3) chọn đúng ≠ tự nhớ ra chữ Hán (4) cân bằng theo kỹ năng + chống lặp giữa các ngày (5) người mới/không có dữ liệu chạy bình
// thường, thẻ chính thức không bao giờ là câu tự gõ (6) ranh giới FSRS: các truy vấn mới chỉ ĐỌC và chỉ chạy khi adaptive.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name); }
  catch (e) { failed++; console.log('  ❌ ' + name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); }
}

global.SS = require('../js/skill-score.js');
global.AM = require('../js/answer-match.js');
const QE = global.QE = require('../js/question-engine.js');
const QS = require('../js/question-selector.js');
const P = require('../lib/skill-pooled.js');
const W = QS.WEIGHTS;

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const cell = (cn, cok, tn, tok, rcn, rcok, rtn, rtok) => ({ c: { n: cn, ok: cok }, t: { n: tn || 0, ok: tok || 0 }, rc: { n: rcn || 0, ok: rcok || 0 }, rt: { n: rtn || 0, ok: rtok || 0 } });
const L = (skills) => ({ v: 1, skills });
const fresh = () => QS.newSession();

console.log('\n[1] learnerCounts (server, thuần)');
test('Tách trắc nghiệm / tự gõ và cửa sổ dài / gần đây theo bảng EXERCISES; nhãn lạ bị bỏ qua (không đoán)', () => {
  const long = [{ exercise_type: 'review-hz2vi', n: 40, correct: 30 }, { exercise_type: 'review-vi2hz', n: 30, correct: 24 },
    { exercise_type: 'review-vi2hz-typed', n: 5, correct: 2 }, { exercise_type: 'practice-recall-typed', n: 4, correct: 4 }, { exercise_type: 'nhan-la', n: 9, correct: 9 }];
  const recent = [{ exercise_type: 'review-vi2hz', n: 10, correct: 5 }];
  const out = P.learnerCounts(long, recent);
  assert.strictEqual(out.v, 1);
  assert.deepStrictEqual(out.skills.recognition.c, { n: 40, ok: 30 });
  assert.deepStrictEqual(out.skills.recall.c, { n: 30, ok: 24 });
  assert.deepStrictEqual(out.skills.recall.t, { n: 9, ok: 6 }); // gộp tự gõ của review + practice
  assert.deepStrictEqual(out.skills.recall.rc, { n: 10, ok: 5 });
  assert.ok(!('nhan-la' in out.skills) && Object.keys(out.skills).length === 2);
});
test('Đầu vào rỗng/null/dòng hỏng → { v:1, skills:{} }; số đúng không vượt số lượt', () => {
  assert.deepStrictEqual(P.learnerCounts(null, undefined), { v: 1, skills: {} });
  assert.deepStrictEqual(P.learnerCounts([{ exercise_type: 'review-hz2vi', n: 0, correct: 0 }, null, { n: 'x' }], []), { v: 1, skills: {} });
  assert.strictEqual(P.learnerCounts([{ exercise_type: 'review-hz2vi', n: 5, correct: 9 }], []).skills.recognition.c.ok, 5);
});

console.log('\n[2] Số liệu cấp người học trong bộ chọn');
test('Trừ đoán mò: đúng 100% trắc nghiệm → năng lực cao; đúng đúng mức đoán mò (25%) → xấp xỉ 0', () => {
  const hi = QS.learnerSkill(L({ recall: cell(40, 40) }), 'recall');
  const chance = QS.learnerSkill(L({ recall: cell(40, 10) }), 'recall');
  assert.ok(hi.ability > 0.9, 'ability=' + hi.ability);
  assert.ok(chance.ability < 0.1, 'ability=' + chance.ability);
  assert.strictEqual(QS.learnerSkill(L({}), 'recall').n, 0);
  assert.strictEqual(QS.learnerSkill(null, 'recall').ability, null);
});
test('Thiếu mẫu (< learnerMinN): KHÔNG kết luận tụt lại; chỉ cộng nhỏ để thu thêm dữ liệu, giảm dần theo số lượt', () => {
  const few = L({ recall: cell(10, 2), recognition: cell(60, 57), listening: cell(60, 57) });
  assert.strictEqual(QS.learnerGap(few, 'recall'), null);
  // AUDIT V127: cộng "thu thêm dữ liệu" chỉ có nghĩa khi có ÍT NHẤT 1 kỹ năng đủ mẫu để đối chứng (learner rỗng / chỉ toàn kỹ năng thiếu mẫu → 0).
  const ctl = { recognition: cell(60, 57) };
  const b10 = QS.learnerBonus(few, 'recall'), b0 = QS.learnerBonus(L(ctl), 'recall'), b19 = QS.learnerBonus(L(Object.assign({ recall: cell(19, 19) }, ctl)), 'recall');
  assert.strictEqual(QS.learnerBonus(L({}), 'recall'), 0); assert.strictEqual(QS.learnerBonus(L({ recall: cell(19, 19) }), 'recall'), 0);
  assert.ok(Math.abs(b0 - W.learnerDataMax) < 1e-9);
  assert.ok(b10 < b0 && b19 < b10 && b19 > 0 && b0 <= W.learnerDataMax);
  assert.strictEqual(QS.learnerBonus(null, 'recall'), 0);
});
test('Tụt lại so với mức giữa của kỹ năng KHÁC (đủ mẫu) → cộng có TRẦN; các kỹ năng ngang nhau → 0', () => {
  const weak = L({ recall: cell(40, 22), recognition: cell(60, 48), listening: cell(60, 50) });
  const g = QS.learnerGap(weak, 'recall');
  assert.ok(g && g.gap >= W.learnerGapMin);
  const b = QS.learnerBonus(weak, 'recall');
  assert.ok(b > 0 && b <= W.learnerWeakMax, 'bonus=' + b);
  assert.strictEqual(QS.learnerBonus(weak, 'recognition'), 0); // kỹ năng cao hơn → không được cộng
  const even = L({ recall: cell(40, 30), recognition: cell(60, 45), listening: cell(60, 45) });
  assert.strictEqual(QS.learnerGap(even, 'recall'), null); assert.strictEqual(QS.learnerBonus(even, 'recall'), 0);
  const extreme = L({ recall: cell(500, 125), recognition: cell(500, 500), listening: cell(500, 500) });
  assert.ok(QS.learnerBonus(extreme, 'recall') <= W.learnerWeakMax + 1e-9, 'phải có trần dù chênh cực lớn');
});
test('MỘT lần sai không làm đổi kết luận / không phản ứng thái quá (kết luận cũ vẫn đúng, điểm cộng đổi nhẹ)', () => {
  const a = L({ recall: cell(40, 22), recognition: cell(60, 48), listening: cell(60, 50) });
  const b = L({ recall: cell(41, 22), recognition: cell(60, 48), listening: cell(60, 50) }); // thêm đúng 1 lượt SAI
  assert.ok(QS.learnerGap(a, 'recall') && QS.learnerGap(b, 'recall'));
  assert.ok(Math.abs(QS.learnerBonus(b, 'recall') - QS.learnerBonus(a, 'recall')) < 0.12);
  // kỹ năng đang ổn: 1 lần sai không bật điểm cộng "tụt lại"
  const ok1 = L({ recall: cell(40, 33), recognition: cell(60, 48), listening: cell(60, 50) });
  const ok2 = L({ recall: cell(41, 33), recognition: cell(60, 48), listening: cell(60, 50) });
  assert.strictEqual(QS.learnerBonus(ok1, 'recall'), 0); assert.strictEqual(QS.learnerBonus(ok2, 'recall'), 0);
});
test('Cửa sổ gần đây: chỉ tính khi ≥ learnerRecentMinN lượt; mức giảm tối đa bị chặn bởi trọng số; MỘT lần sai gần đây chỉ đổi rất nhẹ', () => {
  const ab = (rc) => QS.learnerSkill(L({ recall: cell(60, 48, 0, 0, rc.n, rc.ok) }), 'recall').ability;
  const longOnly = ab({ n: 0, ok: 0 });
  assert.strictEqual(ab({ n: 7, ok: 0 }), longOnly, '7 lượt gần đây < 8 → bỏ qua');
  const allWrong = ab({ n: 10, ok: 0 });
  assert.ok(allWrong < longOnly, '10/10 sai gần đây phải kéo xuống');
  assert.ok(longOnly - allWrong <= W.learnerRecentWeight / (1 - 0.25) + 1e-9, 'không vượt trần theo trọng số cửa sổ gần đây');
  assert.ok(allWrong > 0.2, 'kết luận dài hạn không bị xoá sạch bởi một cửa sổ ngắn: ' + allWrong);
  assert.ok(Math.abs(ab({ n: 10, ok: 10 }) - ab({ n: 10, ok: 9 })) < 0.06, 'một lần sai trong cửa sổ gần đây chỉ đổi nhẹ');
});

console.log('\n[3] Nhận diện (chọn đáp án) ≠ nhớ chủ động (tự gõ)');
test('recallProbeNeeded: nhận diện vững + chưa đủ lượt tự gõ → true; đã đủ bằng chứng / chưa đủ mẫu / người mới → false', () => {
  assert.strictEqual(QS.recallProbeNeeded(L({ recall: cell(60, 54) })), true);
  assert.strictEqual(QS.recallProbeNeeded(L({ recall: cell(60, 54, 25, 20) })), false, 'đã có ≥ 20 lượt tự gõ');
  assert.strictEqual(QS.recallProbeNeeded(L({ recall: cell(20, 20) })), false, 'chưa đủ 30 lượt trắc nghiệm');
  assert.strictEqual(QS.recallProbeNeeded(L({ recall: cell(60, 20) })), false, 'nhận diện còn yếu → chưa đáng đo tự gõ');
  assert.strictEqual(QS.recallProbeNeeded(null), false); assert.strictEqual(QS.recallProbeNeeded(L({})), false);
});
test('productionProven cần ≥ 20 lượt TỰ GÕ và ≥ 70% đúng; chọn đúng đáp án nhiều đến đâu cũng không đủ', () => {
  assert.strictEqual(QS.productionProven(L({ recall: cell(500, 500) })), false);
  assert.strictEqual(QS.productionProven(L({ recall: cell(40, 38, 30, 27) })), true);
  assert.strictEqual(QS.productionProven(L({ recall: cell(40, 38, 30, 12) })), false);
  assert.strictEqual(QS.productionProven(L({ recall: cell(40, 38, 10, 10) })), false, 'chưa đủ 20 lượt');
});
test('Điểm "đã vững" (strong) của recall KHÔNG được áp khi mới có bằng chứng trắc nghiệm; recognition vẫn áp như cũ', () => {
  const word = { hz: 'x' }, sess = fresh();
  const profRecall = { recall: { status: 'ok', level: 'good', score: 0.92, attempts: 6 } };
  const profRecog = { recognition: { status: 'ok', level: 'good', score: 0.92, attempts: 6 } };
  const noGap = (tn, tok) => L({ recall: cell(40, 38, tn, tok), recognition: cell(40, 38), listening: cell(40, 38) }); // không tụt lại → learnerBonus = 0
  const base = QS.scoreType('vi2hz', 'recall', profRecall, sess, word, {});
  assert.ok(Math.abs(QS.scoreType('vi2hz', 'recall', profRecall, sess, word, { learner: noGap(0, 0) }) - (base + W.strongPenalty)) < 1e-9, 'chưa có bằng chứng tự gõ → bỏ trừ strong');
  assert.ok(Math.abs(QS.scoreType('vi2hz', 'recall', profRecall, sess, word, { learner: noGap(30, 27) }) - base) < 1e-9, 'đã chứng minh tự nhớ → trừ như cũ');
  const baseR = QS.scoreType('hz2vi', 'recognition', profRecog, sess, word, {});
  assert.ok(Math.abs(QS.scoreType('hz2vi', 'recognition', profRecog, sess, word, { learner: noGap(0, 0) }) - baseR) < 1e-9, 'recognition giữ nguyên');
});
test('Số liệu cấp người học KHÔNG thưởng cho dạng tự gõ (tự gõ có cổng riêng theo hồ sơ của TỪ)', () => {
  const word = { hz: 'x' }, sess = fresh(), prof = { recall: { status: 'ok', level: 'good', score: 0.8, attempts: 6 } };
  const weak = L({ recall: cell(40, 22), recognition: cell(60, 48), listening: cell(60, 50) });
  assert.strictEqual(QS.scoreType('typeVi2hz', 'recall', prof, sess, word, { learner: weak }), QS.scoreType('typeVi2hz', 'recall', prof, sess, word, {}));
});

console.log('\n[4] Cân bằng theo kỹ năng + chống lặp giữa các ngày');
test('skillShare: kỹ năng chiếm > 40% (từ 5 câu) bị trừ đúng skillSharePenalty; < 5 câu hoặc ≤ 40% thì không', () => {
  const word = { hz: 'x' }, prof = {};
  const mk = (skillCount) => Object.assign(fresh(), { skillCount });
  const heavy = mk({ recall: 6, recognition: 1, listening: 1, pinyin: 1, context: 1 });
  const d = QS.scoreType('vi2hz', 'recall', prof, heavy, word, {}) - QS.scoreType('vi2hz', 'recall', prof, mk({}), word, {});
  assert.ok(Math.abs(d + W.skillSharePenalty) < 1e-9, 'chênh=' + d);
  assert.strictEqual(QS.scoreType('hz2vi', 'recognition', prof, heavy, word, {}), QS.scoreType('hz2vi', 'recognition', prof, mk({}), word, {}), 'kỹ năng khác không bị trừ');
  assert.strictEqual(QS.scoreType('vi2hz', 'recall', prof, mk({ recall: 3, recognition: 1 }), word, {}), QS.scoreType('vi2hz', 'recall', prof, mk({}), word, {}), '4 câu < 5');
  assert.strictEqual(QS.scoreType('vi2hz', 'recall', prof, mk({ recall: 4, recognition: 3, listening: 3 }), word, {}), QS.scoreType('vi2hz', 'recall', prof, mk({}), word, {}), '40% không vượt');
});
test('QS.record đếm theo kỹ năng; câu không có kỹ năng (ghép cặp) và phiên cũ thiếu skillCount không gây lỗi', () => {
  const s = fresh();
  QS.record(s, { hz: 'a', typeId: 'hz2vi', skill: 'recognition', correctIndex: 0 }, true, 1000);
  QS.record(s, { hz: 'b', typeId: 'match', correctIndex: null }, true, null);
  assert.deepStrictEqual(Object.assign({}, s.skillCount), { recognition: 1 });
  const old = { asked: {}, history: [], typeCount: {}, recentCorrectPositions: [], rt: {} }; // phiên tạo bằng mã cũ
  QS.record(old, { hz: 'a', typeId: 'vi2hz', skill: 'recall', correctIndex: 1 }, false, 900);
  assert.strictEqual(old.skillCount.recall, 1);
  assert.ok(Number.isFinite(QS.scoreType('hz2vi', 'recognition', {}, { asked: {}, history: [], typeCount: {} }, { hz: 'a' }, {})));
});
test('typeIdOfExercise: nhãn lưu ở server → dạng câu hỏi (kể cả các tab luyện khác); nhãn lạ/rỗng → null', () => {
  assert.strictEqual(QS.typeIdOfExercise('review-hz2vi'), 'hz2vi');
  assert.strictEqual(QS.typeIdOfExercise('review-cloze'), 'cloze');
  assert.strictEqual(QS.typeIdOfExercise('practice-recall-typed'), 'typeVi2hz');
  assert.strictEqual(QS.typeIdOfExercise('practice-confusable'), 'confusable');
  assert.strictEqual(QS.typeIdOfExercise('quiz-py2hz'), 'py2hz');
  assert.strictEqual(QS.typeIdOfExercise('type-vi2hz'), 'typeVi2hz');
  assert.strictEqual(QS.typeIdOfExercise('nhan-la'), null); assert.strictEqual(QS.typeIdOfExercise(null), null); assert.strictEqual(QS.typeIdOfExercise(''), null);
});
test('lastExerciseType: dạng đã hỏi cho TỪ này lần trước bị trừ lastTypePenalty; dạng khác không bị', () => {
  const word = { hz: 'x' }, sess = fresh();
  const a = QS.scoreType('hz2vi', 'recognition', {}, sess, word, { lastType: 'hz2vi' });
  const b = QS.scoreType('hz2vi', 'recognition', {}, sess, word, {});
  assert.ok(Math.abs((b - a) - W.lastTypePenalty) < 1e-9);
  assert.strictEqual(QS.scoreType('vi2hz', 'recall', {}, sess, word, { lastType: 'hz2vi' }), QS.scoreType('vi2hz', 'recall', {}, sess, word, {}));
});

// ── Mô phỏng nhiều buổi (dữ liệu GIẢ LẬP, tất định) ──────────────────────────────────────────────────
const syll = ['ba', 'ma', 'fa', 'ta', 'na', 'la', 'ga', 'ka', 'ha', 'ja', 'qi', 'xi', 'zhi', 'chi', 'shi', 'ri', 'zi', 'ci', 'si', 'yi', 'wu', 'yu', 'bu', 'pu', 'mu', 'fu', 'du', 'tu', 'nu', 'lu'];
const POOL = [];
for (let i = 0; i < 80; i++) POOL.push({ hz: String.fromCodePoint(0x4e00 + i * 3) + String.fromCodePoint(0x4e01 + i * 5), py: syll[i % 30] + syll[(i * 7 + 3) % 30] + i, vi: 'nghĩa' + i, l: 1, hanviet: 'hv' + i });
const EXAMPLES = POOL.slice(0, 40).map(w => ({ hz: w.hz, zh: '我们' + w.hz + '吧', vi: 'câu ' + w.vi }));
const QCTX = { pool: POOL, examples: EXAMPLES, sentences: [], confuseGroups: [], audioOk: true, heavy: null };
function runSessions(opts, sessions, cards, pCorrect) {
  const skills = {}, types = {}, repeatTypes = new Set(); let n = 0, repeats = 0, typed = 0;
  const pc = pCorrect == null ? 0.7 : pCorrect;
  for (let s = 0; s < sessions; s++) {
    const sess = QS.newSession(), r = rng(1000 + s); let prev = null;
    for (let c = 0; c < cards; c++) {
      const w = POOL[(s * 7 + c * 3) % 80];
      const q = QS.choose(w, QCTX, Object.assign({ session: sess, profile: {}, allowTyped: true, fsrsOnly: true, remaining: cards - c, rand: r }, opts));
      if (!q) continue;
      QS.record(sess, q, r() < pc, 3000); n++;
      skills[q.skill] = (skills[q.skill] || 0) + 1; types[q.typeId] = (types[q.typeId] || 0) + 1;
      if (prev === q.typeId) { repeats++; repeatTypes.add(q.typeId); } prev = q.typeId; if (q.typed) typed++;
    }
  }
  return { skills, types, n, repeats, typed, repeatTypes: Array.from(repeatTypes), share: (k) => (skills[k] || 0) / n };
}
const seq = (opts) => { const out = []; const sess = QS.newSession(), r = rng(7); for (let c = 0; c < 40; c++) { const q = QS.choose(POOL[c % 80], QCTX, Object.assign({ session: sess, profile: {}, allowTyped: true, fsrsOnly: true, remaining: 40 - c, rand: r }, opts)); QS.record(sess, q, true, 3000); out.push(q.typeId); } return out; };

console.log('\n[5] Người mới / thiếu dữ liệu và mô phỏng nhiều buổi');
test('Người mới: learner = null, { v:1, skills:{} } và không truyền cho CÙNG chuỗi dạng câu hỏi (không méo phân phối khi chưa có dữ liệu)', () => {
  const none = seq({}), nul = seq({ learner: null }), empty = seq({ learner: L({}) });
  assert.deepStrictEqual(nul, none); assert.deepStrictEqual(empty, none);
  assert.ok(none.every(t => typeof t === 'string'));
});
test('Luôn dựng được câu hỏi: kho từ tối thiểu, không có âm thanh, không có câu ví dụ, hồ sơ trống → vẫn có câu (dự phòng hz2vi)', () => {
  const tiny = POOL.slice(0, 3);
  const q = QS.choose(tiny[0], { pool: tiny, examples: [], sentences: [], confuseGroups: [], audioOk: false, heavy: null }, { session: QS.newSession(), profile: {}, allowTyped: true, fsrsOnly: true, learner: L({ recall: cell(60, 54) }), lastExerciseType: 'review-hz2vi', remaining: 3 });
  assert.ok(q, 'phải có câu hỏi'); assert.ok(['hz2vi', 'vi2hz', 'hz2py'].includes(q.typeId) || q.typeId === 'cloze');
  const single = QS.choose(POOL[0], { pool: [POOL[0]], examples: [], sentences: [], confuseGroups: [], audioOk: false, heavy: null }, { session: QS.newSession(), profile: {}, fsrsOnly: true, learner: L({}) });
  assert.ok(single === null || single.typeId === 'hz2vi', 'kho 1 từ: không lỗi, hoặc null / dự phòng 2 lựa chọn');
});
test('Thẻ FSRS chính thức KHÔNG BAO GIỜ là câu tự gõ dù số liệu cho thấy nên đo nhớ chủ động (thăm dò chỉ ở luyện bổ sung)', () => {
  const r = runSessions({ learner: L({ recall: cell(80, 76) }) }, 60, 30);
  assert.strictEqual(r.typed, 0);
  assert.ok(Object.keys(r.types).every(t => QE.TYPES[t].exerciseFsrs), 'thẻ chính thức chỉ dùng dạng server tự chấm');
});
test('Một buổi 30 thẻ trả lời đúng: không có 2 câu liền kề cùng dạng; đủ cả 5 kỹ năng; không kỹ năng nào quá 45%', () => {
  const learners = [{}, { learner: L({ recall: cell(60, 33), recognition: cell(60, 52), listening: cell(60, 52), pinyin: cell(60, 50) }) }];
  for (const opts of learners) {
    const r = runSessions(opts, 80, 30, 1.0);
    assert.strictEqual(r.repeats, 0, 'liền kề trùng dạng: ' + r.repeats);
    for (const k of ['recognition', 'recall', 'listening', 'pinyin', 'context']) assert.ok(r.share(k) > 0, 'thiếu kỹ năng ' + k);
    for (const k of Object.keys(r.skills)) assert.ok(r.share(k) <= 0.45, `${k}=${(r.share(k) * 100).toFixed(1)}%`);
  }
});
test('Khi người học sai liên tiếp, liền kề cùng dạng chỉ là dạng DỄ hz2vi (cơ chế có sẵn từ V106), không phải dạng khó nào khác', () => {
  for (const opts of [{}, { learner: L({ recall: cell(60, 33), recognition: cell(60, 52), listening: cell(60, 52) }) }]) {
    const r = runSessions(opts, 80, 30, 0.7);
    assert.ok(r.repeats > 0 ? r.repeatTypes.every(t => t === 'hz2vi') : true, 'trùng liền kề ở dạng: ' + r.repeatTypes.join(','));
    assert.ok(r.repeats / r.n < 0.06, 'tỉ lệ trùng liền kề ' + (r.repeats / r.n * 100).toFixed(1) + '%');
    assert.strictEqual(r.typed, 0);
  }
});
test('Kỹ năng tụt lại (đủ mẫu) được hỏi NHIỀU HƠN so với khi không có số liệu, nhưng có trần (không dồn cả buổi)', () => {
  const base = runSessions({}, 120, 30), weak = runSessions({ learner: L({ pinyin: cell(80, 38), recognition: cell(80, 70), recall: cell(80, 70), listening: cell(80, 70), context: cell(80, 70) }) }, 120, 30);
  assert.ok(weak.share('pinyin') > base.share('pinyin') + 0.02, `pinyin: ${(base.share('pinyin') * 100).toFixed(1)}% → ${(weak.share('pinyin') * 100).toFixed(1)}%`);
  assert.ok(weak.share('pinyin') <= 0.45);
});
test('Chống lặp giữa các ngày: có lastExerciseType thì từ KHÔNG bị hỏi lại đúng dạng đó khi còn dạng phù hợp khác', () => {
  let same = 0, sameWith = 0, tot = 0;
  const ctx = Object.assign({}, QCTX, { examples: [] });
  for (const w of POOL) {
    const first = QS.choose(w, ctx, { session: QS.newSession(), profile: {}, allowTyped: true, fsrsOnly: true, remaining: 5 });
    const lastLabel = first.exerciseFsrs;
    const day2 = QS.choose(w, ctx, { session: QS.newSession(), profile: {}, allowTyped: true, fsrsOnly: true, remaining: 5 });
    const day2b = QS.choose(w, ctx, { session: QS.newSession(), profile: {}, allowTyped: true, fsrsOnly: true, remaining: 5, lastExerciseType: lastLabel });
    tot++; if (day2.typeId === first.typeId) same++; if (day2b.typeId === first.typeId) sameWith++;
  }
  assert.ok(same > 0, 'điều kiện đầu: không có lastExerciseType thì có lặp (' + same + '/' + tot + ')');
  assert.strictEqual(sameWith, 0, 'có lastExerciseType: vẫn lặp ' + sameWith + '/' + tot);
});

console.log('\n[6] Ranh giới FSRS: truy vấn mới chỉ ĐỌC, chỉ chạy khi adaptive, field mới thêm chứ không thay field cũ');
test('getLastExerciseTypes: chỉ SELECT (không INSERT/UPDATE/DELETE), bỏ dòng intro, không đụng fsrs_cards', () => {
  const src = read('lib/skill-store.js'); const i = src.indexOf('async function getLastExerciseTypes');
  const fn = src.slice(i, src.indexOf('\n}\n', i) + 3);
  assert.ok(/SELECT DISTINCT ON \(word_id\)/.test(fn) && /exposure IS DISTINCT FROM 'intro'/.test(fn));
  assert.ok(!/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i.test(fn.replace(/--.*$/gm, '').replace(/\/\/.*$/gm, '')), 'không được ghi');
  assert.ok(!/fsrs_cards/.test(fn));
});
test('getStudySession: 3 truy vấn mới chỉ chạy khi adaptive; lỗi → null/Map rỗng (phiên học vẫn trả); field cũ giữ nguyên', () => {
  const src = read('lib/fsrs/reviewService.js');
  assert.ok(/async function getStudySession\(userId, ui, opts\)/.test(src) && /const adaptive = !!\(opts && opts\.adaptive\)/.test(src));
  assert.strictEqual((src.match(/adaptive \? skillStore\./g) || []).length, 3);
  assert.ok(/getLastExerciseTypes\(userId, wordIdsInSession\)\.catch\(\(\) => new Map\(\)\)/.test(src));
  assert.ok(/getTypeBreakdown\(userId, \{ days: 90 \}\)\.catch\(\(\) => null\)/.test(src) && /getTypeBreakdown\(userId, \{ days: 14 \}\)\.catch\(\(\) => null\)/.test(src));
  assert.ok(/\.\.\.\(adaptive && learner \? \{ learner \} : \{\}\)/.test(src));
  for (const f of ['session: dedupedSession', 'reviewCount: dueCards.length', 'newCount: newCards.length', 'currentLesson, totalDue', 'blockedByBacklog', 'scopeLessons']) assert.ok(src.includes(f), 'mất field cũ: ' + f);
  assert.ok(/it\.skillProfile = prof;/.test(src) && /it\.suggestedSkill = suggestions\[i\]\.suggestedSkill/.test(src), 'field per-item cũ giữ nguyên');
});
test('Route /api/study/session: chỉ ?adaptive=1 mới bật; /api/study/review (ghi FSRS) và /api/skills/practice không bị đổi hành vi', () => {
  const api = read('api/index.js');
  assert.ok(/getStudySession\(authed\.username, ui, \{ adaptive: req\.query && req\.query\.adaptive === '1' \}\)/.test(api));
  const study = fs.readFileSync(path.join(ROOT, 'js/study-queue.js'), 'utf8');
  assert.ok(!/adaptive=1/.test(study), '4 tab luyện khác không xin số liệu thêm (không tốn thêm truy vấn)');
});
test('Bộ chọn/giao diện không import hay gọi lớp FSRS: không có submitFsrsReview/ts-fsrs/fsrs-auto-rating trong question-selector.js', () => {
  const sel = read('js/question-selector.js');
  assert.ok(!/submitFsrsReview|ts-fsrs|fsrs-auto-rating|api\/study\/review|reviewFsrsCard/.test(sel.replace(/\/\/.*$/gm, '')));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
