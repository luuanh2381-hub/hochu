// lib/session-snapshot.js — Đồng bộ ảnh chụp phiên học đang dở & danh sách từ đã xong trong ngày giữa các thiết bị.
//
// Thiết kế tách biệt hoàn toàn khỏi lõi FSRS (fsrs_cards / review_history / study_sessions) và users.progress:
//  • Bảng user_session_snapshots tự tạo idempotent (CREATE TABLE IF NOT EXISTS) qua withSchemaFastPath.
//  • Luôn dùng ngày lịch Việt Nam (vnDateKey — Asia/Ho_Chi_Minh) làm day_key chuẩn chung cho mọi thiết bị.
//  • Cập nhật theo từng mode (review, review-weak, flash, quiz, type, listen) trong transaction FOR UPDATE,
//    so khớp savedAt để request đến trễ không ghi đè tiến độ mới hơn, và gộp (union) danh sách day_known.
//  • Khi hoàn tất phiên hoặc bấm "Học mới" (clear: true), lưu mốc { cleared: true, savedAt } để thiết bị khác
//    biết phiên cũ đã đóng và không hồi sinh bản localStorage cũ hơn.
'use strict';

const { withSchemaFastPath } = require('./schema-state');
const { vnDateKey } = require('./study-days');

const ALLOWED_MODES = new Set(['review', 'review-weak', 'flash', 'quiz', 'type', 'listen']);
const MAX_SESSION_BYTES = 160 * 1024;
const MAX_DAY_KNOWN = 2500;

let _db = null;
function dbm() { if (!_db) _db = require('./db'); return _db; }

let ready = null;
async function ensureTableImpl(client) {
  if (ready) return ready;
  ready = (async () => {
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_session_snapshots (
          user_id TEXT PRIMARY KEY,
          day_key TEXT NOT NULL,
          day_known JSONB NOT NULL DEFAULT '[]'::jsonb,
          sessions JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);
      return true;
    } catch (e) { ready = null; throw e; }
  })();
  return ready;
}
const ensureTable = withSchemaFastPath('session-snapshot-v1', ensureTableImpl);

function sanitizeDayKnown(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    if (typeof x !== 'string') continue;
    const s = x.trim();
    if (!s || s.length > 40 || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= MAX_DAY_KNOWN) break;
  }
  return out;
}

function sanitizeSessionPayload(raw, dayKey) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.sessionId !== 'string' || !raw.sessionId || !Array.isArray(raw.items)) return null;
  const savedAt = Number.isFinite(Number(raw.savedAt)) ? Number(raw.savedAt) : Date.now();
  const payload = {
    sessionId: raw.sessionId.slice(0, 80),
    items: raw.items.slice(0, 300),
    doneHz: Array.isArray(raw.doneHz) ? raw.doneHz.filter((x) => typeof x === 'string').slice(0, 500) : [],
    totalPlanned: Number.isFinite(Number(raw.totalPlanned)) ? Number(raw.totalPlanned) : 0,
    answeredCount: Number.isFinite(Number(raw.answeredCount)) ? Number(raw.answeredCount) : 0,
    startTime: Number.isFinite(Number(raw.startTime)) ? Number(raw.startTime) : null,
    endTime: Number.isFinite(Number(raw.endTime)) ? Number(raw.endTime) : null,
    completedCards: Array.isArray(raw.completedCards) ? raw.completedCards.slice(-300) : [],
    lessonFilter: (raw.lessonFilter && typeof raw.lessonFilter === 'object') ? raw.lessonFilter : null,
    dayKey,
    savedAt,
    graded: (raw.graded && typeof raw.graded === 'object') ? raw.graded : null,
    extra: (raw.extra && typeof raw.extra === 'object') ? raw.extra : {},
  };
  let bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (bytes > MAX_SESSION_BYTES && payload.extra && Array.isArray(payload.extra.log)) {
    // Nếu nhật ký buổi quá dài, rút gọn log giữ phần gần nhất để luôn vừa giới hạn lưu trữ.
    payload.extra = Object.assign({}, payload.extra, { log: payload.extra.log.slice(-60) });
    bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  }
  if (bytes > MAX_SESSION_BYTES) return null;
  return payload;
}

