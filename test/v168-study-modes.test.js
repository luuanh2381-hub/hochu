#!/usr/bin/env node
// test/v168-study-modes.test.js — V168: CHẾ ĐỘ HỌC ở "Hôm nay học" (Cơ bản / Nghe nhiều / Dịch nghe / Dịch đọc / Nhớ chữ Hán / Tổng hợp).
//
// Khoá các cam kết thiết kế:
//   1. MỌI dạng trong MỌI chế độ là dạng CHÍNH THỨC (có nhãn FSRS khớp lib/skills, không practiceOnly) và KHÔNG phải câu gõ bàn phím.
//   2. Chế độ chỉ đổi DẠNG ĐỀ: bộ chọn (QS.choose) chỉ ra dạng thuộc chế độ; không có âm thanh → chế độ nghe bị khoá/bỏ dạng nghe.
//   3. Cách chấm không đổi: server vẫn nhận nhãn exerciseFsrs của dạng đề (tự tra đáp án, không tin client).
//   4. Nối dây: index.html nạp study-modes.js trước study-workspace.js/review.js; cài đặt có hàng "Chế độ học"; màn bắt đầu có bộ chọn.
// KHÔNG cần Postgres, KHÔNG gọi mạng.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

global.QE = require('../js/question-engine.js');
const QE = global.QE;
global.SS = require('../js/skill-score.js');
const QS = require('../js/question-selector.js');
const SMODE = require('../js/study-modes.js');
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

