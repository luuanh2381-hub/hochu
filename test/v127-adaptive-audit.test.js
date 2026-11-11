// test/v127-adaptive-audit.test.js — KIỂM TOÁN ĐỘC LẬP V127 (phần B: trắc nghiệm thích ứng).
// Chạy hàm THẬT js/question-selector.js + js/question-engine.js + lib/skill-pooled.js (Node trần, dữ liệu mô phỏng TẤT ĐỊNH).
// KHÔNG kiểm tra: giao diện thật, dữ liệu học thật của người dùng, SQL thật.
'use strict';
const assert = require('assert');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.QE = require(path.join(ROOT, 'js/question-engine.js'));
global.SS = require(path.join(ROOT, 'js/skill-score.js'));
const QS = require(path.join(ROOT, 'js/question-selector.js'));
const { learnerCounts } = require(path.join(ROOT, 'lib/skill-pooled.js'));
const W = QS.WEIGHTS;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ✅ ' + name); } catch (e) { failed++; console.log('  ❌ ' + name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e)); } }
const section = (s) => console.log('\n' + s);

const syll = ['ba', 'ma', 'fa', 'ta', 'na', 'la', 'ga', 'ka', 'ha', 'ja', 'qi', 'xi', 'zhi', 'chi', 'shi', 'ri', 'zi', 'ci', 'si', 'yi', 'wu', 'yu', 'bu', 'pu', 'mu', 'fu', 'du', 'tu', 'nu', 'lu'];
const POOL = []; for (let i = 0; i < 80; i++) POOL.push({ hz: String.fromCodePoint(0x4e00 + i * 3) + String.fromCodePoint(0x4e01 + i * 5), py: syll[i % 30] + syll[(i * 7 + 3) % 30] + i, vi: 'nghĩa' + i, l: 1, hanviet: 'hv' + i });
const EXAMPLES = POOL.slice(0, 40).map(w => ({ hz: w.hz, zh: '我们' + w.hz + '吧', vi: 'câu ' + w.vi }));
const FULL = { pool: POOL, examples: EXAMPLES, sentences: [], confuseGroups: [], audioOk: true, heavy: null };
const cell = (cn, cok, tn, tok, rcn, rcok, rtn, rtok) => ({ c: { n: cn, ok: cok }, t: { n: tn || 0, ok: tok || 0 }, rc: { n: rcn || 0, ok: rcok || 0 }, rt: { n: rtn || 0, ok: rtok || 0 } });
const L = (skills) => ({ v: 1, skills });
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SK5 = ['recognition', 'recall', 'listening', 'pinyin', 'context'];
// Mô phỏng 1 buổi: trả về mảng { t: typeId, ok, sk } (null nếu không dựng được câu).
function run({ len = 40, seed = 1, pCorrect = 1, learner, profile, sameWord = false, allowTyped = true, ctx = FULL, lastEx } = {}) {
  const rr = rng(seed + 3), ans = rng(seed + 9), s = QS.newSession(), out = [];
  for (let i = 0; i < len; i++) {
    const w = sameWord ? POOL[0] : POOL[Math.floor(rr() * 40)];
    const prof = typeof profile === 'function' ? profile(rr) : (profile || {});
    const q = QS.choose(w, ctx, { session: s, profile: prof, allowTyped, remaining: len - i, rand: rng(seed * 31 + i), learner, lastExerciseType: lastEx });
    if (!q) { out.push(null); continue; }
    const ok = ans() < pCorrect; QS.record(s, q, ok); out.push({ t: q.typeId, ok, sk: q.skill });
  }
  return out;
}
const share = (o, pred) => o.filter(x => x && pred(x)).length / Math.max(1, o.filter(Boolean).length);
const seqKey = (o) => o.map(x => (x ? x.t : 'NULL')).join(',');
const adjacentSame = (o) => { const bad = []; for (let i = 1; i < o.length; i++) if (o[i] && o[i - 1] && o[i].t === o[i - 1].t) bad.push(o[i].t); return bad; };

