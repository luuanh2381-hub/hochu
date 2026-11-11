// lib/word-images.js — V142: ảnh GỢI NHỚ cho từ vựng (Cloudflare Workers AI FLUX.1 schnell → Cloudflare R2).
//
// Luồng cho mỗi từ (chạy NỀN theo lô, không sinh lúc người học bấm):
//   1) Model văn bản (Vilao, qua callText) soạn: câu chuyện gợi nhớ tiếng Việt + prompt vẽ ảnh tiếng Anh
//      (dựa trên nghĩa, Hán Việt, chiết tự bộ thủ) → lưu hàng 'prompted'.
//   2) FLUX.1 schnell (REST API của Cloudflare) vẽ ảnh từ prompt → kiểm tra magic bytes → tải lên R2.
//   3) Neon chỉ lưu metadata (hz, câu chuyện, storage_key, trạng thái). Client xin URL ký sẵn của R2.
//
// Trạng thái: drafting → prompted → generating → ready (hoặc failed, thử lại tối đa MAX_ATTEMPTS lần).
// Mọi bước "chiếm" việc đều nguyên tử (INSERT ... ON CONFLICT / UPDATE ... FOR UPDATE SKIP LOCKED) nên
// nhiều lượt cron chạy song song không sinh trùng. Hàng kẹt quá STALE_SECONDS được trả về hàng đợi.
// Hết hạn mức miễn phí của Cloudflare (HTTP 429) → dừng lượt chạy, trả việc về hàng đợi, KHÔNG đánh dấu lỗi.
//
// Biến môi trường: CF_AI_TOKEN (token có quyền Workers AI), CF_ACCOUNT_ID (mặc định dùng R2_ACCOUNT_ID),
//                  CF_AI_IMAGE_MODEL (tuỳ chọn, mặc định @cf/black-forest-labs/flux-1-schnell),
//                  CF_AI_IMAGE_STEPS (tuỳ chọn, 1–8, mặc định 4).
'use strict';

const crypto = require('crypto');
const https = require('https');

