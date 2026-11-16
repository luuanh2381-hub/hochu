#!/usr/bin/env node
// test/v156-word-examples-file.test.js — V166: nhập hội thoại từ file ngoài — phần thuần (đọc/kiểm tra) + POSTGRES THẬT (thêm / bỏ qua / ghi đè / xem trước).
// Không có Postgres test → SKIP và thoát mã 3. Mỗi test dùng DB riêng.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { connectMini } = require('./helpers/mini-pg');
const ROOT = path.join(__dirname, '..');
const STUB_MODULES = /^(ts-fsrs|\.\/fsrs|\.\/fsrs-auto-rating|\.\/skill-store|\.\/word-notes)$/;
let passed = 0, failed = 0, skipped = 0; const pending = []; const createdDbs = []; let seq = 0;
const test = (n, f, db) => pending.push({ n, f, db: !!db });

const CI = require('../lib/conversation-import');
const tpl = () => CI.templateRows();
const mk = (id, n, over = {}) => Array.from({ length: n }, (_, i) => Object.assign({
  dialogue_id: i === 0 ? id : '', title_zh: i === 0 ? '测试' : '', title_vi: i === 0 ? 'Thử' : '', hsk_level: i === 0 ? 'HSK 3' : '', topic: i === 0 ? 'Chủ đề' : '',
  turn: i + 1, character: i % 2 ? 'B' : 'A', zh: `我今天很高兴见到你${'一二三四五六七八九十'[i % 10]}${i}。`.replace(/[0-9]/g, ''), py: '', vi: 'Hôm nay tôi rất vui',
}, over));

test('thuần: file mẫu hợp lệ, 0 cảnh báo, 12 lượt, 2 nhân vật', () => {
  const r = CI.parseConversationRows(tpl()); assert.deepStrictEqual(r.fileErrors, []);
  const d = r.dialogues[0]; assert.ok(d.ok, JSON.stringify(d.errors)); assert.strictEqual(d.turns.length, 12); assert.strictEqual(d.warningCount, 0);
  assert.deepStrictEqual(d.characters, ['服务员', '小明']); assert.strictEqual(d.hsk_level, 'HSK 3');
  assert.deepStrictEqual(d.turns[0].vocabulary_explanations, [{ hz: '请问', py: 'qǐng wèn', vi: 'cho hỏi' }]);
  assert.deepStrictEqual(d.turns[9].grammar_explanations, [{ pattern: '就要', note_vi: 'dùng khi quyết định chọn ngay' }]);
});

test('thuần: tiêu đề cột tiếng Việt/khác hoa thường, HSK dạng số, dòng trống dialogue_id nối tiếp bài trên, dòng trống bị bỏ', () => {
  const rows = tpl().map((r) => ({ 'Mã bài': r.dialogue_id, 'Tiêu đề Trung': r.title_zh, 'Tiêu đề Việt': r.title_vi, 'HSK': r.hsk_level ? 4 : '', 'Chủ đề': r.topic,
    'Nhân vật': r.character, 'Chữ Hán': r.zh, 'Pinyin': r.py, 'Nghĩa': r.vi, 'Lượt': r.turn }));
  rows.splice(3, 0, { 'Mã bài': '', 'Chữ Hán': '' });
  const r = CI.parseConversationRows(rows); assert.deepStrictEqual(r.fileErrors, []);
  assert.ok(r.dialogues[0].ok, JSON.stringify(r.dialogues[0].errors)); assert.strictEqual(r.dialogues[0].hsk_level, 'HSK 4'); assert.strictEqual(r.dialogues[0].turns.length, 12);
});

test('thuần: lỗi chặn bài (ít lượt, HSK sai, thiếu trường, trùng số lượt, id sai); lỗi bài này không ảnh hưởng bài khác', () => {
  const good = tpl();
  const few = tpl().slice(0, 5).map((r, i) => (i === 0 ? { ...r, dialogue_id: 'few-1' } : r));
  const badHsk = tpl().map((r, i) => (i === 0 ? { ...r, dialogue_id: 'bad-hsk', hsk_level: 'HSK 6' } : r));
  const noPy = tpl().map((r, i) => (i === 0 ? { ...r, dialogue_id: 'no-py' } : i === 4 ? { ...r, py: '' } : r));
  const dupTurn = tpl().map((r, i) => (i === 0 ? { ...r, dialogue_id: 'dup' } : i === 3 ? { ...r, turn: 2 } : r));
  const badId = tpl().map((r, i) => (i === 0 ? { ...r, dialogue_id: 'có dấu cách!' } : r));
  const r = CI.parseConversationRows([...good, ...few, ...badHsk, ...noPy, ...dupTurn, ...badId]);
  const by = Object.fromEntries(r.dialogues.map((d) => [d.dialogueId, d]));
  assert.ok(by['mau-001'].ok);
  assert.ok(!by['few-1'].ok && /tối thiểu 12/.test(by['few-1'].errors.join()));
  assert.ok(!by['bad-hsk'].ok && /hsk_level/.test(by['bad-hsk'].errors.join()));
  assert.ok(!by['no-py'].ok && /thiếu py/.test(by['no-py'].errors.join()));
  assert.ok(!by['dup'].ok && /trùng/.test(by['dup'].errors.join()));
  assert.ok(Object.values(by).some((d) => !d.ok && /không hợp lệ/.test(d.errors.join())), 'id sai bị chặn');
});

