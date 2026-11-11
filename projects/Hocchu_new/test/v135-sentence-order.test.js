#!/usr/bin/env node
// test/v135-sentence-order.test.js — V135: "🧩 Sắp xếp câu" (orderSentence).
//
// Kiểm: thư viện thuần (tách mảnh / chuẩn hoá / chấm / lọc câu dùng được), câu hỏi do QE dựng
// (mảnh đã xáo, là hoán vị của câu gốc, đề không lộ chữ Hán của từ), ĐÚNG/MỘT-CHIỀU luyện bổ sung
// (KHÔNG đụng FSRS), nhãn bài tập ở server, chấm phía server và các điểm nối giao diện.
// KHÔNG cần Postgres, KHÔNG gọi mạng.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const OS = require('../js/order-sentence.js');
const SENTENCES = require('../js/sentences-data.js');
global.QE = require('../js/question-engine.js');
const QE = global.QE;
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

// Kho từ mô phỏng: mỗi từ đều CÓ THẬT trong SENTENCES (theo trường hint), nhờ vậy dựng được câu.
const POOL = [
  { hz: '包子', py: 'bāozi', vi: 'bánh bao', l: 7 },
  { hz: '米饭', py: 'mǐfàn', vi: 'cơm', l: 7 },
  { hz: '面条', py: 'miàntiáo', vi: 'mì sợi', l: 7 },
  { hz: '苹果', py: 'píngguǒ', vi: 'táo', l: 8 },
  { hz: '人民币', py: 'rénmínbì', vi: 'nhân dân tệ', l: 9 },
  { hz: '办公室', py: 'bàngōngshì', vi: 'văn phòng', l: 10 },
  { hz: '留学生', py: 'liúxuéshēng', vi: 'lưu học sinh', l: 11 },
  { hz: '语法', py: 'yǔfǎ', vi: 'ngữ pháp', l: 12 },
  // Từ KHÔNG có câu nào trong SENTENCES và không có word_examples → không dựng được câu.
  { hz: '蓝牙', py: 'lányá', vi: 'bluetooth', l: 12 },
];
const W = (hz) => POOL.find(w => w.hz === hz);
const ctx = (extra, seed) => Object.assign({ pool: POOL, examples: [], sentences: SENTENCES, audioOk: true, rand: rng(seed || 1) }, extra || {});

// ────────────────────────────────────────────────────
test('tokenize: dấu câu dính vào mảnh trước; tổng các mảnh = câu gốc; không lẫn khoảng trắng', () => {
  const t = OS.tokenize('早上我吃包子，喝汤。');
  assert.deepStrictEqual(t, ['早上', '我', '吃', '包子，', '喝', '汤。']);
  assert.strictEqual(t.join(''), '早上我吃包子，喝汤。');
  for (const s of SENTENCES) {
    const tiles = OS.tokenize(s.hz);
    assert.strictEqual(tiles.join(''), s.hz, 'ghép mảnh phải khôi phục đúng câu: ' + s.hz);
    assert.ok(tiles.length >= 1);
    assert.ok(tiles.every(x => !/^\s+$/.test(x)), 'không có mảnh chỉ gồm khoảng trắng');
  }
});

test('normalize: bỏ dấu câu + khoảng trắng, KHÔNG đổi chữ Hán; isOrderCorrect chấm theo chuỗi chuẩn hoá', () => {
  assert.strictEqual(OS.normalize('早上，我吃 包子。'), '早上我吃包子');
  assert.strictEqual(OS.normalize(null), '');
  assert.strictEqual(OS.normalize('B 楼305号'), 'B楼305号');
  assert.ok(OS.isOrderCorrect('早上我吃包子，喝汤。', '早上我吃包子喝汤'), 'thiếu dấu câu vẫn đúng');
  assert.ok(!OS.isOrderCorrect('早上我吃包子，喝汤。', '我早上吃包子，喝汤。'), 'sai thứ tự → sai');
  assert.ok(!OS.isOrderCorrect('早上我吃包子，喝汤。', ''), 'bỏ trống → sai');
  assert.ok(!OS.isOrderCorrect('', '早上我吃包子'), 'câu gốc rỗng → không bao giờ đúng');
});