// ── Dữ liệu thu nhỏ ─────────────────────────────────────────────────────────────────────────
const W = { hz: '学习', py: 'xué xí', vi: 'học tập', l: 1 };
const POOL = [
  W,
  { hz: '公园', py: 'gōng yuán', vi: 'công viên', l: 1 },
  { hz: '音乐', py: 'yīn yuè', vi: 'âm nhạc', l: 1 },
  { hz: '下雨', py: 'xià yǔ', vi: 'mưa', l: 1 },
  { hz: '喜欢', py: 'xǐ huan', vi: 'thích', l: 1 },
];
const EXAMPLES = [
  { hz: '学习', zh: '我每天学习汉语。', vi: 'Tôi học tiếng Trung mỗi ngày.', py: 'Wǒ měitiān xuéxí Hànyǔ.' },
  { hz: '学习', zh: '他在学校学习很认真。', vi: 'Cậu ấy học rất nghiêm túc ở trường.' },
];
const SENTENCES = [
  { hz: '我们去公园散步。', vi: 'Chúng tôi đi dạo trong công viên.', hint: '公园' },
  { hz: '妈妈做的菜很好吃。', vi: 'Món ăn mẹ nấu rất ngon.', hint: '菜' },
  { hz: '明天可能会下雨。', vi: 'Ngày mai có thể sẽ mưa.', hint: '下雨' },
  { hz: '他喜欢听音乐。', vi: 'Anh ấy thích nghe nhạc.', hint: '音乐' },
];
function lcg(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
const qctx = (extra) => Object.assign({ pool: POOL, examples: EXAMPLES, sentences: SENTENCES, audioOk: true, rand: lcg(11) }, extra || {});

const MODE_IDS = ['mix', 'basic', 'listen', 'translateListen', 'translateRead', 'recall'];

// ── 1. Cam kết "thẻ chính thức, không gõ bàn phím" ──────────────────────────────────────────
test('danh sách chế độ: đủ 6 chế độ, id duy nhất, mặc định = Tổng hợp, mỗi chế độ có nhãn + mô tả', () => {
  assert.deepStrictEqual(SMODE.list().map((m) => m.id), MODE_IDS);
  assert.strictEqual(SMODE.DEFAULT_ID, 'mix');
  for (const m of SMODE.list()) { assert.ok(m.label && m.short && m.icon && m.desc, 'thiếu nhãn/mô tả: ' + m.id); }
});

test('MỌI dạng của MỌI chế độ là dạng CHÍNH THỨC: tồn tại, có nhãn FSRS khớp lib/skills, không practiceOnly, không gõ bàn phím', () => {
  for (const m of SMODE.list()) {
    if (!m.types) { assert.strictEqual(m.id, 'mix'); continue; }
    assert.ok(m.types.length >= 3, m.id + ': cần đủ dạng để luân phiên');
    for (const t of m.types) {
      const T = QE.TYPES[t];
      assert.ok(T, m.id + ': dạng không tồn tại ' + t);
      assert.ok(T.exerciseFsrs, m.id + '/' + t + ': thiếu nhãn FSRS');
      assert.ok(!T.practiceOnly, m.id + '/' + t + ': là dạng luyện bổ sung (không phải thẻ chính thức)');
      assert.ok(!T.typed, m.id + '/' + t + ': là dạng GÕ bàn phím');
      const r = SK.resolveExercise(T.exerciseFsrs, T.quizType);
      assert.ok(r && r.fsrs === true, m.id + '/' + t + ': server không nhận nhãn ' + T.exerciseFsrs + ' là FSRS chính thức');
    }
  }
});

test('mọi dạng chế độ đều nằm trong tập dạng chính thức không-gõ (QE.TYPES có nhãn FSRS, không practiceOnly, không typed)', () => {
  const official = Object.values(QE.TYPES).filter((T) => T.exerciseFsrs && !T.practiceOnly && !T.typed).map((T) => T.id);
  const used = new Set(); SMODE.list().forEach((m) => (m.types || []).forEach((t) => used.add(t)));
  for (const t of used) assert.ok(official.includes(t), t);
  assert.ok(used.size >= 8, 'các chế độ phải phủ phần lớn 11 dạng chính thức không-gõ');
});

test('AUDIO_TYPES khớp QE.TYPES[t].needsAudio (không lệch giữa module chế độ và engine)', () => {
  const used = new Set(); SMODE.list().forEach((m) => (m.types || []).forEach((t) => used.add(t)));
  for (const t of SMODE.AUDIO_TYPES) assert.ok(QE.TYPES[t] && QE.TYPES[t].needsAudio, t + ' không cần âm thanh theo engine');
  for (const t of used) assert.strictEqual(SMODE.AUDIO_TYPES.includes(t), !!QE.TYPES[t].needsAudio, 'lệch âm thanh: ' + t);
});

test('cờ needsAudio của chế độ đúng: chỉ chế độ nào CHỈ gồm dạng nghe mới cần giọng đọc', () => {
  for (const m of SMODE.list()) {
    if (!m.types) continue;
    const allAudio = m.types.every((t) => SMODE.AUDIO_TYPES.includes(t));
    assert.strictEqual(!!m.needsAudio, allAudio, m.id);
  }
  assert.strictEqual(SMODE.get('listen').needsAudio, true);
  assert.strictEqual(SMODE.get('translateListen').needsAudio, true);
  assert.strictEqual(SMODE.get('basic').needsAudio, false);
});

// ── 2. API thuần ────────────────────────────────────────────────────────────────────────────
test('normalize/get: id lạ, rỗng, null → Tổng hợp (không ném lỗi, không làm hỏng tuỳ chọn cũ đã lưu)', () => {
  for (const bad of [undefined, null, '', 'zzz', 42, {}, 'typing', 'MIX']) assert.strictEqual(SMODE.normalize(bad), 'mix');
  for (const id of MODE_IDS) assert.strictEqual(SMODE.normalize(id), id);
  assert.strictEqual(SMODE.get('zzz').id, 'mix');
});

test('available: chế độ nghe bị khoá khi KHÔNG có giọng đọc, các chế độ khác luôn dùng được', () => {
  assert.strictEqual(SMODE.available('listen', false), false);
  assert.strictEqual(SMODE.available('translateListen', false), false);
  assert.strictEqual(SMODE.available('listen', true), true);
  for (const id of ['mix', 'basic', 'translateRead', 'recall']) assert.strictEqual(SMODE.available(id, false), true, id);
});

test('typesFor: mix → [] (không giới hạn); bỏ dạng nghe khi không có giọng; bỏ dạng người học đặt "Tắt" (mix=0)', () => {
  assert.deepStrictEqual(SMODE.typesFor('mix', { audioOk: true }), []);
  assert.deepStrictEqual(SMODE.typesFor('basic', { audioOk: false }), ['hz2vi', 'vi2hz', 'hz2py', 'cloze']);
  assert.deepStrictEqual(SMODE.typesFor('recall', { audioOk: false }), ['vi2hz', 'cloze']);
  assert.deepStrictEqual(SMODE.typesFor('listen', { audioOk: false }), []);
  assert.deepStrictEqual(SMODE.typesFor('recall', { audioOk: true }), ['vi2hz', 'listen2hz', 'cloze']);
  assert.deepStrictEqual(SMODE.typesFor('basic', { audioOk: true, mix: { hz2py: 0 } }), ['hz2vi', 'vi2hz', 'cloze']);
  assert.deepStrictEqual(SMODE.typesFor('basic', { audioOk: true, mix: { hz2py: 0.5, cloze: 2 } }), ['hz2vi', 'vi2hz', 'hz2py', 'cloze']);
  for (const id of MODE_IDS) { for (const t of SMODE.typesFor(id, { audioOk: true })) assert.ok(!QE.TYPES[t].typed && !QE.TYPES[t].practiceOnly, id + '/' + t); }
});

test('mixFor: giữ tỷ lệ người học đã đặt, nhân trọng số của chế độ; không sửa đối tượng gốc', () => {
  const user = { listenSent2vi: 1.5, hz2vi: 0 };
  const out = SMODE.mixFor('translateListen', user);
  assert.strictEqual(out.listenSent2vi, 1.5 * 2);
  assert.strictEqual(out.listenSent2zh, 1);
  assert.strictEqual(out.listen2vi, 0.5);
  assert.strictEqual(out.hz2vi, 0, 'tỷ lệ khác của người học vẫn giữ');
  assert.deepStrictEqual(user, { listenSent2vi: 1.5, hz2vi: 0 }, 'không sửa tham số vào');
  assert.deepStrictEqual(SMODE.mixFor('basic', { a: 1 }), { a: 1 });
  assert.deepStrictEqual(SMODE.mixFor('mix', null), {});
});

// ── 3. Bộ chọn thật chỉ ra dạng của chế độ ───────────────────────────────────────────────────
test('QS.choose (fsrsOnly + only = dạng chế độ): mọi câu thuộc chế độ, có nhãn FSRS, KHÔNG gõ bàn phím — qua nhiều hạt giống', () => {
  for (const id of MODE_IDS) {
    if (id === 'mix') continue;
    const types = SMODE.typesFor(id, { audioOk: true });
    let built = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const q = QS.choose(W, qctx({ rand: lcg(seed) }), { fsrsOnly: true, only: types, allowTyped: true, mix: SMODE.mixFor(id, {}) });
      if (!q) continue;
      built++;
      assert.ok(types.includes(q.typeId || q.type), id + ': ra dạng ngoài chế độ: ' + (q.typeId || q.type));
      assert.ok(q.exerciseFsrs, id + ': câu không có nhãn FSRS');
      assert.ok(!q.typed, id + ': ra câu gõ bàn phím');
      assert.ok(!q.practiceOnly, id + ': ra câu luyện bổ sung');
    }
    assert.ok(built >= 30, id + ': phải dựng được hầu hết các lần (dựng ' + built + '/40)');
  }
});