section('[B1] Người học mới / chưa có dữ liệu');
test('learner null, {v:1,skills:{}} và kỹ năng đủ ít mà KHÔNG có đối chứng → điểm cộng cấp người học = 0 cho mọi kỹ năng (hồi quy lỗi đã sửa)', () => {
  for (const lr of [null, undefined, L({}), L({ recall: cell(10, 2) }), L({ recall: cell(5, 5), pinyin: cell(19, 19) })])
    for (const sk of SK5) assert.strictEqual(QS.learnerBonus(lr, sk), 0, JSON.stringify(lr) + ' ' + sk);
});
test('Có ≥ 1 kỹ năng đủ mẫu (đối chứng) thì kỹ năng thiếu mẫu mới được cộng nhỏ để thu thêm dữ liệu', () => {
  const lr = L({ recognition: cell(60, 57) });
  assert.ok(Math.abs(QS.learnerBonus(lr, 'recall') - W.learnerDataMax) < 1e-9);
  assert.strictEqual(QS.learnerBonus(lr, 'recognition'), 0);
});
test('Hồi quy: người mới (server gửi learner rỗng) cho CÙNG chuỗi dạng câu hỏi như learner=null — 100 buổi, hồ sơ từ đã vững (câu tự gõ đủ điều kiện)', () => {
  const strongNoRecall = () => { const p = {}; for (const s of SK5) p[s] = { status: 'ok', score: 0.8, attempts: 8, fragile: false, daysSince: 2 }; p.recall = { status: 'insufficient', score: null, attempts: 1 }; return p; };
  let typedSeen = 0;
  for (let s = 0; s < 100; s++) {
    const a = run({ seed: 200 + s, len: 30, profile: strongNoRecall, learner: null }), b = run({ seed: 200 + s, len: 30, profile: strongNoRecall, learner: L({}) });
    assert.strictEqual(seqKey(b), seqKey(a), 'buổi ' + s); typedSeen += a.filter(x => x && /^type/.test(x.t)).length;
  }
  assert.ok(typedSeen > 0, 'mẫu phải có câu tự gõ, nếu không test vô nghĩa');
});
test('Người mới hoàn toàn (hồ sơ từ trống): mọi buổi dựng được câu, 0 câu tự gõ, đủ cả 5 kỹ năng trong 40 câu', () => {
  const o = run({ seed: 1, len: 40, learner: L({}) });
  assert.strictEqual(o.filter(x => !x).length, 0); assert.strictEqual(o.filter(x => /^type/.test(x.t)).length, 0);
  assert.deepStrictEqual([...new Set(o.map(x => x.sk))].sort(), SK5.slice().sort());
});