const FLUX_MODEL_DEFAULT = '@cf/black-forest-labs/flux-1-schnell';
const PROMPT_BATCH = 6;          // số từ soạn prompt trong 1 lần gọi model văn bản
const IMAGE_CONCURRENCY = 3;     // số ảnh vẽ song song trong 1 lượt
const MAX_IMAGES_PER_RUN = 30;
const MAX_ATTEMPTS = 3;
const STALE_SECONDS = 120;
const IMAGE_TIMEOUT_MS = 20000;
const MIN_MS_FOR_IMAGE = 22000;  // còn ít hơn thì không bắt đầu bước vẽ ảnh mới
const MIN_MS_FOR_TEXT = 30000;   // còn ít hơn thì không bắt đầu bước soạn prompt mới
const PRESIGN_SECONDS = 1200;
const STYLE_SUFFIX = 'simple flat vector illustration, soft pastel colors, plain white background, '
  + 'one clear central subject, no text, no letters, no writing, no Chinese characters, no watermark';
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/g;
const HZ_RE = /^[\u4e00-\u9fff]{1,8}$/;

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS word_images (
  hz TEXT PRIMARY KEY,
  story_vi TEXT,
  image_prompt TEXT,
  storage_key TEXT,
  content_type TEXT,
  file_size INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'drafting' CHECK (status IN ('drafting', 'prompted', 'generating', 'ready', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS word_images_status_idx ON word_images (status);
`;

function sha256(text) { return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex'); }
// Key R2 suy ra từ chữ Hán (server tự tính) — cùng 1 từ luôn cùng 1 key, tạo lại ảnh thì ghi đè.
function hashForWord(hz) { return sha256('wordimg|v1|' + hz); }
function isValidHz(hz) { return typeof hz === 'string' && HZ_RE.test(hz); }
function safeCode(err) {
  if (!err) return 'unknown';
  if (err.code && typeof err.code === 'string') return err.code.slice(0, 40);
  if (err.status) return 'HTTP_' + err.status;
  return String(err.message || 'error').replace(/\s+/g, ' ').slice(0, 120);
}

// ── Hàm THUẦN: dựng prompt gửi model văn bản ──
function buildDraftPrompt(words, partsTextFor) {
  const list = words.map((w, i) => {
    const hv = w.hanviet && String(w.hanviet).trim() ? ` [Hán Việt: ${String(w.hanviet).trim()}]` : '';
    const pt = partsTextFor ? partsTextFor(w.hz) : '';
    return `${i + 1}. ${w.hz} (${w.py}) = ${w.vi}${hv}${pt ? ` [chiết tự: ${pt}]` : ''}`;
  }).join('\n');
  return `Bạn là chuyên gia tạo hình ảnh gợi nhớ (mnemonic) cho người Việt học tiếng Trung. Với MỖI từ trong danh sách, hãy soạn:
- "story_vi": 1–2 câu tiếng Việt kể một cảnh gợi nhớ NGHĨA của từ. Ưu tiên dựa vào cấu tạo chữ (bộ thủ) hoặc âm Hán Việt nếu giúp nhớ; nếu không có thì dùng cảnh gắn với nghĩa.
- "image_prompt": mô tả bằng TIẾNG ANH (tối đa 40 từ) một cảnh minh hoạ cụ thể, đơn giản, 1 chủ thể chính, dễ vẽ. TUYỆT ĐỐI không yêu cầu có chữ viết, ký tự hay biển hiệu trong ảnh; không nhắc người thật hay nhãn hiệu.
Danh sách từ:
${list}
Trả lời CHỈ bằng JSON hợp lệ, không thêm chữ nào khác:
{"words":[{"hz":"chữ Hán của từ","story_vi":"...","image_prompt":"..."}]}`;
}

function tolerantJson(text) {
  let t = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch (e) { /* thử cắt từ { đầu tới } cuối */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { /* bỏ */ } }
  return null;
}

// Hàm THUẦN: kiểm tra phản hồi AI. Mục nào sai/thiếu bị loại (từ đó sẽ được thử lại ở lượt sau).
function parseDrafts(text, batch) {
  const data = tolerantJson(text);
  if (!data || !Array.isArray(data.words)) return [];
  const out = [];
  for (const it of data.words) {
    if (!it || typeof it.hz !== 'string') continue;
    const w = batch.find((b) => b.hz === it.hz);
    if (!w || out.some((o) => o.hz === w.hz)) continue;
    const story = typeof it.story_vi === 'string' ? it.story_vi.replace(/\s+/g, ' ').trim() : '';
    let prompt = typeof it.image_prompt === 'string' ? it.image_prompt : '';
    prompt = prompt.replace(CJK_RE, '').replace(/\s+/g, ' ').trim(); // không để model vẽ chữ Hán
    if (!story || story.length > 400 || prompt.length < 10 || prompt.length > 400) continue;
    out.push({ hz: w.hz, story_vi: story, image_prompt: `${prompt}, ${STYLE_SUFFIX}` });
  }
  return out;
}

// ── Gọi FLUX.1 schnell qua REST API của Cloudflare Workers AI ──
function fluxConfig(env) {
  const e = env || process.env;
  const steps = Math.min(8, Math.max(1, parseInt(e.CF_AI_IMAGE_STEPS, 10) || 4));
  return {
    token: e.CF_AI_TOKEN || '',
    accountId: e.CF_ACCOUNT_ID || e.R2_ACCOUNT_ID || '',
    model: e.CF_AI_IMAGE_MODEL || FLUX_MODEL_DEFAULT,
    steps,
  };
}

function defaultFluxFetch(prompt, env) {
  const cfg = fluxConfig(env);
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ prompt, steps: cfg.steps });
    const req = https.request({
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${encodeURIComponent(cfg.accountId)}/ai/run/${cfg.model}`,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + cfg.token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (resp) => {
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => {
        const raw = Buffer.concat(chunks);
        const status = resp.statusCode;
        const ctype = String(resp.headers['content-type'] || '');
        if (status >= 200 && status < 300 && ctype.startsWith('image/')) return resolve(raw); // API trả thẳng ảnh
        let json = null;
        try { json = JSON.parse(raw.toString('utf8')); } catch (e) { /* không phải JSON */ }
        if (status >= 200 && status < 300 && json && json.result && typeof json.result.image === 'string') {
          return resolve(Buffer.from(json.result.image, 'base64'));
        }
        const msg = json && Array.isArray(json.errors) && json.errors[0] && json.errors[0].message
          ? String(json.errors[0].message) : `Cloudflare AI HTTP ${status}`;
        const err = new Error(msg);
        err.status = status;
        // 429 hoặc thông báo hết hạn mức neuron → coi là hết quota ngày (dừng lượt, không đánh dấu từ lỗi)
        if (status === 429 || /neuron|quota|rate limit|limit exceeded|capacity/i.test(msg)) err.quota = true;
        if (status === 401 || status === 403) err.fatal = true;
        reject(err);
      });
    });
    req.on('error', (e) => reject(new Error('Không kết nối được Cloudflare AI: ' + e.message)));
    req.setTimeout(IMAGE_TIMEOUT_MS, () => req.destroy(new Error('Cloudflare AI timeout')));
    req.write(payload);
    req.end();
  });
}

