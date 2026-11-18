#!/usr/bin/env node
// test/v171-ai-config.test.js — V171: cấu hình TẤT CẢ AI ở màn Quản trị (không phải sửa code). Không cần Postgres/mạng ngoài (dùng server HTTP cục bộ giả).
const assert = require('assert'); const fs = require('fs'); const path = require('path'); const vm = require('vm'); const http = require('http');
const C = require('../lib/ai-config.js');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const api = read('api/index.js');
const pending = []; const test = (n, f) => pending.push({ n, f });
let passed = 0, failed = 0;

test('ưu tiên: DB > biến môi trường > mặc định, kèm nguồn từng trường', () => {
  const env = { AI_API_KEY: 'envkey-12345', AI_MODELS: 'm-env1, m-env2', AI_MIN_INTERVAL_MS: '5000', GEMINI_API_KEY: 'gem-env-123', GEMINI_MODEL: 'g-env' };
  const e = C.resolve({}, env);
  assert.deepStrictEqual(e.text.models, ['m-env1', 'm-env2']); assert.strictEqual(e.text.minIntervalMs, 5000);
  assert.strictEqual(e.text.sources.models, 'env'); assert.strictEqual(e.text.sources.baseUrl, 'default'); assert.strictEqual(e.text.sources.apiKey, 'env');
  assert.strictEqual(e.speech.model, 'g-env');
  const d = C.resolve({ text: { models: ['m-db'], apiKey: 'dbkey-12345', minIntervalMs: 0, baseUrl: 'https://api.groq.com/openai/v1' }, speech: { model: 'g-db' } }, env);
  assert.deepStrictEqual(d.text.models, ['m-db']); assert.strictEqual(d.text.apiKey, 'dbkey-12345'); assert.strictEqual(d.text.minIntervalMs, 0, 'cho phép 0 ms');
  assert.strictEqual(d.text.provider, 'groq'); assert.strictEqual(d.text.sources.models, 'admin'); assert.strictEqual(d.speech.model, 'g-db');
  assert.strictEqual(d.speech.apiKey, 'gem-env-123', 'trường không lưu ở DB vẫn lấy từ env');
});
test('không có gì → y như hành vi cũ (OpenRouter, openrouter/free, 3500ms, Gemini 13000ms)', () => {
  const r = C.resolve(null, undefined);
  assert.strictEqual(r.text.baseUrl, 'https://openrouter.ai/api/v1'); assert.deepStrictEqual(r.text.models, ['openrouter/free']);
  assert.strictEqual(r.text.minIntervalMs, 3500); assert.strictEqual(r.text.reasoning, 'low'); assert.strictEqual(r.text.provider, 'openrouter');
  assert.strictEqual(r.speech.minIntervalMs, 13000); assert.strictEqual(r.speech.model, 'gemini-3.5-flash');
  assert.ok(!('image' in r), 'nhóm image (ảnh gợi nhớ) đã gỡ ở V173');
});
test('applyPatch: kiểm tra đầu vào (https, tên model, giãn cách, bước, khoá) và KHÔNG sửa đối tượng gốc', () => {
  const orig = { text: { models: ['a'] } }; const snap = JSON.stringify(orig);
  const bad = C.applyPatch(orig, { text: { baseUrl: 'http://evil.example.com/v1', models: 'ok-model, bad model!', minIntervalMs: -1, reasoning: 'max', apiKey: 'short' }, speech: { minIntervalMs: 'abc' } });
  const fields = bad.errors.map((x) => x.field).sort();
  assert.deepStrictEqual(fields, ['speech.minIntervalMs', 'text.apiKey', 'text.baseUrl', 'text.minIntervalMs', 'text.models', 'text.reasoning']);
  assert.strictEqual(JSON.stringify(orig), snap);
  assert.ok(C.applyPatch({}, { text: { baseUrl: 'http://localhost:11434/v1' } }).errors.length === 0, 'http chỉ cho localhost');
  assert.ok(C.applyPatch({}, { text: { baseUrl: 'https://user:pw@x.com/v1' } }).errors.length === 1, 'không nhận URL có tài khoản');
  assert.ok(C.applyPatch({}, { text: { models: Array.from({ length: 11 }, (_, i) => 'm' + i) } }).errors.length === 1, 'tối đa 10 model');
});
test('applyPatch: trường rỗng xoá ghi đè; khoá rỗng = GIỮ; clearKey xoá; reset xoá cả nhóm; model tách theo dòng/dấu phẩy và bỏ trùng', () => {
  let r = C.applyPatch({}, { text: { baseUrl: 'https://api.openai.com/v1/', models: 'gpt-4o-mini\nx/y:free, gpt-4o-mini', apiKey: 'sk-secret-123456', minIntervalMs: '1000', reasoning: 'off' } });
  assert.deepStrictEqual(r.errors, []); assert.strictEqual(r.stored.text.baseUrl, 'https://api.openai.com/v1'); assert.deepStrictEqual(r.stored.text.models, ['gpt-4o-mini', 'x/y:free']);
  assert.strictEqual(r.stored.text.minIntervalMs, 1000); assert.strictEqual(r.stored.text.reasoning, 'off');
  r = C.applyPatch(r.stored, { text: { apiKey: '', baseUrl: '', models: '' } });
  assert.strictEqual(r.stored.text.apiKey, 'sk-secret-123456', 'khoá để trống = giữ nguyên'); assert.ok(!('baseUrl' in r.stored.text) && !('models' in r.stored.text));
  r = C.applyPatch(r.stored, { text: { clearKey: true } }); assert.ok(!r.stored.text || !('apiKey' in r.stored.text));
  r = C.applyPatch({ text: { apiKey: 'k-12345678', models: ['a'] }, speech: { model: 'm' } }, { text: { reset: true } });
  assert.ok(!r.stored.text && r.stored.speech.model === 'm', 'reset chỉ xoá nhóm được chọn, nhóm khác giữ nguyên');
});
test('publicView KHÔNG chứa khoá ở bất kỳ đâu (chỉ đã đặt + 4 ký tự cuối)', () => {
  const stored = { text: { apiKey: 'SECRET-TEXT-KEY-abcd' }, speech: { apiKey: 'SECRET-SPEECH-KEY-wxyz' } };
  const j = JSON.stringify(C.publicView(stored, { AI_API_KEY: 'SECRET-ENV-KEY-1111' }));
  for (const sec of ['SECRET-TEXT-KEY', 'SECRET-SPEECH-KEY', 'SECRET-ENV-KEY']) assert.ok(!j.includes(sec), 'lộ ' + sec);
  const v = C.publicView(stored, {});
  assert.deepStrictEqual(v.text.apiKey, { set: true, source: 'admin', tail: '••••abcd' });
  assert.deepStrictEqual(C.publicView({}, {}).text.apiKey, { set: false, source: 'none', tail: '' });
  assert.strictEqual(C.publicView({}, { AI_API_KEY: 'envkey-12345' }).text.apiKey.source, 'env');
});
test('V173: nhóm cấu hình image (ảnh gợi nhớ) đã gỡ — publicView/applyPatch không còn, bản vá image bị bỏ qua', () => {
  assert.ok(!('image' in C.publicView({}, {})) && typeof C.imageEnv === 'undefined' && typeof C.DEFAULT_IMAGE_MODEL === 'undefined');
  const r = C.applyPatch({}, { image: { steps: 3, token: 'abcdefgh12345' } });
  assert.deepStrictEqual(r.errors, []); assert.deepStrictEqual(r.stored, {}, 'không lưu gì cho nhóm đã gỡ');
});

