#!/usr/bin/env node
// test/v154-conversation-schema.test.js — V154: tự khởi tạo lược đồ hội thoại (3 bảng V145 + V152), chạy trên POSTGRES THẬT.
// Cần 1 Postgres cục bộ (TEST_PG_PORT, mặc định 54329, user "postgres", xác thực trust). Không có → các test DB được ĐÁNH DẤU SKIP
// (không tính PASS) và thoát mã 3 để không ai nhầm là đã kiểm thử. Test thuần (phân loại lỗi, che bí mật, danh mục batch) luôn chạy.
// Mỗi tình huống dùng 1 database riêng (tạo/xoá trong file này; không đụng database khác).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { connectMini } = require('./helpers/mini-pg');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const schemaPath = path.join(ROOT, 'lib/conversation-schema.js');
const freshSchema = () => { delete require.cache[schemaPath]; return require(schemaPath); };
const S = freshSchema();
const STUB_MODULES = /^(ts-fsrs|\.\/fsrs|\.\/fsrs-auto-rating|\.\/skill-store|\.\/word-notes|\.\/vocab-merge)$/;

let passed = 0, failed = 0, skipped = 0; const pending = [];
const test = (n, f, opts = {}) => pending.push({ n, f, db: !!opts.db });

// ── Hạ tầng Postgres test ──
let adminOk = false; let seq = 0; const createdDbs = [];
async function admin() { return connectMini({ database: 'postgres' }); }
async function newDb() {
  const name = `t154_${process.pid}_${++seq}`;
  const a = await admin(); await a.query(`CREATE DATABASE ${name}`); a.end(); createdDbs.push(name);
  return name;
}
const conn = (db, user) => connectMini({ database: db, user: user || 'postgres' });
const sqlFile = (f) => read('migrations/' + f);

// Bọc client: ghi lại SQL, hoặc ném lỗi khi gặp mẫu (giả lập lỗi giữa chừng / thiếu quyền extension)
function spy(client, { failOn, failWith } = {}) {
  const log = [];
  return {
    log,
    async query(sql, p) {
      log.push(sql);
      if (failOn && failOn.test(sql)) throw Object.assign(new Error(failWith && failWith.message || 'lỗi giả lập'), { code: failWith && failWith.code || 'XX000' });
      return client.query(sql, p);
    },
    release() { client.release(); },
  };
}

async function dump(c) { // "dấu vân tay" cấu trúc 3 bảng, để so sánh 2 DB
  const cols = (await c.query(`SELECT table_name t, column_name c, data_type d, COALESCE(character_maximum_length::text,'') l, is_nullable n, COALESCE(column_default,'') df
    FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('conversations','conversation_turns','conversation_progress') ORDER BY 1,2`)).rows;
  const cons = (await c.query(`SELECT c.relname t, k.conname n, pg_get_constraintdef(k.oid) d FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
    WHERE c.relname IN ('conversations','conversation_turns','conversation_progress') ORDER BY 1,2`)).rows;
  const idx = (await c.query(`SELECT tablename t, indexname n, indexdef d FROM pg_indexes WHERE schemaname='public' AND tablename IN ('conversations','conversation_turns','conversation_progress') ORDER BY 1,2`)).rows;
  return JSON.stringify({ cols, cons, idx });
}
const count = async (c, t) => (await c.query(`SELECT COUNT(*)::int AS n FROM ${t}`)).rows[0].n;
const tableNames = async (c) => (await c.query(`SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' ORDER BY 1`)).rows.map((r) => r.relname);
const dataHash = async (c) => (await c.query(`SELECT
  (SELECT md5(COALESCE(string_agg(dialogue_id||'|'||title_zh||'|'||title_vi||'|'||hsk_level||'|'||topic||'|'||COALESCE(situation,'')||'|'||total_turns::text, ';' ORDER BY id),'')) FROM conversations) AS c,
  (SELECT md5(COALESCE(string_agg(conversation_id||'|'||turn_number||'|'||chinese_text||'|'||pinyin||'|'||vietnamese_text, ';' ORDER BY id),'')) FROM conversation_turns) AS t`)).rows[0];
async function applyV145(c, batches = [1, 2, 3, 4, 5, 6, 7, 8]) {
  await c.query(sqlFile('V145_conversation_library.sql'));
  for (const b of batches) await c.query(sqlFile(`V145_conversation_data_batch${b}.sql`));
}
const SEED_TURNS = (id) => `INSERT INTO conversation_turns (conversation_id, turn_number, character, chinese_text, pinyin, vietnamese_text)
  SELECT id, n, CASE WHEN n % 2 = 1 THEN 'A' ELSE 'B' END, '你好第' || n, 'nǐ hǎo dì ' || n, 'Xin chào ' || n FROM conversations, generate_series(1,3) n WHERE dialogue_id = '${id}'`;

// ════════════════ TEST THUẦN (không cần DB) ════════════════
test('phân loại lỗi: connection / permission / missing_table / missing_column / migration', () => {
  assert.strictEqual(S.classifyDbError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })), 'connection');
  assert.strictEqual(S.classifyDbError(Object.assign(new Error('password authentication failed'), { code: '28P01' })), 'connection');
  assert.strictEqual(S.classifyDbError(new Error('Connection terminated unexpectedly')), 'connection');
  assert.strictEqual(S.classifyDbError(new Error('Chưa cấu hình biến môi trường DATABASE_URL')), 'connection');
  assert.strictEqual(S.classifyDbError(Object.assign(new Error('permission denied for schema public'), { code: '42501' })), 'permission');
  assert.strictEqual(S.classifyDbError(new Error('must be owner of table conversations')), 'permission');
  assert.strictEqual(S.classifyDbError(Object.assign(new Error('relation "conversations" does not exist'), { code: '42P01' })), 'missing_table');
  assert.strictEqual(S.classifyDbError(Object.assign(new Error('column "gen_status" does not exist'), { code: '42703' })), 'missing_column');
  assert.strictEqual(S.classifyDbError(Object.assign(new Error('syntax error'), { code: '42601' })), 'migration');
});

