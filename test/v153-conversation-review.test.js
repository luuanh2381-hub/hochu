#!/usr/bin/env node
// test/v153-conversation-review.test.js — V153: giai đoạn 2 của hội thoại AI: sinh tự động, duyệt hàng loạt, sửa lượt thoại,
// nối từ vựng hội thoại với kho từ (FSRS), hạn mức ngày; và sửa lỗi "không thấy nút sinh AI" (khung luôn mở, lỗi không bị nuốt).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const G = require('../lib/conversation-gen.js');

let passed = 0, failed = 0; const pending = [];
const test = (n, f) => pending.push({ n, f });
async function runAll() {
  for (const { n, f } of pending) {
    try { await f(); passed++; console.log('  ✅ ' + n); }
    catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); }
  }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
}

// ── Lõi thuần ──
test('validateTurnEdit: dùng đúng luật như bản AI soạn (pinyin, chữ số, tiếng Việt, rỗng, 儿)', () => {
  const ok = G.validateTurnEdit({ chinese_text: ' 第一条线 没问题。', pinyin: 'dì yī tiáo xiàn méi wèn tí', vietnamese_text: 'Dây chuyền số 1 ổn.' });
  assert.ok(ok.ok && ok.turn.chinese_text === '第一条线没问题。', JSON.stringify(ok));
  assert.ok(!G.validateTurnEdit({ chinese_text: '第一条线没问题。', pinyin: 'dì yī', vietnamese_text: 'x' }).ok);
  assert.ok(G.validateTurnEdit({ chinese_text: '第3条线没问题。', pinyin: 'dì sān tiáo xiàn méi wèn tí', vietnamese_text: 'x' }).errors.some((e) => /chữ số/.test(e)));
  assert.ok(G.validateTurnEdit({ chinese_text: '你好', pinyin: 'nǐ hǎo', vietnamese_text: 'Chào 你' }).errors.some((e) => /còn chữ Hán/.test(e)));
  assert.ok(!G.validateTurnEdit({}).ok && !G.validateTurnEdit(null).ok);
  assert.ok(G.validateTurnEdit({ chinese_text: '你去哪儿？', pinyin: 'nǐ qù nǎr', vietnamese_text: 'Bạn đi đâu?' }).ok);
});

test('hạn mức ngày: mặc định 20, <=0 = không giới hạn, không âm', () => {
  assert.strictEqual(G.parseDailyLimit(undefined), 20); assert.strictEqual(G.parseDailyLimit('7'), 7); assert.strictEqual(G.parseDailyLimit('0'), 0);
  assert.strictEqual(G.dailyLimitRemaining(20, 5), 15); assert.strictEqual(G.dailyLimitRemaining(20, 25), 0);
  assert.strictEqual(G.dailyLimitRemaining(0, 999), Infinity); assert.strictEqual(G.dailyLimitRemaining(-1, 3), Infinity);
});

// ── DB + API (đọc mã nguồn) ──
test('db.js: sửa lượt (khoá hàng, tỉa vocab không còn trong câu), thêm từ chỉ khi chưa có + tag + bài 1–9999, duyệt-hết cần có lượt, đếm theo giờ VN', () => {
  const db = read('lib/db.js');
  const u = db.slice(db.indexOf('async function updateConversationTurn'), db.indexOf('async function getVocabStatusByHz'));
  assert.ok(/BEGIN/.test(u) && /FOR UPDATE OF t/.test(u) && /fields\.chinese_text\.includes\(v\.hz\)/.test(u) && /ROLLBACK/.test(u) && /COMMIT/.test(u));
  const a = db.slice(db.indexOf('async function addConversationVocabToLesson'), db.indexOf('\nmodule.exports'));
  assert.ok(/L < 1 \|\| L > 9999/.test(a) && /!status\[c\.hz\]/.test(a) && /tag: 'hoi-thoai'/.test(a) && /importVocab\(missing\.map[\s\S]*?\}\)\), false\)/.test(a), 'không ghi đè, không gắn thêm bài cho từ đã có');
  assert.ok(/gen_status = 'draft'[\s\S]*EXISTS \(SELECT 1 FROM conversation_turns/.test(db.slice(db.indexOf('async function approveAllConversationDrafts'))));
  assert.ok(/Asia\/Ho_Chi_Minh/.test(db.slice(db.indexOf('async function countConversationsGeneratedToday'))));
  assert.ok(/lược đồ hội thoại: ' \+ \(convoGenSchemaLastError/.test(db), 'lỗi lược đồ nêu nguyên nhân thật');
});