test('thuần: lệch pinyin / chữ số trong zh / vocab không nằm trong câu chỉ là CẢNH BÁO (vẫn nhập được)', () => {
  const rows = tpl().map((r, i) => (i === 1 ? { ...r, py: 'Wǒ men liǎng', vocab: '不在|bù zài|không có' } : i === 2 ? { ...r, zh: '这边请，想喝点什么2？' } : r));
  const d = CI.parseConversationRows(rows).dialogues[0];
  assert.ok(d.ok, JSON.stringify(d.errors)); assert.ok(d.warningCount >= 3, 'có cảnh báo: ' + d.warningCount);
  assert.strictEqual(d.turns[1].vocabulary_explanations, null);
});

test('thuần: thiếu cột lõi → lỗi cả file có hướng dẫn; quá nhiều dòng bị chặn; số lượt sắp theo cột turn', () => {
  assert.ok(/Thiếu cột/.test(CI.parseConversationRows([{ a: 1, b: 2 }]).fileErrors[0]));
  assert.ok(CI.parseConversationRows(new Array(CI.MAX_ROWS + 1).fill({})).fileErrors.length === 1);
  assert.ok(CI.parseConversationRows([]).fileErrors.length === 1);
  const shuffled = tpl().reverse();
  const r = CI.parseConversationRows(shuffled);
  // dialogue_id nằm ở dòng cuối sau đảo → các dòng đầu chưa có id: báo lỗi rõ ràng thay vì đoán
  assert.ok(r.fileErrors.length > 0 || !r.dialogues[0].ok);
  const t = tpl(); const sw = [t[0], ...t.slice(1).reverse()];
  const d = CI.parseConversationRows(sw).dialogues[0]; assert.ok(d.ok);
  assert.deepStrictEqual(d.turns.map((x) => x.turn_number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.ok(/^你好/.test(d.turns[0].chinese_text), 'lượt 1 là lượt có turn=1 dù dòng bị đảo');
});

test('mã nguồn: route admin (có requireAdmin), route mẫu, UI có đủ hàm, không gọi AI', () => {
  const api = fs.readFileSync(path.join(ROOT, 'api/index.js'), 'utf8');
  const i = api.indexOf("app.post('/api/admin/conversations/import-file'"); assert.ok(i > 0);
  const block = api.slice(i, api.indexOf('// V153: lõi sinh hội thoại DÙNG CHUNG', i));
  assert.ok(/requireAdmin\(/.test(block) && /importConversationsFromFile/.test(block) && !/callGemini|callAi/.test(block));
  assert.ok(api.includes("/api/admin/conversations/import-template'"));
  const ui = fs.readFileSync(path.join(ROOT, 'js/conversation.js'), 'utf8');
  for (const f of ["convoImportFile", "convoDownloadTemplate", "convoReadFile", "convoImportSummary", "convoToggleFileBox"]) assert.ok(ui.includes('function ' + f), f);
});

function useDb(name) {
  const origLoad = Module._load;
  Module._load = function (request) {
    if (STUB_MODULES.test(request)) return {};
    if (request === 'pg') return { Pool: class { async connect() { return connectMini({ database: name }); } async query(s, p) { const c = await connectMini({ database: name }); try { return await c.query(s, p); } finally { c.end(); } } on() {} } };
    return origLoad.apply(this, arguments);
  };
  const dbPath = path.join(ROOT, 'lib/db.js'); const old = process.env.DATABASE_URL; process.env.DATABASE_URL = 'postgresql://u:pw@localhost/x';
  delete require.cache[dbPath];
  return { D: require(dbPath), restore() { Module._load = origLoad; delete require.cache[dbPath]; if (old === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = old; } };
}

test('db THẬT: xem trước không ghi; nhập nháp; đăng ngay; bài đã có bị bỏ qua; ghi đè thay lượt + đặt lại tiến độ; bài lỗi không ghi', async () => {
  const name = `t166_${process.pid}_${++seq}`;
  const a = await connectMini({ database: 'postgres' }); await a.query(`CREATE DATABASE ${name}`); a.end(); createdDbs.push(name);
  const { D, restore } = useDb(name);
  try {
    const probe = await connectMini({ database: name });
    const parse = (rows) => CI.parseConversationRows(rows).dialogues;
    const two = [...tpl(), ...tpl().slice(0, 4).map((r, i) => (i === 0 ? { ...r, dialogue_id: 'loi-ngan' } : r))]; // bài 2 chỉ 4 lượt → lỗi
    // 1) xem trước: KHÔNG ghi
    const dry = await D.importConversationsFromFile(parse(two), { dryRun: true });
    assert.strictEqual(dry.wouldAdd, 1); assert.strictEqual(dry.invalid, 1);
    assert.strictEqual((await probe.query('SELECT COUNT(*)::int n FROM conversations')).rows[0].n, 0);
    // 2) nhập thật (nháp): chỉ bài hợp lệ
    const r1 = await D.importConversationsFromFile(parse(two), { status: 'draft' });
    assert.strictEqual(r1.added, 1); assert.strictEqual(r1.invalid, 1);
    const c = (await probe.query(`SELECT * FROM conversations WHERE dialogue_id='mau-001'`)).rows[0];
    assert.strictEqual(c.gen_status, 'draft'); assert.strictEqual(c.total_turns, 12); assert.strictEqual(c.hsk_level, 'HSK 3'); assert.strictEqual(String(c.characters), '{服务员,小明}');
    assert.strictEqual((await probe.query(`SELECT COUNT(*)::int n FROM conversations WHERE dialogue_id='loi-ngan'`)).rows[0].n, 0, 'bài lỗi không được ghi');
    const turns = (await probe.query('SELECT * FROM conversation_turns WHERE conversation_id=$1 ORDER BY turn_number', [c.id])).rows;
    assert.strictEqual(turns.length, 12); assert.strictEqual(turns[0].pinyin, 'Nǐ hǎo, qǐng wèn jǐ wèi?'); assert.deepStrictEqual(turns[0].vocabulary_explanations, [{ hz: '请问', py: 'qǐng wèn', vi: 'cho hỏi' }]);
    // nháp: người học KHÔNG thấy, admin thấy
    assert.strictEqual(await D.getConversationWithTurns('mau-001'), null);
    assert.strictEqual((await D.getConversationWithTurns('mau-001', { includeUnready: true })).turns.length, 12);
    // 3) nhập lại cùng file: bỏ qua, không đổi gì
    const r2 = await D.importConversationsFromFile(parse(tpl()), { status: 'ready' });
    assert.strictEqual(r2.exists, 1); assert.strictEqual(r2.added, 0);
    assert.strictEqual((await probe.query(`SELECT gen_status FROM conversations WHERE dialogue_id='mau-001'`)).rows[0].gen_status, 'draft');
    // 4) ghi đè + đăng ngay: đổi nội dung, đặt lại tiến độ, id không đổi
    await probe.query(`INSERT INTO conversation_progress (user_id, conversation_id, last_played_turn, times_practiced) VALUES ('u1', $1, 7, 3)`, [c.id]);
    const edited = tpl().map((r, i) => (i === 1 ? { ...r, vi: 'ĐÃ SỬA' } : r));
    const r3 = await D.importConversationsFromFile(parse(edited), { status: 'ready', overwrite: true });
    assert.strictEqual(r3.replaced, 1);
    const c2 = (await probe.query(`SELECT * FROM conversations WHERE dialogue_id='mau-001'`)).rows[0];
    assert.strictEqual(c2.id, c.id); assert.strictEqual(c2.gen_status, 'ready');
    assert.strictEqual((await probe.query('SELECT COUNT(*)::int n FROM conversation_turns WHERE conversation_id=$1', [c.id])).rows[0].n, 12, 'không nhân đôi lượt');
    assert.strictEqual((await probe.query('SELECT vietnamese_text v FROM conversation_turns WHERE conversation_id=$1 AND turn_number=2', [c.id])).rows[0].v, 'ĐÃ SỬA');
    assert.strictEqual((await probe.query('SELECT last_played_turn n FROM conversation_progress WHERE user_id=$1', ['u1'])).rows[0].n, 0);
    assert.strictEqual((await D.getConversationWithTurns('mau-001')).turns.length, 12, 'đã đăng → người học thấy');
    probe.end();
  } finally { restore(); }
}, { db: true });

(async () => {
  let ok = false; try { const a = await connectMini({ database: 'postgres' }); await a.query('SELECT 1'); a.end(); ok = true; } catch (e) { ok = false; }
  for (const { n, f, db } of pending) {
    if (db && !ok) { skipped++; console.log('  ⏭️  SKIP (không có Postgres test) ' + n); continue; }
    try { await f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n     ') : e)); }
  }
  if (ok) { try { const a = await connectMini({ database: 'postgres' }); for (const d of createdDbs) await a.query(`DROP DATABASE IF EXISTS ${d} WITH (FORCE)`); a.end(); } catch (e) { /* bỏ qua */ } }
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  process.exit(failed ? 1 : (skipped ? 3 : 0));
})();
