#!/usr/bin/env node
// test/v177-neon-load.test.js — V177: giảm số lượt hỏi Neon khi server "thức dậy" (KHÔNG đổi cách ghi kết quả học).
//  (1) lib/schema-state.js: bỏ qua lệnh tạo bảng khi lược đồ đã áp dụng cho đúng phiên bản code; luôn "không chắc thì chạy như cũ".
//  (2) lib/db-target.js: dòng nhật ký vùng Neon / pooler / khác vùng Vercel, không lộ mật khẩu.
//  (3) Nối dây: 15 hàm khởi tạo thật được bọc, 2 hàm có "gieo dòng dữ liệu" thì KHÔNG bọc, vercel.json đặt vùng Sydney.
//  (4) Chạy hàm khởi tạo THẬT (ensureFsrsTables) qua 2 lần "thức dậy" với database giả: lần 2 chỉ còn 1 lệnh.
const assert = require('assert'); const fs = require('fs'); const path = require('path'); const Module = require('module');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SS = require('../lib/schema-state');
const DT = require('../lib/db-target');

// ---- Database giả dùng chung giữa các lần "thức dậy": nhớ bảng schema_state; đếm các lệnh khác.
function fakeDb() {
  const db = { hasState: false, state: new Map(), log: [], failSelect: null, failInsert: false };
  db.client = { async query(sql, params) {
    const t = String(sql).replace(/\s+/g, ' ').trim(); db.log.push(t);
    if (/^SELECT name, fingerprint FROM schema_state/.test(t)) { if (db.failSelect) throw db.failSelect; if (!db.hasState) throw Object.assign(new Error('relation "schema_state" does not exist'), { code: '42P01' }); return { rows: [...db.state].map(([name, fingerprint]) => ({ name, fingerprint })) }; }
    if (/^CREATE TABLE IF NOT EXISTS schema_state/.test(t)) { db.hasState = true; return { rows: [] }; }
    if (/^INSERT INTO schema_state/.test(t)) { if (db.failInsert) throw new Error('read-only'); db.state.set(params[0], params[1]); return { rows: [] }; }
    if (/^SELECT COUNT\(\*\)/.test(t)) return { rows: [{ c: 5, count: 5 }], rowCount: 1 }; // bảng đã có dữ liệu → các bước di trú 1 lần của ensureVocabTable không chạy
    return { rows: [], rowCount: 0 };
  } };
  db.ddl = () => db.log.filter((q) => !/schema_state/.test(q)).length;
  return db;
}
// Mỗi lần gọi = 1 lần server "thức dậy": trạng thái trong bộ nhớ bị xoá, wrapper mới.
const coldStart = () => SS._resetForTests();
function makeImpl(label, ddlCount) { const impl = async function ensureDemoImpl(client, ...rest) { impl.calls++; impl.args = rest; for (let i = 0; i < ddlCount; i++) await client.query('CREATE TABLE IF NOT EXISTS ' + label + i + ' (id int)'); }; impl.calls = 0; return impl; }

const tests = []; const test = (n, f) => tests.push([n, f]);

