// lib/conversation-schema.js
// ════════════════════════════════════════════════════════════════════════════════════════════════
// V154 — KHỞI TẠO / KIỂM TRA LƯỢC ĐỒ HỘI THOẠI (nguồn sự thật DUY NHẤT; db.js, verify script và test đều dùng file này)
//
// Lỗi gốc V153: `ensureConversationGenSchema()` chỉ chạy ALTER TABLE trên bảng `conversations` ĐÃ TỒN TẠI. Neon chưa chạy
// migrations/V145_conversation_library.sql thì bảng không có → `relation "conversations" does not exist`, và các hàm khác
// (tiến độ, yêu thích...) còn không đảm bảo gì cả.
//
// Giờ mọi hàm hội thoại trong db.js đều đi qua `ensureConversationSchema(client)`:
//   1. KIỂM TRA (chỉ đọc catalog). Đủ cấu trúc → KHÔNG chạy DDL nào (user DB chỉ có quyền DML vẫn dùng được).
//   2. Thiếu → 1 transaction: pg_advisory_xact_lock → kiểm tra lại trong khoá → tạo bảng thiếu theo ĐÚNG V145 → áp V152 → COMMIT.
//   3. Lỗi → ROLLBACK (không để lại nửa vời) + ném ConversationSchemaError có `category` rõ ràng.
// Không DROP bảng / TRUNCATE / DELETE; không chèn dữ liệu mẫu; không chạy lại các batch dữ liệu.
// Module KHÔNG import 'pg' — nhận `client` (có .query) từ ngoài nên test được với Postgres thật hoặc client giả.
// ════════════════════════════════════════════════════════════════════════════════════════════════
const { PublicError } = require('./publicError');

const ADVISORY_LOCK_KEY = 152001; // giữ nguyên khoá của V152 để bản cũ/mới không chạy chồng nhau
const LOCK_TIMEOUT = '20s';

const REQUIRED_TABLES = ['conversations', 'conversation_turns', 'conversation_progress'];

// Cột V145 (có từ khi tạo bảng) và cột V152 (thêm bằng ALTER)
const GEN_COLUMNS = ['gen_status', 'gen_error', 'gen_model', 'gen_prompt_version', 'gen_attempts', 'generated_at'];
const V145_COLUMNS = {
  conversations: ['id', 'dialogue_id', 'title_zh', 'title_vi', 'hsk_level', 'topic', 'subtopics', 'situation', 'characters', 'total_turns', 'created_at', 'updated_at', 'is_active'],
  conversation_turns: ['id', 'conversation_id', 'turn_number', 'character', 'chinese_text', 'pinyin', 'vietnamese_text', 'vocabulary_explanations', 'grammar_explanations', 'audio_duration_ms', 'created_at'],
  conversation_progress: ['id', 'user_id', 'conversation_id', 'last_played_turn', 'times_practiced', 'is_favorited', 'last_practiced_at', 'created_at'],
};
const ALL_COLUMNS = {
  conversations: [...V145_COLUMNS.conversations, ...GEN_COLUMNS],
  conversation_turns: V145_COLUMNS.conversation_turns,
  conversation_progress: V145_COLUMNS.conversation_progress,
};

const V152_CHECK_MIN = 'conversations_total_turns_min';
const V152_CHECK_STATUS = 'conversations_gen_status_chk';
const V145_CHECK_OLD = 'conversations_total_turns_check'; // V145 >= 30, V152 phải gỡ
const UQ_TURN_POS = 'uq_conversation_turns_pos';
const PLAIN_INDEXES = ['idx_conversations_hsk_topic', 'idx_conversation_progress_user', 'idx_conversation_progress_convo'];
const TRGM_INDEXES = ['idx_conversations_search', 'idx_conversation_turns_search'];