test('sentenceUsable: đúng độ dài / toàn chữ Hán + dấu câu / từ xuất hiện ĐÚNG một lần', () => {
  assert.ok(OS.sentenceUsable('早上我吃包子，喝汤。', '包子'));
  assert.ok(!OS.sentenceUsable('早上我吃包子，喝汤。', '饺子'), 'từ không có trong câu → loại (đếm nguyên chuỗi)');
  assert.ok(!OS.sentenceUsable('我我我我', '我'), 'xuất hiện 2+ lần → mơ hồ');
  assert.ok(!OS.sentenceUsable('abc 包子', '包子'), 'có chữ Latin không phải chữ Hán');
  assert.ok(!OS.sentenceUsable('包子', '包子'), 'quá ngắn (< 4 chữ)');
  assert.ok(!OS.sentenceUsable('一'.repeat(41), '一'), 'quá dài');
  assert.ok(!OS.sentenceUsable('', '包子'));
});

test('buildTiles: mảnh là HOÁN VỊ của câu gốc và luôn KHÁC thứ tự gốc; câu quá ít/không xáo được → null', () => {
  const zh = '早上我吃包子，喝汤。';
  for (let seed = 1; seed <= 30; seed++) {
    const tiles = OS.buildTiles(zh, rng(seed));
    assert.ok(tiles, 'phải dựng được: seed ' + seed);
    assert.deepStrictEqual(tiles.slice().sort(), OS.tokenize(zh).slice().sort(), 'cùng tập mảnh với câu gốc');
    assert.strictEqual(tiles.slice().sort().join(''), OS.tokenize(zh).slice().sort().join(''));
    assert.ok(tiles.join('|') !== OS.tokenize(zh).join('|'), 'mảnh phải bị xáo (khác thứ tự gốc)');
  }
  assert.strictEqual(OS.buildTiles('我吃，', rng(3)), null, 'dưới 3 mảnh → không phải bài sắp xếp');
  assert.strictEqual(OS.buildTiles('我我我我', rng(3)), null, 'mảnh giống hệt nhau → mọi thứ tự đều đúng → loại');
});

test('fromSentences / fromExamples: chỉ lấy câu CÓ THẬT chứa đúng từ, bỏ câu không dùng được', () => {
  const bz = OS.fromSentences(W('包子'), SENTENCES);
  assert.ok(bz.length >= 1 && bz.every(c => c.zh.includes('包子') && c.source === 'sentence'));
  assert.strictEqual(OS.fromSentences(W('蓝牙'), SENTENCES).length, 0, 'từ không có trong câu nào → rỗng');
  const ex = [{ hz: '包子', zh: '我吃包子。', vi: 'Tôi ăn bánh bao.' }];
  assert.strictEqual(OS.fromExamples(W('包子'), ex).length, 1);
  assert.strictEqual(OS.fromExamples(W('苹果'), ex).length, 0, 'ví dụ của từ khác → không lấy');
  assert.strictEqual(OS.fromExamples(W('包子'), [{ hz: '包子', zh: '我吃包子。包子！', vi: 'x' }]).length, 0, 'từ xuất hiện 2 lần → loại');
});

// ────────────────────────────────────────────────────
test('TYPES.orderSentence: chỉ luyện bổ sung, exerciseFsrs = null, KHÔNG nằm trong các nhóm tự chọn', () => {
  const T = QE.TYPES.orderSentence;
  assert.ok(T);
  assert.strictEqual(T.practiceOnly, true);
  assert.strictEqual(T.exerciseFsrs, null);
  assert.strictEqual(T.quizType, 'order-sentence');
  assert.strictEqual(T.exercisePractice, 'practice-order-sentence');
  assert.deepStrictEqual(QE.ORDER_ORDER, ['orderSentence']);
  for (const arr of [QE.MCQ_ORDER, QE.PRACTICE_ORDER, QE.PRACTICE_TYPED_ORDER, QE.TYPED_ORDER, QE.HV_ORDER, QE.DUEL_ORDER, QE.TF_ORDER]) {
    assert.ok(!arr.includes('orderSentence'), 'không được tự chen vào bộ chọn thường');
  }
});