test('lần đầu: chạy đủ lệnh tạo bảng, tạo schema_state và ghi dấu vân tay', async () => {
  coldStart(); const db = fakeDb(); const impl = makeImpl('t', 5); const ensure = SS.withSchemaFastPath('demo', impl);
  await ensure(db.client); assert.strictEqual(impl.calls, 1); assert.strictEqual(db.ddl(), 5); assert.ok(db.hasState); assert.strictEqual(db.state.get('demo'), SS.fingerprint(impl));
});
test('lần "thức dậy" sau: chỉ 1 lệnh SELECT, KHÔNG chạy lại lệnh tạo bảng', async () => {
  coldStart(); const db = fakeDb(); const impl = makeImpl('t', 5); await SS.withSchemaFastPath('demo', impl)(db.client);
  coldStart(); db.log.length = 0; const impl2 = makeImpl('t', 5); // cùng mã nguồn
  Object.defineProperty(impl2, 'toString', { value: () => Function.prototype.toString.call(impl) });
  await SS.withSchemaFastPath('demo', impl2)(db.client);
  assert.strictEqual(impl2.calls, 0, 'không chạy lại'); assert.strictEqual(db.log.length, 1, 'đúng 1 lệnh'); assert.ok(/^SELECT name, fingerprint FROM schema_state/.test(db.log[0]));
});
test('nhiều hàm khởi tạo cùng 1 lần thức dậy dùng CHUNG 1 lệnh SELECT; gọi lặp/đồng thời dùng chung 1 lần chạy', async () => {
  coldStart(); const db = fakeDb(); const a = makeImpl('a', 3), b = makeImpl('b', 4);
  const ea = SS.withSchemaFastPath('a', a), eb = SS.withSchemaFastPath('b', b);
  await Promise.all([ea(db.client), ea(db.client), eb(db.client), ea(db.client)]);
  assert.strictEqual(a.calls, 1); assert.strictEqual(b.calls, 1); assert.strictEqual(db.log.filter((q) => /^SELECT name/.test(q)).length, 1);
});
test('mã khởi tạo bị SỬA (thêm cột/bảng) → dấu vân tay đổi → chạy lại đúng 1 lần rồi cập nhật', async () => {
  coldStart(); const db = fakeDb(); const v1 = async function ensureXImpl(c) { v1.calls = (v1.calls || 0) + 1; await c.query('CREATE TABLE IF NOT EXISTS x (a int)'); };
  await SS.withSchemaFastPath('x', v1)(db.client); const fp1 = db.state.get('x');
  coldStart(); const v2 = async function ensureXImpl(c) { v2.calls = (v2.calls || 0) + 1; await c.query('CREATE TABLE IF NOT EXISTS x (a int)'); await c.query('ALTER TABLE x ADD COLUMN IF NOT EXISTS b int'); };
  await SS.withSchemaFastPath('x', v2)(db.client); assert.strictEqual(v2.calls, 1); assert.notStrictEqual(db.state.get('x'), fp1);
  coldStart(); await SS.withSchemaFastPath('x', v2)(db.client); assert.strictEqual(v2.calls, 1, 'lần sau lại bỏ qua');
});
test('SCHEMA_FORCE_INIT=1 ép chạy lại dù đã áp dụng (dùng sau khi tự tay xoá bảng)', async () => {
  coldStart(); const db = fakeDb(); const impl = makeImpl('t', 2); await SS.withSchemaFastPath('d', impl)(db.client);
  coldStart(); process.env.SCHEMA_FORCE_INIT = '1';
  try { await SS.withSchemaFastPath('d', impl)(db.client); assert.strictEqual(impl.calls, 2); } finally { delete process.env.SCHEMA_FORCE_INIT; }
});
test('không đọc được schema_state (lỗi khác 42P01) → chạy đầy đủ như cũ, không ghi dấu vân tay, không ném lỗi', async () => {
  coldStart(); const db = fakeDb(); db.failSelect = Object.assign(new Error('connection reset'), { code: '08006' }); const impl = makeImpl('t', 3);
  await SS.withSchemaFastPath('d', impl)(db.client); assert.strictEqual(impl.calls, 1); assert.strictEqual(db.ddl(), 3); assert.ok(!db.log.some((q) => /^INSERT INTO schema_state/.test(q)));
});
test('hàm khởi tạo ném lỗi → lỗi được báo ra, KHÔNG nhớ lỗi (lần sau thử lại), KHÔNG ghi dấu vân tay', async () => {
  coldStart(); const db = fakeDb(); let n = 0; const impl = async function ensureFlakyImpl() { n++; if (n === 1) throw new Error('Neon vừa thức dậy'); };
  const ensure = SS.withSchemaFastPath('f', impl);
  await assert.rejects(() => ensure(db.client), /Neon vừa thức dậy/); assert.ok(!db.state.has('f'));
  await ensure(db.client); assert.strictEqual(n, 2); assert.ok(db.state.has('f'));
});
test('ghi dấu vân tay lỗi → việc khởi tạo vẫn thành công (chỉ lần sau chạy lại)', async () => {
  coldStart(); const db = fakeDb(); db.failInsert = true; const impl = makeImpl('t', 2);
  await SS.withSchemaFastPath('d', impl)(db.client); assert.strictEqual(impl.calls, 1);
});
test('tham số thêm được chuyển nguyên cho hàm gốc; dấu vân tay ổn định theo mã nguồn', async () => {
  coldStart(); const db = fakeDb(); const impl = makeImpl('t', 1); await SS.withSchemaFastPath('d', impl)(db.client, 'x', 7); assert.deepStrictEqual(impl.args, ['x', 7]);
  assert.strictEqual(SS.fingerprint(impl), SS.fingerprint(impl)); assert.notStrictEqual(SS.fingerprint(impl), SS.fingerprint(async function other() {}));
});