// ── doCallAi thật (trích từ api/index.js) chạy với server HTTP cục bộ giả ──
function loadDoCallAi() {
  const a = api.indexOf('function stripThink('); const b = api.indexOf('// Giống callGemini() nhưng gửi kèm file âm thanh');
  assert.ok(a > 0 && b > a);
  const ctx = { require, https: require('https'), Buffer, URL, JSON, Math, Number, Error, Object, String, setTimeout, console, aiRuntimeSync: () => C.resolve({}, {}), process };
  vm.createContext(ctx); vm.runInContext(api.slice(a, b) + '\nthis.doCallAi = doCallAi;', ctx); return ctx.doCallAi;
}
function fake(handler) {
  return new Promise((resolve) => { const reqs = []; const srv = http.createServer((req, res) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { reqs.push({ url: req.url, headers: req.headers, body: JSON.parse(d || '{}') }); handler(reqs.length, res); }); }); srv.listen(0, '127.0.0.1', () => resolve({ srv, reqs, base: 'http://127.0.0.1:' + srv.address().port + '/v1' })); });
}
const ok = (res, content, reason) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: reason || 'stop' }] })); };
test('doCallAi dùng URL/khoá/model từ cấu hình: nhà cung cấp khác → KHÔNG gửi `reasoning` và header OpenRouter', async () => {
  const f = await fake((n, res) => ok(res, '{"ok":true}'));
  try {
    const cfg = C.resolve({ text: { baseUrl: f.base, apiKey: 'groq-key-12345', models: ['llama-x'] } }, {}).text; assert.strictEqual(cfg.provider, 'custom');
    const out = await loadDoCallAi()('llama-x', 'hi', true, { _cfg: cfg });
    assert.strictEqual(out, '{"ok":true}'); const r = f.reqs[0];
    assert.strictEqual(r.url, '/v1/chat/completions'); assert.strictEqual(r.headers.authorization, 'Bearer groq-key-12345');
    assert.strictEqual(r.body.model, 'llama-x'); assert.ok(!('reasoning' in r.body), 'không gửi tham số reasoning cho nhà cung cấp khác');
    assert.ok(!r.headers['http-referer'] && !r.headers['x-title'], 'không gửi header OpenRouter');
  } finally { f.srv.close(); }
});
test('doCallAi với provider openrouter: gửi reasoning theo mức đã chọn + header; mức "off" thì không gửi', async () => {
  const f = await fake((n, res) => ok(res, '{"ok":true}'));
  try {
    const base = C.resolve({ text: { baseUrl: f.base, apiKey: 'or-key-12345', models: ['m'], reasoning: 'medium' } }, {}).text;
    const fn = loadDoCallAi();
    await fn('m', 'hi', true, { _cfg: Object.assign({}, base, { provider: 'openrouter' }) });
    assert.deepStrictEqual(f.reqs[0].body.reasoning, { effort: 'medium' }); assert.ok(f.reqs[0].headers['http-referer'] && f.reqs[0].headers['x-title']);
    await fn('m', 'hi', true, { _cfg: Object.assign({}, base, { provider: 'openrouter', reasoning: 'off' }) });
    assert.ok(!('reasoning' in f.reqs[1].body));
  } finally { f.srv.close(); }
});
test('doCallAi vẫn thử lại gấp đôi token khi finish_reason=length (V161) và giữ cấu hình khi thử lại', async () => {
  const f = await fake((n, res) => (n === 1 ? ok(res, '', 'length') : ok(res, '{"ok":1}')));
  try {
    const cfg = C.resolve({ text: { baseUrl: f.base, apiKey: 'k-12345678', models: ['m'] } }, {}).text;
    const out = await loadDoCallAi()('m', 'hi', true, { _cfg: cfg, maxTokens: 1000 });
    assert.strictEqual(out, '{"ok":1}'); assert.strictEqual(f.reqs[1].body.max_tokens, 2000); assert.strictEqual(f.reqs[1].headers.authorization, 'Bearer k-12345678');
  } finally { f.srv.close(); }
});
test('doCallAi: URL sai → lỗi nghiêm trọng (fatal) có thông báo tiếng Việt, không treo', async () => {
  const cfg = { baseUrl: 'khong-phai-url', apiKey: 'k-12345678', models: ['m'], provider: 'custom', reasoning: 'low', minIntervalMs: 0 };
  await assert.rejects(() => loadDoCallAi()('m', 'hi', true, { _cfg: cfg }), (e) => e.fatal === true && /không hợp lệ/.test(e.message));
});

