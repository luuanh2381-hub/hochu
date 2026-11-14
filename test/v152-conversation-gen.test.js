#!/usr/bin/env node
// test/v152-conversation-gen.test.js — V152: sinh lượt thoại bằng AI + kiểm tra tự động + duyệt bài + ghi Neon.
// KHÔNG cần Postgres/mạng/AI thật: lõi sinh chạy với model giả; DB/route kiểm bằng đọc mã nguồn; UI chạy THẬT trong vm.
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

// ── Dữ liệu mẫu: 14 lượt hợp lệ (zh/py khớp số âm tiết) ──
const NUMS = [['一', 'yī'], ['二', 'èr'], ['三', 'sān'], ['四', 'sì'], ['五', 'wǔ'], ['六', 'liù'], ['七', 'qī'], ['八', 'bā'], ['九', 'jiǔ'], ['十', 'shí'], ['两', 'liǎng'], ['几', 'jǐ'], ['每', 'měi'], ['全', 'quán']];
const goodTurns = () => NUMS.map(([h, p], i) => ({
  character: i % 2 ? 'B' : 'A', zh: `第${h}条线没问题。`, py: `dì ${p} tiáo xiàn méi wèn tí`, vi: `Dây chuyền số ${i + 1} không có vấn đề.`,
  vocab: [{ hz: '没问题', py: 'méi wèn tí', vi: 'không vấn đề' }], grammar: i === 0 ? [{ pattern: '第 + số', note_vi: 'Số thứ tự' }] : [],
}));
const CONVO = { id: 7, dialogue_id: 'hsk3-002', title_zh: '生产线检查', title_vi: 'Kiểm tra dây chuyền', hsk_level: 'HSK 3', topic: 'QA/QC', situation: 'Kiểm tra chất lượng', characters: ['A', 'B'] };
const CTX = { characters: ['A', 'B'], targetTurns: 14 };

// ── Kiểm tra tự động ──
test('validateTurns: bản hợp lệ qua, ánh xạ đúng cột DB, đánh số lượt 1..n', () => {
  const v = G.validateTurns({ turns: goodTurns() }, CTX);
  assert.deepStrictEqual(v.errors, []); assert.ok(v.ok);
  assert.strictEqual(v.turns.length, 14);
  assert.strictEqual(v.turns[0].turn_number, 1); assert.strictEqual(v.turns[13].turn_number, 14);
  const t = v.turns[0];
  assert.deepStrictEqual(Object.keys(t).sort(), ['character', 'chinese_text', 'grammar_explanations', 'pinyin', 'turn_number', 'vietnamese_text', 'vocabulary_explanations']);
  assert.strictEqual(t.chinese_text, '第一条线没问题。');
  assert.deepStrictEqual(t.vocabulary_explanations, [{ hz: '没问题', py: 'méi wèn tí', vi: 'không vấn đề' }]);
  assert.strictEqual(v.turns[1].grammar_explanations, null, 'mảng rỗng → null (JSONB gọn)');
});

test('validateTurns: bắt pinyin sai số âm tiết (lỗi AI hay gặp)', () => {
  const t = goodTurns(); t[3].py = 'dì sì tiáo xiàn méi wèn';
  const v = G.validateTurns(t, CTX);
  assert.ok(!v.ok && v.errors.some((e) => /^Lượt 4:.*pinyin/.test(e)), v.errors.join('|'));
});

test('validateTurns: nhi hoá 儿 được gộp âm; chữ số/Latin trong zh bị chặn', () => {
  const t = goodTurns(); t[0].zh = '你去哪儿？'; t[0].py = 'nǐ qù nǎr'; t[0].vocab = [];
  assert.ok(G.validateTurns(t, CTX).ok, 'pinyin gộp 儿 hợp lệ');
  const t2 = goodTurns(); t2[2].zh = '第3条线没问题。';
  assert.ok(G.validateTurns(t2, CTX).errors.some((e) => /^Lượt 3:.*chữ số/.test(e)));
  const t3 = goodTurns(); t3[2].zh = '第三条线OK没问题。';
  assert.ok(G.validateTurns(t3, CTX).errors.some((e) => /^Lượt 3:.*Latin/.test(e)));
});