test('QE.build("orderSentence"): dựng cho từ có câu, mảnh đã xáo, đề KHÔNG lộ chữ Hán của từ', () => {
  let built = 0;
  for (const w of POOL) for (let seed = 1; seed <= 25; seed++) {
    const q = QE.build('orderSentence', w, ctx({}, seed));
    if (!q) continue;
    built++;
    assert.strictEqual(q.typeId, 'orderSentence');
    assert.strictEqual(q.exerciseFsrs, null, 'không có lượt FSRS');
    assert.strictEqual(q.fsrsEligible, false);
    assert.strictEqual(q.correctIndex, -1, 'không phải trắc nghiệm');
    assert.deepStrictEqual(q.options, []);
    assert.strictEqual(q.order.sentence, q.sentence.zh);
    assert.strictEqual(q.correctKey, OS.normalize(q.order.sentence));
    assert.ok(OS.sentenceUsable(q.order.sentence, w.hz), 'câu dùng được cho từ này');
    assert.deepStrictEqual(q.order.tiles.slice().sort(), OS.tokenize(q.order.sentence).slice().sort(), 'mảnh cùng tập với câu gốc');
    assert.ok(q.order.tiles.join('|') !== OS.tokenize(q.order.sentence).join('|'), 'mảnh phải bị xáo');
    const stem = String(q.prompt.main || '') + String(q.prompt.ask || '') + String(q.prompt.sub || '');
    assert.ok(!stem.includes(w.hz), 'đề không được lộ chữ Hán của từ cần dùng: ' + stem);
    assert.ok(q.explanation.length >= 1 && q.explanation.join(' ').includes(q.order.sentence), 'giải thích có câu đúng');
    assert.ok(QE.validate(q).ok, 'validate phải chấp nhận: ' + JSON.stringify(QE.validate(q)));
    // Chấm: ghép đúng thứ tự gốc → đúng; đảo 2 mảnh → sai.
    const right = q.order.tiles.slice().sort((a, b) => OS.tokenize(q.order.sentence).indexOf(a) - OS.tokenize(q.order.sentence).indexOf(b)).join('');
    assert.ok(OS.isOrderCorrect(q.order.sentence, right));
    assert.ok(!OS.isOrderCorrect(q.order.sentence, q.order.tiles.join('')));
  }
  assert.ok(built >= 50, 'phải dựng được nhiều câu (được ' + built + ')');
});

test('QE.build("orderSentence") = null khi không có câu thật dùng được (không bịa câu)', () => {
  for (let seed = 1; seed <= 10; seed++) assert.strictEqual(QE.build('orderSentence', W('蓝牙'), ctx({}, seed)), null);
  assert.strictEqual(QE.build('orderSentence', W('包子'), ctx({ sentences: [], examples: [] }, 1)), null, 'không có kho câu → null');
});

test('QE.validate: chặn câu không dùng được / mảnh không khớp câu / mảnh chưa xáo / đề lộ chữ Hán', () => {
  const w = W('包子');
  const q = QE.build('orderSentence', w, ctx({}, 5));
  assert.ok(q && QE.validate(q).ok);
  const bad = (mut) => { const c = JSON.parse(JSON.stringify({ typeId: q.typeId, word: w, prompt: q.prompt, order: q.order, correctKey: q.correctKey })); mut(c); return QE.validate(c); };

  assert.ok(!bad(c => { c.order = null; }).ok, 'thiếu câu');
  assert.ok(!bad(c => { c.order.tiles = c.order.tiles.slice(0, 2); }).ok, 'quá ít mảnh');
  assert.ok(!bad(c => { c.order.sentence = '我吃。'; }).ok, 'câu không dùng được cho từ');
  assert.ok(!bad(c => { c.correctKey = ''; }).ok, 'thiếu đáp án chuẩn');
  assert.ok(!bad(c => { c.correctKey = OS.normalize('其他句子'); }).ok, 'đáp án không khớp câu gốc');
  assert.ok(!bad(c => { c.order.tiles = OS.tokenize(c.order.sentence); }).ok, 'mảnh chưa bị xáo');
  assert.ok(!bad(c => { c.order.tiles = c.order.tiles.slice(0, c.order.tiles.length - 1).concat(['XYZ']); }).ok, 'mảnh lạ không thuộc câu');
  assert.ok(!bad(c => { c.prompt = Object.assign({}, c.prompt, { ask: 'Ghép câu dùng từ ' + w.hz }); }).ok, 'đề lộ chữ Hán');
});