test('trong 1 buổi (có QS.record để luân phiên): mỗi chế độ ra ≥ 2 dạng khác nhau và vẫn chỉ trong chế độ', () => {
  for (const id of ['basic', 'listen', 'translateRead', 'recall']) {
    const types = SMODE.typesFor(id, { audioOk: true });
    const session = QS.newSession(); const seen = new Set();
    for (let i = 1; i <= 24; i++) {
      const q = QS.choose(W, qctx({ rand: lcg(100 + i) }), { fsrsOnly: true, only: types, session, mix: SMODE.mixFor(id, {}) });
      assert.ok(q, id + ' lần ' + i);
      assert.ok(types.includes(q.typeId || q.type), id + ': ngoài chế độ ' + (q.typeId || q.type));
      seen.add(q.typeId || q.type);
      QS.record(session, q);
    }
    assert.ok(seen.size >= 2, id + ': chỉ ra 1 dạng: ' + [...seen]);
  }
});

test('"Dịch nghe": trọng số nghiêng về "Nghe câu → Nghĩa" (nhiều hơn "Nghe → Nghĩa" từ đơn)', () => {
  const types = SMODE.typesFor('translateListen', { audioOk: true });
  const session = QS.newSession(); const count = {};
  for (let i = 1; i <= 60; i++) {
    const q = QS.choose(W, qctx({ rand: lcg(500 + i) }), { fsrsOnly: true, only: types, session, mix: SMODE.mixFor('translateListen', {}) });
    assert.ok(q); const t = q.typeId || q.type; count[t] = (count[t] || 0) + 1; QS.record(session, q);
  }
  assert.ok((count.listenSent2vi || 0) > (count.listen2vi || 0), JSON.stringify(count));
});