test('validateTurns: sai nhân vật, trùng lặp, thiếu số lượt, một người nói, tiếng Việt lẫn chữ Hán', () => {
  let t = goodTurns(); t[1].character = 'C';
  assert.ok(G.validateTurns(t, CTX).errors.some((e) => /nhân vật "C"/.test(e)));
  t = goodTurns(); t[5].zh = t[4].zh; t[5].py = t[4].py;
  assert.ok(G.validateTurns(t, CTX).errors.some((e) => /trùng lặp/.test(e)));
  assert.ok(G.validateTurns(goodTurns().slice(0, 6), CTX).errors.some((e) => /Số lượt = 6/.test(e)));
  t = goodTurns().map((x) => Object.assign(x, { character: 'A' }));
  assert.ok(G.validateTurns(t, CTX).errors.some((e) => /một nhân vật/.test(e)));
  t = goodTurns(); t[0].vi = 'Dây chuyền 没问题';
  assert.ok(G.validateTurns(t, CTX).errors.some((e) => /còn chữ Hán/.test(e)));
  assert.ok(!G.validateTurns({}, CTX).ok); assert.ok(!G.validateTurns(null, CTX).ok);
});

test('validateTurns: vocab không nằm trong câu bị LOẠI (cảnh báo), không làm hỏng cả bài', () => {
  const t = goodTurns(); t[0].vocab = [{ hz: '吃饭', py: 'chī fàn', vi: 'ăn cơm' }, { hz: '没问题', py: 'méi wèn tí', vi: 'ok' }];
  const v = G.validateTurns(t, CTX);
  assert.ok(v.ok); assert.strictEqual(v.turns[0].vocabulary_explanations.length, 1);
  assert.ok(v.warnings.some((w) => /吃饭/.test(w)));
});

test('parseModelJson: bỏ rào ```json, <think>, chữ thừa; phát hiện JSON bị cắt', () => {
  const j = '{"turns":[{"a":1}]}';
  assert.ok(G.parseModelJson('```json\n' + j + '\n```').ok);
  assert.ok(G.parseModelJson('<think>nghĩ...</think>\nĐây là kết quả: ' + j + ' hết.').ok);
  const cut = G.parseModelJson('{"turns":[{"character":"A","zh":"你好');
  assert.ok(!cut.ok && cut.truncated === true);
  assert.ok(!G.parseModelJson('không phải json').ok);
});

test('buildPrompt: có tiêu đề, cấp độ, nhân vật, số lượt; ghi lỗi lần trước & yêu cầu rút ngắn khi cần', () => {
  const p = G.buildPrompt(CONVO, { targetTurns: 20 });
  for (const s of ['生产线检查', 'Kiểm tra dây chuyền', 'HSK 3', 'QA/QC', 'Đúng 20 lượt', 'A, B', '600 từ', 'CHỈ TRẢ VỀ JSON']) assert.ok(p.includes(s), s);
  assert.ok(G.buildPrompt({ ...CONVO, hsk_level: 'HSK 4' }, {}).includes('1200 từ'));
  const q = G.buildPrompt(CONVO, { targetTurns: 20, fixNotes: ['Lượt 4: pinyin 6 âm tiết ≠ 7 chữ Hán'], shrink: true });
  assert.ok(q.includes('Lượt 4: pinyin 6') && q.includes('NGẮN HƠN'));
  assert.strictEqual(G.clampTarget(5), 12); assert.strictEqual(G.clampTarget(999), 34); assert.strictEqual(G.clampTarget('x'), 20);
});