test('QS: dạng orderSentence KHÔNG xuất hiện khi bộ chọn tự do; được dựng khi yêu cầu đích danh', () => {
  const w = W('包子');
  for (let seed = 1; seed <= 20; seed++) {
    const ranked = QS.rank(w, Object.assign(ctx({}, seed), { allowPracticeOnly: true, allowTyped: true }));
    assert.ok(!ranked.some(r => r.typeId === 'orderSentence'), 'không tự chọn sắp xếp câu');
    const q = QS.choose(w, ctx({}, seed), { only: QE.ORDER_ORDER, forced: true, allowPracticeOnly: true, session: QS.newSession() });
    assert.ok(q && q.typeId === 'orderSentence', 'chi định đích danh thì dựng được');
  }
});

// ────────────────────────────────────────────────────
test('lib/skills: nhãn practice-order-sentence hợp lệ, fsrs: false, đúng quizType + kỹ năng context', () => {
  const def = SK.EXERCISES['practice-order-sentence'];
  assert.ok(def);
  assert.strictEqual(def.fsrs, false, 'không phải lượt FSRS');
  assert.strictEqual(def.quizType, 'order-sentence');
  assert.strictEqual(def.skill, 'context');
  const ex = SK.resolveExercise('practice-order-sentence', 'order-sentence');
  assert.ok(ex && ex.fsrs === false);
  assert.strictEqual(SK.resolveExercise('practice-order-sentence', 'hz2vi'), null, 'nhãn phải khớp chiều câu hỏi thật');
  assert.ok(SK.PRACTICE_SOURCES.includes('extra') && SK.PRACTICE_SOURCES.includes('mode'));
});

test('CÔ LẬP FSRS: không nhãn bài nào của sắp xếp câu bật fsrs; câu hỏi không mang exerciseFsrs', () => {
  for (const [k, v] of Object.entries(SK.EXERCISES)) {
    if (v.quizType === 'order-sentence') assert.strictEqual(v.fsrs, false, k + ' không được đi đường FSRS');
  }
  const q = QE.build('orderSentence', W('苹果'), ctx({}, 7));
  assert.ok(q);
  assert.strictEqual(q.exerciseFsrs, null);
  assert.strictEqual(q.practiceOnly, undefined);
  // Server chặn nhãn FSRS ở route luyện bổ sung (resolveExercise(exerciseType, null) rồi `ex.fsrs` → từ chối).
  assert.ok(SK.resolveExercise('practice-order-sentence', null).fsrs === false);
});

test('server: route /api/skills/practice chấm sắp xếp câu từ CÂU THẬT, không tin client', () => {
  const api = fs.readFileSync(path.join(ROOT, 'api/index.js'), 'utf8');
  assert.ok(api.includes("require('../js/order-sentence')"));
  assert.ok(api.includes("require('../js/sentences-data')"));
  assert.ok(/ex\.quizType === 'order-sentence'/.test(api), 'có nhánh chấm riêng');
  assert.ok(api.includes('orderSentence.fromSentences(word, PROGRAM_SENTENCES)') && api.includes('orderSentence.fromExamples(word, examples)'));
  assert.ok(api.includes('candidates.find(zh => orderSentence.isOrderCorrect(zh, submitted))'));
  assert.ok(api.includes('wrongAnswer = null;'), 'không lưu cả câu làm "đáp án sai" cho dạng trắc nghiệm sau này');
  // Chấm phải nằm TRONG route luyện bổ sung (không đụng route FSRS).
  const practiceRoute = api.slice(api.indexOf("app.post('/api/skills/practice'"));
  assert.ok(practiceRoute.slice(0, practiceRoute.indexOf('app.get', 1000)).includes("ex.quizType === 'order-sentence'"));
});

test('server: MIN_EXAMPLES_PER_WORD = 3 (mỗi từ được bù đủ 3 câu ví dụ như yêu cầu)', () => {
  const api = fs.readFileSync(path.join(ROOT, 'api/index.js'), 'utf8');
  assert.ok(/const MIN_EXAMPLES_PER_WORD = 3;/.test(api));
});