test('đề của chế độ nghe: không hiện chữ trong đề (chỉ âm thanh); chế độ nghe không dựng được khi không có giọng đọc', () => {
  const types = SMODE.typesFor('listen', { audioOk: true });
  for (let seed = 1; seed <= 20; seed++) {
    const q = QS.choose(W, qctx({ rand: lcg(seed) }), { fsrsOnly: true, only: types, mix: {} });
    assert.ok(q); assert.strictEqual(q.prompt.kind, 'audio', 'đề nghe phải là âm thanh');
  }
  assert.deepStrictEqual(SMODE.typesFor('listen', { audioOk: false }), []);
  // engine cũng tự từ chối khi ctx.audioOk=false (lớp bảo vệ thứ hai)
  for (const t of SMODE.AUDIO_TYPES) assert.strictEqual(QE.build(t, W, qctx({ audioOk: false })), null, t);
});

test('chế độ toàn câu mà từ CHƯA có câu ví dụ: bộ chọn trả null (không bịa) → review.js rơi về cách chọn mặc định, không bỏ thẻ', () => {
  const bare = { hz: '桌子', py: 'zhuō zi', vi: 'cái bàn', l: 2 };
  const types = SMODE.typesFor('translateRead', { audioOk: true }).filter((t) => t !== 'cloze');
  const q = QS.choose(bare, qctx({ examples: [], sentences: [] }), { fsrsOnly: true, only: types, mix: {} });
  assert.strictEqual(q, null);
});

// ── 4. review.js: hành vi thật trong vm (không DOM thật) ─────────────────────────────────────
function makeEnv(prefsMode, audio) {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ex = POOL.map((w) => ({ hz: w.hz, zh: '我昨天买了' + w.hz + '。', vi: 'Câu ví dụ cho ' + w.hz }));
  const calls = { render: 0, prefs: [] };
  const ctx = {
    console, Math, Date, JSON, Set, Map, Array, Object, String, Number, Promise, Error, setTimeout: () => 0, clearInterval() {}, setInterval: () => 0, clearTimeout() {},
    document: { createElement: () => ({ style: {}, appendChild() {}, set textContent(v) {} }), head: { appendChild() {} }, getElementById: () => null, querySelectorAll: () => [] },
    localStorage: { _m: {}, getItem(k) { return k in this._m ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); } },
    performance: { now: () => 0 }, WORDS: POOL, GUEST_MAX_LESSON: 99, isLoggedIn: () => true, isGuest: false, authToken: 't', authHeaders: () => ({}),
    SENTENCES, CONFUSE_GROUPS: [], showPinyin: true, showMeaning: true, isAdminRole: () => false, currentTab: 'review',
    escapeHtml: esc, escapeJsAttr: (s) => String(s).replace(/'/g, "\\'"), lessonName: (l) => 'Bài ' + l, renderHanziParts: () => '', wnBlockHtml: () => '', lessonsLabel: () => 'Bài 1',
    skillAudioAvailable: () => !!audio, vtMarkStart() {}, vtHiddenMs: () => 0, render() { calls.render++; }, speak() {}, playDing() {}, playBuzz() {},
    sqCreate: () => ({ items: [], doneHz: new Set(), totalPlanned: 0, answeredCount: 0, sessionId: 'sess-1234567', startTime: null, endTime: null, completedCards: [], lessonFilter: null, dayKey: null }),
    sqSnapshotLessonFilter: () => ({}), sqReadPersisted: () => null, sqPersist() {}, sqClearPersisted() {}, ssArchiveSession() {}, refreshServerMeta() {},
    sessionKnownHz: new Set(), saveSessionKnownHz() {}, sqPurgeHzFromAllQueues() {}, sqLessonFilterMatches: () => true, REPEAT_GAP: 3,
    genIdempotencyKey: () => 'k-123456789', todayKey: () => '2026-11-17', goTab() {}, alert() {}, SUBMIT_REVIEW_MAX_WAIT_MS: 1000,
    submitFsrsReviewAwaited: async () => ({ ok: true }), submitSkillPractice: async () => ({ ok: true }),
    fetch: async () => ({ json: async () => ({ ok: true }) }),
    swSetPref(k, v) { calls.prefs.push([k, v]); ctx.swPrefs = Object.assign({}, ctx.swPrefs, { [k]: v }); },
  };
  ctx.swPrefs = prefsMode === undefined ? undefined : { mode: prefsMode };
  vm.createContext(ctx);
  for (const f of ['js/answer-match.js', 'js/skill-score.js', 'js/session-summary.js', 'js/question-engine.js', 'js/question-selector.js', 'js/study-modes.js', 'js/review.js']) vm.runInContext(read(f), ctx);
  vm.runInContext(`rvExamplePool = ${JSON.stringify(ex)};`, ctx);
  ctx.__calls = calls;
  return ctx;
}
const R = (ctx, code) => vm.runInContext(code, ctx);

