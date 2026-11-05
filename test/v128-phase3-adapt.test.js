#!/usr/bin/env node
// test/v128-phase3-adapt.test.js — V128 giai đoạn 3: thích ứng NGAY TRONG BUỔI cho câu luyện thêm theo kế hoạch.
// Chạy: node test/v128-phase3-adapt.test.js   (không cần DB/ts-fsrs/express)
//
// Kiểm tra: (1) applyAnswer khớp cách đếm của server (lib/skill-pooled.learnerCounts) trên 300 chuỗi ngẫu nhiên; bất biến; (2) adaptExtras: làm tốt → bớt, sai liên tiếp →
// không dồn, mệt → bỏ hết câu theo kế hoạch, "hết tụt lại" theo số liệu vừa cập nhật; không bao giờ đụng thẻ chính thức/từ hay sai/thăm dò/câu hỏi lại; thuần và lặp lại
// được (khôi phục phiên giữa chừng ra cùng kết luận) (3) buổi học giả chạy NGUYÊN review.js (rvRecordAnswer → rvAdvanceQueue): bớt đúng chỗ, lưu phiên đã bớt,
// thông báo hiện 1 lần và được thoát HTML, thiếu module thì như V127 (4) ranh giới.
// KHÔNG thay cho thử trên trình duyệt thật.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let passed = 0, failed = 0; const pending = [];
const test = (n, f) => pending.push({ n, f });
const section = (t) => pending.push({ n: null, f: () => console.log('\n' + t) });
async function runAll() {
  for (const { n, f } of pending) {
    if (n === null) { f(); continue; }
    try { await f(); passed++; console.log('  ✅ ' + n); }
    catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); }
  }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
}

global.SS = require('../js/skill-score.js');
global.AM = require('../js/answer-match.js');
const QE = global.QE = require('../js/question-engine.js');
const QS = require('../js/question-selector.js');
const TP = require('../js/training-plan.js');
const P = require('../lib/skill-pooled.js');

const cell = (cn, cok, tn, tok) => ({ c: { n: cn, ok: cok }, t: { n: tn || 0, ok: tok || 0 }, rc: { n: 0, ok: 0 }, rt: { n: 0, ok: 0 } });
const L = (skills) => ({ v: 1, skills });
const clone = (x) => JSON.parse(JSON.stringify(x));
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const LISTEN_LAG = L({ recognition: cell(80, 72), recall: cell(60, 45), listening: cell(60, 30), pinyin: cell(50, 40), context: cell(5, 3) });