section('[B2] Kỹ năng mạnh / yếu khác nhau');
const WEAK_RECALL = L({ recognition: cell(80, 76), pinyin: cell(80, 72), listening: cell(80, 68), context: cell(80, 64), recall: cell(80, 28) });
test('Tụt lại (recall) đủ mẫu → gap ≥ 15 điểm %, điểm cộng nằm trong (0, learnerWeakMax]; kỹ năng ngang/ cao hơn → 0', () => {
  const g = QS.learnerGap(WEAK_RECALL, 'recall'); assert.ok(g && g.gap >= W.learnerGapMin, JSON.stringify(g));
  const b = QS.learnerBonus(WEAK_RECALL, 'recall'); assert.ok(b > 0 && b <= W.learnerWeakMax, 'b=' + b);
  for (const sk of ['recognition', 'pinyin', 'listening', 'context']) assert.strictEqual(QS.learnerBonus(WEAK_RECALL, sk), 0, sk);
});
test('Buổi 40 câu đúng hết: người học tụt recall được hỏi recall NHIỀU HƠN không-learner, nhưng có trần (≤ 55%) — trung bình 40 buổi', () => {
  let base = 0, adp = 0, maxAdp = 0; const N = 40;
  for (let s = 0; s < N; s++) {
    const a = share(run({ seed: 300 + s }), x => x.sk === 'recall'), b = share(run({ seed: 300 + s, learner: WEAK_RECALL }), x => x.sk === 'recall');
    base += a / N; adp += b / N; maxAdp = Math.max(maxAdp, b);
  }
  assert.ok(adp > base, `recall có learner ${adp.toFixed(3)} phải > không có ${base.toFixed(3)}`); assert.ok(adp <= 0.55, 'trung bình ' + adp.toFixed(3)); assert.ok(maxAdp <= 0.7, 'buổi cao nhất ' + maxAdp.toFixed(3));
});
test('Điểm cộng cấp người học chỉ áp cho câu TRẮC NGHIỆM (câu tự gõ có cổng riêng theo hồ sơ của từ): chênh điểm hz2vi/typeVi2hz tính bằng scoreType', () => {
  const prof = { status: 'developing', score: 0.5, attempts: 3 }; const w = POOL[0], s = QS.newSession();
  const mcq = (lr) => QS.scoreType('vi2hz', 'recall', { recall: prof }, s, w, { remaining: 5, learner: lr });
  const dMcq = mcq(WEAK_RECALL) - mcq(null); assert.ok(dMcq > 0, 'MCQ recall phải được cộng: ' + dMcq);
  const typ = (lr) => QS.scoreType('typeVi2hz', 'recall', { recall: prof }, s, w, { remaining: 5, learner: lr });
  assert.ok(Math.abs(typ(WEAK_RECALL) - typ(null)) < 1e-9, 'tự gõ không được cộng điểm người học');
});
test('Chọn đúng đáp án KHÔNG chứng minh tự nhớ ra chữ: recall "đã vững" theo trắc nghiệm không bị trừ điểm khi chưa đủ bằng chứng tự gõ; recognition vẫn bị trừ như cũ', () => {
  const strong = { status: 'ok', score: 0.95, attempts: 9, fragile: false };
  const sc = (typeId, sk, lr) => QS.scoreType(typeId, sk, { [sk]: strong }, QS.newSession(), POOL[0], { remaining: 5, learner: lr });
  const lr = L({ recall: cell(60, 54), recognition: cell(60, 54) });
  assert.ok(sc('vi2hz', 'recall', lr) > sc('vi2hz', 'recall', null), 'recall: miễn trừ strongPenalty');
  assert.ok(Math.abs(sc('hz2vi', 'recognition', lr) - sc('hz2vi', 'recognition', null)) < 1e-9, 'recognition: giữ nguyên');
});

section('[B3] Dữ liệu của một kỹ năng còn quá ít');
test('recall chỉ 5 lượt (có đối chứng): KHÔNG kết luận yếu (gap=null), chỉ cộng nhỏ = learnerDataMax·(1−n/20), giảm dần theo số lượt, không vượt trần', () => {
  const mk = (n) => L({ recognition: cell(60, 57), recall: cell(n, Math.floor(n * 0.2)) });
  assert.strictEqual(QS.learnerGap(mk(5), 'recall'), null);
  let prev = Infinity; for (const n of [0, 5, 10, 15, 19]) { const b = QS.learnerBonus(mk(n), 'recall'); assert.ok(Math.abs(b - W.learnerDataMax * (1 - n / W.learnerMinN)) < 1e-9, 'n=' + n); assert.ok(b < prev && b <= W.learnerDataMax); prev = b; }
  assert.ok(W.learnerDataMax < W.learnerWeakMax, 'thu thập dữ liệu luôn nhẹ hơn kết luận "tụt lại"');
});
test('Lý do hiển thị: thiếu mẫu thì KHÔNG nói "thấp hơn các kỹ năng khác"; đủ mẫu và tụt lại thì nói', () => {
  const q = QS.choose(POOL[0], FULL, { session: QS.newSession(), profile: { recall: { status: 'ok', score: 0.7, attempts: 6, daysSince: 1 } }, allowTyped: false, only: ['vi2hz', 'hz2vi'], learner: L({ recognition: cell(60, 57), recall: cell(6, 1) }) });
  const sparse = QS.explainChoice(Object.assign({}, q, { skill: 'recall', typed: null, typeId: 'vi2hz' }), { recall: { status: 'ok', score: 0.7, attempts: 6, daysSince: 1 } }, POOL[0], QS.newSession(), { learner: L({ recognition: cell(60, 57), recall: cell(6, 1) }) });
  assert.ok(!sparse || !/thấp hơn các kỹ năng khác/.test(sparse), String(sparse));
  const weak = QS.explainChoice(Object.assign({}, q, { skill: 'recall', typed: null, typeId: 'vi2hz' }), { recall: { status: 'ok', score: 0.7, attempts: 6, daysSince: 1 } }, POOL[0], QS.newSession(), { learner: WEAK_RECALL });
  assert.ok(/thấp hơn các kỹ năng khác/.test(String(weak)), String(weak));
});