test('api: route mới bắt buộc admin (vocab-status chỉ cần đăng nhập, ≤100 từ); route sinh & cron dùng chung runConversationGeneration; hạn mức ngày; lỗi lược đồ → 503 rõ ràng', () => {
  const api = read('api/index.js');
  for (const r of ["app.post('/api/admin/conversations/approve-all'", "app.post('/api/admin/conversations/:dialogueId/turns/:n'", "app.post('/api/admin/conversations/:dialogueId/add-vocab'"]) {
    const i = api.indexOf(r); assert.ok(i > 0, r); assert.ok(/requireAdmin\(/.test(api.slice(i, i + 420)), r);
  }
  const v = api.slice(api.indexOf("app.post('/api/conversations/vocab-status'"), api.indexOf("app.post('/api/admin/conversations/:dialogueId/status'"));
  assert.ok(/requireAuth/.test(v) && !/requireAdmin/.test(v) && /\.slice\(0, 100\)/.test(v));
  assert.ok(/validateTurnEdit/.test(api) && /status\(400\)/.test(api.slice(api.indexOf("'/api/admin/conversations/:dialogueId/turns/:n'"))));
  assert.ok((api.match(/runConversationGeneration\(/g) || []).length >= 3, 'định nghĩa + route + cron');
  assert.ok(/task === 'conversations'/.test(api) && /respectDailyLimit: true/.test(api) && /respectDailyLimit: ids\.length === 0/.test(api));
  assert.ok(/CONVERSATION_GEN_DAILY_LIMIT/.test(api) && /skipped_limit/.test(api));
  assert.ok(/status\(503\)/.test(api.slice(api.indexOf("app.get('/api/admin/conversations'"), api.indexOf("app.post('/api/admin/conversations/generate'"))));
});

// ── Giao diện (chạy thật trong vm) ──
function uiEnv(admin, route) {
  const calls = []; const els = {};
  const ctx = vm.createContext({
    console, window: { scrollTo() {} }, URLSearchParams, encodeURIComponent, confirm: () => true,
    document: { getElementById: (id) => els[id] || null, body: { insertAdjacentHTML() {} }, querySelectorAll: (sel) => (sel === '.convo-vs' ? (els.__vs || []) : []) },
    localStorage: { getItem: () => null, setItem() {} },
    fetch: (url, opts) => { calls.push({ url, opts, body: opts && opts.body ? JSON.parse(opts.body) : undefined });
      const out = route(url, opts, calls);
      return Promise.resolve({ ok: out.__status ? out.__status < 400 : true, status: out.__status || 200, json: async () => out }); },
    ttsSpeakSegments() {}, goTab() {}, pauseSpeaking() {}, resumeSpeaking() {}, stopSpeaking() {},
  });
  vm.runInContext(`function escapeHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
    var authToken='tok'; function authHeaders(){return {Authorization:'Bearer t'};} function isAdminRole(){return ${admin};} var ttsRate=0.9;`, ctx);
  vm.runInContext(read('js/conversation.js'), ctx);
  return { ctx, calls, els };
}
const OV = (counts, items) => ({ ok: true, counts: Object.assign({ pending: 0, generating: 0, draft: 0, ready: 0, failed: 0 }, counts), items: items || [] });

test('LỖI "không thấy nút": admin thấy các nút sinh NGAY, kể cả khi chưa có nháp/lỗi (khung luôn mở)', async () => {
  const E = uiEnv(true, () => OV({ pending: 200 }));
  E.els['convo-admin'] = { innerHTML: '' };
  await E.ctx.loadConvoAdmin();
  const h = E.els['convo-admin'].innerHTML;
  assert.ok(/<details class="panel"[^>]* open>/.test(h), 'khung phải mở sẵn');
  for (const s of ['Sinh 1 bài tiếp theo', 'Sinh 3 bài', 'Sinh tự động']) assert.ok(h.includes(s), s);
  assert.ok(!h.includes('Duyệt tất cả'), 'chỉ hiện khi có ≥2 nháp');
});

test('LỖI "không thấy nút": API lỗi → admin THẤY lý do + nút Thử lại (không im lặng); người học thường không thấy gì', async () => {
  const E = uiEnv(true, () => ({ __status: 503, ok: false, error: 'Chưa cập nhật được lược đồ hội thoại: relation "conversations" does not exist' }));
  E.els['convo-admin'] = { innerHTML: '' };
  await E.ctx.loadConvoAdmin();
  assert.ok(/không tải được/.test(E.els['convo-admin'].innerHTML) && /conversations/.test(E.els['convo-admin'].innerHTML) && /Thử lại/.test(E.els['convo-admin'].innerHTML));
  const L = uiEnv(false, () => OV({}));
  L.els['convo-admin'] = { innerHTML: '' }; await L.ctx.loadConvoAdmin();
  assert.strictEqual(L.els['convo-admin'].innerHTML, ''); assert.strictEqual(L.calls.length, 0);
});

test('hiện nút "Duyệt tất cả" khi ≥2 nháp; duyệt-hết gọi đúng API và báo số bài', async () => {
  const E = uiEnv(true, (url) => (/approve-all/.test(url) ? { ok: true, approved: 3 } : OV({ draft: 3 }, [])));
  E.els['convo-admin'] = { innerHTML: '' }; E.els['convo-gen-msg'] = { textContent: '' };
  await E.ctx.loadConvoAdmin();
  assert.ok(/convoApproveAll\(3\)/.test(E.els['convo-admin'].innerHTML));
  await E.ctx.convoApproveAll(3);
  assert.ok(E.calls.some((c) => c.url === '/api/admin/conversations/approve-all' && c.opts.method === 'POST'));
  assert.ok(/Đã duyệt 3 bài/.test(E.els['convo-gen-msg'].textContent));
});

function autoEnv(replies) {
  let i = 0;
  const E = uiEnv(true, (url) => (/generate$/.test(url) ? replies[Math.min(i++, replies.length - 1)] : OV({})));
  E.els['convo-admin'] = { innerHTML: '' }; E.els['convo-gen-msg'] = { textContent: '' }; E.els['convo-auto-btn'] = { textContent: '' };
  return E;
}
const D = (n) => ({ ok: true, results: Array.from({ length: n }, (_, k) => ({ dialogueId: 'x' + k, status: 'draft', turns: 20 })), quota: false, limitReached: false, generatedToday: n, dailyLimit: 20 });

test('sinh tự động: lặp tới khi hết bài; cộng dồn số bản nháp', async () => {
  const E = autoEnv([D(3), D(2), { ok: true, results: [], quota: false, limitReached: false }]);
  await E.ctx.convoAutoRun();
  assert.strictEqual(E.calls.filter((c) => /generate$/.test(c.url)).length, 3);
  assert.ok(/Không còn bài nào/.test(E.els['convo-gen-msg'].textContent) && /5 bản nháp mới/.test(E.els['convo-gen-msg'].textContent), E.els['convo-gen-msg'].textContent);
});

test('sinh tự động: dừng khi hết hạn mức AI / chạm hạn mức ngày / 2 vòng liền không ra bài / lỗi mạng', async () => {
  let E = autoEnv([Object.assign(D(1), { quota: true })]); await E.ctx.convoAutoRun();
  assert.ok(/Hết hạn mức AI/.test(E.els['convo-gen-msg'].textContent));
  E = autoEnv([Object.assign(D(2), { limitReached: true, generatedToday: 20, dailyLimit: 20 })]); await E.ctx.convoAutoRun();
  assert.ok(/hạn mức ngày \(20\/20\)/.test(E.els['convo-gen-msg'].textContent));
  const bad = { ok: true, results: [{ dialogueId: 'a', status: 'failed', errors: ['x'] }], quota: false, limitReached: false };
  E = autoEnv([bad, bad, bad]); await E.ctx.convoAutoRun();
  assert.strictEqual(E.calls.filter((c) => /generate$/.test(c.url)).length, 2); assert.ok(/lỗi liên tiếp/.test(E.els['convo-gen-msg'].textContent));
  E = autoEnv([{ __status: 500, ok: false, error: 'Lỗi máy chủ' }]); await E.ctx.convoAutoRun();
  assert.ok(/⚠️ Lỗi máy chủ/.test(E.els['convo-gen-msg'].textContent));
});

test('sinh tự động: bấm lần 2 = Dừng (sau vòng đang chạy); không chạy chồng hai vòng', async () => {
  const E = autoEnv([D(3), D(3), D(3), D(3)]);
  const p = E.ctx.convoAutoRun();
  await E.ctx.convoAutoRun();          // lần 2 khi đang chạy → đặt cờ dừng, không mở vòng mới
  await p;
  assert.ok(E.calls.filter((c) => /generate$/.test(c.url)).length <= 2);
  assert.ok(/Đã dừng/.test(E.els['convo-gen-msg'].textContent), E.els['convo-gen-msg'].textContent);
});

const CONVO = () => ({ id: 7, dialogue_id: 'hsk3-002', title_zh: 'T', title_vi: 't', gen_status: 'draft', generated_at: '2026-11-14T03:00:00Z', gen_attempts: 2, gen_model: 'deepseek-v4-flash', progress: {}, turns: [
  { character: 'A', chinese_text: '第一条线没问题。', pinyin: 'dì yī tiáo xiàn méi wèn tí', vietnamese_text: 'ok', vocabulary_explanations: [{ hz: '没问题', py: 'méi wèn tí', vi: 'không vấn đề' }, { hz: '条线', py: 'tiáo xiàn', vi: 'dây chuyền' }], grammar_explanations: null },
  { character: 'B', chinese_text: '好的。', pinyin: 'hǎo de', vietnamese_text: 'ừ', vocabulary_explanations: null, grammar_explanations: null }] });
const setConvo = (E) => { vm.runInContext('currentConvo = ' + JSON.stringify(CONVO()) + ';', E.ctx); };

test('sửa lượt: chỉ admin có nút ✏️; lưu gọi đúng API và cập nhật nội dung; lỗi kiểm tra hiện ngay tại khung sửa', async () => {
  const E = uiEnv(true, (url, o, calls) => (/turns\/1$/.test(url) ? (JSON.parse(o.body).pinyin.includes('sai') ? { __status: 400, ok: false, error: 'pinyin 1 âm tiết ≠ 8 chữ Hán' } : { ok: true, turn: { chinese_text: '第一条线没问题啊。', pinyin: 'dì yī tiáo xiàn méi wèn tí a', vietnamese_text: 'ổn nhé' } }) : OV({})));
  setConvo(E);
  assert.ok(vm.runInContext("renderConvoTurn(currentConvo, currentConvo.turns[0], 0)", E.ctx).includes('convoEditTurn(0)'));
  assert.ok(!uiEnv(false, () => OV({})).ctx.renderConvoTurn(CONVO(), CONVO().turns[0], 0).includes('convoEditTurn'));
  E.els['convo-turn-0'] = { innerHTML: '' }; E.els['convo-gen-msg'] = { textContent: '' };
  E.ctx.convoEditTurn(0);
  assert.ok(/convo-ed-zh-0/.test(E.els['convo-turn-0'].innerHTML) && /第一条线没问题。/.test(E.els['convo-turn-0'].innerHTML));
  E.els['convo-ed-zh-0'] = { value: '第一条线没问题啊。' }; E.els['convo-ed-py-0'] = { value: 'sai' }; E.els['convo-ed-vi-0'] = { value: 'ổn nhé' }; E.els['convo-ed-msg-0'] = { textContent: '' };
  await E.ctx.convoSaveTurn(0);
  assert.ok(/pinyin 1 âm tiết/.test(E.els['convo-ed-msg-0'].textContent), 'lỗi hiện tại chỗ');
  E.els['convo-ed-py-0'].value = 'dì yī tiáo xiàn méi wèn tí a';
  await E.ctx.convoSaveTurn(0);
  const post = E.calls.filter((c) => /turns\/1$/.test(c.url)).pop();
  assert.strictEqual(post.url, '/api/admin/conversations/hsk3-002/turns/1'); assert.strictEqual(post.body.chinese_text, '第一条线没问题啊。');
  assert.strictEqual(vm.runInContext('currentConvo.turns[0].vietnamese_text', E.ctx), 'ổn nhé');
});

test('thanh quản trị chi tiết: metadata AI + nút "Duyệt & bản nháp kế"; duyệt xong nhảy sang nháp kế tiếp', async () => {
  const E = uiEnv(true, (url, o) => (/status$/.test(url) ? { ok: true, gen_status: 'ready' } : (url === '/api/admin/conversations' ? OV({ draft: 2 }, [{ dialogue_id: 'hsk3-002', gen_status: 'draft' }, { dialogue_id: 'hsk3-005', gen_status: 'draft' }]) : { ok: true, conversation: Object.assign(CONVO(), { dialogue_id: 'hsk3-005' }) })));
  const bar = E.ctx.convoAdminBar(CONVO());
  assert.ok(/convoApproveAndNext\('hsk3-002'\)/.test(bar) && /2 lần sinh/.test(bar) && /deepseek-v4-flash/.test(bar) && /2 lượt/.test(bar));
  E.els['convo-gen-msg'] = { textContent: '' };
  await E.ctx.convoApproveAndNext('hsk3-002');
  assert.ok(E.calls.some((c) => /conversations\/hsk3-005/.test(c.url)), 'đã mở bản nháp kế tiếp');
});

test('từ vựng ↔ kho từ: huy hiệu ✓/＋ cho từng từ; admin thấy số từ chưa có + ô nhập bài; thêm gọi đúng API', async () => {
  const E = uiEnv(true, (url) => (/vocab-status$/.test(url) ? { ok: true, status: { '没问题': { lessons: [5] } } } : (/add-vocab$/.test(url) ? { ok: true, total: 2, added: 1, existing: 1 } : OV({}))));
  setConvo(E);
  const s1 = { _t: '', textContent: '', getAttribute: () => '没问题' }, s2 = { textContent: '', getAttribute: () => '条线' };
  E.els.__vs = [s1, s2]; E.els['convo-vocab-admin'] = { innerHTML: '' }; E.els['convo-gen-msg'] = { textContent: '' };
  await E.ctx.convoLoadVocabStatus();
  const vs = E.calls.find((c) => /vocab-status$/.test(c.url));
  assert.deepStrictEqual(vs.body.hzs, ['没问题', '条线']);
  assert.ok(/✓ bài 5/.test(s1.textContent)); assert.ok(/＋ mới/.test(s2.textContent));
  assert.ok(/1\/2 từ chưa có trong kho/.test(E.els['convo-vocab-admin'].innerHTML) && /convoAddVocab\(\)/.test(E.els['convo-vocab-admin'].innerHTML));
  E.els['convo-vocab-lesson'] = { value: '900' };
  await E.ctx.convoAddVocab();
  const add = E.calls.find((c) => /add-vocab$/.test(c.url));
  assert.strictEqual(add.url, '/api/admin/conversations/hsk3-002/add-vocab'); assert.deepStrictEqual(add.body, { lesson: 900 });
  assert.ok(/Đã thêm 1 từ mới vào bài 900/.test(E.els['convo-gen-msg'].textContent));
  E.els['convo-vocab-lesson'].value = ''; E.calls.length = 0; await E.ctx.convoAddVocab();
  assert.ok(!E.calls.some((c) => /add-vocab/.test(c.url)), 'thiếu số bài → không gọi API');
});

test('người học: chỉ tải trạng thái từ vựng khi đang hiện phần giải thích (đỡ 1 request); convoFmtExplain mặc định giữ nguyên (không span)', async () => {
  const L = uiEnv(false, () => ({ ok: true, status: {} }));
  setConvo(L); await L.ctx.convoLoadVocabStatus();
  assert.strictEqual(L.calls.length, 0);
  assert.ok(!L.ctx.convoFmtExplain([{ hz: '好', vi: 'tốt' }], 'v').includes('convo-vs'));
  assert.ok(L.ctx.convoFmtExplain([{ hz: '好', vi: 'tốt' }], 'v', true).includes('class="convo-vs" data-hz="好"'));
});

runAll();