test('lib/db: có getWordExamplesForWord (tra ví dụ theo ĐÚNG một từ, không theo cả bài)', () => {
  const db = fs.readFileSync(path.join(ROOT, 'lib/db.js'), 'utf8');
  assert.ok(/async function getWordExamplesForWord\(hz\)/.test(db));
  assert.ok(/WHERE hz = \$1/.test(db));
  assert.ok(/getWordExamplesForWord,/.test(db), 'phải được export');
  const api = fs.readFileSync(path.join(ROOT, 'api/index.js'), 'utf8');
  assert.ok(/getWordExamplesForWord/.test(api.slice(0, 4000)) || api.includes('getWordExamplesForWord(hz)'));
});

// ────────────────────────────────────────────────────
test('js/data.js không còn khai báo SENTENCES; index.html nạp sentences-data.js TRƯỚC data.js', () => {
  const data = fs.readFileSync(path.join(ROOT, 'js/data.js'), 'utf8');
  assert.ok(!/const SENTENCES\s*=/.test(data) && !/var SENTENCES\s*=/.test(data), 'SENTENCES đã chuyển sang file riêng');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const iSen = html.indexOf('/js/sentences-data.js');
  const iOS = html.indexOf('/js/order-sentence.js');
  const iUI = html.indexOf('/js/order-sentence-ui.js');
  const iData = html.indexOf('/js/data.js');
  assert.ok(iSen > 0 && iOS > 0 && iUI > 0 && iData > 0, 'đủ 3 file mới + data.js');
  assert.ok(iSen < iData && iOS < iData, 'nạp TRƯỚC data.js (data.js không còn tự khai báo SENTENCES)');
  assert.strictEqual(SENTENCES.length, 26, 'giữ nguyên 26 câu giáo trình');
  assert.ok(SENTENCES.every(s => s.vi && s.hz && s.hint && Number.isFinite(s.l)));
});

