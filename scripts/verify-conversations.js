#!/usr/bin/env node
// verify-conversations.js — V154: KIỂM TRA (chỉ đọc) lược đồ + dữ liệu hội thoại. Không sửa, không xoá, không tạo gì.
//   node scripts/verify-conversations.js            (cần DATABASE_URL)
// Kết quả mỗi mục: PASS (đầy đủ) · WARNING (thiếu thứ không ảnh hưởng trực tiếp) · FAIL (thiếu bảng/cấu trúc bắt buộc).
// Mã thoát: 0 = không có FAIL; 1 = có FAIL; 2 = không kết nối được.
// Toàn bộ truy vấn là SELECT trên catalog/bảng; hàm `runVerification(client)` dùng được với bất kỳ client có .query (test dùng Postgres thật).
const {
  REQUIRED_TABLES, ALL_COLUMNS, GEN_COLUMNS, PLAIN_INDEXES, TRGM_INDEXES, V152_CHECK_MIN, V152_CHECK_STATUS, V145_CHECK_OLD, UQ_TURN_POS,
  inspectConversationSchema, redact,
} = require('../lib/conversation-schema');
const { buildConversationDataReport } = require('../lib/conversation-batches');

const PASS = 'PASS', WARN = 'WARNING', FAIL = 'FAIL';

