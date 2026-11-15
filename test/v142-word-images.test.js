#!/usr/bin/env node
// test/v142-word-images.test.js — V142: ảnh gợi nhớ từ vựng (Cloudflare FLUX.1 schnell → R2).
//
// A. Hàm thuần: parseDrafts (loại chữ Hán khỏi prompt, thêm style, loại mục sai), dựng prompt, key R2.
// B. Orchestrator lib/word-images.js với store/R2/FLUX/model văn bản GIẢ: sinh lần đầu, không sinh trùng,
//    hết quota, token sai, ảnh hỏng, soạn prompt lỗi (thử lại tối đa MAX_ATTEMPTS), ngân sách thời gian, resolve.
// C. R2: imageKey, putImage (kiểm tra magic bytes, kích thước), presignImageGet (chỉ key ảnh hợp lệ).
//
// KHÔNG cần mạng/credentials thật → KHÔNG chứng minh được: Cloudflare Workers AI thật trả đúng định dạng,
// token/quyền thật, hạn mức thật, SQL thật trên Neon (createStore chưa chạy với Postgres thật).
'use strict';
const assert = require('assert');
const WI = require('../lib/word-images.js');
const r2Module = require('../lib/r2.js');

let passed = 0, failed = 0; const pending = [];
const test = (n, f) => pending.push({ n, f });
async function runAll() {
  for (const { n, f } of pending) {
    try { await f(); passed++; console.log('  ✅ ' + n); }
    catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n     ') : e)); }
  }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
}

const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(40, 1)]);
const WORDS = [
  { hz: '好', py: 'hǎo', vi: 'tốt', hanviet: 'hảo' },
  { hz: '你好', py: 'nǐ hǎo', vi: 'xin chào', hanviet: '' },
  { hz: '水', py: 'shuǐ', vi: 'nước', hanviet: 'thủy' },
];
const draftJson = (items) => JSON.stringify({ words: items.map((w) => ({ hz: w.hz, story_vi: 'Cảnh gợi nhớ ' + w.hz, image_prompt: 'A happy mother hugging her child 好 in a garden' })) });

// Store giả có cùng ngữ nghĩa với createStore (SQL) để thử orchestrator.
function fakeStore() {
  const rows = new Map();
  return {
    rows,
    async reclaimStale() {},
    async states() { const m = new Map(); for (const [hz, r] of rows) m.set(hz, { status: r.status, attempts: r.attempts, hasPrompt: !!r.image_prompt }); return m; },
    async claimForDrafting(list) {
      const out = [];
      for (const hz of list) {
        const r = rows.get(hz);
        if (!r) { rows.set(hz, { hz, status: 'drafting', attempts: 0, image_prompt: null }); out.push(hz); }
        else if (r.status === 'failed' && !r.image_prompt && r.attempts < WI.MAX_ATTEMPTS) { r.status = 'drafting'; out.push(hz); }
      }
      return out;
    },
    async savePrompts(items) { for (const it of items) Object.assign(rows.get(it.hz), { story_vi: it.story_vi, image_prompt: it.image_prompt, status: 'prompted' }); },
    async failDrafting(list, code) { for (const hz of list) { const r = rows.get(hz); if (r && r.status === 'drafting') { r.status = 'failed'; r.attempts++; r.error = code; } } },
    async claimForImage(limit) {
      const out = [];
      for (const r of rows.values()) {
        if (out.length >= limit) break;
        if (r.image_prompt && (r.status === 'prompted' || (r.status === 'failed' && r.attempts < WI.MAX_ATTEMPTS))) { r.status = 'generating'; out.push({ hz: r.hz, image_prompt: r.image_prompt, story_vi: r.story_vi }); }
      }
      return out;
    },
    async markReady(hz, meta) { Object.assign(rows.get(hz), { status: 'ready', storage_key: meta.key, content_type: meta.contentType }); },
    async markImageFailed(hz, code) { const r = rows.get(hz); r.status = 'failed'; r.attempts++; r.error = code; },
    async requeue(hz) { const r = rows.get(hz); if (r.status === 'generating') r.status = 'prompted'; },
    async get(hz) { return rows.get(hz) || null; },
    async remove(list) { let n = 0; for (const hz of list) if (rows.delete(hz)) n++; return n; },
    async counts() { const o = { drafting: 0, prompted: 0, generating: 0, ready: 0, failed: 0 }; for (const r of rows.values()) o[r.status]++; return o; },
  };
}
function fakeR2(over) {
  const puts = [];
  return Object.assign({
    puts,
    isConfigured: () => true, missingEnv: () => [],
    detectImage: r2Module.detectImage,
    async putImage(hash, buf) { puts.push({ hash, size: buf.length }); return { key: `img/v1/${hash.slice(0, 2)}/${hash}.jpg`, contentType: 'image/jpeg', size: buf.length }; },
    async presignImageGet(key) { return 'https://r2.example/' + key + '?sig=1'; },
  }, over || {});
}
const ENV_OK = () => ({ CF_AI_TOKEN: 't', CF_ACCOUNT_ID: 'acc' });
function build(over) {
  const o = over || {};
  const store = o.store || fakeStore();
  const r2 = o.r2 || fakeR2();
  const calls = { text: 0, flux: 0 };
  const svc = WI.createWordImages({
    store, r2, env: o.env || ENV_OK, now: o.now,
    callText: o.callText || (async (prompt) => { calls.text++; return draftJson(WORDS.filter((w) => prompt.includes(w.hz + ' ('))); }),
    getWords: async () => o.words || WORDS,
    getParts: async () => ({ 好: '女(người phụ nữ) + 子(con)' }),
    fluxFetch: o.fluxFetch || (async () => { calls.flux++; return JPEG; }),
  });
  return { svc, store, r2, calls };
}