test('giao diện: Hôm nay học + Phân tích + Cài đặt đều nối tới sắp xếp câu; luyện bổ sung không gửi route FSRS', () => {
  const review = fs.readFileSync(path.join(ROOT, 'js/review.js'), 'utf8');
  assert.ok(/RV_PRACTICE_TYPES = \[[^\]]*'order'/.test(review), "'order' là bài luyện bổ sung");
  assert.ok(/function rvInsertOrderSentence\(/.test(review));
  assert.ok(/rvInsertOrderSentence\(ex\.items\)/.test(review), 'được chèn vào buổi Hôm nay học');
  assert.ok(/OS_UI\.playBind\(host, rvQuestion/.test(review), 'màn học nối ô chữ');
  assert.ok(/function rvSubmitOrder\(/.test(review));
  assert.ok(/submitSkillPractice\(\{ word: w, exerciseType: q\.exercisePractice, selectedAnswer: joined/.test(review));
  assert.ok(/function rvOrderPerSession\(/.test(review) && /orderSentencePerSession/.test(review));
  assert.ok(/it\.type !== 'order' && it\.type !== 'tone' && !ok/.test(review), 'câu sắp xếp câu / thanh điệu không bị xếp lại hàng đợi');

  const ui = fs.readFileSync(path.join(ROOT, 'js/skills-ui.js'), 'utf8');
  assert.ok(ui.includes("skStartPractice('ordersentence')"), 'có nút ở Phân tích');
  assert.ok(/ordersentence: QE\.ORDER_ORDER\.slice\(\)/.test(ui), 'bị ép đúng dạng, không tự đổi');
  assert.ok(/function skSubmitOrder\(/.test(ui) && /q\.order/.test(ui));

  const lesson = fs.readFileSync(path.join(ROOT, 'js/lesson.js'), 'utf8');
  assert.ok(lesson.includes("skStartPractice('ordersentence')"), 'có nút ở Hôm nay học');
  assert.ok(/rvSetOrderPerSession\(this\.value\)/.test(lesson), 'có ô chọn số câu mỗi buổi');
  assert.ok(/\[0,1,2,3,4,5\]\.map/.test(lesson), 'giới hạn 0–5');

  const auth = fs.readFileSync(path.join(ROOT, 'js/auth.js'), 'utf8');
  assert.ok(/orderSentencePerSession: 2/.test(auth), 'mặc định 2 câu');
  assert.ok(/Math\.max\(0, Math\.min\(5, Math\.round\(p\.ui\.orderSentencePerSession\)\)\)/.test(auth), 'chuẩn hoá 0–5');
});

test('rvInsertOrderSentence: chèn rải rác, không vượt số cấu hình, không lặp từ, tắt = 0', () => {
  const review = fs.readFileSync(path.join(ROOT, 'js/review.js'), 'utf8');
  const src = review.slice(review.indexOf('function rvInsertOrderSentence('), review.indexOf('// Bài hiện tại của màn bắt đầu'));
  // Chạy hàm thật trong sandbox tối thiểu (chỉ phụ thuộc QE/OS/rvIsOfficial/rvOrderPerSession/rvQCtx).
  const vm = require('vm');
  const sandbox = { QUANT: 0, QE, OS, progressState: { ui: { orderSentencePerSession: 2 } } };
  vm.createContext(sandbox);
  vm.runInContext('const SENTENCES = ' + JSON.stringify(SENTENCES) + ';', sandbox);
  vm.runInContext('function rvIsOfficial(it){return !!it && (it.type === "review" || it.type === "new");}', sandbox);
  vm.runInContext('function rvQCtx(){return { pool: ' + JSON.stringify(POOL) + ', examples: [], sentences: SENTENCES, audioOk: true }; }', sandbox);
  // Dùng CHÍNH hàm đọc cấu hình của review.js (không chép lại logic) để test bám đúng mã thật.
  const perSrc = review.slice(review.indexOf('function rvOrderPerSession()'), review.indexOf('function rvSetOrderPerSession('));
  vm.runInContext(perSrc, sandbox);
  vm.runInContext(src, sandbox);
  const mk = () => POOL.slice(0, 6).map(w => ({ type: 'review', word: w }));
  const items = mk();

  const out2 = sandbox.rvInsertOrderSentence(items.slice());
  assert.strictEqual(out2.filter(i => i.type === 'order').length, 2, 'mặc định 2 câu');
  assert.strictEqual(items.filter(i => i.type === 'order').length, 0, 'không sửa mảng gốc');
  const pos = out2.map((it, i) => (it.type === 'order' ? i : -1)).filter(i => i >= 0);
  assert.ok(pos.length === 2 && pos[0] < pos[1], 'chèn theo thứ tự tăng dần');
  assert.ok(pos[0] >= 1 && pos[1] < out2.length, 'nằm trong buổi, không đứng đầu');
  const hzs = out2.filter(i => i.type === 'order').map(i => i.word.hz);
  assert.strictEqual(new Set(hzs).size, hzs.length, 'không lặp cùng một từ');
  assert.ok(hzs.every(h => QE.build('orderSentence', W(h), ctx({}, 2))), 'mỗi câu dùng được câu thật');

  sandbox.progressState.ui.orderSentencePerSession = 0;
  assert.strictEqual(sandbox.rvInsertOrderSentence(mk()).filter(i => i.type === 'order').length, 0, '0 = tắt');
  sandbox.progressState.ui.orderSentencePerSession = 9;
  assert.ok(sandbox.rvInsertOrderSentence(mk().concat(mk())).filter(i => i.type === 'order').length <= 5, 'trần 5 câu');
});

test('sắp xếp câu không xuất hiện trong đề chính thức: mọi item "order" đều practiceOnly', () => {
  const review = fs.readFileSync(path.join(ROOT, 'js/review.js'), 'utf8');
  const insert = review.slice(review.indexOf('function rvInsertOrderSentence('), review.indexOf('// Bài hiện tại của màn bắt đầu'));
  assert.ok(insert.includes("{ type: 'order'"), "item được chèn dưới type 'order'");
  assert.ok(!/type: 'review'|type: 'new'/.test(insert), 'không tạo thẻ FSRS');
  const q = QE.build('orderSentence', W('米饭'), ctx({}, 4));
  assert.ok(q && QE.validate(q).ok);
  assert.ok(!QE.TYPES.orderSentence.exerciseFsrs, 'không có nhãn FSRS để server ghi lịch');
});

runAll();
