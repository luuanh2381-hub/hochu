// lib/audio-library.js — V141: thư viện âm thanh DÙNG CHUNG (Neon metadata + Cloudflare R2).
//
// Luồng 1 lần nghe: client hỏi content_hash → server tra Neon → có MP3 thì ký URL R2;
// chưa có thì TẠO LƯỢT (lazy, không sinh hàng loạt) → gọi Edge-TTS → tải MP3 lên R2 → ghi Neon ready.
// Chống trùng: content_hash UNIQUE; claim nguyên tử (INSERT ... ON CONFLICT) nên 2 request đồng thời
// chỉ 1 bên tạo, bên kia chờ rồi dùng lại. storage_key luôn suy ra từ content_hash (client không chọn).
// Không đụng bảng từ vựng / FSRS / tiến độ học. Bảng tự tạo (CREATE TABLE IF NOT EXISTS) ở lần dùng đầu.
'use strict';

const crypto = require('crypto');
const AH = require('../js/audio-hash');

const MAX_TEXT_CHARS = 500;        // khớp api/edge-tts.py
const WAIT_BUDGET_MS = 45000;      // chờ bên đang tạo (tối đa 45 s)
const WAIT_STEP_MS = 500;
const STALE_PENDING_SECONDS = 120; // lượt pending quá cũ coi như bỏ dở → cho phép tạo lại

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS audio_library (
  id BIGSERIAL PRIMARY KEY,
  content_hash TEXT NOT NULL UNIQUE,
  text_content TEXT NOT NULL,
  voice TEXT NOT NULL,
  speed TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'mp3',
  storage_key TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  duration DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audio_library_status_idx ON audio_library (status);
CREATE INDEX IF NOT EXISTS audio_library_updated_idx ON audio_library (updated_at);
`;

function sha256(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function textLength(text) { return Array.from(text).length; }

// Hàm THUẦN: kiểm tra đầu vào từ client. Chỉ 2 giọng và 5 tốc độ đang dùng; không nhận storage_key.
function validateRequest(input) {
  const text = AH.normalizeText(input && input.text);
  const voice = String((input && input.voice) || '');
  const rawSpeed = input && (input.speed != null ? input.speed : input.rate);
  let speed = '0.9';
  if (rawSpeed != null) {
    const num = Number(rawSpeed);
    if (!Number.isFinite(num) || !AH.SPEEDS.some((s) => Math.abs(Number(s) - num) < 1e-9)) {
      return { ok: false, message: 'Tốc độ không hợp lệ' };
    }
    speed = num.toFixed(1);
  }
  if (!text) return { ok: false, message: 'Thiếu nội dung cần đọc' };
  if (textLength(text) > MAX_TEXT_CHARS) return { ok: false, message: `Nội dung quá dài (tối đa ${MAX_TEXT_CHARS} ký tự mỗi đoạn)` };
  if (!/[一-鿿]/.test(text)) return { ok: false, message: 'Nội dung phải có chữ Hán' };
  if (!AH.VOICES.includes(voice)) return { ok: false, message: 'Giọng đọc không hợp lệ' };
  return { ok: true, text, voice, speed, format: AH.FORMAT };
}

function createStore(pool) {
  let ensured = null;
  function ensure() {
    if (!ensured) ensured = pool.query(TABLE_SQL).catch((e) => { ensured = null; throw e; });
    return ensured;
  }
  const run = async (sql, params) => { await ensure(); return pool.query(sql, params); };

  return {
    ensure,
    async find(hash) {
      const r = await run('SELECT * FROM audio_library WHERE content_hash = $1', [hash]);
      return r.rows[0] || null;
    },
    // Trả về row nếu request này GIÀNH được quyền tạo (chưa có, failed, hoặc pending quá cũ).
    async claim(hash, f) {
      const r = await run(
        `INSERT INTO audio_library (content_hash, text_content, voice, speed, format, storage_key, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         ON CONFLICT (content_hash) DO UPDATE
           SET status = 'pending', updated_at = now(), error = NULL
           WHERE audio_library.status = 'failed'
              OR (audio_library.status = 'pending' AND audio_library.updated_at < now() - interval '${STALE_PENDING_SECONDS} seconds')
         RETURNING *`,
        [hash, f.text, f.voice, f.speed, f.format, f.storageKey],
      );
      return r.rows[0] || null;
    },
    async reset(hash) {
      const r = await run(
        `UPDATE audio_library SET status = 'pending', updated_at = now(), error = NULL
         WHERE content_hash = $1 RETURNING *`, [hash],
      );
      return r.rows[0] || null;
    },
    async markReady(hash, f) {
      await run(
        `UPDATE audio_library
         SET status = 'ready', storage_key = $2, file_size = $3, duration = $4, error = NULL, updated_at = now()
         WHERE content_hash = $1`,
        [hash, f.storageKey, f.fileSize, f.duration == null ? null : f.duration],
      );
    },
    async markFailed(hash, code) {
      await run(
        `UPDATE audio_library SET status = 'failed', error = $2, updated_at = now() WHERE content_hash = $1`,
        [hash, String(code || 'unknown').slice(0, 300)],
      );
    },
  };
}

function ttsUrl() {
  if (process.env.AUDIO_TTS_URL) return process.env.AUDIO_TTS_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api/edge-tts`;
  return `http://127.0.0.1:${process.env.PORT || 3000}/api/edge-tts`;
}

// Chẩn đoán: 1 dòng JSON mỗi bước, có request ID. KHÔNG log text, credentials hay presigned URL.
function newRequestId() { return crypto.randomBytes(6).toString('hex'); }
function logStep(step, fields) {
  try { console.log('[AUDIO] ' + step + ' ' + JSON.stringify(fields || {})); } catch (e) { /* logging không được làm hỏng luồng */ }
}
// Mã lỗi an toàn để trả client/log: Code của S3 → name của SDK → tts_http_N → HTTP_N.
function safeCode(err) {
  if (!err) return 'unknown';
  if (typeof err.Code === 'string' && err.Code) return err.Code;
  if (typeof err.name === 'string' && err.name && err.name !== 'Error') return err.name;
  const m = /^tts_http_(\d+)$/.exec(String(err.message || ''));
  if (m) return 'tts_http_' + m[1];
  const status = err.$metadata && err.$metadata.httpStatusCode;
  return status ? 'HTTP_' + status : 'unknown';
}

async function defaultTtsFetch(text, voice, speed) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50000);
  try {
    const res = await fetch(ttsUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, rate: speed }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('tts_http_' + res.status);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

// Health: gọi đúng đường Edge-TTS mà server dùng khi tạo MP3 (phát hiện deployment protection/URL sai).
async function probeTts() {
  const started = Date.now();
  try {
    const buf = await defaultTtsFetch('你好', 'zh-CN-XiaoxiaoNeural', '0.9');
    return { ok: true, bytes: buf.length, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, code: safeCode(e), ms: Date.now() - started };
  }
}

function createAudioLibrary(opts) {
  const options = opts || {};
  const store = options.store;
  const r2 = options.r2;
  const ttsFetch = options.ttsFetch || defaultTtsFetch;
  const wait = options.wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now || (() => Date.now());
  const presignSeconds = options.presignSeconds || 1200;

  async function generateOwned(hash, key, v, ctx) {
    const c = ctx || { requestId: newRequestId(), started: now() };
    let buf;
    const ttsStarted = now();
    logStep('EDGE_TTS_STARTED', { requestId: c.requestId, contentHash: hash, voice: v.voice, speed: v.speed, textChars: textLength(v.text) });
    try {
      buf = await ttsFetch(v.text, v.voice, v.speed);
    } catch (e) {
      const code = safeCode(e);
      logStep('EDGE_TTS_FAILED', { requestId: c.requestId, contentHash: hash, ms: now() - ttsStarted, code });
      await store.markFailed(hash, code).catch(() => {});
      return { ok: false, code: 'tts_failed', detail: code, message: 'Edge-TTS không tạo được âm thanh' };
    }
    const bytes = Buffer.isBuffer(buf) ? buf.length : 0;
    logStep('EDGE_TTS_COMPLETED', { requestId: c.requestId, contentHash: hash, ms: now() - ttsStarted, bytes });
    logStep('MP3_SIZE', { requestId: c.requestId, contentHash: hash, bytes });
    if (!r2.isMp3(buf)) {
      logStep('EDGE_TTS_INVALID_AUDIO', { requestId: c.requestId, contentHash: hash, bytes });
      await store.markFailed(hash, 'invalid_audio').catch(() => {});
      return { ok: false, code: 'tts_invalid_audio', detail: 'not_mp3', message: 'Âm thanh trả về không hợp lệ' };
    }
    const putStarted = now();
    logStep('R2_UPLOAD_STARTED', { requestId: c.requestId, contentHash: hash, storageKey: key, bytes });
    try {
      await r2.putMp3(key, buf);
      logStep('R2_UPLOAD_SUCCESS', { requestId: c.requestId, contentHash: hash, storageKey: key, ms: now() - putStarted });
    } catch (e) {
      const code = safeCode(e);
      logStep('R2_UPLOAD_FAILED', { requestId: c.requestId, contentHash: hash, storageKey: key, ms: now() - putStarted, code });
      await store.markFailed(hash, code).catch(() => {});
      return { ok: false, code: 'upload_failed', detail: code, message: 'Không lưu được âm thanh lên R2' };
    }
    // Xác minh object thật sự tồn tại và đúng dữ liệu trước khi đánh dấu ready.
    const headStarted = now();
    logStep('R2_HEAD_STARTED', { requestId: c.requestId, contentHash: hash, storageKey: key });
    let meta;
    try {
      meta = await r2.headObject(key);
    } catch (e) {
      const code = safeCode(e);
      logStep('R2_HEAD_FAILED', { requestId: c.requestId, contentHash: hash, storageKey: key, ms: now() - headStarted, code });
      await store.markFailed(hash, 'verify_' + code).catch(() => {});
      return { ok: false, code: 'upload_verify_failed', detail: code, message: 'Không xác minh được tệp trên R2' };
    }
    if (!meta) {
      logStep('R2_HEAD_FAILED', { requestId: c.requestId, contentHash: hash, storageKey: key, ms: now() - headStarted, code: 'not_found' });
      await store.markFailed(hash, 'verify_not_found').catch(() => {});
      return { ok: false, code: 'upload_verify_failed', detail: 'not_found', message: 'R2 báo không có tệp sau khi tải lên' };
    }
    logStep('R2_HEAD_SUCCESS', {
      requestId: c.requestId, contentHash: hash, storageKey: key, ms: now() - headStarted,
      contentLength: meta.contentLength == null ? null : meta.contentLength, contentType: meta.contentType || null,
    });
    if (meta.contentLength != null && meta.contentLength !== bytes) {
      logStep('R2_VERIFY_MISMATCH', { requestId: c.requestId, contentHash: hash, storageKey: key, expected: bytes, actual: meta.contentLength });
      await store.markFailed(hash, 'verify_size_mismatch').catch(() => {});
      return { ok: false, code: 'upload_verify_failed', detail: 'size_mismatch', message: 'Tệp trên R2 sai kích thước' };
    }
    if (meta.contentType && !/audio\/mpeg/i.test(String(meta.contentType))) {
      logStep('R2_VERIFY_MISMATCH', { requestId: c.requestId, contentHash: hash, storageKey: key, contentType: String(meta.contentType) });
      await store.markFailed(hash, 'verify_content_type').catch(() => {});
      return { ok: false, code: 'upload_verify_failed', detail: 'content_type_mismatch', message: 'Tệp trên R2 sai định dạng' };
    }
    const dbStarted = now();
    try {
      await store.markReady(hash, { storageKey: key, fileSize: bytes, duration: null });
      logStep('NEON_METADATA_SAVED', { requestId: c.requestId, contentHash: hash, storageKey: key, bytes, ms: now() - dbStarted });
    } catch (e) {
      const code = safeCode(e);
      logStep('NEON_METADATA_FAILED', { requestId: c.requestId, contentHash: hash, ms: now() - dbStarted, code });
      await store.markFailed(hash, 'metadata_failed').catch(() => {});
      return { ok: false, code: 'metadata_failed', detail: code, message: 'Không lưu được thông tin âm thanh' };
    }
    try {
      const url = await r2.presignGet(key, presignSeconds);
      return { ok: true, contentHash: hash, url, cached: false, generated: true, expiresIn: presignSeconds };
    } catch (e) {
      const code = safeCode(e);
      logStep('R2_PRESIGN_FAILED', { requestId: c.requestId, contentHash: hash, storageKey: key, code });
      return { ok: false, code: 'sign_failed', detail: code, message: 'Không tạo được liên kết âm thanh' };
    }
  }

  async function resolve(input) {
    const requestId = newRequestId();
    const started = now();
    const v = validateRequest(input);
    if (!v.ok) {
      logStep('AUDIO_REQUEST_RECEIVED', { requestId, valid: false, textChars: textLength(AH.normalizeText(input && input.text)) });
      logStep('AUDIO_RESOLVE_DONE', { requestId, ok: false, code: 'invalid_input', ms: now() - started });
      return { ok: false, code: 'invalid_input', message: v.message };
    }
    logStep('AUDIO_REQUEST_RECEIVED', {
      requestId, valid: true, textChars: textLength(v.text), voice: v.voice, speed: v.speed,
    });
    if (!r2.isConfigured()) {
      logStep('AUDIO_RESOLVE_DONE', { requestId, ok: false, code: 'r2_not_configured', ms: now() - started });
      return { ok: false, code: 'r2_not_configured', message: 'Thư viện âm thanh chưa được cấu hình' };
    }

    const hash = sha256(AH.canonical(v.text, v.voice, v.speed));
    let key;
    try { key = r2.storageKey(hash); }
    catch (e) {
      logStep('AUDIO_RESOLVE_DONE', { requestId, ok: false, code: 'invalid_input', ms: now() - started });
      return { ok: false, code: 'invalid_input', message: 'Không tạo được khoá âm thanh' };
    }
    const ctx = { requestId, started };

    const deadline = now() + WAIT_BUDGET_MS;
    let announcedMiss = false;
    let announcedWait = false;
    try {
      for (;;) {
        const row = await store.find(hash);
        if (row && row.status === 'ready') {
          logStep('NEON_CACHE_HIT', { requestId, contentHash: hash, storageKey: key });
          if (await r2.head(key)) {
            logStep('R2_OBJECT_PRESENT', { requestId, contentHash: hash, storageKey: key });
            const url = await r2.presignGet(key, presignSeconds);
            logStep('AUDIO_RESOLVE_DONE', { requestId, contentHash: hash, ok: true, cached: true, ms: now() - started });
            return { ok: true, contentHash: hash, url, cached: true, expiresIn: presignSeconds };
          }
          logStep('R2_OBJECT_MISSING', { requestId, contentHash: hash, storageKey: key });
          await store.reset(hash); // Neon có nhưng R2 mất tệp → tạo lại
          const out = await generateOwned(hash, key, v, ctx);
          logStep('AUDIO_RESOLVE_DONE', { requestId, contentHash: hash, ok: out.ok, code: out.code, cached: false, generated: out.generated, ms: now() - started });
          return out;
        }
        if (!announcedMiss) {
          logStep('NEON_CACHE_MISS', { requestId, contentHash: hash, storageKey: key });
          announcedMiss = true;
        }
        const claimed = await store.claim(hash, { text: v.text, voice: v.voice, speed: v.speed, format: v.format, storageKey: key });
        if (claimed) {
          logStep('NEON_CLAIM_OWNED', { requestId, contentHash: hash, storageKey: key });
          const out = await generateOwned(hash, key, v, ctx);
          logStep('AUDIO_RESOLVE_DONE', { requestId, contentHash: hash, ok: out.ok, code: out.code, cached: false, generated: out.generated, ms: now() - started });
          return out;
        }
        if (now() >= deadline) {
          logStep('NEON_CLAIM_WAIT_TIMEOUT', { requestId, contentHash: hash, ms: now() - started });
          logStep('AUDIO_RESOLVE_DONE', { requestId, contentHash: hash, ok: false, code: 'pending', ms: now() - started });
          return { ok: false, code: 'pending', pending: true, message: 'Âm thanh đang được tạo, thử lại sau' };
        }
        if (!announcedWait) {
          logStep('NEON_CLAIM_WAIT', { requestId, contentHash: hash, ms: now() - started });
          announcedWait = true;
        }
        await wait(WAIT_STEP_MS);
      }
    } catch (e) {
      const code = safeCode(e);
      logStep('AUDIO_RESOLVE_ERROR', { requestId, contentHash: hash, storageKey: key, ms: now() - started, code });
      return { ok: false, code: 'library_error', detail: code, message: 'Thư viện âm thanh đang lỗi' };
    }
  }

  return { resolve, validateRequest, generateOwned };
}

let _default = null;
function getAudioLibrary() {
  if (!_default) {
    const db = require('./db');
    _default = createAudioLibrary({ store: createStore(db.getPool()), r2: require('./r2') });
  }
  return _default;
}

module.exports = {
  MAX_TEXT_CHARS, TABLE_SQL, STALE_PENDING_SECONDS,
  sha256, validateRequest, createStore, createAudioLibrary, getAudioLibrary, defaultTtsFetch, probeTts, ttsUrl,
};