test('review.js · rvStudyMode: đọc từ cài đặt; id lạ/thiếu cài đặt → mix; chế độ nghe + KHÔNG có giọng đọc → tự về mix', () => {
  assert.strictEqual(R(makeEnv('basic', true), 'rvStudyMode()'), 'basic');
  assert.strictEqual(R(makeEnv('zzz', true), 'rvStudyMode()'), 'mix');
  assert.strictEqual(R(makeEnv(undefined, true), 'rvStudyMode()'), 'mix');
  assert.strictEqual(R(makeEnv('listen', true), 'rvStudyMode()'), 'listen');
  assert.strictEqual(R(makeEnv('listen', false), 'rvStudyMode()'), 'mix');
  assert.strictEqual(R(makeEnv('translateListen', false), 'rvStudyMode()'), 'mix');
  assert.strictEqual(R(makeEnv('recall', false), 'rvStudyMode()'), 'recall');
});

test('review.js · thẻ CHÍNH THỨC (review/new) trong từng chế độ chỉ ra dạng của chế độ, có nhãn FSRS, không gõ', () => {
  for (const id of ['basic', 'listen', 'translateListen', 'translateRead', 'recall']) {
    const ctx = makeEnv(id, true);
    const types = SMODE.typesFor(id, { audioOk: true });
    for (const itemType of ['review', 'new']) {
      for (const w of POOL) {
        const q = R(ctx, `rvBuildQuestionFor(${JSON.stringify({ type: itemType, word: w })})`);
        assert.ok(q, `${id}/${itemType}/${w.hz}: phải dựng được câu`);
        assert.ok(types.includes(q.typeId || q.type), `${id}/${itemType}/${w.hz}: ngoài chế độ → ${q.typeId || q.type}`);
        assert.ok(q.exerciseFsrs && !q.typed && !q.practiceOnly, `${id}/${w.hz}: phải là câu chính thức, không gõ`);
      }
    }
  }
});

test('review.js · chế độ "Tổng hợp" giữ NGUYÊN cách chọn cũ: toàn câu hỏi theo câu hoặc dạng từ đơn dự phòng chính thức', () => {
  const ctx = makeEnv('mix', true);
  const allowed = new Set(QE.SENTENCE_ORDER.concat(QE.WORD_FALLBACK_ORDER || []));
  for (const w of POOL) {
    const q = R(ctx, `rvBuildQuestionFor(${JSON.stringify({ type: 'review', word: w })})`);
    assert.ok(q && allowed.has(q.typeId || q.type), String(q && (q.typeId || q.type)));
    assert.ok(q.exerciseFsrs);
  }
});

test('review.js · câu LUYỆN THÊM (extra/redo) trong chế độ vẫn theo chế độ, và vẫn là luyện bổ sung (item.type=extra → đường practice)', () => {
  for (const id of ['basic', 'translateRead', 'recall']) {
    const ctx = makeEnv(id, true);
    const types = SMODE.typesFor(id, { audioOk: true });
    for (const itemType of ['extra', 'redo']) {
      const q = R(ctx, `rvBuildQuestionFor(${JSON.stringify({ type: itemType, word: W, failedTypes: [] })})`);
      assert.ok(q, `${id}/${itemType}`);
      assert.ok(types.includes(q.typeId || q.type), `${id}/${itemType}: ngoài chế độ → ${q.typeId || q.type}`);
      assert.ok(q.exercisePractice, 'phải có nhãn luyện bổ sung để ghi vào skill_practice_log');
    }
  }
  // dạng vừa làm sai (failedTypes) bị loại khỏi câu sửa lỗi nếu còn dạng khác trong chế độ
  const ctx = makeEnv('basic', true);
  const q = R(ctx, `rvBuildQuestionFor(${JSON.stringify({ type: 'redo', word: W, failedTypes: ['hz2vi'] })})`);
  assert.ok(q && (q.typeId || q.type) !== 'hz2vi');
});