section('[1] applyAnswer — cập nhật số liệu cấp người học (khớp cách đếm của server)');
test('Trắc nghiệm vào c/rc, tự gõ vào t/rt; đúng cộng cả n và ok, sai chỉ cộng n', () => {
  let l = L({ listening: cell(10, 5, 2, 1) });
  l = TP.applyAnswer(l, { skill: 'listening', typed: false, correct: true });
  assert.deepStrictEqual(l.skills.listening, { c: { n: 11, ok: 6 }, t: { n: 2, ok: 1 }, rc: { n: 1, ok: 1 }, rt: { n: 0, ok: 0 } });
  l = TP.applyAnswer(l, { skill: 'listening', typed: true, correct: false });
  assert.deepStrictEqual(l.skills.listening, { c: { n: 11, ok: 6 }, t: { n: 3, ok: 1 }, rc: { n: 1, ok: 1 }, rt: { n: 1, ok: 0 } });
});
test('Bất biến: trả bản sao mới, KHÔNG sửa đối tượng cũ (kể cả kỹ năng khác dùng chung)', () => {
  const before = L({ listening: cell(10, 5), pinyin: cell(8, 4) }), snap = clone(before);
  const after = TP.applyAnswer(before, { skill: 'listening', typed: false, correct: true });
  assert.deepStrictEqual(before, snap); assert.notStrictEqual(after, before); assert.strictEqual(after.skills.pinyin, before.skills.pinyin);
  assert.notStrictEqual(after.skills.listening, before.skills.listening);
});
test('Không có số liệu (null) → giữ null (người mới không có cơ sở để so sánh); đầu vào lỗi → trả lại nguyên đối tượng', () => {
  assert.strictEqual(TP.applyAnswer(null, { skill: 'listening', correct: true }), null);
  assert.strictEqual(TP.applyAnswer(undefined, { skill: 'listening', correct: true }), undefined);
  const l = L({ listening: cell(10, 5) });
  for (const bad of [null, undefined, {}, { skill: '' }, { skill: 5 }]) assert.strictEqual(TP.applyAnswer(l, bad), l);
  for (const badL of [{}, { v: 1 }, { v: 1, skills: 'x' }, 'x', 5]) assert.strictEqual(TP.applyAnswer(badL, { skill: 'listening', correct: true }), badL);
});
test('Kỹ năng chưa có trong số liệu → tạo ô mới; trường thiếu/hỏng được coi là 0', () => {
  const a = TP.applyAnswer(L({}), { skill: 'pinyin', typed: false, correct: true });
  assert.deepStrictEqual(a.skills.pinyin, { c: { n: 1, ok: 1 }, t: { n: 0, ok: 0 }, rc: { n: 1, ok: 1 }, rt: { n: 0, ok: 0 } });
  const b = TP.applyAnswer(L({ pinyin: { c: { n: 'x', ok: NaN } } }), { skill: 'pinyin', typed: false, correct: false });
  assert.deepStrictEqual(b.skills.pinyin.c, { n: 1, ok: 0 });
});
test('KHỚP SERVER: 300 chuỗi câu trả lời ngẫu nhiên — gấp từng câu bằng applyAnswer == lib/skill-pooled.learnerCounts trên cùng dữ liệu (mọi dạng câu của app)', () => {
  const types = Object.values(QE.TYPES).filter(T => T.exercisePractice && P.exerciseInfo(T.exercisePractice));
  assert.ok(types.length >= 15, 'số dạng câu có trong bảng server: ' + types.length);
  const r = rng(1283);
  for (let t = 0; t < 300; t++) {
    const len = 1 + Math.floor(r() * 40), agg = {}; let l = L({});
    for (let i = 0; i < len; i++) {
      const T = types[Math.floor(r() * types.length)], correct = r() < 0.6;
      l = TP.applyAnswer(l, { skill: T.skill, typed: !!T.typed, correct });
      const a = agg[T.exercisePractice] || (agg[T.exercisePractice] = { exercise_type: T.exercisePractice, n: 0, correct: 0 }); a.n++; if (correct) a.correct++;
    }
    const rows = Object.values(agg);
    assert.deepStrictEqual(l, P.learnerCounts(rows, rows), 'chuỗi #' + t);
  }
});
test('Cộng dồn vào số liệu có sẵn khớp server: (số liệu cũ) + (câu mới) == learnerCounts(hàng cũ + hàng mới)', () => {
  const T = QE.TYPES.hz2vi, rowsOld = [{ exercise_type: T.exercisePractice, n: 40, correct: 25 }], rowsNew = [{ exercise_type: T.exercisePractice, n: 3, correct: 2 }];
  let l = P.learnerCounts(rowsOld, rowsOld.map(r => Object.assign({}, r, { n: 5, correct: 3 })));
  for (const ok of [true, true, false]) l = TP.applyAnswer(l, { skill: T.skill, typed: false, correct: ok });
  const want = P.learnerCounts([{ exercise_type: T.exercisePractice, n: 43, correct: 27 }], [{ exercise_type: T.exercisePractice, n: 8, correct: 5 }]);
  assert.deepStrictEqual(l, want);
});
test('Phân tích dùng được số liệu đã cập nhật: câu đúng/sai làm thay đổi kết luận "tụt lại" theo hướng đúng', () => {
  let l = clone(LISTEN_LAG); const gap0 = QS.learnerGap(l, 'listening').gap;
  for (let i = 0; i < 40; i++) l = TP.applyAnswer(l, { skill: 'listening', typed: false, correct: true });
  const g1 = QS.learnerGap(l, 'listening'); assert.ok(!g1 || g1.gap < gap0, 'làm tốt thì độ tụt phải giảm');
  let m = clone(LISTEN_LAG); for (let i = 0; i < 40; i++) m = TP.applyAnswer(m, { skill: 'listening', typed: false, correct: false });
  assert.ok(QS.learnerGap(m, 'listening').gap > gap0, 'làm kém thì độ tụt phải tăng');
});

