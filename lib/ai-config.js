// lib/ai-config.js — V171: cấu hình TẤT CẢ AI ở màn Quản trị (THUẦN — không DB, không mạng; dùng được ở test).
//
// Hai nhóm AI của app:
//   text   — AI văn bản (sinh ví dụ, giải thích, dịch, hội thoại…) qua API kiểu OpenAI /chat/completions
//            (OpenRouter, Gemini-OpenAI, OpenAI, Groq, hoặc URL tự nhập).
//   speech — Gemini chấm phát âm bằng giọng nói (API gốc của Google).
//
// Thứ tự ưu tiên khi lấy giá trị: (1) cấu hình LƯU TRONG DB do superadmin sửa ở màn Quản trị
//   → (2) biến môi trường cũ (AI_API_KEY, AI_MODELS, GEMINI_API_KEY…) → (3) mặc định.
// Vì vậy hệ thống đang chạy bằng biến môi trường vẫn chạy y như cũ cho tới khi có người lưu cấu hình ở màn Quản trị.
// KHÔNG bao giờ trả khoá bí mật ra client: publicView chỉ cho biết "đã đặt / nguồn / 4 ký tự cuối".
'use strict';

const PRESETS = {
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', models: ['openrouter/free'], hint: 'Có model miễn phí (hậu tố :free hoặc openrouter/free).' },
  gemini: { label: 'Google Gemini (tương thích OpenAI)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-2.5-flash'], hint: 'Key lấy tại aistudio.google.com/apikey.' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o-mini'], hint: 'Trả phí theo lượt dùng.' },
  groq: { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile'], hint: 'Có gói miễn phí giới hạn lượt/phút.' },
  custom: { label: 'Tự nhập URL', baseUrl: '', models: [], hint: 'Bất kỳ API tương thích OpenAI /chat/completions.' },
};
const REASONING = ['off', 'low', 'medium', 'high'];
const DEFAULT_MODEL_TEXT = 'openrouter/free';
const DEFAULT_SPEECH_MODEL = 'gemini-3.5-flash';
const MAX_MODELS = 10;

const str = (v) => (v == null ? '' : String(v)).trim();
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);

function inferProvider(baseUrl) {
  const u = str(baseUrl).toLowerCase();
  if (!u) return 'openrouter';
  for (const [id, p] of Object.entries(PRESETS)) if (p.baseUrl && u.startsWith(p.baseUrl.toLowerCase())) return id;
  return 'custom';
}
function splitModels(v) {
  const arr = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[\n,;]+/);
  const out = [];
  for (const m of arr.map(str)) if (m && !out.includes(m)) out.push(m);
  return out;
}
function isLocalHost(h) { return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'; }
function cleanBaseUrl(v) {
  const s = str(v).replace(/\/+$/, '');
  if (!s) return { value: '' };
  let u; try { u = new URL(s); } catch { return { error: 'URL không hợp lệ' }; }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLocalHost(u.hostname))) return { error: 'URL phải bắt đầu bằng https://' };
  if (u.username || u.password) return { error: 'URL không được chứa tài khoản/mật khẩu' };
  if (u.search || u.hash) return { error: 'URL không được có ? hoặc #' };
  return { value: s };
}
const MODEL_RE = /^[A-Za-z0-9._:\/@+\-]{1,120}$/;
const SECRET_RE = /^[\x21-\x7e]{8,600}$/; // ký tự in được, không khoảng trắng

// ── Giá trị HIỆU LỰC = DB > env > mặc định; kèm nguồn từng trường để màn Quản trị hiển thị ──
function resolve(stored, env) {
  const s = stored || {}; const e = env || {};
  const st = s.text || {}, ss = s.speech || {};
  const pick = (dbv, envv, def) => {
    if (dbv !== undefined && dbv !== null && dbv !== '' && !(Array.isArray(dbv) && !dbv.length)) return { value: dbv, source: 'admin' };
    if (envv !== undefined && envv !== null && envv !== '' && !(Array.isArray(envv) && !envv.length)) return { value: envv, source: 'env' };
    return { value: def, source: 'default' };
  };
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : undefined; };
  const nn = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) || Number(v) < 0 ? undefined : Number(v)); // cho phép 0

  const baseUrl = pick(st.baseUrl && str(st.baseUrl).replace(/\/+$/, ''), e.AI_BASE_URL && str(e.AI_BASE_URL).replace(/\/+$/, ''), PRESETS.openrouter.baseUrl);
  const models = pick(Array.isArray(st.models) ? st.models : undefined, e.AI_MODELS ? splitModels(e.AI_MODELS) : undefined, [DEFAULT_MODEL_TEXT]);
  const interval = pick(nn(st.minIntervalMs), num(e.AI_MIN_INTERVAL_MS), 3500);
  const reasoning = pick(REASONING.includes(st.reasoning) ? st.reasoning : undefined, undefined, 'low');
  const tKey = pick(st.apiKey, e.AI_API_KEY || e.OPENROUTER_API_KEY, '');
  const text = {
    baseUrl: baseUrl.value, models: models.value, minIntervalMs: interval.value, reasoning: reasoning.value, apiKey: tKey.value,
    provider: inferProvider(baseUrl.value),
    sources: { baseUrl: baseUrl.source, models: models.source, minIntervalMs: interval.source, reasoning: reasoning.source, apiKey: tKey.source },
  };

  const sKey = pick(ss.apiKey, e.GEMINI_API_KEY, '');
  const sModel = pick(ss.model, e.GEMINI_MODEL, DEFAULT_SPEECH_MODEL);
  const sInt = pick(nn(ss.minIntervalMs), num(e.GEMINI_MIN_INTERVAL_MS), 13000);
  const speech = { apiKey: sKey.value, model: sModel.value, minIntervalMs: sInt.value, sources: { apiKey: sKey.source, model: sModel.source, minIntervalMs: sInt.source } };

  return { text, speech };
}