section('[B4] Trả lời SAI liên tiếp');
test('30 câu sai liên tiếp (4 kiểu learner): luôn dựng được câu; liền kề cùng dạng chỉ có thể là dạng DỄ hz2vi; không câu tự gõ khi hồ sơ từ trống', () => {
  for (const lr of [null, L({}), WEAK_RECALL, L({ recognition: cell(80, 78), recall: cell(80, 80), pinyin: cell(80, 79) })]) {
    const o = run({ seed: 7, len: 30, pCorrect: 0, learner: lr });
    assert.strictEqual(o.filter(x => !x).length, 0);
    for (const t of adjacentSame(o)) assert.strictEqual(t, 'hz2vi', 'liền kề lặp dạng khó: ' + t);
    assert.strictEqual(o.filter(x => /^type/.test(x.t)).length, 0, 'không ép tự gõ khi đang sai liên tiếp');
  }
});
test('Sau khi sai ≥ 3 câu liền, dạng DỄ hz2vi được ưu tiên hơn so với lúc đúng liên tiếp (cơ chế V106 còn nguyên khi có learner)', () => {
  const wrong = run({ seed: 11, len: 30, pCorrect: 0, learner: WEAK_RECALL }), right = run({ seed: 11, len: 30, pCorrect: 1, learner: WEAK_RECALL });
  assert.ok(share(wrong.slice(4), x => x.t === 'hz2vi') > share(right.slice(4), x => x.t === 'hz2vi'));
});

section('[B5] Trả lời ĐÚNG liên tiếp');
test('40 câu đúng liên tiếp: 0 cặp liền kề cùng dạng, đủ 5 kỹ năng, không kỹ năng nào > 45% (learner cân bằng và learner tụt recall)', () => {
  for (const lr of [null, L({ recognition: cell(60, 57), recall: cell(60, 57), listening: cell(60, 57), pinyin: cell(60, 57), context: cell(60, 57) }), WEAK_RECALL]) {
    for (let s = 0; s < 10; s++) {
      const o = run({ seed: 500 + s, len: 40, learner: lr });
      assert.deepStrictEqual(adjacentSame(o), []); assert.strictEqual(new Set(o.map(x => x.sk)).size, 5);
      for (const sk of SK5) assert.ok(share(o, x => x.sk === sk) <= 0.45, `${sk}=${share(o, x => x.sk === sk).toFixed(2)}`);
    }
  }
});