section('[2] adaptExtras — các quy tắc thích ứng (thuần)');
const E = (hz, skill, o) => Object.assign({ type: 'extra', word: { hz }, targetSkill: skill || 'listening', fromPlan: true }, o || {});
const LG = (skill, correct, o) => Object.assign({ hz: 'x', skill, correct, official: false, source: 'extra', hinted: false, intro: false, plan: true }, o || {});
const ev = (log, items, learner) => TP.adaptExtras(log, items, learner === undefined ? LISTEN_LAG : learner);
const reasons = (r) => r.events.map(e => (e.skill || '*') + ':' + e.reason + ':' + e.dropped);
test('Làm tốt: 3 câu theo kế hoạch gần nhất của CÙNG kỹ năng đều đúng → bớt các câu theo kế hoạch còn lại của kỹ năng đó', () => {
  const items = [E('a'), E('b'), { type: 'review', word: { hz: 'r' } }];
  const r = ev([LG('listening', true), LG('listening', true), LG('listening', true)], items);
  assert.deepStrictEqual(reasons(r), ['listening:good:2']); assert.deepStrictEqual(r.drop, [items[0], items[1]]);
});
test('Chưa đủ 3 câu, hoặc có 1 câu sai/có gợi ý xen vào → KHÔNG bớt', () => {
  const items = [E('a')];
  assert.deepStrictEqual(ev([LG('listening', true), LG('listening', true)], items).events, []);
  assert.deepStrictEqual(ev([LG('listening', true), LG('listening', false), LG('listening', true), LG('listening', true)].slice(0, 3), items).events, []);
  assert.deepStrictEqual(ev([LG('listening', true), LG('listening', true), LG('listening', true, { hinted: true })], items).events, [], 'đúng nhờ gợi ý không tính là làm tốt');
  assert.deepStrictEqual(ev([LG('listening', false), LG('listening', true), LG('listening', true), LG('listening', true)], items).events.map(e => e.reason), ['good'], 'chỉ xét 3 câu GẦN NHẤT');
});
test('Sai liên tiếp: 3 câu theo kế hoạch gần nhất của kỹ năng đều sai → không dồn thêm (bỏ phần chưa hỏi); câu hỏi lại (tries) được giữ', () => {
  const retry = E('r', 'listening', { tries: 1 }), fresh = E('f');
  const r = ev([LG('listening', false), LG('listening', false), LG('listening', false)], [retry, fresh]);
  assert.deepStrictEqual(reasons(r), ['listening:struggle:1']); assert.deepStrictEqual(r.drop, [fresh]);
});
test('Chỉ tính câu theo kế hoạch của ĐÚNG kỹ năng: câu thường/ câu chính thức/ kỹ năng khác không góp vào chuỗi', () => {
  const items = [E('a')];
  const log = [LG('listening', true), LG('listening', true, { plan: false }), LG('listening', true, { source: 'review', official: true, plan: false }), LG('pinyin', true), LG('listening', true)];
  assert.deepStrictEqual(ev(log, items).events, [], 'chỉ có 2 câu theo kế hoạch của Nghe');
});
test('Mệt: 4 câu bằng chứng gần nhất (mọi loại) đều sai → bỏ HẾT câu theo kế hoạch chưa hỏi (mọi kỹ năng), chỉ 1 sự kiện', () => {
  const items = [E('a', 'listening'), E('b', 'pinyin'), E('c', 'listening', { tries: 1 }), { type: 'extra', word: { hz: 'w' }, targetSkill: 'pinyin' }, { type: 'review', word: { hz: 'r' } }];
  const w = (o) => LG('recall', false, Object.assign({ plan: false, source: 'review', official: true }, o || {}));
  const r = ev([w(), w(), w(), w()], items);
  assert.deepStrictEqual(reasons(r), ['*:tired:2']); assert.deepStrictEqual(r.drop, [items[0], items[1]]);
});
test('Mệt: câu luyện lại (redo) / kiểm tra (check) / giới thiệu (intro) KHÔNG tính; 3 câu sai + 1 redo sai chưa phải mệt', () => {
  const items = [E('a')], w = (o) => LG('recall', false, Object.assign({ plan: false, source: 'review', official: true }, o || {}));
  assert.deepStrictEqual(ev([w(), w(), w(), w({ source: 'redo', official: false })], items).events, []);
  assert.deepStrictEqual(ev([w(), w(), w({ intro: true }), w({ source: 'check' }), w()], items).events, []);
  assert.deepStrictEqual(ev([w(), w(), w(), w({ source: 'redo' }), w()], items).events.map(e => e.reason), ['tired'], '4 câu bằng chứng sai (redo xen giữa bị bỏ qua)');
  assert.deepStrictEqual(ev([w(), w(), w(), w({ correct: true })], items).events, []);
});
test('Hết tụt lại: ≥ 2 câu theo kế hoạch, câu gần nhất đúng, và Phân tích (số liệu vừa cập nhật) không còn coi kỹ năng là tụt lại → bớt', () => {
  // tìm số liệu "vừa đủ tụt lại": đúng 2 câu trắc nghiệm đúng nữa là hết tụt lại (kỹ năng khác cố định)
  const others = { recognition: cell(80, 72), recall: cell(60, 45), pinyin: cell(50, 40), context: cell(5, 3) };
  let fix = null;
  for (let n = 30; n <= 120 && !fix; n++) for (let ok = 0; ok <= n && !fix; ok++) {
    const l0 = L(Object.assign({ listening: cell(n, ok) }, others));
    if (TP.build(l0).skills.listening.level !== 'behind') continue;
    let l = l0; l = TP.applyAnswer(l, { skill: 'listening', correct: true }); const l1 = TP.build(l).skills.listening.level;
    l = TP.applyAnswer(l, { skill: 'listening', correct: true }); const l2 = TP.build(l).skills.listening.level;
    if (l1 === 'behind' && l2 === 'ok') fix = { l0, l };
  }
  assert.ok(fix, 'không tìm được số liệu mẫu cận ngưỡng');
  const items = [E('a'), E('b')], log = [LG('listening', true), LG('listening', true)];
  assert.deepStrictEqual(reasons(ev(log, items, fix.l)), ['listening:cleared:2']);
  assert.deepStrictEqual(ev(log, items, fix.l0).events, [], 'số liệu CHƯA cập nhật vẫn tụt lại → chưa bớt');
  assert.deepStrictEqual(ev(log.slice(0, 1), items, fix.l).events, [], 'mới 1 câu: chưa đủ bằng chứng');
  assert.deepStrictEqual(ev([LG('listening', true), LG('listening', false)], items, fix.l).events, [], 'câu gần nhất sai');
  assert.deepStrictEqual(ev(log, items, null).events, [], 'không có số liệu người học thì không dùng quy tắc này');
  assert.deepStrictEqual(ev(log, items, LISTEN_LAG).events, [], 'còn tụt lại rõ → giữ');
});
test('Mỗi kỹ năng xét riêng: Nghe làm tốt chỉ bớt câu Nghe, câu Pinyin theo kế hoạch vẫn còn', () => {
  const items = [E('a', 'listening'), E('b', 'pinyin'), E('c', 'listening')];
  const r = ev([LG('listening', true), LG('listening', true), LG('listening', true)], items);
  assert.deepStrictEqual(r.drop, [items[0], items[2]]);
});
test('KHÔNG BAO GIỜ đụng: thẻ chính thức, câu luyện thêm thường ("từ hay sai"), thăm dò, câu hỏi lại, mục không hợp lệ (400 ca ngẫu nhiên)', () => {
  const r = rng(99), skills = ['listening', 'pinyin', 'recall', 'recognition', 'context'];
  for (let t = 0; t < 400; t++) {
    const items = [], n = Math.floor(r() * 14);
    for (let i = 0; i < n; i++) {
      const k = Math.floor(r() * 7), sk = skills[Math.floor(r() * skills.length)];
      items.push(k === 0 ? { type: 'review', word: { hz: 'r' + i } } : k === 1 ? { type: 'new', word: { hz: 'n' + i } } : k === 2 ? { type: 'extra', word: { hz: 'w' + i }, targetSkill: sk }
        : k === 3 ? { type: 'extra', word: { hz: 'p' + i }, probe: 'typed' } : k === 4 ? E('t' + i, sk, { tries: 1 }) : k === 5 ? { type: 'redo', word: { hz: 'd' + i }, targetSkill: sk } : E('f' + i, sk));
    }
    items.push(null, undefined, {}, 'x');
    const log = Array.from({ length: Math.floor(r() * 12) }, () => LG(skills[Math.floor(r() * skills.length)], r() < 0.5, { plan: r() < 0.7, source: ['extra', 'review', 'redo', 'check'][Math.floor(r() * 4)], hinted: r() < 0.1, intro: r() < 0.1 }));
    const snapI = clone(items.filter(Boolean)), snapL = clone(log);
    const lrn = r() < 0.5 ? LISTEN_LAG : null, out = TP.adaptExtras(log, items, lrn);
    assert.deepStrictEqual(clone(items.filter(Boolean)), snapI, 'không được sửa hàng đợi'); assert.deepStrictEqual(clone(log), snapL, 'không được sửa nhật ký');
    for (const it of out.drop) { assert.ok(items.includes(it)); assert.ok(it.type === 'extra' && it.fromPlan === true && !it.tries && it.targetSkill, JSON.stringify(it)); }
    assert.strictEqual(out.events.reduce((a, e) => a + e.dropped, 0), out.drop.length); assert.strictEqual(new Set(out.drop).size, out.drop.length);
    // lặp lại sau khi đã bớt, cùng nhật ký và cùng số liệu → không còn gì để bớt (idempotent)
    const rest = items.filter(it => !out.drop.includes(it)); assert.deepStrictEqual(TP.adaptExtras(log, rest, lrn).events, []);
  }
});
test('Khôi phục phiên giữa chừng: nhật ký + hàng đợi qua JSON (như lưu/đọc phiên) cho CÙNG quyết định', () => {
  const items = [E('a'), E('b'), E('c', 'pinyin'), { type: 'review', word: { hz: 'r' } }], log = [LG('listening', true), LG('listening', true), LG('listening', true), LG('pinyin', false)];
  const live = ev(log, items), restored = ev(clone(log), clone(items), clone(LISTEN_LAG));
  assert.deepStrictEqual(reasons(restored), reasons(live)); assert.deepStrictEqual(restored.drop.map(i => i.word.hz), live.drop.map(i => i.word.hz));
});
test('Thiếu/hỏng đầu vào → không văng lỗi, không bớt gì', () => {
  for (const [a, b, c] of [[null, null, null], [undefined, [], undefined], [[], [E('a')], null], ['x', 'y', 5], [[null, 5, {}], [null, E('a')], LISTEN_LAG]]) assert.deepStrictEqual(TP.adaptExtras(a, b, c).events, []);
});
test('describeAdapt: câu thông báo nêu đúng kỹ năng + số câu đã bớt; "không dồn thêm" nhắc thẻ ôn chính thức vẫn như cũ; văn bản thuần', () => {
  const t = TP.describeAdapt([{ skill: 'listening', reason: 'good', dropped: 2 }, { skill: 'pinyin', reason: 'cleared', dropped: 1 }, { skill: 'recall', reason: 'struggle', dropped: 3 }, { skill: null, reason: 'tired', dropped: 4 }]);
  assert.strictEqual(t.length, 4);
  assert.ok(/kỹ năng Nghe/.test(t[0]) && /bớt 2 câu/.test(t[0])); assert.ok(/Pinyin không còn tụt lại/.test(t[1]));
  assert.ok(/Nhớ chủ động đang khó/.test(t[2]) && /không dồn thêm/.test(t[2]) && /thẻ ôn chính thức vẫn như cũ/.test(t[2])); assert.ok(/sai liên tiếp 4 câu/.test(t[3]) && /bỏ 4 câu/.test(t[3]) && /thẻ ôn chính thức vẫn như cũ/.test(t[3]));
  for (const s of t) assert.ok(!/[<>]/.test(s));
  assert.deepStrictEqual(TP.describeAdapt(null), []); assert.deepStrictEqual(TP.describeAdapt([]), []);
});