// ── Lưu trữ Neon (pool pg) ──
function createStore(pool) {
  let ensured = null;
  const ensure = () => {
    if (!ensured) ensured = pool.query(TABLE_SQL).catch((e) => { ensured = null; throw e; });
    return ensured;
  };
  const run = async (sql, params) => { await ensure(); return pool.query(sql, params); };
  return {
    async reclaimStale() {
      await run(`UPDATE word_images
                    SET status = CASE WHEN image_prompt IS NULL THEN 'failed' ELSE 'prompted' END, updated_at = now()
                  WHERE status IN ('drafting','generating') AND updated_at < now() - ($1 || ' seconds')::interval`, [String(STALE_SECONDS)]);
    },
    async states() {
      const r = await run('SELECT hz, status, attempts, (image_prompt IS NOT NULL) AS has_prompt FROM word_images');
      const m = new Map();
      for (const x of r.rows) m.set(x.hz, { status: x.status, attempts: x.attempts, hasPrompt: !!x.has_prompt });
      return m;
    },
    async claimForDrafting(hzList) {
      const r = await run(`INSERT INTO word_images (hz, status, updated_at)
                           SELECT h, 'drafting', now() FROM unnest($1::text[]) AS h
                           ON CONFLICT (hz) DO UPDATE SET status = 'drafting', updated_at = now()
                             WHERE word_images.status = 'failed' AND word_images.image_prompt IS NULL AND word_images.attempts < $2
                           RETURNING hz`, [hzList, MAX_ATTEMPTS]);
      return r.rows.map((x) => x.hz);
    },
    async savePrompts(items) {
      for (const it of items) {
        await run(`UPDATE word_images SET story_vi = $2, image_prompt = $3, status = 'prompted', error = NULL, updated_at = now() WHERE hz = $1`,
          [it.hz, it.story_vi, it.image_prompt]);
      }
    },
    async failDrafting(hzList, code) {
      if (!hzList.length) return;
      await run(`UPDATE word_images SET status = 'failed', attempts = attempts + 1, error = $2, updated_at = now()
                  WHERE hz = ANY($1::text[]) AND status = 'drafting'`, [hzList, code]);
    },
    async claimForImage(limit, only) {
      // V144: `only` (Set chữ Hán) giới hạn đúng các từ được yêu cầu → hàng đợi ưu tiên theo bài
      // (37 → 36 → 38) mới thật sự tuân thủ thứ tự; không truyền `only` thì giữ nguyên hành vi cũ.
      const r = await run(`UPDATE word_images SET status = 'generating', updated_at = now()
                            WHERE hz IN (SELECT hz FROM word_images
                                          WHERE image_prompt IS NOT NULL AND (status = 'prompted' OR (status = 'failed' AND attempts < $2))
                                            AND ($3::text[] IS NULL OR hz = ANY($3::text[]))
                                          ORDER BY updated_at LIMIT $1 FOR UPDATE SKIP LOCKED)
                            RETURNING hz, image_prompt, story_vi`, [limit, MAX_ATTEMPTS, only ? Array.from(only) : null]);
      return r.rows;
    },
    async markReady(hz, meta) {
      await run(`UPDATE word_images SET status = 'ready', storage_key = $2, content_type = $3, file_size = $4, error = NULL, updated_at = now() WHERE hz = $1`,
        [hz, meta.key, meta.contentType, meta.size]);
    },
    async markImageFailed(hz, code) {
      await run(`UPDATE word_images SET status = 'failed', attempts = attempts + 1, error = $2, updated_at = now() WHERE hz = $1`, [hz, code]);
    },
    async requeue(hz) {
      await run(`UPDATE word_images SET status = 'prompted', updated_at = now() WHERE hz = $1 AND status = 'generating'`, [hz]);
    },
    async get(hz) {
      const r = await run('SELECT hz, story_vi, storage_key, content_type, status FROM word_images WHERE hz = $1', [hz]);
      return r.rows[0] || null;
    },
    async remove(hzList) {
      const r = await run('DELETE FROM word_images WHERE hz = ANY($1::text[])', [hzList]);
      return r.rowCount || 0;
    },
    async counts() {
      const r = await run('SELECT status, COUNT(*)::int AS n FROM word_images GROUP BY status');
      const out = { drafting: 0, prompted: 0, generating: 0, ready: 0, failed: 0 };
      for (const x of r.rows) out[x.status] = x.n;
      return out;
    },
    // V144: bản ghi đầy đủ để KIỂM TRA ảnh (bảng thống kê + đối chiếu tệp trên R2).
    async auditRows() {
      const r = await run(`SELECT hz, status, storage_key, content_type, file_size, story_vi, image_prompt, error, attempts
                             FROM word_images`);
      return r.rows;
    },
    async rowsFor(hzList) {
      if (!hzList || !hzList.length) return [];
      const r = await run(`SELECT hz, status, storage_key, content_type, file_size, story_vi, error, attempts
                             FROM word_images WHERE hz = ANY($1::text[])`, [hzList]);
      return r.rows;
    },
  };
}