async function getSnapshot(userId) {
  const today = vnDateKey(Date.now());
  const client = await dbm().getPool().connect();
  try {
    await ensureTable(client);
    const r = await client.query(
      'SELECT day_key, day_known, sessions, updated_at FROM user_session_snapshots WHERE user_id = $1',
      [userId]
    );
    if (!r.rows.length || r.rows[0].day_key !== today) {
      return { dayKey: today, dayKnown: [], sessions: {} };
    }
    const row = r.rows[0];
    return {
      dayKey: today,
      dayKnown: Array.isArray(row.day_known) ? row.day_known : [],
      sessions: (row.sessions && typeof row.sessions === 'object') ? row.sessions : {},
    };
  } finally {
    client.release();
  }
}

async function saveSnapshot(userId, { mode, session, clear, dayKnown, savedAt } = {}) {
  const today = vnDateKey(Date.now());
  const validMode = (typeof mode === 'string' && ALLOWED_MODES.has(mode)) ? mode : null;
  const incomingKnown = sanitizeDayKnown(dayKnown);
  const incomingSession = (!clear && validMode) ? sanitizeSessionPayload(session, today) : null;
  const clearAt = Number.isFinite(Number(savedAt)) ? Number(savedAt) : Date.now();

  if (!validMode && !incomingKnown.length) {
    return { dayKey: today, updated: false };
  }

  const client = await dbm().getPool().connect();
  try {
    await ensureTable(client);
    await client.query('BEGIN');
    const r = await client.query(
      'SELECT day_key, day_known, sessions FROM user_session_snapshots WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    const sameDay = r.rows.length > 0 && r.rows[0].day_key === today;
    const mergedKnownSet = new Set(sameDay && Array.isArray(r.rows[0].day_known) ? r.rows[0].day_known : []);
    for (const hz of incomingKnown) {
      if (mergedKnownSet.size >= MAX_DAY_KNOWN) break;
      mergedKnownSet.add(hz);
    }
    const mergedKnown = [...mergedKnownSet];

    const sessions = (sameDay && r.rows[0].sessions && typeof r.rows[0].sessions === 'object')
      ? Object.assign({}, r.rows[0].sessions)
      : {};

    if (validMode) {
      const existing = sessions[validMode];
      const existingAt = (existing && Number.isFinite(Number(existing.savedAt))) ? Number(existing.savedAt) : 0;
      if (clear) {
        if (clearAt >= existingAt) sessions[validMode] = { cleared: true, dayKey: today, savedAt: clearAt };
      } else if (incomingSession) {
        if (incomingSession.savedAt >= existingAt) sessions[validMode] = incomingSession;
      }
    }

    await client.query(
      `INSERT INTO user_session_snapshots (user_id, day_key, day_known, sessions, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, now())
       ON CONFLICT (user_id) DO UPDATE SET
         day_key = EXCLUDED.day_key,
         day_known = EXCLUDED.day_known,
         sessions = EXCLUDED.sessions,
         updated_at = now()`,
      [userId, today, JSON.stringify(mergedKnown), JSON.stringify(sessions)]
    );
    await client.query('COMMIT');
    return { dayKey: today, updated: true, dayKnownCount: mergedKnown.length };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

// CHỈ ĐỌC: tóm tắt trạng thái học theo từng chữ Hán cho Bản đồ HSK 1-4 và Sơ đồ họ chữ.
// KHÔNG ghi/đổi bất kỳ bản ghi FSRS nào.
async function getUserStudiedStatusMap(userId) {
  const client = await dbm().getPool().connect();
  try {
    const r = await client.query(
      `SELECT hz,
              MAX(CASE WHEN state = 2 AND stability >= 21 THEN 2
                       WHEN reps > 0 OR state > 0 THEN 1
                       ELSE 0 END) AS lvl
       FROM fsrs_cards
       WHERE user_id = $1
       GROUP BY hz`,
      [userId]
    );
    const map = {};
    for (const row of r.rows) {
      if (row.lvl >= 2) map[row.hz] = 'mature';
      else if (row.lvl >= 1) map[row.hz] = 'learning';
    }
    return map;
  } finally {
    client.release();
  }
}

module.exports = { getSnapshot, saveSnapshot, getUserStudiedStatusMap, ALLOWED_MODES, sanitizeSessionPayload, sanitizeDayKnown };