// ── [3] Buổi học giả — NGUYÊN review.js ─────────────────────────────────────────────────────────────────────────────
const POOL = Array.from({ length: 200 }, (_, i) => ({ hz: '字' + i, py: 'zì' + i, vi: 'nghĩa ' + i, l: 1 + (i % 5) }));
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function makeEnv(o) {
  const opt = Object.assign({ withTP: true, seed: 7 }, o || {}); const store = { rvAllowTyped: '0' }; const spy = [];
  const sm = Object.create(Math); sm.random = rng(opt.seed);
  const ctx = {
    console, Math: sm, Date, JSON, Set, Map, Array, Object, String, Number, Promise, Error, setTimeout: () => 0, clearInterval() {}, setInterval: () => 0, clearTimeout() {},
    document: { createElement: () => ({ style: {}, appendChild() {}, set textContent(v) {} }), head: { appendChild() {} }, getElementById: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    performance: { now: () => 0 }, WORDS: POOL, GUEST_MAX_LESSON: 99, isLoggedIn: () => true, isGuest: false, authToken: 't', authHeaders: () => ({}),
    SENTENCES: [], CONFUSE_GROUPS: [], showPinyin: true, showMeaning: true, isAdminRole: () => false, currentTab: 'review',
    escapeHtml: esc, escapeJsAttr: s => String(s).replace(/'/g, "\\'"), lessonName: l => 'Bài ' + l, renderHanziParts: () => '', wnBlockHtml: () => '', lessonsLabel: () => 'Bài 5',
    skillAudioAvailable: () => true, vtMarkStart() {}, vtHiddenMs: () => 0, render() {}, speak() {}, playDing() {}, playBuzz() {},
    sqCreate: () => ({ items: [], doneHz: new Set(), totalPlanned: 0, answeredCount: 0, sessionId: 'sess-1234567', startTime: null, endTime: null, completedCards: [], lessonFilter: null, dayKey: null }),
    sqSnapshotLessonFilter: () => ({}), sqReadPersisted: () => null, sqPersist: (k, q, extra) => { spy.push({ items: clone(q.items), extra: clone(extra) }); }, sqClearPersisted() {}, ssArchiveSession() {}, refreshServerMeta() {},
    sessionKnownHz: new Set(), saveSessionKnownHz() {}, sqPurgeHzFromAllQueues() {}, sqLessonFilterMatches: () => true, REPEAT_GAP: 10,
    genIdempotencyKey: () => 'k-123456789', todayKey: () => '2026-10-30', goTab() {}, alert() {}, SUBMIT_REVIEW_MAX_WAIT_MS: 1000,
    submitFsrsReviewAwaited: async () => ({ ok: true }), submitSkillPractice: async () => ({ ok: true }), fetch: async () => { throw new Error('không được gọi mạng'); },
  };
  vm.createContext(ctx);
  const files = ['js/answer-match.js', 'js/skill-score.js', 'js/session-summary.js', 'js/question-engine.js', 'js/question-selector.js'].concat(opt.withTP ? ['js/training-plan.js'] : [], ['js/review.js']);
  for (const f of files) vm.runInContext(read(f), ctx);
  ctx.__spy = spy; ctx.__store = store; return ctx;
}
const R = (ctx, code) => vm.runInContext(code, ctx);
const rev = (i) => ({ type: 'review', word: POOL[i] });
const planX = (i, skill) => ({ type: 'extra', word: POOL[i], targetSkill: skill || 'listening', fromPlan: true });
function startSession(ctx, items, learner) {
  ctx.__items = clone(items); R(ctx, 'rvQueue.items = __items; rvQueue.totalPlanned = rvQueue.items.filter(rvIsOfficial).length; rvLog = []; rvAdaptNote = ""; rvLearner = ' + JSON.stringify(learner === undefined ? LISTEN_LAG : learner));
}
function step(ctx, correct, o) {
  R(ctx, 'rvPrepareCurrentCard()'); if (o && o.hinted) R(ctx, 'rvQuestion.hinted = true');
  ctx.__c = !!correct;
  R(ctx, 'rvRecordAnswer(rvQueue.items[0], rvQuestion, __c, 1000, rvIsOfficial(rvQueue.items[0])); rvLastAnswer = { correct: __c };');
  R(ctx, 'rvAdvanceQueue()');
}
const queue = (ctx) => clone(R(ctx, 'rvQueue.items'));
const freshPlan = (q, skill) => q.filter(i => i.type === 'extra' && i.fromPlan && !i.tries && (!skill || i.targetSkill === skill));
const offCount = (q) => q.filter(i => i.type === 'review' || i.type === 'new').length;

section('[3] Buổi học giả (nạp NGUYÊN review.js: rvRecordAnswer → rvAdvanceQueue)');
const BASE_ITEMS = () => [planX(90), planX(91), planX(92), planX(93), planX(94), { type: 'extra', word: POOL[60], targetSkill: 'pinyin' }, rev(1), rev(2), rev(3), rev(4), rev(5), rev(6)];
test('Làm tốt: 3 câu Nghe theo kế hoạch đúng → bớt 2 câu Nghe còn lại; thẻ chính thức và "từ hay sai" nguyên vẹn; có thông báo; số liệu người học được cập nhật', () => {
  const ctx = makeEnv(); startSession(ctx, BASE_ITEMS());
  for (let i = 0; i < 3; i++) step(ctx, true);
  const q = queue(ctx);
  assert.strictEqual(freshPlan(q, 'listening').length, 0); assert.strictEqual(offCount(q), 6); assert.ok(q.some(i => i.type === 'extra' && !i.fromPlan && i.targetSkill === 'pinyin'));
  const note = R(ctx, 'rvAdaptNote'); assert.ok(/kỹ năng Nghe/.test(note) && /bớt 2 câu/.test(note), note);
  const l = clone(R(ctx, 'rvLearner')).skills.listening; assert.strictEqual(l.c.n, 63); assert.strictEqual(l.c.ok, 33); assert.strictEqual(l.rc.n, 3);
  assert.strictEqual(clone(R(ctx, 'rvLog')).filter(e => e.plan === true && e.skill === 'listening').length, 3);
});
test('Phiên được LƯU sau khi đã bớt (refresh giữa buổi không đưa câu đã bớt trở lại), kèm số liệu người học đã cập nhật', () => {
  const ctx = makeEnv(); startSession(ctx, BASE_ITEMS()); for (let i = 0; i < 3; i++) step(ctx, true);
  const last = ctx.__spy[ctx.__spy.length - 1];
  assert.strictEqual(freshPlan(last.items, 'listening').length, 0); assert.strictEqual(last.extra.learner.skills.listening.c.n, 63);
  assert.strictEqual(last.extra.log.filter(e => e.plan).length, 3);
});
test('Chưa đủ 3 câu → chưa bớt gì, không có thông báo', () => {
  const ctx = makeEnv(); startSession(ctx, BASE_ITEMS()); for (let i = 0; i < 2; i++) step(ctx, true);
  assert.strictEqual(freshPlan(queue(ctx), 'listening').length, 3); assert.strictEqual(R(ctx, 'rvAdaptNote'), '');
});
test('Sai liên tiếp: 3 câu Nghe sai → không dồn thêm (bỏ 2 câu chưa hỏi); 3 câu hỏi lại sau khi sai vẫn còn để sửa lỗi', () => {
  const ctx = makeEnv(); startSession(ctx, BASE_ITEMS()); for (let i = 0; i < 3; i++) step(ctx, false);
  const q = queue(ctx);
  assert.strictEqual(freshPlan(q, 'listening').length, 0); assert.strictEqual(q.filter(i => i.type === 'extra' && i.fromPlan && i.tries >= 1).length, 3); assert.strictEqual(offCount(q), 6);
  assert.ok(/đang khó/.test(R(ctx, 'rvAdaptNote')) && /không dồn thêm/.test(R(ctx, 'rvAdaptNote')));
  assert.strictEqual(clone(R(ctx, 'rvLearner')).skills.listening.c.ok, 30, 'sai thì không cộng ok');
});
test('Đúng nhờ gợi ý không tính là làm tốt → không bớt', () => {
  const ctx = makeEnv(); startSession(ctx, BASE_ITEMS()); step(ctx, true); step(ctx, true, { hinted: true }); step(ctx, true);
  assert.strictEqual(freshPlan(queue(ctx), 'listening').length, 2); assert.strictEqual(R(ctx, 'rvAdaptNote'), '');
});
test('Mệt: 4 thẻ chính thức sai liên tiếp → bỏ HẾT câu theo kế hoạch chưa hỏi; thẻ chính thức (kể cả thẻ quay lại) và "từ hay sai" còn nguyên', () => {
  const ctx = makeEnv(); startSession(ctx, [rev(1), rev(2), rev(3), rev(4), rev(5), rev(6), planX(90), planX(91, 'pinyin'), { type: 'extra', word: POOL[60], targetSkill: 'pinyin' }]);
  let wrong = 0; while (wrong < 4) { const t = R(ctx, 'rvQueue.items[0].type'); step(ctx, false); if (t === 'review') wrong++; }
  const q = queue(ctx);
  assert.strictEqual(freshPlan(q).length, 0); assert.ok(q.some(i => i.type === 'extra' && !i.fromPlan)); assert.ok(offCount(q) >= 6, 'thẻ chính thức vẫn còn (kể cả thẻ quay lại)');
  assert.ok(/sai liên tiếp 4 câu/.test(R(ctx, 'rvAdaptNote')));
});
test('Kỹ năng khác không bị ảnh hưởng: Nghe làm tốt chỉ bớt câu Nghe, câu Pinyin theo kế hoạch còn nguyên', () => {
  const ctx = makeEnv(); startSession(ctx, [planX(90), planX(91), planX(92), planX(93), planX(110, 'pinyin'), planX(111, 'pinyin'), rev(1), rev(2)]);
  for (let i = 0; i < 3; i++) step(ctx, true);
  const q = queue(ctx);
  assert.strictEqual(freshPlan(q, 'listening').length, 0); assert.strictEqual(freshPlan(q, 'pinyin').length, 2);
});
test('Thông báo hiện ở câu kế tiếp, được thoát HTML, và biến mất ở lần chuyển câu sau', () => {
  const ctx = makeEnv(); startSession(ctx, BASE_ITEMS()); for (let i = 0; i < 3; i++) step(ctx, true);
  R(ctx, 'rvPrepareCurrentCard()'); const html = () => R(ctx, 'rvQuestionBodyHtml("x", rvQueue.items[0].word)');
  assert.ok(html().includes('🔔') && html().includes('bớt 2 câu'));
  R(ctx, 'rvAdaptNote = "<img src=x onerror=alert(1)>"'); assert.ok(!html().includes('<img src=x') && html().includes('&lt;img src=x'));
  step(ctx, true); R(ctx, 'rvPrepareCurrentCard()'); assert.ok(!html().includes('🔔'));
});
test('Phiên luyện lại (practiceOnly) không bị thích ứng; thẻ FSRS chính thức không bao giờ bị bớt dù trả lời thế nào (200 buổi ngẫu nhiên)', () => {
  const ctx = makeEnv(); startSession(ctx, BASE_ITEMS()); R(ctx, 'rvQueue.practiceOnly = true'); for (let i = 0; i < 3; i++) step(ctx, true);
  assert.strictEqual(freshPlan(queue(ctx), 'listening').length, 2);
  const r = rng(31);
  for (let t = 0; t < 200; t++) {
    const c = makeEnv({ seed: t + 1 }); const nOff = 4 + Math.floor(r() * 6);
    startSession(c, [planX(90), planX(91), planX(92), planX(93), planX(110, 'pinyin'), planX(111, 'pinyin'), planX(112, 'pinyin')].concat(Array.from({ length: nOff }, (_, i) => rev(i + 1))));
    const seen = new Set(); let guard = 0;
    while (R(c, 'rvQueue.items.length') && guard++ < 80) { const head = clone(R(c, 'rvQueue.items[0]')); if (head.type === 'review') seen.add(head.word.hz); step(c, r() < 0.5); }
    for (let i = 1; i <= nOff; i++) assert.ok(seen.has(POOL[i].hz), 'thẻ chính thức ' + i + ' phải được hỏi (buổi #' + t + ')');
  }
});
test('Khôi phục phiên: nhật ký + hàng đợi + số liệu qua JSON → câu thứ 3 cho CÙNG kết quả như chạy liền mạch', () => {
  const live = makeEnv(); startSession(live, BASE_ITEMS()); for (let i = 0; i < 3; i++) step(live, true);
  const a = makeEnv(); startSession(a, BASE_ITEMS()); for (let i = 0; i < 2; i++) step(a, true);
  const snap = { items: queue(a), log: clone(R(a, 'rvLog')), learner: clone(R(a, 'rvLearner')) };
  const b = makeEnv({ seed: 99 }); b.__items = snap.items; b.__log = snap.log; R(b, 'rvQueue.items = __items; rvQueue.totalPlanned = 6; rvLog = __log; rvLearner = ' + JSON.stringify(snap.learner)); step(b, true);
  const strip = (q) => q.map(i => [i.type, i.word.hz, !!i.fromPlan, i.tries || 0]);
  assert.deepStrictEqual(strip(queue(b)), strip(queue(live))); assert.deepStrictEqual(clone(R(b, 'rvLearner')).skills.listening, clone(R(live, 'rvLearner')).skills.listening);
});
test('Số liệu người học: chỉ câu là BẰNG CHỨNG mới cập nhật (check/redo không); người mới (null) giữ null; đối tượng cũ không bị sửa', () => {
  const ctx = makeEnv(); startSession(ctx, [rev(1), rev(2)]);
  const before = clone(R(ctx, 'rvLearner')); R(ctx, 'rvPrepareCurrentCard()');
  ctx.__it = { type: 'redo', word: POOL[1] }; R(ctx, 'rvRecordAnswer(__it, rvQuestion, true, 900, false)'); assert.deepStrictEqual(clone(R(ctx, 'rvLearner')), before, 'redo không cập nhật');
  ctx.__it = { type: 'check', word: POOL[1] }; R(ctx, 'rvRecordAnswer(__it, rvQuestion, true, 900, false)'); assert.deepStrictEqual(clone(R(ctx, 'rvLearner')), before, 'check không cập nhật');
  ctx.__it = { type: 'extra', word: POOL[1] }; R(ctx, 'rvRecordAnswer(__it, rvQuestion, true, 900, false)'); assert.notDeepStrictEqual(clone(R(ctx, 'rvLearner')), before, 'extra cập nhật');
  const n = makeEnv(); startSession(n, [rev(1)], null); R(n, 'rvPrepareCurrentCard()'); n.__it = { type: 'extra', word: POOL[1] }; R(n, 'rvRecordAnswer(__it, rvQuestion, true, 900, false)'); assert.strictEqual(R(n, 'rvLearner'), null);
});
test('Thiếu module TP → y như V127: không bớt, không cập nhật số liệu người học, không lỗi', () => {
  const ctx = makeEnv({ withTP: false }); startSession(ctx, BASE_ITEMS()); const before = clone(R(ctx, 'rvLearner'));
  for (let i = 0; i < 3; i++) step(ctx, true);
  assert.strictEqual(freshPlan(queue(ctx), 'listening').length, 2); assert.deepStrictEqual(clone(R(ctx, 'rvLearner')), before); assert.strictEqual(R(ctx, 'rvAdaptNote'), '');
});
test('Module TP hỏng giữa chừng (ném lỗi) → bị nuốt, buổi học tiếp tục bình thường', () => {
  const ctx = makeEnv(); startSession(ctx, BASE_ITEMS()); R(ctx, 'TP.adaptExtras = () => { throw new Error("boom"); }; TP.applyAnswer = () => { throw new Error("boom"); }');
  for (let i = 0; i < 3; i++) step(ctx, true); assert.strictEqual(freshPlan(queue(ctx), 'listening').length, 2); assert.strictEqual(offCount(queue(ctx)), 6);
});
test('Bớt hết câu chưa hỏi mà hàng đợi trống → buổi kết thúc đúng cách (không kẹt)', () => {
  const ctx = makeEnv(); startSession(ctx, [planX(90), planX(91), planX(92), planX(93)]);
  for (let i = 0; i < 3; i++) step(ctx, true);
  assert.strictEqual(R(ctx, 'rvQueue.items.length'), 0); assert.ok(R(ctx, 'rvQueue.endTime') > 0);
});

section('[4] Ranh giới');
const src = read('js/review.js');
const body = (name) => { const s = src.indexOf('function ' + name + '('); assert.ok(s >= 0, name); return src.slice(s, src.indexOf('\n}\n', s)); };
test('rvAdaptExtras chạy TRƯỚC kiểm tra "hết hàng đợi" và TRƯỚC khi lưu phiên; thông báo cũ được xoá ngay sau chốt chặn currentTab', () => {
  const b = body('rvAdvanceQueue');
  assert.ok(b.indexOf('rvAdaptExtras()') > 0 && b.indexOf('rvAdaptExtras()') < b.indexOf('if (!rvQueue.items.length)') && b.indexOf('rvAdaptExtras()') < b.indexOf('sqPersist('));
  assert.ok(b.indexOf("rvAdaptNote = ''") > b.indexOf("if (currentTab !== 'review') return;") && b.indexOf("rvAdaptNote = ''") < b.indexOf('rvQueue.items.shift()'));
});
test('rvAdaptExtras chỉ gỡ đúng các mục do TP chỉ định; bỏ qua phiên luyện lại; không gọi mạng/FSRS', () => {
  const b = body('rvAdaptExtras');
  assert.ok(/rvQueue\.practiceOnly\) return/.test(b) && /drop\.has\(rvQueue\.items\[i\]\)/.test(b) && /splice\(i, 1\)/.test(b));
  for (const bad of ['fetch(', 'submitFsrsReviewAwaited', '/api/', 'sessionKnownHz', 'rvQueue.answeredCount', 'completedCards']) assert.ok(!b.includes(bad), bad);
});
test('Số liệu người học chỉ được cập nhật trong nhánh "là bằng chứng" của rvRecordAnswer (cùng điều kiện hồ sơ từng từ)', () => {
  const b = body('rvRecordAnswer'); const i = b.indexOf('TP.applyAnswer');
  assert.ok(i > b.indexOf("if (item && !(item.type === 'check' || item.type === 'redo' || rvIsIntroExposure(item)))") && i < b.indexOf('QS.record('));
});
test('Bộ chọn câu hỏi/FSRS/máy chủ vẫn không biết TP; không có route hay bảng dữ liệu mới ở giai đoạn này', () => {
  for (const f of ['js/question-selector.js', 'js/question-engine.js', 'js/study-queue.js', 'js/skill-score.js', 'lib/fsrs.js', 'lib/fsrs/scheduler.js', 'lib/fsrs/reviewService.js', 'lib/db.js', 'lib/skill-store.js']) assert.ok(!/\bTP\b/.test(read(f)), f);
  assert.ok(!/applyAnswer|adaptExtras/.test(read('api/index.js')));
});

runAll();