// ── A ──
test('A1 hashForWord: ổn định, 64 hex, khác nhau theo từ; isValidHz chặn chuỗi lạ', () => {
  assert.ok(/^[a-f0-9]{64}$/.test(WI.hashForWord('好')));
  assert.strictEqual(WI.hashForWord('好'), WI.hashForWord('好'));
  assert.notStrictEqual(WI.hashForWord('好'), WI.hashForWord('水'));
  assert.ok(WI.isValidHz('你好'));
  for (const bad of ['', 'abc', '../x', '好a', '一二三四五六七八九', null, 5]) assert.ok(!WI.isValidHz(bad), String(bad));
});
test('A2 parseDrafts: bỏ chữ Hán khỏi prompt, thêm style "no text", chịu được ```json và <think>', () => {
  const raw = '<think>hmm</think>```json\n' + draftJson([WORDS[0]]) + '\n```';
  const out = WI.parseDrafts(raw, WORDS);
  assert.strictEqual(out.length, 1);
  assert.ok(!/[\u4e00-\u9fff]/.test(out[0].image_prompt), 'prompt không được còn chữ Hán');
  assert.ok(out[0].image_prompt.includes('no text'));
  assert.ok(out[0].story_vi.startsWith('Cảnh gợi nhớ'));
});
test('A3 parseDrafts: loại mục sai (hz lạ, thiếu story, prompt quá ngắn, trùng), JSON hỏng → []', () => {
  const raw = JSON.stringify({ words: [
    { hz: '龙', story_vi: 'x', image_prompt: 'a dragon in the clouds' },       // không thuộc lô
    { hz: '好', story_vi: '', image_prompt: 'a happy family at home' },          // thiếu story
    { hz: '水', story_vi: 'ok', image_prompt: 'short' },                         // prompt quá ngắn
    { hz: '你好', story_vi: 'ok', image_prompt: 'two people waving hello at each other' },
    { hz: '你好', story_vi: 'dup', image_prompt: 'two people waving hello again please' },
  ] });
  const out = WI.parseDrafts(raw, WORDS);
  assert.deepStrictEqual(out.map((x) => x.hz), ['你好']);
  assert.deepStrictEqual(WI.parseDrafts('không phải json', WORDS), []);
});
test('A4 buildDraftPrompt: có nghĩa, Hán Việt, chiết tự; yêu cầu không có chữ trong ảnh', () => {
  const p = WI.buildDraftPrompt([WORDS[0]], () => '女 + 子');
  assert.ok(p.includes('好 (hǎo) = tốt') && p.includes('Hán Việt: hảo') && p.includes('chiết tự: 女 + 子'));
  assert.ok(/không yêu cầu có chữ viết/i.test(p));
});