// ── Vòng sinh + thử lại ──
test('generateConversationTurns: lần 1 JSON hỏng, lần 2 sai pinyin, lần 3 đúng → thành công, lỗi được đưa vào prompt lần sau', async () => {
  const prompts = [];
  const bad = goodTurns(); bad[0].py = 'dì yī';
  const replies = ['không phải json', JSON.stringify({ turns: bad }), JSON.stringify({ turns: goodTurns() })];
  const r = await G.generateConversationTurns({ convo: CONVO, targetTurns: 14, callModel: async (p) => { prompts.push(p); return replies[prompts.length - 1]; } });
  assert.ok(r.ok); assert.strictEqual(r.attempts, 3); assert.strictEqual(r.turns.length, 14);
  assert.ok(/JSON không hợp lệ/.test(prompts[1]), 'lần 2 nhận lỗi parse');
  assert.ok(/pinyin/.test(prompts[2]) && /Lượt 1/.test(prompts[2]), 'lần 3 nhận lỗi kiểm tra');
  assert.strictEqual(r.promptVersion, G.PROMPT_VERSION);
});

test('generateConversationTurns: hỏng cả 3 lần → ok=false kèm lỗi cuối (không ghi DB); lỗi mạng của model được ném lên', async () => {
  let n = 0;
  const r = await G.generateConversationTurns({ convo: CONVO, targetTurns: 14, callModel: async () => { n++; return JSON.stringify({ turns: goodTurns().slice(0, 3) }); } });
  assert.strictEqual(n, 3); assert.ok(!r.ok && r.errors.length && /Số lượt/.test(r.errors[0]));
  await assert.rejects(() => G.generateConversationTurns({ convo: CONVO, callModel: async () => { throw new Error('429 quota exceeded'); } }), /quota/);
});

test('cắt giữa chừng → lần sau yêu cầu viết ngắn hơn', async () => {
  const prompts = [];
  const r = await G.generateConversationTurns({ convo: CONVO, targetTurns: 14, maxAttempts: 2, callModel: async (p) => { prompts.push(p); return prompts.length === 1 ? '{"turns":[{"character":"A","zh":"你好' : JSON.stringify({ turns: goodTurns() }); } });
  assert.ok(r.ok && /NGẮN HƠN/.test(prompts[1]));
});

// ── DB (đọc mã nguồn) ──
test('lib/db.js: người học chỉ thấy bài READY; admin (includeUnready) thấy tất cả; thống kê chỉ đếm bài ready', () => {
  const db = read('lib/db.js');
  assert.ok(/if \(genOk && !filters\.includeUnready\) query \+= " AND gen_status = 'ready'"/.test(db));
  assert.ok(/async function getConversationWithTurns\(conversationId, opts = \{\}\)/.test(db) && /genOk && !opts\.includeUnready/.test(db));
  assert.ok(/WHERE is_active = true\$\{genOk \? " AND gen_status = 'ready'" : ''\}/.test(db));
});

test('lib/db.js: ensure lược đồ idempotent + khoá tư vấn + không làm gãy khi thất bại; bài có sẵn lượt thoại → ready', () => {
  const db = read('lib/db.js');
  const i = db.indexOf('function ensureConversationGenSchema'); const blk = db.slice(i, i + 4200);
  assert.ok(/pg_advisory_xact_lock/.test(blk) && /ADD COLUMN IF NOT EXISTS gen_status/.test(blk));
  assert.ok(/DROP CONSTRAINT conversations_total_turns_check/.test(blk) && /CHECK \(total_turns >= 12\)/.test(blk));
  assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_turns_pos/.test(blk) && /EXCEPTION WHEN unique_violation/.test(blk));
  assert.ok(/SET gen_status = 'ready'[\s\S]*EXISTS \(SELECT 1 FROM conversation_turns/.test(blk), 'bài đã có lượt thoại không biến mất khỏi thư viện');
  assert.ok(/ROLLBACK/.test(blk) && /convoGenSchemaPromise = null/.test(blk) && /return false/.test(blk));
});