// ── Nối dây server / giao diện ──
test('server: route chỉ superadmin, không trả khoá, nhật ký không ghi giá trị khoá, callGemini đọc cấu hình DB, chấm phát âm dùng cấu hình', () => {
  for (const r of ["app.get('/api/admin/ai-config'", "app.post('/api/admin/ai-config'", "app.post('/api/admin/ai-config/test'"]) assert.ok(api.includes(r), r);
  assert.ok(/async function aiConfigSuper[\s\S]{0,300}requireSuperAdmin/.test(api), 'phải yêu cầu superadmin');
  const a = api.indexOf("app.get('/api/admin/ai-config'"); const seg = api.slice(a, api.indexOf('// ── [SUPERADMIN] Tạo tài khoản cho người khác'));
  assert.ok(/publicView\(/.test(seg) && !/res\.json\([^)]*apiKey/.test(seg), 'chỉ trả publicView');
  assert.ok(/redactSecrets/.test(seg), 'lỗi từ nhà cung cấp phải che khoá');
  assert.ok(/async function callGemini\(prompt, opts\)\s*\{\s*const cfg = \(await getAiRuntime\(\)\)\.text/.test(api));
  assert.ok(/callGeminiWithAudio[\s\S]{0,200}getAiRuntime\(\)\)\.speech/.test(api));
  assert.ok(!/process\.env\.GEMINI_API_KEY/.test(api.replace(/\/\/.*$/gm, '')), 'khóa Gemini không còn đọc thẳng từ env trong api');
  assert.ok(/ai_config/.test(read('lib/db.js')) && /getAiConfigRow, saveAiConfigRow/.test(read('lib/db.js')));
});
test('redactSecrets che mọi khoá đang dùng khỏi thông báo lỗi', () => {
  const a = api.indexOf('function redactSecrets('); const b = api.indexOf('async function aiConfigSuper');
  const ctx = { String }; vm.createContext(ctx); vm.runInContext(api.slice(a, b) + '\nthis.f = redactSecrets;', ctx);
  const rt = C.resolve({ text: { apiKey: 'sk-super-secret-1' }, speech: { apiKey: 'gem-super-secret' } }, {});
  const m = ctx.f('401 bad key sk-super-secret-1 and gem-super-secret', rt);
  assert.ok(!/super-secret/.test(m) && /••••/.test(m));
});
test('giao diện admin-ai.js: dựng đủ 2 khối (văn bản + phát âm; khối ảnh đã gỡ V173), hiển thị nguồn + chỉ 4 ký tự cuối, không có khoá; chỉ superadmin thấy; nạp trước admin.js', () => {
  const idx = read('index.html'); assert.ok(idx.indexOf('/js/admin-ai.js') > 0 && idx.indexOf('/js/admin-ai.js') < idx.indexOf('/js/admin.js'));
  const ad = read('js/admin.js'); assert.ok(/currentRole==='superadmin' \? aiCfgPanelHtml\(\)/.test(ad) && /aicLoad\(\)/.test(ad));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ctx = { escapeHtml: esc, document: { getElementById: () => null }, authHeaders: () => ({}), currentRole: 'superadmin', fetch: async () => ({}), confirm: () => true, console };
  vm.createContext(ctx); vm.runInContext(read('js/admin-ai.js'), ctx);
  const view = C.publicView({ text: { apiKey: 'SECRET-TEXT-KEY-abcd', models: ['m-a', 'm-b'] } }, {});
  ctx.__v = view; vm.runInContext('aiCfg = __v;', ctx);
  const html = vm.runInContext('aicTextHtml() + aicSpeechHtml()', ctx);
  assert.ok(!html.includes('SECRET-TEXT-KEY'), 'không được lộ khoá'); assert.ok(html.includes('••••abcd') && html.includes('Đã lưu ở Quản trị'));
  assert.ok(/m-a/.test(html) && /m-b/.test(html) && /▶ Thử/.test(html)); assert.ok(!/Cloudflare/.test(html) && /Gemini/.test(html) && /OpenRouter/.test(html) && /Groq/.test(html));
  assert.ok(/id="aic-models"/.test(html) && /id="aic-baseurl"/.test(html) && /type="password"/.test(html));
});
(async () => {
  for (const { n, f } of pending) { try { await f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); } }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