// ── B ──
test('B1 sinh lần đầu: soạn prompt → vẽ → lên R2 → ready; resolve trả URL ký sẵn + câu chuyện', async () => {
  const { svc, store, r2 } = build();
  const res = await svc.runBatch(50000);
  assert.strictEqual(res.drafted, 3);
  assert.strictEqual(res.generated, 3);
  assert.deepStrictEqual(await store.counts(), { drafting: 0, prompted: 0, generating: 0, ready: 3, failed: 0 });
  assert.strictEqual(r2.puts.length, 3);
  const out = await svc.resolve('好');
  assert.strictEqual(out.status, 'ready');
  assert.ok(out.url.startsWith('https://r2.example/img/v1/'));
  assert.ok(out.story.includes('好'));
  assert.ok(!('storage_key' in out));
});
test('B2 chạy lại: không gọi AI/FLUX lần nữa cho từ đã ready (không trùng)', async () => {
  const { svc, calls } = build();
  await svc.runBatch(50000);
  const t = calls.text, f = calls.flux;
  const again = await svc.runBatch(50000);
  assert.strictEqual(again.drafted + again.generated, 0);
  assert.strictEqual(calls.text, t); assert.strictEqual(calls.flux, f);
});
test('B3 hết quota Cloudflare (429): dừng lượt, trả việc về hàng đợi, KHÔNG đánh dấu failed', async () => {
  const { svc, store } = build({ fluxFetch: async () => { const e = new Error('limit'); e.status = 429; e.quota = true; throw e; } });
  const res = await svc.runBatch(50000);
  assert.strictEqual(res.quota, true);
  assert.strictEqual(res.failed, 0);
  const c = await store.counts();
  assert.strictEqual(c.failed, 0); assert.strictEqual(c.ready, 0); assert.ok(c.prompted > 0);
});
test('B4 token sai (401/403): dừng, báo lỗi gợi ý CF_AI_TOKEN, việc vẫn nằm trong hàng đợi', async () => {
  const { svc, store } = build({ fluxFetch: async () => { const e = new Error('nope'); e.status = 401; e.fatal = true; throw e; } });
  const res = await svc.runBatch(50000);
  assert.ok(res.errorSamples.some((m) => m.includes('CF_AI_TOKEN')));
  assert.strictEqual((await store.counts()).failed, 0);
});
test('B5 Cloudflare trả dữ liệu không phải ảnh: đánh dấu failed, không tải lên R2', async () => {
  const { svc, store, r2 } = build({ fluxFetch: async () => Buffer.from('{"oops":true} not an image at all') });
  const res = await svc.runBatch(50000);
  assert.strictEqual(res.generated, 0);
  assert.ok(res.failed > 0);
  assert.strictEqual(r2.puts.length, 0);
  assert.strictEqual((await store.counts()).ready, 0);
});
test('B6 model văn bản lỗi: từ chuyển failed, thử lại ở lượt sau, dừng sau MAX_ATTEMPTS', async () => {
  const { svc, store } = build({ callText: async () => { throw new Error('boom'); }, words: [WORDS[0]] });
  for (let i = 0; i < WI.MAX_ATTEMPTS + 2; i++) await svc.runBatch(50000);
  const row = await store.get('好');
  assert.strictEqual(row.status, 'failed');
  assert.strictEqual(row.attempts, WI.MAX_ATTEMPTS);
});
test('B7 ngân sách thời gian: còn ít thì không bắt đầu bước mới', async () => {
  let t = 0;
  const { svc, calls } = build({ now: () => t, fluxFetch: async () => { t += 40000; return JPEG; } });
  const res = await svc.runBatch(50000); // soạn prompt (t=0) → vẽ 3 ảnh hết 40s → còn 10s < 22s → dừng
  assert.strictEqual(res.drafted, 3);
  assert.ok(calls.text === 1);
  const t2 = 49000; // ngân sách còn 1s → không làm gì
  let tt = t2;
  const b = build({ now: () => tt });
  const r2res = await b.svc.runBatch(1000);
  assert.strictEqual(r2res.drafted + r2res.generated, 0);
});
test('B8 tham số only: chỉ xử lý đúng các từ chỉ định', async () => {
  const { svc, store } = build();
  await svc.runBatch(50000, { only: ['水'] });
  assert.deepStrictEqual([...store.rows.keys()], ['水']);
});
test('B9 chưa cấu hình (thiếu CF_AI_TOKEN): trả notConfigured, không gọi gì', async () => {
  const { svc, calls } = build({ env: () => ({ CF_ACCOUNT_ID: 'a' }) });
  const res = await svc.runBatch(50000);
  assert.ok(res.notConfigured.includes('CF_AI_TOKEN'));
  assert.strictEqual(calls.text + calls.flux, 0);
});
test('B10 resolve: từ chưa có → none; chưa xong → pending; đầu vào lạ → bad_request', async () => {
  const { svc, store } = build();
  assert.strictEqual((await svc.resolve('好')).status, 'none');
  store.rows.set('好', { hz: '好', status: 'prompted', attempts: 0, image_prompt: 'x' });
  assert.strictEqual((await svc.resolve('好')).status, 'pending');
  assert.strictEqual((await svc.resolve('../etc')).ok, false);
});
test('B11 hai lượt chạy liên tiếp cùng store: mỗi từ chỉ được vẽ đúng 1 lần', async () => {
  const store = fakeStore();
  const a = build({ store }), b = build({ store });
  await Promise.all([a.svc.runBatch(50000), b.svc.runBatch(50000)]);
  assert.strictEqual(a.calls.flux + b.calls.flux, 3);
});