test('review.js · extra theo kỹ năng yếu: chế độ có dạng thuộc kỹ năng đó thì ưu tiên kỹ năng đó', () => {
  const ctx = makeEnv('recall', true); // vi2hz / listen2hz / cloze → có 'listening' (listen2hz) và 'recall' (vi2hz)
  for (let i = 0; i < 8; i++) {
    const q = R(ctx, `rvBuildQuestionFor(${JSON.stringify({ type: 'extra', word: W, targetSkill: 'listening', failedTypes: [] })})`);
    assert.ok(q); assert.strictEqual(q.skill, 'listening', 'phải đúng kỹ năng nghe đang yếu');
    assert.strictEqual(q.typeId || q.type, 'listen2hz');
  }
});

test('review.js · chế độ không dựng được (vd Dịch đọc nhưng từ chưa có câu) → rơi về cách chọn mặc định, KHÔNG ném lỗi', () => {
  const ctx = makeEnv('translateRead', true);
  R(ctx, 'rvExamplePool = [];');
  const bare = { hz: '桌子', py: 'zhuō zi', vi: 'cái bàn', l: 2 };
  assert.doesNotThrow(() => R(ctx, `rvBuildQuestionFor(${JSON.stringify({ type: 'review', word: bare })})`));
});

test('review.js · rvSetMode: lưu qua swSetPref rồi vẽ lại; id lạ bị bỏ qua; chế độ nghe bị chặn khi không có giọng đọc', () => {
  const ctx = makeEnv('mix', true);
  R(ctx, "rvSetMode('basic')");
  assert.deepStrictEqual(ctx.__calls.prefs, [['mode', 'basic']]); assert.strictEqual(ctx.__calls.render, 1);
  R(ctx, "rvSetMode('zzz')");
  assert.deepStrictEqual(ctx.__calls.prefs.pop(), ['mode', 'mix']); // chuẩn hoá về mix, không lưu id lạ
  const noAudio = makeEnv('mix', false);
  R(noAudio, "rvSetMode('listen')");
  assert.deepStrictEqual(noAudio.__calls.prefs, [], 'không có giọng đọc → không lưu chế độ nghe');
  assert.strictEqual(noAudio.__calls.render, 0);
});

test('review.js · rvModePickerHtml: đủ 6 thẻ, thẻ đang chọn có aria-pressed, chế độ nghe bị vô hiệu + giải thích khi không có giọng đọc', () => {
  const on = R(makeEnv('basic', true), 'rvModePickerHtml()');
  assert.strictEqual((on.match(/<button[^>]*class="rv-mode(?: on)?"/g) || []).length, 6);
  assert.ok(/class="rv-mode on"[^>]*aria-pressed="true"[^>]*onclick="rvSetMode\('basic'\)"/.test(on.replace(/\s+/g, ' ')) || /rv-mode on/.test(on));
  assert.ok(!/disabled/.test(on), 'có giọng đọc → không khoá chế độ nào');
  assert.ok(/thẻ chính thức/.test(on), 'nói rõ mọi câu là thẻ chính thức tính vào FSRS');
  const off = R(makeEnv('listen', false), 'rvModePickerHtml()');
  assert.strictEqual((off.match(/disabled/g) || []).length, 2, 'khoá đúng 2 chế độ nghe (Nghe nhiều, Dịch nghe)');
  assert.ok(/chưa có giọng đọc/.test(off));
  assert.ok(/rv-mode on/.test(off) && /onclick="rvSetMode\('mix'\)"/.test(off));
  assert.ok(!/rv-mode on[^>]*onclick="rvSetMode\('listen'\)"/.test(off), 'không đánh dấu chế độ nghe đang chọn khi nó bị khoá');
});

// ── 5. Nối dây (static) ─────────────────────────────────────────────────────────────────────
test('index.html nạp study-modes.js SAU question-selector và TRƯỚC study-workspace.js + review.js (swPrefs đọc SMODE lúc nạp)', () => {
  const idx = read('index.html');
  const pos = (f) => idx.indexOf('/js/' + f);
  assert.ok(pos('study-modes.js') > 0, 'chưa nạp study-modes.js');
  assert.ok(pos('question-selector.js') < pos('study-modes.js'));
  assert.ok(pos('study-modes.js') < pos('review.js'));
  assert.ok(pos('study-modes.js') < pos('study-workspace.js'));
});