test('thông điệp lỗi KHÔNG lộ DATABASE_URL / mật khẩu / host; lỗi kết nối chỉ nêu mã', () => {
  const url = 'postgresql://neon_owner:SuperSecret123@ep-cool-123.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
  const old = process.env.DATABASE_URL; process.env.DATABASE_URL = url;
  try {
    const e1 = S.wrapDbError(Object.assign(new Error(`connect failed for ${url}`), { code: 'ECONNREFUSED' }));
    const e2 = S.wrapDbError(Object.assign(new Error(`permission denied; conn=${url} pw SuperSecret123`), { code: '42501' }));
    const e3 = S.wrapDbError(new Error('getaddrinfo ENOTFOUND ep-cool-123.ap-southeast-1.aws.neon.tech'));
    for (const e of [e1, e2, e3]) {
      const all = e.message + ' ' + e.hint + ' ' + JSON.stringify(S.schemaErrorResponse(e));
      assert.ok(!/SuperSecret123|neon_owner|ep-cool-123|neon\.tech|postgresql:\/\//.test(all), 'lộ bí mật: ' + all);
    }
    assert.strictEqual(e1.category, 'connection'); assert.ok(/ECONNREFUSED/.test(e1.message));
    assert.strictEqual(e2.category, 'permission');
    assert.ok(e2.message.includes('lược đồ hội thoại'));
  } finally { if (old === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = old; }
});

test('schemaErrorResponse: lỗi lược đồ → 503 + category; lỗi khác → null (đi đường fail() chung)', () => {
  const r = S.schemaErrorResponse(new S.ConversationSchemaError('missing_table', 'bảng conversations'));
  assert.strictEqual(r.status, 503); assert.strictEqual(r.body.ok, false); assert.strictEqual(r.body.category, 'missing_table');
  assert.ok(/Thiếu bảng/.test(r.body.error));
  assert.strictEqual(S.schemaErrorResponse(new Error('boom')), null);
  assert.ok(new S.ConversationSchemaError('x', 'y') instanceof Error);
  assert.ok(new S.ConversationSchemaError('x', 'y') instanceof require('../lib/publicError').PublicError, 'phải là PublicError để thông điệp hiện nguyên văn');
});

test('danh mục batch khớp ĐÚNG 8 file SQL (dialogue_id, số lượng); báo cáo biết batch nào thiếu', () => {
  const B = require('../lib/conversation-batches');
  const all = [];
  for (const b of B.CONVERSATION_BATCHES) {
    const sql = read('migrations/' + b.file);
    const ids = [...sql.matchAll(/^\('([a-z0-9_-]+)'/gm)].map((m) => m[1]);
    assert.deepStrictEqual(ids, B.batchIds(b), `batch ${b.batch} lệch danh mục`);
    all.push(...ids);
  }
  assert.strictEqual(new Set(all).size, 200, 'không có dialogue_id trùng giữa các batch');
  const rep = B.buildConversationDataReport(['hsk3-001', 'hsk3-002', 'd1']);
  assert.deepStrictEqual(rep.needBatches, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.strictEqual(rep.batches[0].status, 'partial'); assert.strictEqual(rep.batches[1].status, 'missing'); assert.strictEqual(rep.extraCount, 1);
  assert.ok(B.buildConversationDataReport(all).complete);
  assert.deepStrictEqual(B.buildConversationDataReport(all.filter((i) => !i.startsWith('hsk4-0') || i > 'hsk4-025')).needBatches, [5]);
});

test('DDL trong module khớp từng lệnh của V145 & V152 (không bỏ sót logic)', () => {
  const v152 = read('migrations/V152_conversation_generation.sql').replace(/\s+/g, ' ');
  for (const frag of [S.DDL_GEN_COLUMNS, S.DDL_GEN_CONSTRAINTS, S.SQL_BACKFILL_READY]) {
    const norm = frag.replace(/\s+/g, ' ').trim();
    assert.ok(v152.includes(norm), 'V152 không chứa đoạn:\n' + norm.slice(0, 120));
  }
  const v145 = read('migrations/V145_conversation_library.sql').replace(/\s+/g, ' ');
  for (const t of Object.values(S.TABLE_DDL)) assert.ok(v145.includes(t.replace(/\s+/g, ' ').trim()), 'V145 không chứa:\n' + t.slice(0, 80));
});

test('mã nguồn: không có DROP TABLE / TRUNCATE / DELETE / INSERT dữ liệu trong khởi tạo; dùng advisory lock + transaction', () => {
  const src = read('lib/conversation-schema.js').replace(/\/\/.*$/gm, '');
  assert.ok(!/DROP\s+TABLE|TRUNCATE|DELETE\s+FROM|INSERT\s+INTO/i.test(src), 'khởi tạo không được xoá/chèn dữ liệu');
  assert.ok(/pg_advisory_xact_lock/.test(src) && /'BEGIN'/.test(src) && /'COMMIT'/.test(src) && /ROLLBACK/.test(src));
  assert.ok(!/require\('pg'\)/.test(src), 'module không import pg');
});

test('db.js: MỌI hàm hội thoại đi qua connectConversationDb + ensureConversationGenSchema; không còn nhánh "gen_status không dùng được"', () => {
  const db = read('lib/db.js');
  assert.ok(!/convoGenSchemaLastError|genOk/.test(db), 'còn tàn dư cơ chế cũ');
  const names = ['getConversations', 'getConversationWithTurns', 'getConversationProgress', 'getConversationProgressForUser', 'updateConversationProgress', 'toggleConversationFavorite', 'getConversationStats',
    'pickConversationsForGen', 'getConversationForGen', 'setConversationGenState', 'saveGeneratedConversation', 'setConversationApproval', 'getConversationGenOverview',
    'countConversationsGeneratedToday', 'approveAllConversationDrafts', 'updateConversationTurn', 'getConversationVocabCandidates', 'getConversationDataReport'];
  for (const n of names) {
    const i = db.indexOf(`async function ${n}(`); assert.ok(i > 0, n + ' không tìm thấy');
    const body = db.slice(i, db.indexOf('\n}\n', i));
    assert.ok(/connectConversationDb\(\)/.test(body), n + ' phải mở kết nối qua connectConversationDb');
    assert.ok(/ensureConversationGenSchema\(client\)/.test(body), n + ' phải gọi ensureConversationGenSchema trước khi truy vấn');
    assert.ok(!/getPool\(\)\.connect/.test(body), n + ' còn tự mở kết nối');
  }
});

test('api: mọi route hội thoại dùng convoFail (503 + nguyên nhân cụ thể); admin overview kèm dataReport', () => {
  const api = read('api/index.js');
  const a = api.indexOf('// CONVERSATION LIBRARY'); const b = api.indexOf('// ── Bắt lỗi chung ──');
  const seg = api.slice(a, b);
  assert.ok(!/\bfail\(res, e\)/.test(seg.replace(/return fail\(res, e\);/, '')), 'còn route hội thoại dùng fail() chung chung');
  assert.ok(/schemaErrorResponse/.test(api) && /function convoFail/.test(seg));
  assert.ok(/getConversationDataReport\(\)/.test(seg));
  assert.ok(!/Kiểm tra bảng conversations đã được tạo trong Neon/.test(seg), 'thông báo cũ chung chung đã được thay');
});

// ════════════════ TEST TRÊN POSTGRES THẬT ════════════════
test('(1) DB hoàn toàn chưa có 3 bảng → tự tạo đủ + áp V152; cấu trúc GIỐNG HỆT chạy tay V145+V152; không chèn dữ liệu', async () => {
  const dbA = await newDb(); const dbB = await newDb();
  const a = await conn(dbA); const b = await conn(dbB);
  assert.deepStrictEqual(await tableNames(a), [], 'DB phải trống');
  const ensure = S.createEnsurer();
  await ensure(a);
  assert.deepStrictEqual(await tableNames(a), ['conversation_progress', 'conversation_turns', 'conversations']);
  const st = ensure.status();
  assert.deepStrictEqual(st.applied.createdTables, ['conversations', 'conversation_turns', 'conversation_progress']);
  assert.ok(st.ok);
  const ins = await S.inspectConversationSchema(a);
  assert.ok(!ins.needsInit && !ins.unfixableColumns.length, ins.needs.join(';'));
  assert.ok(ins.v152.totalTurnsMin && ins.v152.genStatusCheck && ins.v152.oldTotalTurnsCheckGone && ins.v152.turnPosUnique);
  assert.strictEqual(await count(a, 'conversations'), 0, 'không được chèn dữ liệu mẫu');
  // So với chạy tay V145 + V152
  await b.query(sqlFile('V145_conversation_library.sql')); await b.query(sqlFile('V152_conversation_generation.sql'));
  assert.strictEqual(await dump(a), await dump(b), 'cấu trúc tự tạo khác cấu trúc migration chạy tay');
  a.end(); b.end();
}, { db: true });

test('(2) đã có conversations (+ dữ liệu) nhưng thiếu 2 bảng còn lại → tạo 2 bảng, giữ nguyên dữ liệu', async () => {
  const db = await newDb(); const c = await conn(db);
  await c.query(sqlFile('V145_conversation_library.sql'));
  await c.query(`DROP TABLE conversation_progress; DROP TABLE conversation_turns;`); // chuẩn bị tình huống (chỉ trong DB test)
  await c.query(`UPDATE conversations SET title_vi = 'Tiêu đề do người dùng sửa' WHERE dialogue_id = 'd1'`);
  const convoHash = async () => (await c.query(`SELECT md5(string_agg(dialogue_id||title_zh||title_vi||hsk_level||topic||COALESCE(situation,'')||total_turns::text, ';' ORDER BY id)) h FROM conversations`)).rows[0].h;
  const before = await convoHash();
  const ensure = S.createEnsurer(); await ensure(c);
  assert.deepStrictEqual(ensure.status().applied.createdTables, ['conversation_turns', 'conversation_progress']);
  assert.deepStrictEqual(await tableNames(c), ['conversation_progress', 'conversation_turns', 'conversations']);
  assert.strictEqual(await convoHash(), before, 'dữ liệu conversations bị đổi');
  assert.strictEqual((await c.query(`SELECT title_vi FROM conversations WHERE dialogue_id='d1'`)).rows[0].title_vi, 'Tiêu đề do người dùng sửa');
  // khoá ngoại hoạt động
  await c.query(`INSERT INTO conversation_progress (user_id, conversation_id) SELECT 'u1', id FROM conversations LIMIT 1`);
  await assert.rejects(c.query(`INSERT INTO conversation_turns (conversation_id, turn_number, character, chinese_text, pinyin, vietnamese_text) VALUES (999999,1,'A','x','x','x')`), /foreign key|violates/);
  c.end();
}, { db: true });

test('(3) đủ 3 bảng nhưng thiếu cột V152 → thêm cột + CHECK; bài ĐÃ có lượt → ready, bài chưa có → pending; dữ liệu giữ nguyên', async () => {
  const db = await newDb(); const c = await conn(db);
  await applyV145(c, [1]); // 25 + d1
  await c.query(SEED_TURNS('hsk3-001'));
  assert.ok(!(await S.inspectConversationSchema(c)).tables.conversation_progress === false);
  const before = await dataHash(c);
  const ensure = S.createEnsurer(); await ensure(c);
  const st = ensure.status().applied;
  assert.deepStrictEqual(st.createdTables, []); assert.deepStrictEqual(st.addedColumns, S.GEN_COLUMNS);
  assert.strictEqual(st.backfilled, 1);
  const rows = (await c.query(`SELECT dialogue_id, gen_status FROM conversations WHERE gen_status='ready'`)).rows;
  assert.deepStrictEqual(rows, [{ dialogue_id: 'hsk3-001', gen_status: 'ready' }]);
  assert.strictEqual((await c.query(`SELECT COUNT(*)::int n FROM conversations WHERE gen_status='pending'`)).rows[0].n, 25);
  assert.deepStrictEqual(await dataHash(c), before);
  const ins = await S.inspectConversationSchema(c);
  assert.ok(ins.v152.totalTurnsMin && ins.v152.genStatusCheck && ins.v152.oldTotalTurnsCheckGone && ins.v152.turnPosUnique);
  // CHECK mới hoạt động: total_turns 12 hợp lệ, 11 bị chặn; gen_status sai bị chặn
  await c.query(`UPDATE conversations SET total_turns = 12 WHERE dialogue_id = 'hsk3-002'`);
  await assert.rejects(c.query(`UPDATE conversations SET total_turns = 11 WHERE dialogue_id = 'hsk3-002'`), /check/i);
  await assert.rejects(c.query(`UPDATE conversations SET gen_status = 'bậy' WHERE dialogue_id = 'hsk3-002'`), /check/i);
  // UNIQUE(conversation_id, turn_number)
  await assert.rejects(c.query(`INSERT INTO conversation_turns (conversation_id, turn_number, character, chinese_text, pinyin, vietnamese_text) SELECT id,1,'A','x','x','x' FROM conversations WHERE dialogue_id='hsk3-001'`), /duplicate|unique/i);
  c.end();
}, { db: true });

test('(3b) turn trùng (conversation_id, turn_number) có sẵn → vẫn khởi tạo được, KHÔNG xoá dòng trùng, chỉ cảnh báo thiếu UNIQUE', async () => {
  const db = await newDb(); const c = await conn(db);
  await applyV145(c, [1]); await c.query(SEED_TURNS('hsk3-001'));
  await c.query(`INSERT INTO conversation_turns (conversation_id, turn_number, character, chinese_text, pinyin, vietnamese_text) SELECT id,1,'A','trùng','trùng','trùng' FROM conversations WHERE dialogue_id='hsk3-001'`);
  const ensure = S.createEnsurer(); await ensure(c);
  assert.strictEqual(await count(c, 'conversation_turns'), 4, 'không được xoá dòng trùng');
  assert.strictEqual((await S.inspectConversationSchema(c)).v152.turnPosUnique, false);
  const V = require('../scripts/verify-conversations');
  const res = await V.runVerification(c);
  assert.ok(res.items.some((i) => i.level === 'WARNING' && /uq_conversation_turns_pos/.test(i.text)));
  assert.strictEqual(res.fails, 0);
  c.end();
}, { db: true });

test('(4) DB đã đầy đủ → KHÔNG chạy DDL/transaction nào (chỉ SELECT + 1 UPDATE bài cũ→ready); chạy lặp lại vẫn giữ nguyên', async () => {
  const db = await newDb(); const c = await conn(db);
  await S.createEnsurer()(c);
  const before = await dump(c);
  const s = spy(c); const ensure = S.createEnsurer(); await ensure(s);
  const bad = s.log.filter((q) => !/^\s*(SELECT|UPDATE conversations c SET gen_status = 'ready')/i.test(q));
  assert.deepStrictEqual(bad, [], 'có lệnh không phải SELECT/backfill: ' + bad.join(' | ').slice(0, 200));
  assert.ok(!s.log.some((q) => /^\s*(BEGIN|COMMIT|CREATE|ALTER|DROP|LOCK|SET)\b/i.test(q)));
  for (let i = 0; i < 3; i++) await S.createEnsurer()(c);
  assert.strictEqual(await dump(c), before, 'cấu trúc đổi sau khi chạy lặp');
  // Cache: lần gọi thứ 2 trên cùng ensurer không truy vấn gì
  const n = s.log.length; await ensure(s); assert.strictEqual(s.log.length, n);
  c.end();
}, { db: true });

test('(5) nhiều request đồng thời trên DB trống (8 kết nối, 8 bộ khởi tạo = 8 instance serverless) → đều thành công, không tạo trùng, không lỗi', async () => {
  const db = await newDb();
  const clients = await Promise.all(Array.from({ length: 8 }, () => conn(db)));
  const ensures = clients.map(() => S.createEnsurer());
  const results = await Promise.allSettled(clients.map((cl, i) => ensures[i](cl)));
  const bad = results.filter((r) => r.status === 'rejected').map((r) => r.reason && r.reason.message);
  assert.deepStrictEqual(bad, []);
  const created = ensures.map((e) => e.status().applied.createdTables.length);
  assert.strictEqual(created.filter((n) => n === 3).length, 1, 'đúng 1 instance tạo bảng, 7 instance còn lại thấy đã đủ: ' + created);
  assert.deepStrictEqual(await tableNames(clients[0]), ['conversation_progress', 'conversation_turns', 'conversations']);
  const cons = (await clients[0].query(`SELECT conname FROM pg_constraint WHERE conrelid='conversations'::regclass`)).rows.map((r) => r.conname);
  assert.strictEqual(new Set(cons).size, cons.length);
  // trong CÙNG 1 tiến trình: 6 request song song dùng chung 1 lần chạy
  const db2 = await newDb(); const cs = await Promise.all(Array.from({ length: 6 }, () => conn(db2))); const one = S.createEnsurer();
  const r2 = await Promise.all(cs.map((cl) => one(cl))); assert.ok(r2.every((x) => x === true));
  assert.strictEqual(await count(cs[0], 'conversations'), 0);
  [...clients, ...cs].forEach((x) => x.end());
}, { db: true });

test('(6) DB đã có dữ liệu cũ (V145 + 8 batch = 200 hội thoại + lượt thoại) → không mất/không trùng; batch không bị chạy lại', async () => {
  const db = await newDb(); const c = await conn(db);
  await applyV145(c);
  await c.query(SEED_TURNS('hsk3-001')); await c.query(SEED_TURNS('hsk4-100'));
  assert.strictEqual(await count(c, 'conversations'), 201); // 200 + mẫu d1
  const before = await dataHash(c); const turnsBefore = await count(c, 'conversation_turns');
  await c.query(`INSERT INTO conversation_progress (user_id, conversation_id, last_played_turn, is_favorited) SELECT 'u1', id, 2, true FROM conversations WHERE dialogue_id='hsk3-001'`);
  const ensure = S.createEnsurer(); await ensure(c);
  assert.strictEqual(await count(c, 'conversations'), 201);
  assert.strictEqual(await count(c, 'conversation_turns'), turnsBefore);
  assert.deepStrictEqual(await dataHash(c), before, 'nội dung tiếng Trung/pinyin/tiếng Việt bị đổi');
  assert.strictEqual((await c.query(`SELECT COUNT(*)::int n FROM (SELECT dialogue_id FROM conversations GROUP BY 1 HAVING COUNT(*)>1) x`)).rows[0].n, 0);
  assert.deepStrictEqual((await c.query(`SELECT user_id, last_played_turn, is_favorited FROM conversation_progress`)).rows, [{ user_id: 'u1', last_played_turn: 2, is_favorited: true }]);
  assert.deepStrictEqual((await c.query(`SELECT dialogue_id FROM conversations WHERE gen_status='ready' ORDER BY 1`)).rows.map((r) => r.dialogue_id), ['hsk3-001', 'hsk4-100']);
  // báo cáo batch: đủ 8
  const V = require('../scripts/verify-conversations'); const res = await V.runVerification(c);
  assert.ok(res.report.complete && res.report.extraCount === 1, JSON.stringify(res.report.needBatches));
  assert.strictEqual(res.fails, 0);
  c.end();
}, { db: true });

test('(6b) DB thiếu batch → báo cáo nêu đúng batch cần nhập, KHÔNG tự nhập', async () => {
  const db = await newDb(); const c = await conn(db);
  await applyV145(c, [1, 2, 5]);
  await S.createEnsurer()(c);
  assert.strictEqual(await count(c, 'conversations'), 76, 'ensure không được tự nhập batch');
  const res = await require('../scripts/verify-conversations').runVerification(c);
  assert.deepStrictEqual(res.report.needBatches, [3, 4, 6, 7, 8]);
  assert.ok(res.items.some((i) => i.level === 'WARNING' && /batch 3/.test(i.text) && /batch3\.sql/.test(i.text)));
  assert.strictEqual(res.overall, 'WARNING'); assert.strictEqual(res.fails, 0);
  c.end();
}, { db: true });

test('(7) migration lỗi GIỮA CHỪNG → ROLLBACK toàn bộ (không còn bảng nửa vời), lỗi phân loại "migration", lần sau thử lại thành công', async () => {
  const db = await newDb(); const c = await conn(db);
  const s = spy(c, { failOn: /CREATE TABLE IF NOT EXISTS conversation_progress/ });
  const ensure = S.createEnsurer();
  await assert.rejects(ensure(s), (e) => e instanceof S.ConversationSchemaError && e.category === 'migration' && /Migration thất bại/.test(e.message));
  assert.deepStrictEqual(await tableNames(c), [], 'conversations/conversation_turns đã tạo trước đó phải bị hoàn tác');
  assert.ok(s.log.includes('ROLLBACK'));
  assert.strictEqual((await c.query('SELECT COUNT(*)::int n FROM pg_locks WHERE locktype=\'advisory\' AND granted AND pid = pg_backend_pid()')).rows[0].n, 0, 'không giữ khoá sau lỗi');
  await ensure(c); // CHÍNH ensurer đó thử lại được (lỗi không bị cache)
  assert.deepStrictEqual(await tableNames(c), ['conversation_progress', 'conversation_turns', 'conversations']);
  // lỗi giữa chừng khi nâng cấp V152: cột đã ADD phải bị hoàn tác
  const db2 = await newDb(); const c2 = await conn(db2);
  await applyV145(c2, [1]); const before = await dump(c2);
  await assert.rejects(S.createEnsurer()(spy(c2, { failOn: /conversations_total_turns_min/ })), (e) => e.category === 'migration');
  assert.strictEqual(await dump(c2), before, 'V152 áp dở phải hoàn tác sạch');
  assert.strictEqual(await count(c2, 'conversations'), 26);
  c.end(); c2.end();
}, { db: true });

test('(7b) không tạo được pg_trgm → vẫn tạo đủ bảng, chỉ CẢNH BÁO (tìm kiếm ILIKE vẫn chạy)', async () => {
  const db = await newDb(); const c = await conn(db);
  const s = spy(c, { failOn: /CREATE EXTENSION/, failWith: { code: '42501', message: 'permission denied to create extension "pg_trgm"' } });
  const ensure = S.createEnsurer(); await ensure(s);
  assert.deepStrictEqual(await tableNames(c), ['conversation_progress', 'conversation_turns', 'conversations']);
  assert.ok(ensure.status().warnings.some((w) => /pg_trgm/.test(w)));
  const ins = await S.inspectConversationSchema(c); assert.ok(!ins.needsInit);
  const res = await require('../scripts/verify-conversations').runVerification(c);
  assert.strictEqual(res.fails, 0); assert.ok(res.items.some((i) => i.level === 'WARNING' && /idx_conversations_search/.test(i.text)));
  c.end();
}, { db: true });

test('(8) user DB KHÔNG đủ quyền ALTER/CREATE → lỗi "permission" cụ thể, không đổi gì; cấu trúc đã đủ thì vẫn dùng được không cần DDL', async () => {
  const a = await admin();
  await a.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_limited_154') THEN CREATE ROLE app_limited_154 LOGIN; END IF; END $$`); a.end();
  const grant = async (c, db) => c.query(`GRANT CONNECT ON DATABASE ${db} TO app_limited_154; GRANT USAGE ON SCHEMA public TO app_limited_154;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_limited_154; GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_limited_154`);
  // (a) có conversations nhưng thiếu cột V152 + thiếu bảng
  const dbA = await newDb(); const owner = await conn(dbA);
  await owner.query(sqlFile('V145_conversation_library.sql')); await owner.query('DROP TABLE conversation_progress; DROP TABLE conversation_turns;');
  await grant(owner, dbA); const before = await dump(owner);
  const lim = await conn(dbA, 'app_limited_154');
  await assert.rejects(S.createEnsurer()(lim), (e) => {
    assert.ok(e instanceof S.ConversationSchemaError); assert.strictEqual(e.category, 'permission');
    assert.ok(/Thiếu quyền database/.test(e.message) && /permission denied/.test(e.message), e.message);
    return true;
  });
  assert.strictEqual(await dump(owner), before, 'thiếu quyền thì không được thay đổi gì');
  // (b) DB trống hoàn toàn
  const dbB = await newDb(); const ob = await conn(dbB); await grant(ob, dbB);
  await assert.rejects(S.createEnsurer()(await conn(dbB, 'app_limited_154')), (e) => e.category === 'permission');
  assert.deepStrictEqual(await tableNames(ob), []);
  // (c) cấu trúc đã đủ (do owner khởi tạo) → user hạn chế vẫn chạy được, không cần quyền DDL
  const dbC = await newDb(); const oc = await conn(dbC); await S.createEnsurer()(oc); await applyBatchRows(oc); await grant(oc, dbC);
  const limC = await conn(dbC, 'app_limited_154'); const ens = S.createEnsurer();
  await ens(limC);
  assert.ok(ens.status().ok);
  assert.strictEqual((await limC.query('SELECT COUNT(*)::int n FROM conversations')).rows[0].n, 25);
  [owner, lim, ob, oc, limC].forEach((x) => x.end());
}, { db: true });
async function applyBatchRows(c) { await c.query(sqlFile('V145_conversation_data_batch1.sql')); }

test('(9) không kết nối được: lỗi "connection" chỉ có mã lỗi, không có host/URL', async () => {
  const old = process.env.TEST_PG_PORT;
  let err;
  try { await connectMini({ port: 1 }); } catch (e) { err = e; }
  assert.ok(err, 'phải lỗi kết nối');
  const w = S.wrapDbError(err);
  assert.strictEqual(w.category, 'connection'); assert.ok(/ECONNREFUSED/.test(w.message)); assert.ok(!/127\.0\.0\.1/.test(w.message));
  void old;
});

test('(10) db.js THẬT + Postgres thật: DB trống → getConversationGenOverview / getConversations / tiến độ / yêu thích / báo cáo dữ liệu đều chạy (màn Quản trị tải được)', async () => {
  const dbName = await newDb();
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (STUB_MODULES.test(request)) return {}; // chỉ để nạp được db.js (ts-fsrs không cài được ở đây; các module FSRS/kỹ năng không liên quan hội thoại)
    if (request === 'pg') {
      return { Pool: class { constructor() {} async connect() { return connectMini({ database: dbName }); } async query(s, p) { const c = await connectMini({ database: dbName }); try { return await c.query(s, p); } finally { c.end(); } } on() {} } };
    }
    return origLoad.apply(this, arguments);
  };
  const dbPath = path.join(ROOT, 'lib/db.js');
  const old = process.env.DATABASE_URL; process.env.DATABASE_URL = 'postgresql://u:pw@localhost/x';
  try {
    delete require.cache[dbPath]; delete require.cache[schemaPath];
    const D = require(dbPath);
    const probe = await conn(dbName);
    assert.deepStrictEqual(await tableNames(probe), []);
    // lần gọi ĐẦU TIÊN của một chức năng bất kỳ (kể cả của người học, không cần admin vào trước) tự khởi tạo
    const list0 = await D.getConversations({});
    assert.deepStrictEqual(list0, []);
    assert.deepStrictEqual(await tableNames(probe), ['conversation_progress', 'conversation_turns', 'conversations']);
    const ov = await D.getConversationGenOverview();
    assert.deepStrictEqual(ov.counts, { pending: 0, generating: 0, draft: 0, ready: 0, failed: 0 });
    assert.strictEqual(D.getConversationSchemaStatus().ok, true);
    // nạp 8 batch như admin sẽ làm, rồi các chức năng
    for (let b = 1; b <= 8; b++) await probe.query(sqlFile(`V145_conversation_data_batch${b}.sql`));
    const rep = await D.getConversationDataReport();
    assert.ok(rep.complete && rep.expectedTotal === 200 && rep.presentTotal === 200);
    assert.strictEqual((await D.getConversationGenOverview()).items.length, 200);
    assert.deepStrictEqual(await D.getConversations({}), [], 'người học chưa thấy bài nào (chưa duyệt)');
    assert.strictEqual((await D.getConversations({ includeUnready: true, hsk_level: 'HSK 3' })).length, 100);
    assert.strictEqual((await D.getConversations({ includeUnready: true, hsk_level: 'HSK 4' })).length, 100);
    assert.ok((await D.getConversations({ includeUnready: true, search: '工厂' })).length >= 1, 'tìm kiếm');
    const id = (await D.getConversations({ includeUnready: true }))[0].id;
    await D.updateConversationProgress('u1', id, 3, 1); await D.toggleConversationFavorite('u1', id, true);
    const pm = await D.getConversationProgressForUser('u1');
    assert.strictEqual(pm[id].last_played_turn, 3); assert.strictEqual(pm[id].is_favorited, true);
    // sinh AI → nháp → duyệt
    const turns = Array.from({ length: 12 }, (_, i) => ({ character: i % 2 ? 'B' : 'A', chinese_text: `你好${i}`, pinyin: 'nǐ hǎo', vietnamese_text: 'Xin chào', vocabulary_explanations: [{ hz: '你好', py: 'nǐ hǎo', vi: 'xin chào' }], grammar_explanations: null }));
    const did = (await D.pickConversationsForGen(1))[0];
    const cv = await D.getConversationForGen(did);
    await D.setConversationGenState(cv.id, 'generating', null);
    assert.ok(await D.saveGeneratedConversation(cv.id, turns, { model: 'm', promptVersion: 'p' }));
    assert.strictEqual((await D.getConversationGenOverview()).counts.draft, 1);
    assert.ok(await D.setConversationApproval(did, 'ready'));
    assert.strictEqual((await D.getConversations({})).length, 1);
    const full = await D.getConversationWithTurns(did); assert.strictEqual(full.turns.length, 12); assert.strictEqual(full.total_turns, 12, 'total_turns 12 hợp lệ nhờ V152');
    assert.strictEqual(await D.countConversationsGeneratedToday(), 1);
    assert.deepStrictEqual((await D.getConversationStats()).map((r) => r.hsk_level), ['HSK 3']);
    const cands = await D.getConversationVocabCandidates(did); assert.strictEqual(cands.length, 1);
    probe.end();
  } finally {
    Module._load = origLoad; delete require.cache[dbPath]; delete require.cache[schemaPath];
    if (old === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = old;
  }
}, { db: true });

test('(10b) db.js THẬT: lỗi kết nối/khởi tạo được ném thành ConversationSchemaError (không phải lỗi pg thô)', async () => {
  const origLoad = Module._load;
  Module._load = function (request) {
    if (STUB_MODULES.test(request)) return {};
    if (request === 'pg') return { Pool: class { async connect() { throw Object.assign(new Error('connect ECONNREFUSED 10.1.2.3:5432'), { code: 'ECONNREFUSED' }); } on() {} } };
    return origLoad.apply(this, arguments);
  };
  const dbPath = path.join(ROOT, 'lib/db.js'); const old = process.env.DATABASE_URL; process.env.DATABASE_URL = 'postgresql://u:pw@localhost/x';
  try {
    delete require.cache[dbPath]; delete require.cache[schemaPath];
    const D = require(dbPath); const SS = require(schemaPath);
    await assert.rejects(D.getConversationGenOverview(), (e) => e instanceof SS.ConversationSchemaError && e.category === 'connection' && !/10\.1\.2\.3/.test(e.message));
  } finally { Module._load = origLoad; delete require.cache[dbPath]; delete require.cache[schemaPath]; if (old === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = old; }
});

test('(11) verify-conversations: FAIL khi thiếu bảng, WARNING khi thiếu thứ phụ, PASS khi đủ; script CHỈ ĐỌC (không đổi cấu trúc/dữ liệu)', async () => {
  const V = require('../scripts/verify-conversations');
  const db = await newDb(); const c = await conn(db);
  const r0 = await V.runVerification(c);
  assert.strictEqual(r0.overall, 'FAIL'); assert.strictEqual(r0.fails, 3);
  await applyV145(c); // V145 xong nhưng chưa V152
  const r1 = await V.runVerification(c);
  assert.strictEqual(r1.overall, 'FAIL'); assert.ok(r1.items.some((i) => i.level === 'FAIL' && /cột V152/.test(i.text)));
  await S.createEnsurer()(c);
  await c.query(`DELETE FROM conversations WHERE dialogue_id = 'd1'`); // bỏ mẫu để đủ đúng 200
  const snap = await dump(c); const dh = await dataHash(c);
  const s = spy(c); const r2 = await V.runVerification(s);
  assert.strictEqual(r2.overall, 'WARNING', 'chưa có lượt thoại → WARNING (thiếu thứ không chặn)'); assert.strictEqual(r2.fails, 0);
  assert.ok(s.log.every((q) => /^\s*SELECT/i.test(q)), 'verify chỉ được SELECT');
  assert.strictEqual(await dump(c), snap); assert.deepStrictEqual(await dataHash(c), dh);
  await c.query(`DROP INDEX idx_conversations_hsk_topic`); // thiếu index thường → WARNING
  assert.ok((await V.runVerification(c)).items.some((i) => i.level === 'WARNING' && /idx_conversations_hsk_topic/.test(i.text)));
  await c.query(`ALTER TABLE conversation_progress DROP CONSTRAINT conversation_progress_user_id_conversation_id_key`);
  const r3 = await V.runVerification(c); assert.strictEqual(r3.overall, 'FAIL');
  c.end();
}, { db: true });

test('seed nhúng (lib/conversation-seed.js) KHỚP TỪNG BYTE với 8 file SQL; route import chỉ admin, không tự chạy; chỉ nhập batch còn thiếu', () => {
  const seed = require('../lib/conversation-seed'); const B = require('../lib/conversation-batches');
  for (const b of B.CONVERSATION_BATCHES) assert.strictEqual(seed[b.batch], read('migrations/' + b.file), `batch ${b.batch} lệch file SQL (chạy node scripts/build-conversation-seed.js)`);
  const api = read('api/index.js'); const i = api.indexOf("app.post('/api/admin/conversations/import-batches'");
  assert.ok(i > 0 && /requireAdmin\(actingUser, res\)/.test(api.slice(i, i + 500)) && /importConversationBatches\(\)/.test(api.slice(i, i + 800)));
  const db = read('lib/db.js'); const j = db.indexOf('async function importConversationBatches');
  assert.ok(/b\.status !== 'ok'/.test(db.slice(j, j + 900)) && /ROLLBACK/.test(db.slice(j, j + 1800)));
  assert.ok(!/importConversationBatches/.test(db.slice(0, j).replace(/\/\/.*$/gm, '')), 'không hàm nào tự gọi nhập batch');
});

test('(12) importConversationBatches trên Postgres thật: DB trống → +200; gọi lại → +0 (không trùng); batch lẻ thiếu → chỉ bù phần thiếu, không đè chỉnh sửa tay', async () => {
  const dbName = await newDb(); const origLoad = Module._load;
  Module._load = function (request) {
    if (STUB_MODULES.test(request)) return {};
    if (request === 'pg') return { Pool: class { async connect() { return connectMini({ database: dbName }); } on() {} } };
    return origLoad.apply(this, arguments);
  };
  const dbPath = path.join(ROOT, 'lib/db.js'); const old = process.env.DATABASE_URL; process.env.DATABASE_URL = 'postgresql://u:pw@localhost/x';
  try {
    delete require.cache[dbPath]; delete require.cache[schemaPath];
    const D = require(dbPath); const probe = await conn(dbName);
    assert.strictEqual((await D.getConversationDataReport()).presentTotal, 0, 'DB trống: cần nhập đủ 8 batch');
    const r1 = await D.importConversationBatches();
    assert.strictEqual(r1.added, 200); assert.deepStrictEqual(r1.imported.map((x) => x.batch), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.strictEqual(await count(probe, 'conversations'), 200);
    assert.strictEqual((await D.getConversationGenOverview()).counts.pending, 200, 'bài ở trạng thái chờ → nút Sinh có việc để làm');
    assert.deepStrictEqual(await D.pickConversationsForGen(1), ['hsk3-001']);
    const r2 = await D.importConversationBatches(); assert.strictEqual(r2.added, 0); assert.deepStrictEqual(r2.imported, []);
    // sửa tay 1 bài, xoá 1 bài của batch 3 → nhập lại chỉ bù bài thiếu, không đè bài đã sửa
    await probe.query(`UPDATE conversations SET title_vi = 'ĐÃ SỬA TAY' WHERE dialogue_id = 'hsk3-001'; DELETE FROM conversations WHERE dialogue_id = 'hsk3-060'`);
    const r3 = await D.importConversationBatches(); assert.strictEqual(r3.added, 1); assert.deepStrictEqual(r3.imported.map((x) => x.batch), [3]);
    assert.strictEqual((await probe.query(`SELECT title_vi FROM conversations WHERE dialogue_id='hsk3-001'`)).rows[0].title_vi, 'ĐÃ SỬA TAY');
    assert.strictEqual(await count(probe, 'conversations'), 200);
    probe.end();
  } finally { Module._load = origLoad; delete require.cache[dbPath]; delete require.cache[schemaPath]; if (old === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = old; }
}, { db: true });

// ── Chạy ──
(async () => {
  try { const a = await admin(); await a.query('SELECT 1'); a.end(); adminOk = true; } catch (e) { adminOk = false; }
  for (const { n, f, db } of pending) {
    if (db && !adminOk) { skipped++; console.log('  ⏭️  SKIP (không có Postgres test) ' + n); continue; }
    try { await f(); passed++; console.log('  ✅ ' + n); }
    catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n     ') : e)); }
  }
  if (adminOk) { try { const a = await admin(); for (const d of createdDbs) await a.query(`DROP DATABASE IF EXISTS ${d} WITH (FORCE)`); a.end(); } catch (e) { /* dọn dẹp best-effort */ } }
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  process.exit(failed ? 1 : (skipped ? 3 : 0));
})();