// ── C ──
test('C1 R2: imageKey từ hash, putImage chỉ nhận JPEG/PNG/WebP, tối đa 2MB, presign chỉ key ảnh hợp lệ', async () => {
  const sent = [];
  const client = { send: async (cmd) => { sent.push(cmd); return {}; } };
  const env = { R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', R2_BUCKET_NAME: 'b', R2_ENDPOINT: 'https://x' };
  const r = r2Module.createR2({ env: () => env, client, sign: async (c, cmd) => 'https://signed/' + cmd.input.Key });
  const h = WI.hashForWord('好');
  assert.strictEqual(r.imageKey(h, 'jpg'), `img/v1/${h.slice(0, 2)}/${h}.jpg`);
  assert.throws(() => r.imageKey('abc', 'jpg'));
  assert.throws(() => r.imageKey(h, 'gif'));
  const out = await r.putImage(h, JPEG);
  assert.strictEqual(out.contentType, 'image/jpeg');
  assert.strictEqual(sent.length, 1);
  await assert.rejects(() => r.putImage(h, Buffer.from('GIF89a not allowed here....')));
  await assert.rejects(() => r.putImage(h, Buffer.concat([JPEG, Buffer.alloc(2 * 1024 * 1024)])));
  assert.ok((await r.presignImageGet(out.key)).startsWith('https://signed/img/v1/'));
  await assert.rejects(() => r.presignImageGet('tts/v1/aa/' + h + '.mp3'));
  await assert.rejects(() => r.presignImageGet('img/v1/../secret.jpg'));
});
test('C2 R2 chỉ còn dành cho ảnh (V148): không còn hàm MP3/âm thanh; headObject chỉ nhận key ảnh', async () => {
  const env = { R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', R2_BUCKET_NAME: 'b', R2_ENDPOINT: 'https://x' };
  const r = r2Module.createR2({ env: () => env, client: { send: async () => ({}) }, sign: async (c, cmd) => 'u/' + cmd.input.Key });
  for (const gone of ['putMp3', 'presignGet', 'storageKey', 'health', 'head', 'isMp3']) {
    assert.strictEqual(r[gone], undefined, gone + ' phải đã bị gỡ');
  }
  await assert.rejects(() => r.headObject('tts/v1/aa/' + 'a'.repeat(64) + '.mp3'), /Key ảnh không hợp lệ/);
  const h = await r.headObject('img/v1/aa/' + 'a'.repeat(64) + '.jpg'); // client giả trả {} → có tệp
  assert.ok(h && typeof h === 'object');
});

// ── D. Giao diện (đọc mã nguồn, không cần trình duyệt) ──
const fs = require('fs'), path = require('path');
const readSrc = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
test('D1 client: <img> ảnh R2 có crossorigin="anonymous" (site bật COEP require-corp)', () => {
  assert.ok(/crossorigin="anonymous"/.test(readSrc('js/word-image.js')));
  assert.ok(/Cross-Origin-Embedder-Policy/.test(readSrc('vercel.json')));
});
test('D2 admin: có thẻ ảnh gợi nhớ nối đúng 3 route, escape dữ liệu server, nạp trạng thái khi mở', () => {
  const a = readSrc('js/admin.js');
  for (const r of ['/api/admin/word-images/status', '/api/admin/word-images/generate', '/api/admin/word-images/reset']) assert.ok(a.includes(r), r);
  assert.ok(/loadWordImageStatus\(\);\s*\n\}/.test(a), 'bindVocabAdmin phải gọi loadWordImageStatus');
  assert.ok(a.includes('gen-wi-btn') && a.includes('wi-progress-area'));
  assert.ok(/errorSamples[\s\S]{0,200}escapeHtml\(m\)/.test(a), 'errorSamples phải được escapeHtml');
});
test('D3 CSS V142 nằm TRƯỚC khối V117 (test cô lập selector V117 lấy từ V117 tới cuối file)', () => {
  const css = readSrc('css/styles.css');
  assert.ok(css.indexOf('V142 — ảnh gợi nhớ') < css.indexOf('V117 — STUDY WORKSPACE'));
});
test('D4 client: đăng nhập được nhận biết qua authHeaders() (authToken là `let`, không có trên window)', () => {
  const w = readSrc('js/word-image.js');
  assert.ok(!/g\.authToken/.test(w), 'không dùng g.authToken');
  assert.ok(/headers\(\)\.Authorization/.test(w));
  assert.ok(/^let authToken/m.test(readSrc('js/auth.js')));
});

runAll();