// ── DDL V145 (giữ nguyên cột, kiểu, khoá chính/ngoại, UNIQUE, CHECK) ──
const DDL_CONVERSATIONS = `CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  dialogue_id VARCHAR(50) UNIQUE NOT NULL,
  title_zh VARCHAR(255) NOT NULL,
  title_vi VARCHAR(255) NOT NULL,
  hsk_level VARCHAR(10) NOT NULL CHECK (hsk_level IN ('HSK 3', 'HSK 4')),
  topic VARCHAR(100) NOT NULL,
  subtopics TEXT[],
  situation TEXT,
  characters TEXT[],
  total_turns INTEGER NOT NULL CHECK (total_turns >= 30),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true
)`;
const DDL_TURNS = `CREATE TABLE IF NOT EXISTS conversation_turns (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  character VARCHAR(50) NOT NULL,
  chinese_text TEXT NOT NULL,
  pinyin TEXT NOT NULL,
  vietnamese_text TEXT NOT NULL,
  vocabulary_explanations JSONB,
  grammar_explanations JSONB,
  audio_duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
)`;
const DDL_PROGRESS = `CREATE TABLE IF NOT EXISTS conversation_progress (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(100) NOT NULL,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  last_played_turn INTEGER DEFAULT 0,
  times_practiced INTEGER DEFAULT 0,
  is_favorited BOOLEAN DEFAULT false,
  last_practiced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, conversation_id)
)`;
const TABLE_DDL = { conversations: DDL_CONVERSATIONS, conversation_turns: DDL_TURNS, conversation_progress: DDL_PROGRESS };

const DDL_PLAIN_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_conversations_hsk_topic ON conversations(hsk_level, topic)',
  'CREATE INDEX IF NOT EXISTS idx_conversation_progress_user ON conversation_progress(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_conversation_progress_convo ON conversation_progress(conversation_id)',
];
const DDL_TRGM = [
  'CREATE EXTENSION IF NOT EXISTS pg_trgm',
  'CREATE INDEX IF NOT EXISTS idx_conversations_search ON conversations USING GIN (title_zh gin_trgm_ops, title_vi gin_trgm_ops, situation gin_trgm_ops)',
  'CREATE INDEX IF NOT EXISTS idx_conversation_turns_search ON conversation_turns USING GIN (chinese_text gin_trgm_ops, vietnamese_text gin_trgm_ops)',
];

// ── DDL V152 (giống hệt migrations/V152_conversation_generation.sql) ──
const DDL_GEN_COLUMNS = `ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS gen_status VARCHAR(12) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS gen_error TEXT,
  ADD COLUMN IF NOT EXISTS gen_model VARCHAR(120),
  ADD COLUMN IF NOT EXISTS gen_prompt_version VARCHAR(20),
  ADD COLUMN IF NOT EXISTS gen_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ`;
const DDL_GEN_CONSTRAINTS = `DO $$
BEGIN
  -- Ràng buộc cũ total_turns >= 30 quá dài cho HSK 3 (ép AI độn câu) → hạ xuống 12
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${V145_CHECK_OLD}' AND conrelid = 'conversations'::regclass) THEN
    ALTER TABLE conversations DROP CONSTRAINT ${V145_CHECK_OLD};
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${V152_CHECK_MIN}' AND conrelid = 'conversations'::regclass) THEN
    ALTER TABLE conversations ADD CONSTRAINT ${V152_CHECK_MIN} CHECK (total_turns >= 12);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${V152_CHECK_STATUS}' AND conrelid = 'conversations'::regclass) THEN
    ALTER TABLE conversations ADD CONSTRAINT ${V152_CHECK_STATUS}
      CHECK (gen_status IN ('pending','generating','draft','ready','failed'));
  END IF;
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS ${UQ_TURN_POS} ON conversation_turns (conversation_id, turn_number);
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'conversation_turns có dòng trùng (conversation_id, turn_number) — bỏ qua chỉ mục duy nhất';
  END;
END $$`;
// Bài đã CÓ lượt thoại từ trước V152 → coi là đã duyệt (không biến mất khỏi thư viện). Chỉ UPDATE, không xoá/ghi đè nội dung.
const SQL_BACKFILL_READY = `UPDATE conversations c SET gen_status = 'ready'
  WHERE c.gen_status = 'pending' AND c.gen_attempts = 0
    AND EXISTS (SELECT 1 FROM conversation_turns t WHERE t.conversation_id = c.id)`;