section('[B6] Không còn câu hỏi phù hợp');
test('Kho từ tối thiểu / không âm thanh / không câu ví dụ / một từ duy nhất: choose không ném lỗi; kho 2 từ vẫn có câu (hz2vi 2 lựa chọn); kho 1 từ → null', () => {
  const tiny = POOL.slice(0, 2), mk = (pool) => ({ pool, examples: [], sentences: [], confuseGroups: [], audioOk: false, heavy: null });
  const q2 = QS.choose(tiny[0], mk(tiny), { session: QS.newSession(), profile: {}, fsrsOnly: true, learner: WEAK_RECALL, lastExerciseType: 'review-hz2vi' });
  assert.ok(q2 && q2.typeId === 'hz2vi', JSON.stringify(q2 && q2.typeId));
  assert.strictEqual(QS.choose(POOL[0], mk([POOL[0]]), { session: QS.newSession(), profile: {}, fsrsOnly: true, learner: L({}) }), null);
});
test('Dạng ép (only) không dựng được → null, KHÔNG âm thầm hạ chuẩn sang dạng khác (thăm dò tự gõ phải rơi về luồng thường)', () => {
  const q = QS.choose(POOL[0], { pool: [POOL[0]], examples: [], sentences: [], confuseGroups: [], audioOk: false, heavy: null }, { session: QS.newSession(), profile: {}, allowTyped: true, allowPracticeOnly: true, only: ['typeVi2hz'], forced: true, learner: L({}) });
  assert.ok(q === null || q.typeId === 'typeVi2hz', 'không được trả dạng khác: ' + (q && q.typeId));
});

section('[B7] Nhiều câu hỏi trùng lặp');
test('Cùng 1 từ hỏi 12 lần (đúng và sai): không null, không liền kề cùng dạng (trừ hz2vi khi sai), dùng ≥ 4 dạng khác nhau', () => {
  for (const pc of [1, 0]) {
    const o = run({ seed: 21, len: 12, pCorrect: pc, sameWord: true, learner: WEAK_RECALL });
    assert.strictEqual(o.filter(x => !x).length, 0);
    for (const t of adjacentSame(o)) assert.strictEqual(t, 'hz2vi');
    assert.ok(new Set(o.map(x => x.t)).size >= 4, 'chỉ ' + new Set(o.map(x => x.t)).size + ' dạng');
  }
});
test('lastExerciseType: dạng đã hỏi lần trước bị trừ ĐÚNG lastTypePenalty, dạng khác không đổi; nhãn lạ/rỗng không đổi gì', () => {
  const s = QS.newSession(), w = POOL[0], sc = (t, sk, last) => QS.rank(w, { session: s, profile: {}, remaining: 5, rand: () => 0, lastExerciseType: last }).find(x => x.typeId === t).score;
  assert.ok(Math.abs((sc('hz2vi', 'recognition', undefined) - sc('hz2vi', 'recognition', 'review-hz2vi')) - W.lastTypePenalty) < 1e-9);
  assert.ok(Math.abs(sc('vi2hz', 'recall', undefined) - sc('vi2hz', 'recall', 'review-hz2vi')) < 1e-9);
  for (const bad of ['zzz', '', null, 'intro']) assert.ok(Math.abs(sc('hz2vi', 'recognition', undefined) - sc('hz2vi', 'recognition', bad)) < 1e-9, String(bad));
});