test('KHÔNG trùng tên toàn cục giữa các script của index.html (const/let/class trùng → script sau không chạy; V168 từng trùng SM với session-summary.js)', () => {
  const idx = read('index.html');
  const files = [...idx.matchAll(/<script src="\/(js\/[^"?]+)/g)].map((m) => m[1]);
  assert.ok(files.includes('js/study-modes.js') && files.length > 20);
  const seen = {}; const dup = [];
  for (const f of files) {
    if (!fs.existsSync(path.join(ROOT, f))) continue;
    for (const m of read(f).matchAll(/^(?:const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      if (seen[m[1]] && seen[m[1]] !== f) dup.push(`${m[1]}: ${seen[m[1]]} & ${f}`);
      seen[m[1]] = f;
    }
  }
  assert.deepStrictEqual(dup, []);
  assert.strictEqual(seen.SMODE, 'js/study-modes.js');
  assert.strictEqual(seen.SM, 'js/session-summary.js', 'SM vẫn là session-summary — chế độ học KHÔNG được dùng tên này');
});

test('study-workspace.js: có tuỳ chọn mode (mặc định mix), chuẩn hoá qua SMODE, và hàng "Chế độ học" trong bảng cài đặt', () => {
  const sw = read('js/study-workspace.js');
  assert.ok(/mode: 'mix'/.test(sw), 'SW_DEFAULTS thiếu mode');
  assert.ok(/mode: \(typeof SMODE !== 'undefined'\) \? SMODE\.normalize\(r\.mode\)/.test(sw), 'swNormalizePrefs chưa chuẩn hoá mode');
  assert.ok(/swSegRow\('Chế độ học', 'mode'/.test(sw), 'thiếu hàng Chế độ học');
  // tuỳ chọn cũ đã lưu (không có mode) vẫn nạp được → mode = mix. Chỉ chạy phần THUẦN của file (khối hằng + swNormalizePrefs).
  const head = sw.slice(sw.indexOf('const SW_KEY'), sw.indexOf('function swLoadPrefs'));
  const ctx = { SMODE, console }; vm.createContext(ctx);
  vm.runInContext(head + '\nglobalThis.__n = swNormalizePrefs;', ctx);
  const n = ctx.__n;
  assert.strictEqual(n({ layout: 'focus', hz: 1.2 }).mode, 'mix');
  assert.strictEqual(n({ mode: 'listen' }).mode, 'listen');
  assert.strictEqual(n({ mode: 'typing' }).mode, 'mix', 'id lạ/đã bỏ (vd gõ bàn phím) → mix');
  assert.strictEqual(n(null).mode, 'mix');
  assert.strictEqual(n({ layout: 'focus', mode: 'basic' }).layout, 'focus', 'không làm hỏng tuỳ chọn khác');
});

test('review.js: màn bắt đầu có bộ chọn chế độ; không còn đường nào đưa câu gõ bàn phím vào chế độ; không đụng thứ tự thẻ đến hạn', () => {
  const rv = read('js/review.js');
  assert.ok(/\$\{rvModePickerHtml\(\)\}\s*\n\s*\$\{rvPlanHtml\(\)\}/.test(rv), 'bộ chọn chế độ chưa nằm ở màn bắt đầu');
  assert.ok(/function rvStudyMode\(\)/.test(rv) && /function rvSetMode\(/.test(rv) && /const modeQ = /.test(rv));
  const mq = rv.slice(rv.indexOf('const modeQ = '), rv.indexOf('const officialQ = '));
  assert.ok(!/allowTyped:\s*true|forced:\s*true|TYPED_ORDER|typeVi2hz|typeHz2py/.test(mq), 'modeQ không được mở đường cho câu gõ');
  assert.ok(/only: types/.test(mq) && /fsrsOnly: true/.test(mq), 'modeQ phải giới hạn dạng + fsrsOnly cho thẻ chính thức');
  // chế độ KHÔNG đụng hàng đợi/FSRS: study-modes.js thuần, không có fetch/DOM
  const sm = read('js/study-modes.js');
  assert.ok(!/\bwindow\b|\bdocument\b|\bfetch\(|localStorage/.test(sm.replace(/\/\/.*$/gm, '')), 'study-modes.js phải thuần');
});

runAll();