function createWordImages(opts) {
  const o = opts || {};
  const store = o.store;
  const r2 = o.r2;
  const env = o.env || (() => process.env);
  const now = o.now || (() => Date.now());
  const callText = o.callText;                 // (prompt) → Promise<string>  (Vilao)
  const getWords = o.getWords;                 // () → [{hz, py, vi, hanviet}]
  const getParts = o.getParts || (async () => ({}));  // () → { [chữ Hán đơn]: 'mô tả chiết tự ngắn' }
  const fluxFetch = o.fluxFetch || ((prompt) => defaultFluxFetch(prompt, env()));

  function isConfigured() {
    const c = fluxConfig(env());
    return !!(c.token && c.accountId) && r2.isConfigured();
  }
  function missingConfig() {
    const c = fluxConfig(env());
    const miss = [];
    if (!c.token) miss.push('CF_AI_TOKEN');
    if (!c.accountId) miss.push('CF_ACCOUNT_ID');
    return miss.concat(r2.missingEnv());
  }

  async function generateOne(row) {
    const buf = await fluxFetch(row.image_prompt);
    const kind = r2.detectImage(buf);
    if (!kind) { const e = new Error('Cloudflare AI không trả về ảnh hợp lệ'); e.code = 'bad_image'; throw e; }
    const meta = await r2.putImage(hashForWord(row.hz), buf);
    await store.markReady(row.hz, meta);
  }

  // Chạy 1 lượt trong ngân sách thời gian (Vercel Hobby cắt cứng 60s → mặc định 50s, giống các cron khác).
  async function runBatch(timeBudgetMs, runOpts) {
    const budget = timeBudgetMs || 50000;
    const startedAt = now();
    const result = { drafted: 0, generated: 0, failed: 0, quota: false, pendingDraft: 0, errorSamples: [] };
    const addErr = (m) => { if (result.errorSamples.length < 5 && !result.errorSamples.includes(m)) result.errorSamples.push(m); };
    if (!isConfigured()) { result.notConfigured = missingConfig(); return result; }
    const only = runOpts && Array.isArray(runOpts.only) ? new Set(runOpts.only.filter(isValidHz)) : null;

    await store.reclaimStale();
    const words = await getWords();
    const states = await store.states();
    const seen = new Set();
    const candidates = [];
    for (const w of words) {
      if (!w || !isValidHz(w.hz) || seen.has(w.hz)) continue;
      seen.add(w.hz);
      if (only && !only.has(w.hz)) continue;
      const st = states.get(w.hz);
      if (!st || (st.status === 'failed' && !st.hasPrompt && st.attempts < MAX_ATTEMPTS)) candidates.push(w);
    }
    result.pendingDraft = candidates.length;
    let partsMap = null;
    const partsTextFor = (hz) => {
      if (!partsMap) return '';
      return [...hz].map((ch) => (partsMap[ch] ? `${ch}=${String(partsMap[ch]).slice(0, 80)}` : '')).filter(Boolean).join('; ');
    };

    while (result.generated + result.failed < MAX_IMAGES_PER_RUN) {
      const remaining = budget - (now() - startedAt);
      // (1) Ưu tiên vẽ ảnh cho các hàng đã có prompt
      if (remaining >= MIN_MS_FOR_IMAGE) {
        const rows = await store.claimForImage(IMAGE_CONCURRENCY, only);
        if (rows.length) {
          const settled = await Promise.allSettled(rows.map((r) => generateOne(r)));
          let stop = false;
          for (let i = 0; i < settled.length; i++) {
            const s = settled[i];
            if (s.status === 'fulfilled') { result.generated++; continue; }
            const err = s.reason;
            if (err && err.quota) { result.quota = true; stop = true; await store.requeue(rows[i].hz); continue; }
            if (err && err.fatal) { stop = true; await store.requeue(rows[i].hz); addErr('Cloudflare từ chối token (401/403) — kiểm tra CF_AI_TOKEN'); continue; }
            result.failed++;
            addErr(safeCode(err));
            await store.markImageFailed(rows[i].hz, safeCode(err));
          }
          if (stop) break;
          continue;
        }
      }
      // (2) Hết việc vẽ → soạn prompt cho lô từ kế tiếp
      if (candidates.length && remaining >= MIN_MS_FOR_TEXT) {
        if (partsMap === null) { try { partsMap = await getParts(); } catch (e) { partsMap = {}; } }
        const batch = candidates.splice(0, PROMPT_BATCH);
        const claimed = await store.claimForDrafting(batch.map((w) => w.hz));
        const mine = batch.filter((w) => claimed.includes(w.hz));
        if (!mine.length) continue;
        try {
          const text = await callText(buildDraftPrompt(mine, partsTextFor));
          const drafts = parseDrafts(text, mine);
          if (drafts.length) await store.savePrompts(drafts);
          result.drafted += drafts.length;
          const missing = mine.filter((w) => !drafts.some((d) => d.hz === w.hz)).map((w) => w.hz);
          if (missing.length) { await store.failDrafting(missing, 'bad_draft'); addErr('AI trả prompt không hợp lệ cho một số từ'); }
        } catch (e) {
          await store.failDrafting(mine.map((w) => w.hz), safeCode(e));
          addErr(safeCode(e));
        }
        result.pendingDraft = candidates.length;
        continue;
      }
      break;
    }
    return result;
  }

  // Trả URL ký sẵn (20 phút) cho client. Không lộ storage_key / lỗi nội bộ.
  async function resolve(hz) {
    if (!isValidHz(hz)) return { ok: false, code: 'bad_request', error: 'Từ không hợp lệ' };
    const row = await store.get(hz);
    if (!row || row.status !== 'ready' || !row.storage_key) return { ok: true, status: row ? 'pending' : 'none' };
    const url = await r2.presignImageGet(row.storage_key, PRESIGN_SECONDS);
    return { ok: true, status: 'ready', url, story: row.story_vi || '' };
  }

  return { isConfigured, missingConfig, runBatch, resolve, store };
}

let _default = null;
// Dùng trong api/index.js: truyền callText/getWords/getParts một lần.
function getWordImages(deps) {
  if (!_default) {
    const db = require('./db');
    _default = createWordImages({ store: createStore(db.getPool()), r2: require('./r2'), ...(deps || {}) });
  }
  return _default;
}

module.exports = {
  TABLE_SQL, STYLE_SUFFIX, MAX_ATTEMPTS, PROMPT_BATCH, IMAGE_CONCURRENCY,
  sha256, hashForWord, isValidHz, safeCode, buildDraftPrompt, tolerantJson, parseDrafts, fluxConfig,
  defaultFluxFetch, createStore, createWordImages, getWordImages,
};