test('lib/db.js: saveGeneratedConversation = 1 transaction ngắn, khoá hàng, xoá-rồi-chèn nhiều dòng, reset tiến độ, thành nháp', () => {
  const db = read('lib/db.js');
  const i = db.indexOf('async function saveGeneratedConversation'); const blk = db.slice(i, i + 3400);
  for (const re of [/BEGIN/, /FOR UPDATE/, /DELETE FROM conversation_turns/, /INSERT INTO conversation_turns/, /::jsonb/, /gen_status = 'draft'/, /UPDATE conversation_progress SET last_played_turn = 0/, /COMMIT/, /ROLLBACK/, /client\.release\(\)/]) assert.ok(re.test(blk), String(re));
  assert.ok(/setConversationApproval/.test(db) && /EXISTS \(SELECT 1 FROM conversation_turns/.test(db.slice(db.indexOf('async function setConversationApproval'))), 'chỉ duyệt bài có lượt thoại');
  for (const n of ['pickConversationsForGen', 'getConversationForGen', 'setConversationGenState', 'saveGeneratedConversation', 'setConversationApproval', 'getConversationGenOverview', 'ensureConversationGenSchema']) {
    assert.ok(new RegExp('module\\.exports = \\{[\\s\\S]*\\b' + n + '\\b').test(db), 'export ' + n);
  }
});

// ── API (đọc mã nguồn) ──
test('api/index.js: route quản trị bắt buộc admin, tối đa 3 bài/lượt, không đè bài đã duyệt nếu không force; callGemini mặc định không đổi', () => {
  const api = read('api/index.js');
  for (const route of ["app.get('/api/admin/conversations'", "app.post('/api/admin/conversations/generate'", "app.post('/api/admin/conversations/:dialogueId/status'"]) {
    const i = api.indexOf(route); assert.ok(i > 0, route);
    assert.ok(/requireAdmin\(/.test(api.slice(i, i + 500)), route + ' phải kiểm tra admin');
  }
  assert.ok(/\.slice\(0, 3\)/.test(api.slice(api.indexOf("app.post('/api/admin/conversations/generate'"), api.indexOf("app.post('/api/admin/conversations/generate'") + 1200)));
  assert.ok(/convo\.gen_status === 'ready' && force !== true/.test(api));
  assert.ok(/\(opts && opts\.maxTokens\) \|\| 4096/.test(api) && /\(opts && opts\.timeoutMs\) \|\| 25000/.test(api), 'mặc định cũ 4096 token / 25 giây');
  assert.ok(/convoIsAdmin && req\.query\.all === '1'/.test(api) && /includeUnready: convoIsAdmin/.test(api));
  assert.ok(/status !== 'ready' && status !== 'draft'/.test(api));
});

// ── Giao diện (chạy thật trong vm) ──
function uiEnv(admin) {
  const calls = [];
  const els = {};
  const ctx = vm.createContext({
    console, window: { scrollTo() {} }, URLSearchParams, encodeURIComponent, confirm: () => true,
    document: { getElementById: (id) => els[id] || null, body: { insertAdjacentHTML() {} } },
    localStorage: { getItem: () => null, setItem() {} },
    fetch: (url, opts) => { calls.push({ url, opts }); return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, results: [], counts: { pending: 2, draft: 1, ready: 3, failed: 0 }, items: [] }) }); },
    ttsSpeakSegments() {}, goTab() {}, pauseSpeaking() {}, resumeSpeaking() {}, stopSpeaking() {},
  });
  vm.runInContext(`function escapeHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
    var authToken='tok123'; function authHeaders(){return {Authorization:'Bearer t'};} function isAdminRole(){return ${admin ? 'true' : 'false'};} var ttsRate=0.9;`, ctx);
  vm.runInContext(read('js/conversation.js'), ctx);
  return { ctx, calls, els };
}