const maskTail = (k) => (k ? '••••' + String(k).slice(-4) : '');

// Bản gửi ra client: KHÔNG có khoá. secrets → { set, source, tail }.
function publicView(stored, env) {
  const r = resolve(stored, env);
  const sec = (v, src) => ({ set: !!v, source: v ? src : 'none', tail: v ? maskTail(v) : '' });
  return {
    presets: Object.fromEntries(Object.entries(PRESETS).map(([id, p]) => [id, { label: p.label, baseUrl: p.baseUrl, models: p.models, hint: p.hint }])),
    reasoningOptions: REASONING,
    text: { provider: r.text.provider, baseUrl: r.text.baseUrl, models: r.text.models, minIntervalMs: r.text.minIntervalMs, reasoning: r.text.reasoning, apiKey: sec(r.text.apiKey, r.text.sources.apiKey), sources: r.text.sources },
    speech: { model: r.speech.model, minIntervalMs: r.speech.minIntervalMs, apiKey: sec(r.speech.apiKey, r.speech.sources.apiKey), sources: r.speech.sources },
    hasStored: { text: !!(stored && stored.text && Object.keys(stored.text).length), speech: !!(stored && stored.speech && Object.keys(stored.speech).length) },
  };
}

// ── Kiểm tra + áp bản vá do admin gửi lên. Trả { stored, errors }. KHÔNG sửa đối tượng vào. ──
// Quy ước: trường thường rỗng ('') → XOÁ ghi đè (quay về biến môi trường/mặc định).
//          khoá bí mật rỗng/không gửi → GIỮ NGUYÊN; muốn xoá: clearKey/clearToken = true.
//          reset: true cho cả nhóm → xoá toàn bộ ghi đè của nhóm.
function applyPatch(stored, patch) {
  const out = { text: Object.assign({}, (stored || {}).text), speech: Object.assign({}, (stored || {}).speech) };
  const errors = []; const p = patch && typeof patch === 'object' ? patch : {};
  const err = (f, m) => errors.push({ field: f, message: m });
  const setOrDel = (obj, k, v) => { if (v === '' || v === undefined || v === null) delete obj[k]; else obj[k] = v; };

  const t = p.text; if (t && typeof t === 'object') {
    if (t.reset) out.text = {};
    else {
      if (hasOwn(t, 'baseUrl')) { const c = cleanBaseUrl(t.baseUrl); if (c.error) err('text.baseUrl', c.error); else setOrDel(out.text, 'baseUrl', c.value); }
      if (hasOwn(t, 'models')) {
        const ms = splitModels(t.models);
        if (ms.length > MAX_MODELS) err('text.models', `Tối đa ${MAX_MODELS} model`);
        else if (ms.some((m) => !MODEL_RE.test(m))) err('text.models', 'Tên model chỉ gồm chữ, số và . _ : / @ + - (không có khoảng trắng)');
        else if (ms.length) out.text.models = ms; else delete out.text.models;
      }
      if (hasOwn(t, 'minIntervalMs')) {
        if (t.minIntervalMs === '' || t.minIntervalMs == null) delete out.text.minIntervalMs;
        else { const n = Number(t.minIntervalMs); if (!Number.isInteger(n) || n < 0 || n > 120000) err('text.minIntervalMs', 'Giãn cách phải là số nguyên 0–120000 ms'); else out.text.minIntervalMs = n; }
      }
      if (hasOwn(t, 'reasoning')) { if (t.reasoning === '' || t.reasoning == null) delete out.text.reasoning; else if (!REASONING.includes(t.reasoning)) err('text.reasoning', 'Mức suy luận không hợp lệ'); else out.text.reasoning = t.reasoning; }
      if (t.clearKey) delete out.text.apiKey;
      else if (str(t.apiKey)) { if (!SECRET_RE.test(str(t.apiKey))) err('text.apiKey', 'API key không hợp lệ (8–600 ký tự, không khoảng trắng)'); else out.text.apiKey = str(t.apiKey); }
    }
  }
  const s = p.speech; if (s && typeof s === 'object') {
    if (s.reset) out.speech = {};
    else {
      if (hasOwn(s, 'model')) { const m = str(s.model); if (m && !MODEL_RE.test(m)) err('speech.model', 'Tên model không hợp lệ'); else setOrDel(out.speech, 'model', m); }
      if (hasOwn(s, 'minIntervalMs')) {
        if (s.minIntervalMs === '' || s.minIntervalMs == null) delete out.speech.minIntervalMs;
        else { const n = Number(s.minIntervalMs); if (!Number.isInteger(n) || n < 0 || n > 120000) err('speech.minIntervalMs', 'Giãn cách phải là số nguyên 0–120000 ms'); else out.speech.minIntervalMs = n; }
      }
      if (s.clearKey) delete out.speech.apiKey;
      else if (str(s.apiKey)) { if (!SECRET_RE.test(str(s.apiKey))) err('speech.apiKey', 'API key không hợp lệ'); else out.speech.apiKey = str(s.apiKey); }
    }
  }
  for (const k of ['text', 'speech']) if (!Object.keys(out[k]).length) delete out[k];
  return { stored: out, errors };
}

module.exports = { PRESETS, REASONING, MAX_MODELS, DEFAULT_MODEL_TEXT, DEFAULT_SPEECH_MODEL, inferProvider, splitModels, cleanBaseUrl, resolve, publicView, applyPatch, maskTail };