// ═══════════════════════════ LỖI CÓ PHÂN LOẠI ═══════════════════════════
const CATEGORY_LABEL = {
  connection: 'Kết nối Neon thất bại',
  permission: 'Thiếu quyền database',
  missing_table: 'Thiếu bảng',
  missing_column: 'Thiếu cột',
  migration: 'Migration thất bại',
};
const CATEGORY_HINT = {
  connection: 'Kiểm tra biến DATABASE_URL trên Vercel và trạng thái dự án Neon (có thể đang ngủ/hết hạn mức).',
  permission: 'Cấp quyền CREATE/ALTER trên schema cho user trong DATABASE_URL, hoặc chạy migrations/V145_conversation_library.sql rồi migrations/V152_conversation_generation.sql bằng Neon SQL Editor (bằng chủ sở hữu bảng).',
  missing_table: 'Chạy migrations/V145_conversation_library.sql trong Neon SQL Editor.',
  missing_column: 'Chạy migrations/V152_conversation_generation.sql trong Neon SQL Editor (cột V145 bị thiếu thì cần đối chiếu migrations/V145_conversation_library.sql).',
  migration: 'Thay đổi đã được hoàn tác (không để lại nửa vời). Thử lại; nếu vẫn lỗi hãy chạy tay các file migration trong Neon SQL Editor.',
};

class ConversationSchemaError extends PublicError {
  // PublicError: message an toàn để hiện nguyên văn cho admin (đã lọc URL/mật khẩu bằng redact()).
  constructor(category, detail, extra = {}) {
    const label = CATEGORY_LABEL[category] || CATEGORY_LABEL.migration;
    const d = String(detail).replace(/\.?\s*$/, '.'); // luôn kết thúc bằng 1 dấu chấm
    super(`Chưa khởi tạo được lược đồ hội thoại — ${label}: ${d}`);
    this.name = 'ConversationSchemaError';
    this.category = category in CATEGORY_LABEL ? category : 'migration';
    this.detail = d;
    this.hint = CATEGORY_HINT[this.category];
    this.code = extra.code || null;
    this.missing = extra.missing || null;
  }
}

// Che chuỗi kết nối / mật khẩu trước khi đưa lỗi ra ngoài.
function redact(msg) {
  let s = String(msg == null ? '' : msg);
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    s = s.split(dbUrl).join('[ẩn]');
    try { const u = new URL(dbUrl); if (u.password) s = s.split(decodeURIComponent(u.password)).join('[ẩn]'); } catch (e) { /* bỏ qua */ }
  }
  s = s.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"]+/gi, '[ẩn]');
  return s.slice(0, 300);
}

const CONNECTION_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN']);
function classifyDbError(e) {
  const code = e && e.code ? String(e.code) : '';
  const msg = String((e && e.message) || e || '');
  if (code === '42501' || /permission denied|must be owner|must be member|only superuser|insufficient privilege/i.test(msg)) return 'permission';
  if (CONNECTION_CODES.has(code) || /^08/.test(code) || /^28/.test(code) || code === '3D000' || /^57P0[123]$/.test(code) || code === '53300'
    || /Connection terminated|timeout exceeded when trying to connect|connect ECONN|getaddrinfo|DATABASE_URL|SSL|server closed the connection|too many clients/i.test(msg)) return 'connection';
  if (code === '42P01' || /relation ".*" does not exist/i.test(msg)) return 'missing_table';
  if (code === '42703' || /column ".*" (of relation ".*" )?does not exist/i.test(msg)) return 'missing_column';
  return 'migration';
}

// Đổi 1 lỗi bất kỳ của pg thành ConversationSchemaError (không làm lộ DATABASE_URL/host/mật khẩu).
function wrapDbError(e, ctx = {}) {
  if (e instanceof ConversationSchemaError) return e;
  const category = ctx.category || classifyDbError(e);
  const code = e && e.code ? String(e.code) : null;
  let detail;
  if (category === 'connection') {
    if (/DATABASE_URL/.test(String(e && e.message))) detail = 'chưa cấu hình biến môi trường DATABASE_URL.';
    else if (code && /^28/.test(code)) detail = `Neon từ chối đăng nhập (mã ${code}) — sai user/mật khẩu trong DATABASE_URL.`;
    else detail = `không kết nối được cơ sở dữ liệu${code ? ` (mã ${code})` : ''}.`;
  } else {
    detail = redact(e && e.message) || 'không rõ nguyên nhân';
  }
  return new ConversationSchemaError(category, detail, { code, missing: ctx.missing });
}