// ---- db-target
test('db-target: đọc vùng + pooler từ tên máy chủ Neon; không lộ mật khẩu', () => {
  const url = 'postgresql://user:sekretPW@ep-cool-darkness-a1b2c3d4-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require';
  assert.deepStrictEqual(JSON.parse(JSON.stringify(DT.parseNeonHost(url))), { pooler: true, region: 'ap-southeast-2' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(DT.parseNeonHost('postgresql://u:p@ep-x-123.us-east-2.aws.neon.tech/db'))), { pooler: false, region: 'us-east-2' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(DT.parseNeonHost('postgresql://u:p@ep-xxxx.aws.neon.tech/db'))), { pooler: false, region: null }, 'bản cũ không có vùng');
  assert.strictEqual(DT.parseNeonHost('postgresql://u:p@localhost:5432/db'), null);
  const d = DT.describeDbTarget(url, 'syd1'); assert.ok(!d.line.includes('sekretPW') && !d.line.includes('user:')); assert.ok(d.line.includes('ap-southeast-2') && d.line.includes('POOLER') && d.line.includes('syd1')); assert.strictEqual(d.warn, false);
});
test('db-target: cảnh báo khi khác vùng (gợi ý đúng mã Vercel) hoặc dùng địa chỉ trực tiếp', () => {
  const direct = 'postgresql://u:p@ep-x-123.ap-southeast-2.aws.neon.tech/db';
  const a = DT.describeDbTarget(direct, 'iad1'); assert.ok(a.warn && a.line.includes('KHÁC VÙNG') && a.line.includes('syd1') && a.line.includes('TRỰC TIẾP'));
  const b = DT.describeDbTarget('postgresql://u:p@ep-x-123-pooler.ap-southeast-2.aws.neon.tech/db', 'iad1'); assert.ok(b.warn && b.line.includes('Function Region = syd1'));
  const c = DT.describeDbTarget('postgresql://u:p@ep-x-123-pooler.ap-southeast-2.aws.neon.tech/db', undefined); assert.ok(!c.warn, 'không biết vùng Vercel (chạy máy cục bộ) → không cảnh báo');
  assert.strictEqual(DT.NEON_TO_VERCEL['ap-southeast-2'], 'syd1'); assert.strictEqual(DT.NEON_TO_VERCEL['ap-southeast-1'], 'sin1');
});