section('[B8] Không có dữ liệu phân tích / dữ liệu bị thiếu hoặc hỏng');
test('24 dạng learner hỏng/vô lý (null, mảng, chuỗi, NaN, ok>n, Infinity, 1e15, kỹ năng lạ…): choose/explainChoice/gap/bonus không ném lỗi, điểm luôn hữu hạn', () => {
  const garbage = [undefined, null, 0, 1, '', 'x', NaN, Infinity, -5, [], {}, { v: 1 }, { v: 1, skills: null }, { v: 1, skills: [] }, { v: 1, skills: 'abc' }, { v: 1, skills: { recall: null } }, { v: 1, skills: { recall: 5 } }, { v: 1, skills: { recall: {} } },
    { v: 1, skills: { recall: { c: null, t: 'a' } } }, { v: 1, skills: { recall: { c: { n: NaN, ok: 5 }, t: { n: -3, ok: 2 }, rc: { n: Infinity, ok: Infinity }, rt: { n: '7', ok: '3' } } } }, { v: 1, skills: { recall: { c: { n: 10, ok: 99 } } } },
    { v: 1, skills: { recall: { c: { n: 1e15, ok: 5e14 }, rc: { n: 1e12, ok: 1 } }, recognition: { c: { n: 40, ok: 39 } } } }, { v: 1, skills: { unknown: { c: { n: 50, ok: 10 } }, recognition: { c: { n: 50, ok: 10 } } } }, WEAK_RECALL];
  for (const g of garbage) {
    for (const sk of [...SK5, 'zzz']) for (const f of [QS.learnerBonus(g, sk), QS.learnerSkill(g, sk).n]) assert.ok(Number.isFinite(f), JSON.stringify(g) + ' ' + sk);
    QS.productionProven(g); QS.recallProbeNeeded(g);
    const s = QS.newSession();
    for (let k = 0; k < 8; k++) { const q = QS.choose(POOL[k], FULL, { session: s, profile: {}, allowTyped: true, remaining: 5, learner: g, lastExerciseType: 'review-hz2vi' }); assert.ok(q, 'choose null với ' + JSON.stringify(g)); assert.ok(Number.isFinite(q.chosenScore)); QS.record(s, q, k % 2 === 0); }
    QS.explainChoice(QS.choose(POOL[0], FULL, { session: QS.newSession(), profile: {}, allowTyped: false, learner: g }), {}, POOL[0], QS.newSession(), { learner: g });
  }
});
test('Hồ sơ từ thiếu/hỏng (undefined, null, {}, trường lạ, status lạ) không làm chọn câu hỏng', () => {
  for (const profile of [undefined, null, {}, { recall: null }, { recall: { status: 'weird' } }, { recall: { status: 'ok' } }, { zzz: { status: 'weak', score: 0.1, attempts: 5 } }]) {
    const o = run({ seed: 3, len: 10, profile, learner: WEAK_RECALL }); assert.strictEqual(o.filter(x => !x).length, 0, JSON.stringify(profile));
  }
});
test('Phiên cũ (lưu từ V126) thiếu skillCount: QS.record/scoreType không lỗi và tự khởi tạo', () => {
  const s = QS.newSession(); delete s.skillCount; const q = QS.choose(POOL[0], FULL, { session: s, profile: {}, learner: WEAK_RECALL }); QS.record(s, q, true);
  const q2 = QS.choose(POOL[1], FULL, { session: s, profile: {}, learner: WEAK_RECALL }); assert.ok(q2);
});
test('Server learnerCounts với hàng hỏng: bỏ n≤0/NaN/nhãn lạ/null, ép số từ chuỗi, ok không vượt n, không ném lỗi', () => {
  const bad = [null, undefined, 5, 'x', {}, { exercise_type: null, n: 5, correct: 2 }, { exercise_type: 'review-hz2vi', n: '12', correct: '7' }, { exercise_type: 'review-hz2vi', n: -3, correct: 1 }, { exercise_type: 'review-hz2vi', n: 4, correct: 9 }, { exercise_type: 'zzz', n: 4, correct: 1 }, { exercise_type: 'review-hz2vi', n: NaN, correct: NaN }, { exercise_type: 'review-vi2hz-typed', n: 10, correct: 4, kind: 'fsrs' }];
  const r = learnerCounts(bad, bad);
  assert.deepStrictEqual(r.skills.recognition.c, { n: 16, ok: 11 }); assert.deepStrictEqual(r.skills.recall.t, { n: 10, ok: 4 }); assert.deepStrictEqual(r.skills.recall.rt, { n: 10, ok: 4 });
  assert.deepStrictEqual(learnerCounts(null, undefined), { v: 1, skills: {} });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