// Dùng ở tầng API: trả { status, body } cho lỗi lược đồ, null cho lỗi khác (để đi đường fail() cũ).
function schemaErrorResponse(e) {
  if (!(e instanceof ConversationSchemaError)) return null;
  return { status: 503, body: { ok: false, error: `${e.message} ${e.hint}`, category: e.category, schemaError: true } };
}

// ═══════════════════════════ KIỂM TRA (CHỈ ĐỌC) ═══════════════════════════
const IN_TABLES = REQUIRED_TABLES.map((t) => `'${t}'`).join(',');

// Trả về mô tả cấu trúc hiện có. Chỉ SELECT trên catalog — an toàn chạy bất cứ lúc nào, kể cả với user chỉ-đọc.
async function inspectConversationSchema(client) {
  const q = async (sql) => (await client.query(sql)).rows;
  const nsq = "n.nspname = current_schema()";
  const tblRows = await q(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE ${nsq} AND c.relkind IN ('r','p') AND c.relname IN (${IN_TABLES})`);
  const colRows = await q(`SELECT c.relname AS tbl, a.attname AS col FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE ${nsq} AND c.relkind IN ('r','p') AND c.relname IN (${IN_TABLES}) AND a.attnum > 0 AND NOT a.attisdropped`);
  const conRows = await q(`SELECT c.relname AS tbl, k.conname AS name, k.contype AS type, pg_get_constraintdef(k.oid) AS def
    FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE ${nsq} AND c.relname IN (${IN_TABLES})`);
  const idxRows = await q(`SELECT tablename AS tbl, indexname AS name, indexdef AS def FROM pg_indexes
    WHERE schemaname = current_schema() AND tablename IN (${IN_TABLES})`);
  const extRows = await q("SELECT 1 AS x FROM pg_extension WHERE extname = 'pg_trgm'");

  const tables = {};
  for (const t of REQUIRED_TABLES) tables[t] = tblRows.some((r) => r.relname === t);
  const columns = {};
  for (const t of REQUIRED_TABLES) columns[t] = colRows.filter((r) => r.tbl === t).map((r) => r.col);
  const constraints = conRows.map((r) => ({ table: r.tbl, name: r.name, type: r.type, def: r.def }));
  const indexes = idxRows.map((r) => ({ table: r.tbl, name: r.name, def: r.def }));

  const missingTables = REQUIRED_TABLES.filter((t) => !tables[t]);
  const missingColumns = []; // { table, column, gen } — chỉ tính cho bảng ĐÃ tồn tại
  for (const t of REQUIRED_TABLES) {
    if (!tables[t]) continue;
    for (const c of ALL_COLUMNS[t]) if (!columns[t].includes(c)) missingColumns.push({ table: t, column: c, gen: t === 'conversations' && GEN_COLUMNS.includes(c) });
  }
  const hasCon = (name) => constraints.some((k) => k.name === name);
  const hasIdx = (name) => indexes.some((k) => k.name === name);
  const structure = {
    // khoá/ràng buộc V145 — KHÔNG tự sửa trên bảng đã có (có thể ảnh hưởng dữ liệu), chỉ báo
    conversationsPk: constraints.some((k) => k.table === 'conversations' && k.type === 'p'),
    dialogueIdUnique: constraints.some((k) => k.table === 'conversations' && k.type === 'u' && /\(dialogue_id\)/.test(k.def)),
    hskLevelCheck: constraints.some((k) => k.table === 'conversations' && k.type === 'c' && /hsk_level/.test(k.def)),
    turnsPk: constraints.some((k) => k.table === 'conversation_turns' && k.type === 'p'),
    turnsFk: constraints.some((k) => k.table === 'conversation_turns' && k.type === 'f' && /conversation_id/.test(k.def) && /REFERENCES conversations/.test(k.def)),
    progressPk: constraints.some((k) => k.table === 'conversation_progress' && k.type === 'p'),
    progressFk: constraints.some((k) => k.table === 'conversation_progress' && k.type === 'f' && /conversation_id/.test(k.def) && /REFERENCES conversations/.test(k.def)),
    progressUnique: constraints.some((k) => k.table === 'conversation_progress' && k.type === 'u' && /user_id, conversation_id/.test(k.def)),
  };
  const v152 = {
    totalTurnsMin: hasCon(V152_CHECK_MIN),
    genStatusCheck: hasCon(V152_CHECK_STATUS),
    oldTotalTurnsCheckGone: !hasCon(V145_CHECK_OLD),
    turnPosUnique: hasIdx(UQ_TURN_POS),
  };
  const idx = {};
  for (const n of [...PLAIN_INDEXES, ...TRGM_INDEXES]) idx[n] = hasIdx(n);

  // "Cần khởi tạo/nâng cấp" (tự sửa được) — khác với "cấu trúc hỏng" (chỉ báo)
  const needs = [];
  for (const t of missingTables) needs.push(`bảng ${t}`);
  const missingGen = missingColumns.filter((c) => c.gen);
  if (missingGen.length) needs.push(`cột V152: ${missingGen.map((c) => c.column).join(', ')}`);
  if (tables.conversations) {
    if (!v152.totalTurnsMin) needs.push(`ràng buộc ${V152_CHECK_MIN}`);
    if (!v152.genStatusCheck && !missingGen.length) needs.push(`ràng buộc ${V152_CHECK_STATUS}`);
    if (!v152.oldTotalTurnsCheckGone) needs.push(`gỡ ràng buộc cũ ${V145_CHECK_OLD}`);
  }
  const unfixableColumns = missingColumns.filter((c) => !c.gen);

  return {
    tables, columns, constraints, indexes, trgmExtension: extRows.length > 0,
    missingTables, missingColumns, unfixableColumns, structure, v152, indexPresence: idx,
    needs, needsInit: needs.length > 0,
  };
}

// ═══════════════════════════ KHỞI TẠO ═══════════════════════════
async function safeRollback(client) { try { await client.query('ROLLBACK'); } catch (e) { /* bỏ qua */ } }

async function runBackfill(client) {
  const r = await client.query(SQL_BACKFILL_READY);
  return r && typeof r.rowCount === 'number' ? r.rowCount : 0;
}

// Thực hiện 1 transaction khởi tạo. Trả về mô tả những gì đã làm. Ném ConversationSchemaError nếu lỗi (đã ROLLBACK).
async function initializeInLock(client) {
  const applied = { createdTables: [], addedColumns: [], constraints: false, backfilled: 0, warnings: [] };
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    await client.query(`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`);

    // Kiểm tra LẠI trong khoá: request khác có thể vừa khởi tạo xong trong lúc ta chờ khoá.
    const s = await inspectConversationSchema(client);
    if (s.unfixableColumns.length) {
      throw new ConversationSchemaError('missing_column',
        `bảng đã có nhưng thiếu cột V145: ${s.unfixableColumns.map((c) => `${c.table}.${c.column}`).join(', ')}.`, { missing: s.unfixableColumns });
    }
    if (s.needsInit) {
      for (const t of REQUIRED_TABLES) { // conversations trước (khoá ngoại của 2 bảng kia trỏ tới nó)
        if (!s.tables[t]) { await client.query(TABLE_DDL[t]); applied.createdTables.push(t); }
      }
      // Bảng conversations vừa được tạo theo V145 (chưa có cột gen_*) hoặc đã có từ trước nhưng thiếu cột V152 → ADD COLUMN IF NOT EXISTS
      const createdConvos = applied.createdTables.includes('conversations');
      const missingGen = s.missingColumns.filter((c) => c.gen).map((c) => c.column);
      if (createdConvos || missingGen.length) {
        await client.query(DDL_GEN_COLUMNS);
        applied.addedColumns = createdConvos ? GEN_COLUMNS.slice() : missingGen;
      }
      await client.query(DDL_GEN_CONSTRAINTS);
      applied.constraints = true;
      for (const sql of DDL_PLAIN_INDEXES) await client.query(sql);
      // Chỉ mục tìm kiếm gần đúng cần pg_trgm — thiếu quyền tạo extension thì BỎ QUA (tìm kiếm dùng ILIKE vẫn chạy), chỉ cảnh báo.
      if (!s.indexPresence.idx_conversations_search || !s.indexPresence.idx_conversation_turns_search) {
        await client.query('SAVEPOINT sp_trgm');
        try { for (const sql of DDL_TRGM) await client.query(sql); await client.query('RELEASE SAVEPOINT sp_trgm'); }
        catch (e) {
          await client.query('ROLLBACK TO SAVEPOINT sp_trgm');
          applied.warnings.push(`Không tạo được chỉ mục tìm kiếm pg_trgm (${redact(e && e.message)}). Tìm kiếm vẫn chạy nhưng chậm hơn khi dữ liệu lớn.`);
        }
      }
      applied.backfilled = await runBackfill(client);
    }
    await client.query('COMMIT');
    return applied;
  } catch (e) {
    await safeRollback(client);
    throw wrapDbError(e);
  }
}

// Bộ khởi tạo có trạng thái riêng (mỗi tiến trình serverless 1 bộ). Test tạo nhiều bộ để giả lập nhiều instance.
function createEnsurer() {
  let ready = false;
  let inflight = null;
  let status = { ok: false, applied: null, warnings: [], checkedAt: null };

  async function run(client) {
    let s;
    try { s = await inspectConversationSchema(client); } catch (e) { throw wrapDbError(e); }
    if (s.unfixableColumns.length) {
      throw new ConversationSchemaError('missing_column',
        `bảng đã có nhưng thiếu cột V145: ${s.unfixableColumns.map((c) => `${c.table}.${c.column}`).join(', ')}.`, { missing: s.unfixableColumns });
    }
    let applied = { createdTables: [], addedColumns: [], constraints: false, backfilled: 0, warnings: [] };
    if (s.needsInit) {
      applied = await initializeInLock(client);
      const after = await inspectConversationSchema(client).catch((e) => { throw wrapDbError(e); });
      if (after.needsInit || after.unfixableColumns.length) {
        const cat = after.missingTables.length ? 'missing_table' : 'missing_column';
        throw new ConversationSchemaError(cat, `sau khi khởi tạo vẫn thiếu: ${after.needs.join('; ') || after.unfixableColumns.map((c) => c.column).join(', ')}.`);
      }
    } else {
      // Đủ cấu trúc: chỉ chạy lại bước "bài đã có lượt thoại → ready" (UPDATE thường, không cần quyền DDL). Lỗi ở đây không chặn.
      try { applied.backfilled = await runBackfill(client); } catch (e) { applied.warnings.push('Không chạy được bước chuyển bài có sẵn lượt thoại sang ready: ' + redact(e && e.message)); }
    }
    status = { ok: true, applied, warnings: applied.warnings, checkedAt: new Date().toISOString() };
    return status;
  }

  // Các request đồng thời trong CÙNG tiến trình dùng chung 1 lần chạy; khác tiến trình được advisory lock xếp hàng.
  async function ensure(client) {
    if (ready) return true;
    if (!inflight) {
      inflight = run(client).then(
        () => { ready = true; inflight = null; return true; },
        (e) => { inflight = null; throw e; } // KHÔNG cache lỗi: request sau được thử lại
      );
    }
    return inflight;
  }
  ensure.status = () => status;
  ensure.reset = () => { ready = false; inflight = null; };
  return ensure;
}

const ensureConversationSchema = createEnsurer();

module.exports = {
  ADVISORY_LOCK_KEY, REQUIRED_TABLES, GEN_COLUMNS, V145_COLUMNS, ALL_COLUMNS,
  V152_CHECK_MIN, V152_CHECK_STATUS, V145_CHECK_OLD, UQ_TURN_POS, PLAIN_INDEXES, TRGM_INDEXES,
  TABLE_DDL, DDL_GEN_COLUMNS, DDL_GEN_CONSTRAINTS, SQL_BACKFILL_READY,
  CATEGORY_LABEL, ConversationSchemaError, classifyDbError, wrapDbError, schemaErrorResponse, redact,
  inspectConversationSchema, createEnsurer, ensureConversationSchema,
};