// ---- Nối dây
const WRAPPED = { 'lib/db.js': ['ensureVocabTable', 'ensureBookDefsTable', 'ensureWordExampleTable', 'ensureSentenceWordsTable', 'ensureHanziPartsTable', 'ensureActivityLogTable', 'ensureAiConfigTable', 'ensureFsrsTables'], 'lib/skill-store.js': ['ensureSkillTables'], 'lib/fsrs/analytics.js': ['ensureAnalyticsTables'], 'lib/fsrs/optimizer.js': ['ensureOptimizerTables'], 'lib/fsrs/reviewService.js': ['ensureUserSettingsTable'], 'lib/word-notes.js': ['ensureNotesTable'], 'lib/ai-explain.js': ['ensureTables'], 'lib/tts-hints.js': ['ensureTable'] };
test('nối dây: 15 hàm khởi tạo được bọc, require đứng TRƯỚC chỗ dùng, khoá trạng thái không trùng nhau', () => {
  const keys = []; let n = 0;
  for (const [f, fns] of Object.entries(WRAPPED)) {
    const s = read(f); const L = s.split('\n'); const req = L.findIndex((l) => /withSchemaFastPath \} = require\('(\.|\.\.)\/schema-state'\)/.test(l)); assert.ok(req >= 0, f + ' thiếu require');
    for (const fn of fns) {
      const w = L.findIndex((l) => new RegExp("^const " + fn + " = withSchemaFastPath\\('([^']+)', " + fn + "Impl\\);").test(l)); assert.ok(w > req, f + ':' + fn + ' chưa được bọc đúng thứ tự');
      keys.push(new RegExp("withSchemaFastPath\\('([^']+)', " + fn + "Impl").exec(L[w])[1]);
      assert.ok(new RegExp('^(async )?function ' + fn + 'Impl\\(client\\)').test(L.find((l) => l.includes('function ' + fn + 'Impl(')) || ''), fn + 'Impl phải là hàm gốc'); n++;
    }
  }
  assert.strictEqual(n, 15); assert.strictEqual(new Set(keys).size, 15, 'khoá trạng thái phải khác nhau');
});
test('2 hàm có "gieo dòng dữ liệu" (app_store id=1, gemini_rate_limit) KHÔNG bị bọc → vẫn chạy như cũ mỗi lần thức dậy', () => {
  const s = read('lib/db.js');
  assert.ok(/^(async )?function ensureTable\(client\)/m.test(s) && !/ensureTableImpl|withSchemaFastPath\('db\.app_store'/.test(s));
  assert.ok(/^(async )?function ensureGeminiRateTable\(client\)/m.test(s) && !/ensureGeminiRateTableImpl/.test(s));
});
test('db.js: có bộ xử lý lỗi kết nối rảnh + dòng nhật ký vùng/pooler; vercel.json đặt vùng Sydney (cùng vùng Neon)', () => {
  const s = read('lib/db.js'); assert.ok(/pool\.on\('error'/.test(s) && /describeDbTarget\(connectionString, process\.env\.VERCEL_REGION\)/.test(s));
  const v = JSON.parse(read('vercel.json')); assert.deepStrictEqual(v.regions, ['syd1']); assert.strictEqual(v.functions['api/index.js'].maxDuration, 300, 'cấu hình khác giữ nguyên');
});
test('ghi kết quả sau mỗi câu KHÔNG bị đụng: hàm ghi ôn tập (reviewService) không gọi schema-state; chỉ hàm khởi tạo bảng được bọc', () => {
  const s = read('lib/fsrs/reviewService.js'); const uses = s.split('\n').filter((l) => /withSchemaFastPath/.test(l));
  assert.strictEqual(uses.length, 2, 'chỉ dòng require + 1 dòng bọc ensureUserSettingsTable');
  assert.ok(uses.every((l) => /require\(|ensureUserSettingsTable/.test(l)));
});

// ---- Hàm khởi tạo THẬT qua 2 lần thức dậy
function loadFresh() {
  for (const k of Object.keys(require.cache)) if (k.startsWith(path.join(ROOT, 'lib'))) delete require.cache[k];
  const orig = Module._load;
  const stub = () => new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : (k === Symbol.toPrimitive ? () => '' : stub())), apply: () => stub(), construct: () => stub() });
  Module._load = function (req) {
    try { return orig.apply(this, arguments); } catch (e) {
      if (e && e.code === 'MODULE_NOT_FOUND' && !req.startsWith('.') && !req.startsWith('/')) {
        if (req === 'pg') return { Pool: class { on() {} } };
        if (req === 'ts-fsrs') return new Proxy({ generatorParameters: () => ({ w: new Array(21).fill(0.5) }) }, { get: (t, k) => (k in t ? t[k] : stub()) });
        return stub();
      } throw e;
    }
  };
  try { return { db: require('../lib/db'), skill: require('../lib/skill-store') }; } finally { Module._load = orig; }
}
test('THẬT: ensureFsrsTables + ensureSkillTables — lần thức dậy đầu chạy đủ, lần sau chỉ còn 1 lệnh cho cả hai', async () => {
  const database = fakeDb();
  let m = loadFresh(); await m.db.ensureFsrsTables(database.client); await m.skill.ensureSkillTables(database.client);
  const first = database.log.length; assert.ok(database.ddl() >= 30, 'lần đầu phải chạy đủ lệnh tạo bảng/cột/index (' + database.ddl() + ')');
  assert.ok(database.state.has('db.fsrs') && database.state.has('skill-store.skills'));
  database.log.length = 0; m = loadFresh(); await m.db.ensureFsrsTables(database.client); await m.skill.ensureSkillTables(database.client);
  assert.strictEqual(database.log.length, 1, 'lần sau: ' + database.log.length + ' lệnh (trước đây ' + first + ')'); assert.ok(/^SELECT name, fingerprint FROM schema_state/.test(database.log[0]));
  console.log('     ↳ số lệnh gửi tới Neon mỗi lần server thức dậy (chỉ 2 nhóm bảng này): ' + first + ' → ' + database.log.length);
});

(async () => {
  let passed = 0, failed = 0;
  for (const [n, f] of tests) { try { await f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.message)); } }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