test('UI: người học thường KHÔNG thấy thanh quản trị và không gọi API quản trị', async () => {
  const E = uiEnv(false);
  assert.strictEqual(E.ctx.convoAdminBar({ dialogue_id: 'hsk3-001', gen_status: 'draft', turns: [{}] }), '');
  E.els['convo-admin'] = { innerHTML: '' };
  await E.ctx.loadConvoAdmin();
  assert.strictEqual(E.calls.length, 0);
});

test('UI: admin thấy nút theo trạng thái (Duyệt/Gỡ duyệt/Sinh/Sinh lại); id được làm sạch, lỗi được escape', () => {
  const E = uiEnv(true); const bar = (o) => E.ctx.convoAdminBar(o);
  assert.ok(/convoSetApproval\('hsk3-001','ready'\)/.test(bar({ dialogue_id: 'hsk3-001', gen_status: 'draft', turns: [{}] })));
  assert.ok(/Gỡ duyệt/.test(bar({ dialogue_id: 'hsk3-001', gen_status: 'ready', turns: [{}] })));
  assert.ok(/Sinh bằng AI/.test(bar({ dialogue_id: 'hsk3-001', gen_status: 'pending', turns: [] })));
  assert.ok(/convoRegenerate\('hsk3-001'\)/.test(bar({ dialogue_id: 'hsk3-001', gen_status: 'ready', turns: [{}] })));
  const evil = bar({ dialogue_id: "x');alert(1);('", gen_status: 'failed', gen_error: '<img src=x onerror=1>', turns: [] });
  assert.ok(evil.includes("convoGenerate(1,['xalert1'],false)") && !evil.includes("');alert"), 'id bị làm sạch, không thoát khỏi chuỗi onclick');
  assert.ok(!/<img src=x/.test(evil) && /&lt;img/.test(evil));
});

test('UI: convoFmtExplain dễ đọc + escape; dữ liệu cũ dạng lạ không làm vỡ', () => {
  const { ctx } = uiEnv(true);
  assert.strictEqual(ctx.convoFmtExplain([{ hz: '没问题', py: 'méi wèn tí', vi: 'ok' }], 'v'), '没问题 (méi wèn tí): ok');
  assert.strictEqual(ctx.convoFmtExplain([{ pattern: '第 + số', note_vi: 'Số thứ tự' }], 'g'), '第 + số — Số thứ tự');
  assert.ok(!/<script>/.test(ctx.convoFmtExplain([{ hz: '<script>', vi: 'x' }], 'v')));
  assert.strictEqual(typeof ctx.convoFmtExplain({ a: 1 }, 'v'), 'string');
});

test('UI: sinh bài gọi đúng API, bấm đúp không gửi 2 lần; duyệt gọi đúng đường dẫn', async () => {
  const E = uiEnv(true);
  E.els['convo-gen-msg'] = { textContent: '' };
  const p1 = E.ctx.convoGenerate(1, ['hsk3-002'], false); E.ctx.convoGenerate(1, ['hsk3-002'], false);
  await p1;
  const posts = E.calls.filter((c) => /generate/.test(c.url));
  assert.strictEqual(posts.length, 1);
  assert.strictEqual(posts[0].opts.method, 'POST'); assert.strictEqual(posts[0].url, '/api/admin/conversations/generate');
  assert.deepStrictEqual(JSON.parse(posts[0].opts.body), { count: 1, force: false, dialogueIds: ['hsk3-002'] });
  await E.ctx.convoSetApproval('hsk3-002', 'ready');
  const ap = E.calls.find((c) => /\/status$/.test(c.url));
  assert.strictEqual(ap.url, '/api/admin/conversations/hsk3-002/status'); assert.deepStrictEqual(JSON.parse(ap.opts.body), { status: 'ready' });
});

runAll();