async function runVerification(client) {
  const items = []; // { level, area, text }
  const add = (level, area, text) => items.push({ level, area, text });
  const s = await inspectConversationSchema(client);

  // 1. Ba bảng nền tảng
  for (const t of REQUIRED_TABLES) {
    if (s.tables[t]) add(PASS, 'Bảng', `${t} tồn tại`);
    else add(FAIL, 'Bảng', `THIẾU bảng ${t} — chạy migrations/V145_conversation_library.sql (hoặc mở tab Hội thoại để app tự tạo)`);
  }

  // 2. Cột (V145 + V152)
  for (const t of REQUIRED_TABLES) {
    if (!s.tables[t]) continue;
    const miss = ALL_COLUMNS[t].filter((c) => !s.columns[t].includes(c));
    const missGen = miss.filter((c) => t === 'conversations' && GEN_COLUMNS.includes(c));
    const missBase = miss.filter((c) => !missGen.includes(c));
    if (!miss.length) add(PASS, 'Cột', `${t}: đủ ${ALL_COLUMNS[t].length} cột`);
    if (missBase.length) add(FAIL, 'Cột', `${t} thiếu cột V145: ${missBase.join(', ')}`);
    if (missGen.length) add(FAIL, 'Cột V152', `conversations thiếu cột V152: ${missGen.join(', ')} — chạy migrations/V152_conversation_generation.sql`);
  }

  // 3. Khoá chính / khoá ngoại / UNIQUE
  const st = s.structure;
  const chk = (ok, area, text, level = FAIL) => add(ok ? PASS : level, area, ok ? text : `THIẾU: ${text}`);
  if (s.tables.conversations) {
    chk(st.conversationsPk, 'Khoá', 'PRIMARY KEY conversations(id)');
    chk(st.dialogueIdUnique, 'Khoá', 'UNIQUE conversations(dialogue_id)');
  }
  if (s.tables.conversation_turns) {
    chk(st.turnsPk, 'Khoá', 'PRIMARY KEY conversation_turns(id)');
    chk(st.turnsFk, 'Khoá', 'FOREIGN KEY conversation_turns.conversation_id → conversations(id)');
  }
  if (s.tables.conversation_progress) {
    chk(st.progressPk, 'Khoá', 'PRIMARY KEY conversation_progress(id)');
    chk(st.progressFk, 'Khoá', 'FOREIGN KEY conversation_progress.conversation_id → conversations(id)');
    chk(st.progressUnique, 'Khoá', 'UNIQUE conversation_progress(user_id, conversation_id) (cần cho lưu tiến độ/yêu thích — ON CONFLICT)');
  }

  // 4. Constraints CHECK
  if (s.tables.conversations) {
    chk(st.hskLevelCheck, 'Ràng buộc', "CHECK hsk_level IN ('HSK 3','HSK 4')");
    if (s.missingColumns.some((c) => c.gen)) add(FAIL, 'Ràng buộc', `${V152_CHECK_STATUS} không kiểm tra được vì thiếu cột gen_status`);
    else chk(s.v152.genStatusCheck, 'Ràng buộc', `${V152_CHECK_STATUS} (CHECK gen_status)`);
    chk(s.v152.totalTurnsMin, 'Ràng buộc', `${V152_CHECK_MIN} (CHECK total_turns >= 12)`);
    if (s.v152.oldTotalTurnsCheckGone) add(PASS, 'Ràng buộc', `đã gỡ ${V145_CHECK_OLD} (>= 30) theo V152`);
    else add(FAIL, 'Ràng buộc', `còn ${V145_CHECK_OLD} (total_turns >= 30) — sẽ chặn bài AI < 30 lượt; V152 chưa áp xong`);
  }
  if (s.tables.conversation_turns) {
    if (s.v152.turnPosUnique) add(PASS, 'Ràng buộc', `${UQ_TURN_POS} UNIQUE(conversation_id, turn_number)`);
    else add(WARN, 'Ràng buộc', `chưa có ${UQ_TURN_POS} UNIQUE(conversation_id, turn_number) (thường do đang có dòng trùng lượt, hoặc V152 chưa chạy)`);
  }

  // 5. Index
  for (const n of PLAIN_INDEXES) {
    if (s.indexPresence[n]) add(PASS, 'Index', n);
    else add(WARN, 'Index', `thiếu ${n} (chỉ ảnh hưởng tốc độ)`);
  }
  for (const n of TRGM_INDEXES) {
    if (s.indexPresence[n]) add(PASS, 'Index', n);
    else add(WARN, 'Index', `thiếu ${n} (cần extension pg_trgm${s.trgmExtension ? '' : ' — chưa cài'}; tìm kiếm vẫn chạy bằng ILIKE)`);
  }

  // 6. Dữ liệu
  let report = null;
  const countsOk = s.tables.conversations && s.tables.conversation_turns && !s.missingColumns.some((c) => c.table === 'conversations' && c.gen);
  if (s.tables.conversations) {
    const ids = (await client.query('SELECT dialogue_id FROM conversations')).rows.map((r) => r.dialogue_id);
    const t = s.tables.conversation_turns
      ? (await client.query(`SELECT (SELECT COUNT(*) FROM conversation_turns)::int AS total, (SELECT COUNT(DISTINCT conversation_id) FROM conversation_turns)::int AS with_turns`)).rows[0]
      : { total: 0, with_turns: 0 };
    report = buildConversationDataReport(ids, { total: t.total, conversationsWithTurns: t.with_turns, conversationsWithoutTurns: Math.max(0, ids.length - t.with_turns) });
    add(ids.length ? PASS : WARN, 'Dữ liệu', `số hội thoại: ${ids.length}`);
    add(t.total ? PASS : WARN, 'Dữ liệu', `số lượt thoại: ${t.total} (${t.with_turns} hội thoại đã có lượt, ${Math.max(0, ids.length - t.with_turns)} chưa có lượt — AI sẽ soạn ở tab Quản trị hội thoại)`);
    for (const b of report.batches) {
      if (b.status === 'ok') add(PASS, 'Batch', `batch ${b.batch} (${b.level}): đủ ${b.expected}/${b.expected}`);
      else add(WARN, 'Batch', `batch ${b.batch} (${b.level}): có ${b.present}/${b.expected} — nhập ${b.file}${b.missing.length ? ` (thiếu ví dụ: ${b.missing.slice(0, 3).join(', ')})` : ''}`);
    }
    if (countsOk) {
      const g = await client.query("SELECT gen_status, COUNT(*)::int AS c FROM conversations GROUP BY gen_status ORDER BY gen_status");
      add(PASS, 'Trạng thái', g.rows.length ? g.rows.map((r) => `${r.gen_status}=${r.c}`).join(', ') : 'chưa có hội thoại');
      const orphan = await client.query("SELECT COUNT(*)::int AS c FROM conversations c WHERE c.gen_status = 'ready' AND NOT EXISTS (SELECT 1 FROM conversation_turns t WHERE t.conversation_id = c.id)");
      if (orphan.rows[0].c) add(WARN, 'Trạng thái', `${orphan.rows[0].c} hội thoại 'ready' nhưng không có lượt thoại`);
    }
  } else {
    add(WARN, 'Dữ liệu', 'bỏ qua kiểm tra dữ liệu vì chưa có bảng conversations');
  }

  const fails = items.filter((i) => i.level === FAIL).length;
  const warns = items.filter((i) => i.level === WARN).length;
  return { items, fails, warns, overall: fails ? FAIL : (warns ? WARN : PASS), report };
}

function printResult(res, log = console.log) {
  let area = '';
  for (const i of res.items) {
    if (i.area !== area) { area = i.area; log(`\n[${area}]`); }
    log(`  ${i.level === PASS ? '✅ PASS   ' : i.level === WARN ? '⚠️  WARNING' : '❌ FAIL   '} ${i.text}`);
  }
  log(`\n══ KẾT QUẢ: ${res.overall} — ${res.fails} FAIL, ${res.warns} WARNING ══`);
  if (res.fails) log('Có thể để app tự khởi tạo (mở Thêm → Quản trị hội thoại) hoặc chạy migrations/V145_conversation_library.sql + V152_conversation_generation.sql trong Neon SQL Editor.');
  if (res.report && !res.report.complete) log(res.report.advice);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) { console.error('❌ Chưa cấu hình DATABASE_URL'); process.exit(2); }
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 1 });
  try {
    const res = await runVerification(pool);
    printResult(res);
    process.exitCode = res.fails ? 1 : 0;
  } catch (e) {
    console.error('❌ Không kiểm tra được:', redact(e && e.message));
    process.exitCode = 2;
  } finally { await pool.end().catch(() => {}); }
}

if (require.main === module) main();
module.exports = { runVerification, printResult, PASS, WARN, FAIL };
