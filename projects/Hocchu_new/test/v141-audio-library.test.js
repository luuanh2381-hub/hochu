#!/usr/bin/env node
// test/v141-audio-library.test.js — V141: thư viện âm thanh dùng chung (Neon + Cloudflare R2).
//
// A. Hàm thuần: chuỗi canonical, kiểm tra đầu vào, storage_key, presign, health check với client giả.
// B. Orchestrator lib/audio-library.js với store/R2/Edge-TTS giả: tạo lần đầu, dùng lại, tranh chấp,
//    Object R2 mất, Edge-TTS lỗi, upload lỗi, ghi Neon lỗi, timeout pending, chưa cấu hình.
// C. js/audio.js chạy THẬT trong vm: IndexedDB → resolve R2 → Edge-TTS → Web Speech, cache theo
//    content_hash, tải trùng bị gộp, tệp R2 hỏng/mất, mạng lỗi, IndexedDB hết dung lượng.
//
// KHÔNG cần mạng và KHÔNG cần credentials thật. Vì vậy KHÔNG chứng minh được kết nối R2 thật,
// sai credentials thật, bucket thật hay quyền thật — chỉ chạy được trên Vercel (xem báo cáo V141).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const AH = require('../js/audio-hash.js');
const audioLib = require('../lib/audio-library.js');
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
const tick = (ms) => new Promise(r => setTimeout(r, ms == null ? 1 : ms));
const MP3 = Buffer.from([0xFF, 0xFB, 0x90, 0x64]);
const REQ = { text: '你好。', voice: 'zh-CN-XiaoxiaoNeural', rate: '0.9' };

// ══════════════════════════════════════════════════════════════════════════════
// A. Hàm thuần + health check
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[A] Canonical hash / validate / storage_key / health');

test('canonical: ổn định, phân biệt nội dung, giọng, tốc độ, format, phiên bản TTS', () => {
  const a = AH.canonical('你好。', 'zh-CN-XiaoxiaoNeural', '0.9');
  assert.strictEqual(a, AH.canonical(' 你好。 ', 'zh-CN-XiaoxiaoNeural', 0.9));
  assert.notStrictEqual(a, AH.canonical('再见。', 'zh-CN-XiaoxiaoNeural', '0.9'));
  assert.notStrictEqual(a, AH.canonical('你好。', 'zh-CN-YunxiNeural', '0.9'));
  assert.notStrictEqual(a, AH.canonical('你好。', 'zh-CN-XiaoxiaoNeural', '0.8'));
  assert.notStrictEqual(a, AH.canonical('你好。', 'zh-CN-XiaoxiaoNeural', '0.9', 'mp3', 'v2'));
  assert.notStrictEqual(AH.canonical('你好。', 'zh-CN-XiaoxiaoNeural', '0.9', 'wav'), a);
});

test('chuỗi canonical không thể bị "dính trường" (dùng NUL)', () => {
  assert.notStrictEqual(
    AH.canonical('ab', 'cd', '0.9'),
    AH.canonical('abcd', '', '0.9'),
  );
});

test('normalizeSpeed: chỉ 0.8–1.2, làm tròn 0.1', () => {
  assert.strictEqual(AH.normalizeSpeed('0.9'), '0.9');
  assert.strictEqual(AH.normalizeSpeed(1), '1.0');
  assert.strictEqual(AH.normalizeSpeed('0.79'), '0.8');
  assert.strictEqual(AH.normalizeSpeed('9'), '1.2');
  assert.strictEqual(AH.normalizeSpeed('abc'), '0.9');
});

test('validateRequest: nhận đúng, từ chối rỗng/quá dài/không Hán/giọng lạ/tốc độ lạ', () => {
  const ok = audioLib.validateRequest(REQ);
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.speed, '0.9');
  assert.strictEqual(audioLib.validateRequest({}).ok, false);
  assert.strictEqual(audioLib.validateRequest({ text: 'hello', voice: REQ.voice }).ok, false);
  assert.strictEqual(audioLib.validateRequest({ text: '你'.repeat(501), voice: REQ.voice }).ok, false);
  assert.strictEqual(audioLib.validateRequest({ text: '你好', voice: 'evil' }).ok, false);
  assert.strictEqual(audioLib.validateRequest({ text: '你好', voice: REQ.voice, rate: '0.3' }).ok, false);
});

test('content_hash là SHA-256 của canonical (64 ký tự hex)', () => {
  const h = audioLib.sha256(AH.canonical(REQ.text, REQ.voice, REQ.rate));
  assert.ok(/^[a-f0-9]{64}$/.test(h));
  assert.strictEqual(h, audioLib.sha256(AH.canonical('你好。', 'zh-CN-XiaoxiaoNeural', '0.9')));
});

test('storage_key do server sinh từ hash; hash sai bị từ chối', () => {
  const r2 = r2Module.createR2({ env: () => ({}) });
  const h = 'a'.repeat(64);
  assert.strictEqual(r2.storageKey(h), 'tts/v1/aa/' + h + '.mp3');
  assert.throws(() => r2.storageKey('../../etc/passwd'));
  assert.throws(() => r2.storageKey('abc'));
});

test('presign chỉ nhận thời hạn 15–30 phút; chỉ ký tệp .mp3', () => {
  assert.strictEqual(r2Module.clampExpiry(60), 900);
  assert.strictEqual(r2Module.clampExpiry(99999), 1800);
  assert.strictEqual(r2Module.clampExpiry(1200), 1200);
  const r2 = r2Module.createR2({
    env: () => ({ R2_BUCKET_NAME: 'hsk-audio', R2_ENDPOINT: 'https://x', R2_ACCESS_KEY_ID: 'a', R2_SECRET_ACCESS_KEY: 'b', R2_ACCOUNT_ID: 'c' }),
    client: { send: async () => ({}) },
    sign: async (client, cmd) => 'https://r2.test/' + cmd.input.Key,
  });
  assert.ok(r2.presignGet('a'.repeat(64), 60) instanceof Promise);
});

test('putMp3: chỉ chấp nhận frame sync MP3 và key .mp3', async () => {
  const sent = [];
  const r2 = r2Module.createR2({
    env: () => ({ R2_BUCKET_NAME: 'hsk-audio', R2_ENDPOINT: 'https://x', R2_ACCESS_KEY_ID: 'a', R2_SECRET_ACCESS_KEY: 'b', R2_ACCOUNT_ID: 'c' }),
    client: { send: async (cmd) => { sent.push(cmd); return {}; } },
  });
  await assert.rejects(() => r2.putMp3('a'.repeat(64), Buffer.from('not mp3')));
  await assert.rejects(() => r2.putMp3('file.txt', MP3));
  await r2.putMp3('a'.repeat(64), MP3);
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].input.ContentType, 'audio/mpeg');
  assert.strictEqual(sent[0].input.Bucket, 'hsk-audio');
});

function fakeClient(script) {
  const sent = [];
  return {
    sent,
    async send(cmd) {
      sent.push(cmd);
      const fn = script[cmd.constructor.name];
      if (fn) return fn(cmd);
      return {};
    },
  };
}
const FULL_ENV = () => ({
  R2_ACCOUNT_ID: 'acc', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET_NAME: 'hsk-audio', R2_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
});
function r2With(script, env) {
  return r2Module.createR2({
    env: env || FULL_ENV,
    client: fakeClient(script || {}),
    sign: async (client, cmd, o) => 'https://r2.test/' + cmd.input.Key + '?e=' + o.expiresIn,
  });
}

test('health: thiếu biến môi trường → báo rõ, không cấu hình', async () => {
  const out = await r2With({}, () => ({ R2_BUCKET_NAME: 'hsk-audio' })).health();
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.configured, false);
  assert.strictEqual(out.checks.env, 'missing');
  assert.deepStrictEqual(out.errors[0].missing.sort(), ['R2_ACCESS_KEY_ID', 'R2_ACCOUNT_ID', 'R2_ENDPOINT', 'R2_SECRET_ACCESS_KEY']);
});

test('health: sai credentials → lỗi bucket, không lộ message/khóa', async () => {
  const out = await r2With({ HeadBucketCommand: () => { throw Object.assign(new Error('bad key AKIA-SECRET'), { name: 'InvalidAccessKeyId' }); } }).health();
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.checks.bucket, 'fail');
  assert.deepStrictEqual(out.errors, [{ check: 'bucket', code: 'InvalidAccessKeyId' }]);
  assert.ok(!JSON.stringify(out).includes('AKIA'), 'không được trả chi tiết credentials');
});

test('health: bucket không tồn tại → NoSuchBucket', async () => {
  const out = await r2With({ HeadBucketCommand: () => { throw Object.assign(new Error('x'), { name: 'NoSuchBucket' }); } }).health();
  assert.strictEqual(out.checks.bucket, 'fail');
  assert.strictEqual(out.errors[0].code, 'NoSuchBucket');
});

test('health: thiếu quyền đọc → read fail; thiếu quyền ghi → write fail', async () => {
  const readFail = await r2With({
    ListObjectsV2Command: () => { throw Object.assign(new Error('x'), { name: 'AccessDenied' }); },
  }).health();
  assert.strictEqual(readFail.checks.bucket, 'ok');
  assert.strictEqual(readFail.checks.read, 'fail');
  assert.strictEqual(readFail.ok, false);

  const writeFail = await r2With({
    PutObjectCommand: () => { throw Object.assign(new Error('x'), { name: 'AccessDenied' }); },
  }).health();
  assert.strictEqual(writeFail.checks.read, 'ok');
  assert.strictEqual(writeFail.checks.write, 'fail');
  assert.strictEqual(writeFail.ok, false);
});

test('health: đủ quyền → ok, ghi/xoá đúng object thăm dò, ký URL https', async () => {
  const client = fakeClient({});
  const r2 = r2Module.createR2({ env: FULL_ENV, client, sign: async (c, cmd) => 'https://r2.test/' + cmd.input.Key });
  const out = await r2.health();
  assert.strictEqual(out.ok, true);
  assert.deepStrictEqual(out.checks, { env: 'ok', bucket: 'ok', read: 'ok', write: 'ok', verify: 'ok', cleanup: 'ok', presign: 'ok' });
  const put = client.sent.find((c) => c.constructor.name === 'PutObjectCommand');
  const del = client.sent.find((c) => c.constructor.name === 'DeleteObjectCommand');
  assert.strictEqual(put.input.Key, 'health/probe.mp3');
  assert.strictEqual(put.input.ContentType, 'audio/mpeg');
  assert.strictEqual(put.input.ContentLength, 4);
  assert.strictEqual(del.input.Key, 'health/probe.mp3');
  assert.ok(!JSON.stringify(out).includes('secret'), 'không được trả credentials');
});

test('health: upload xong nhưng HEAD không thấy tệp → verify fail, không báo ok', async () => {
  const out = await r2With({
    HeadObjectCommand: () => { throw Object.assign(new Error('x'), { name: 'NotFound' }); },
  }).health();
  assert.strictEqual(out.checks.write, 'ok');
  assert.strictEqual(out.checks.verify, 'mismatch');
  assert.strictEqual(out.ok, false);
});

test('S3Client tắt checksum tự động để tương thích R2 (CRC32 FULL_OBJECT không hỗ trợ)', async () => {
  const r2 = r2Module.createR2({ env: FULL_ENV });
  const cfg = r2.getClient().config;
  assert.strictEqual(await cfg.requestChecksumCalculation(), 'WHEN_REQUIRED');
  assert.strictEqual(await cfg.responseChecksumValidation(), 'WHEN_REQUIRED');
});

// ══════════════════════════════════════════════════════════════════════════════
// B. Orchestrator
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[B] Orchestrator: tạo / dùng lại / tranh chấp / lỗi');

function makeStore(seed, opts) {
  const o = opts || {};
  const rows = new Map(Object.entries(seed || {}));
  const calls = { find: 0, claim: 0, reset: 0, ready: 0, failed: 0 };
  const copy = (r) => Object.assign({}, r);
  return {
    rows, calls,
    async find(hash) { calls.find++; return rows.has(hash) ? copy(rows.get(hash)) : null; },
    async claim(hash, f) {
      calls.claim++;
      const r = rows.get(hash);
      if (!r) {
        rows.set(hash, Object.assign({ content_hash: hash, status: 'pending', updated_at: Date.now() }, f));
        return copy(rows.get(hash));
      }
      if (r.status === 'failed' || (r.status === 'pending' && Date.now() - r.updated_at > 120000)) {
        Object.assign(r, { status: 'pending', updated_at: Date.now() });
        return copy(r);
      }
      return null;
    },
    async reset(hash) {
      calls.reset++;
      const r = rows.get(hash);
      if (r) { r.status = 'pending'; r.updated_at = Date.now(); }
      return r ? copy(r) : null;
    },
    async markReady(hash, f) {
      calls.ready++;
      if (o.failReady) throw new Error('db down');
      const r = rows.get(hash);
      Object.assign(r, { status: 'ready', storage_key: f.storageKey, file_size: f.fileSize });
    },
    async markFailed(hash, code) {
      calls.failed++;
      if (o.failMarkFailed) throw new Error('db down');
      const r = rows.get(hash);
      if (r) { r.status = 'failed'; r.error = code; }
    },
  };
}

function makeR2(opts) {
  const o = opts || {};
  const objects = new Set(o.existing || []);
  const calls = { put: 0, presign: 0, head: 0, headObject: 0 };
  return {
    objects, calls,
    isConfigured: () => !o.notConfigured,
    isMp3: (buf) => r2Module.isMp3(buf),
    storageKey: (h) => 'tts/v1/' + h.slice(0, 2) + '/' + h + '.mp3',
    async head(key) { calls.head++; return objects.has(key); },
    async headObject(key) {
      calls.headObject++;
      if (o.headThrow) throw Object.assign(new Error('head'), { name: o.headThrow });
      if (o.headMissing || !objects.has(key)) return null;
      return {
        contentLength: o.headLength != null ? o.headLength : MP3.length,
        contentType: o.headType != null ? o.headType : 'audio/mpeg',
      };
    },
    async putMp3(key, buf) { calls.put++; if (o.failPut) throw new Error('put'); objects.add(key); },
    async presignGet(key, s) { calls.presign++; return 'https://r2.test/' + key + '?e=' + s; },
  };
}

test('lần đầu: chưa có MP3 → Edge-TTS → upload R2 → ghi Neon ready → trả URL', async () => {
  const store = makeStore();
  const r2 = makeR2();
  let ttsCalls = 0;
  const lib = audioLib.createAudioLibrary({ store, r2, ttsFetch: async () => { ttsCalls++; return MP3; }, wait: tick });
  const out = await lib.resolve(REQ);
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.cached, false);
  assert.ok(/^https:\/\//.test(out.url));
  assert.strictEqual(ttsCalls, 1);
  assert.strictEqual(r2.calls.put, 1);
  assert.strictEqual(store.calls.ready, 1);
  assert.strictEqual(store.rows.get(out.contentHash).status, 'ready');
});

test('người học thứ 2 cùng câu: dùng lại Neon + R2, không gọi TTS, không upload lại', async () => {
  const store = makeStore();
  const r2 = makeR2();
  let ttsCalls = 0;
  const lib = audioLib.createAudioLibrary({ store, r2, ttsFetch: async () => { ttsCalls++; return MP3; }, wait: tick });
  const first = await lib.resolve(REQ);
  const second = await lib.resolve(REQ);
  assert.strictEqual(second.ok, true);
  assert.strictEqual(second.cached, true);
  assert.strictEqual(second.url, first.url);
  assert.strictEqual(ttsCalls, 1);
  assert.strictEqual(r2.calls.put, 1);
});

test('Neon ready nhưng tệp R2 mất → tạo lại 1 lần và cập nhật lại', async () => {
  const hash = audioLib.sha256(AH.canonical(REQ.text, REQ.voice, REQ.rate));
  const key = 'tts/v1/' + hash.slice(0, 2) + '/' + hash + '.mp3';
  const store = makeStore({ [hash]: { content_hash: hash, status: 'ready', storage_key: key, updated_at: Date.now() } });
  const r2 = makeR2(); // không có object
  let ttsCalls = 0;
  const lib = audioLib.createAudioLibrary({ store, r2, ttsFetch: async () => { ttsCalls++; return MP3; }, wait: tick });
  const out = await lib.resolve(REQ);
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.cached, false);
  assert.strictEqual(store.calls.reset, 1);
  assert.strictEqual(ttsCalls, 1);
  assert.strictEqual(r2.objects.has(key), true);
});

test('Edge-TTS lỗi/timeout → failed, không upload, trả lỗi có mã', async () => {
  const store = makeStore();
  const r2 = makeR2();
  const lib = audioLib.createAudioLibrary({
    store, r2,
    ttsFetch: async () => { throw Object.assign(new Error('timeout'), { name: 'AbortError' }); },
    wait: tick,
  });
  const out = await lib.resolve(REQ);
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.code, 'tts_failed');
  assert.strictEqual(r2.calls.put, 0);
  assert.strictEqual(store.calls.failed, 1);
  assert.strictEqual([...store.rows.values()][0].status, 'failed');
});

test('upload R2 lỗi → failed, không ghi ready, trả mã lỗi gốc', async () => {
  const store = makeStore();
  const r2 = makeR2({ failPut: true });
  const lib = audioLib.createAudioLibrary({ store, r2, ttsFetch: async () => MP3, wait: tick });
  const out = await lib.resolve(REQ);
  assert.strictEqual(out.code, 'upload_failed');
  assert.strictEqual(out.detail, 'unknown');
  assert.strictEqual(store.calls.ready, 0);
  assert.strictEqual(store.calls.failed, 1);
});

test('upload xong nhưng HEAD không thấy tệp → upload_verify_failed, không ready', async () => {
  const store = makeStore();
  const r2 = makeR2({ headMissing: true });
  const lib = audioLib.createAudioLibrary({ store, r2, ttsFetch: async () => MP3, wait: tick });
  const out = await lib.resolve(REQ);
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.code, 'upload_verify_failed');
  assert.strictEqual(out.detail, 'not_found');
  assert.strictEqual(store.calls.ready, 0);
  assert.strictEqual(store.calls.failed, 1);
});

test('HEAD thấy tệp sai kích thước / sai ContentType → không ready', async () => {
  const size = await audioLib.createAudioLibrary({
    store: makeStore(), r2: makeR2({ headLength: MP3.length + 10 }), ttsFetch: async () => MP3, wait: tick,
  }).resolve(REQ);
  assert.strictEqual(size.code, 'upload_verify_failed');
  assert.strictEqual(size.detail, 'size_mismatch');

  const store = makeStore();
  const type = await audioLib.createAudioLibrary({
    store, r2: makeR2({ headType: 'text/html' }), ttsFetch: async () => MP3, wait: tick,
  }).resolve(REQ);
  assert.strictEqual(type.code, 'upload_verify_failed');
  assert.strictEqual(type.detail, 'content_type_mismatch');
  assert.strictEqual(store.calls.ready, 0);
});

test('HEAD lỗi quyền/mạng → upload_verify_failed với mã lỗi, không ready', async () => {
  const store = makeStore();
  const out = await audioLib.createAudioLibrary({
    store, r2: makeR2({ headThrow: 'AccessDenied' }), ttsFetch: async () => MP3, wait: tick,
  }).resolve(REQ);
  assert.strictEqual(out.code, 'upload_verify_failed');
  assert.strictEqual(out.detail, 'AccessDenied');
  assert.strictEqual(store.calls.ready, 0);
});

test('log từng bước có request ID, hash, key, size; không lộ credentials', async () => {
  const lines = [];
  const orig = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  try {
    const lib = audioLib.createAudioLibrary({ store: makeStore(), r2: makeR2(), ttsFetch: async () => MP3, wait: tick });
    const out = await lib.resolve(REQ);
    assert.strictEqual(out.ok, true);
  } finally { console.log = orig; }
  const text = lines.join('\n');
  for (const tag of ['AUDIO_REQUEST_RECEIVED', 'NEON_CACHE_MISS', 'EDGE_TTS_STARTED', 'EDGE_TTS_COMPLETED', 'MP3_SIZE',
    'R2_UPLOAD_STARTED', 'R2_UPLOAD_SUCCESS', 'R2_HEAD_STARTED', 'R2_HEAD_SUCCESS', 'NEON_METADATA_SAVED', 'AUDIO_RESOLVE_DONE']) {
    assert.ok(text.includes(tag), 'thiếu log ' + tag);
  }
  assert.ok(/"requestId":"[a-f0-9]{12}"/.test(text), 'log phải có requestId');
  assert.ok(!/secret|AKIA|presigned/i.test(text), 'log không được chứa credentials/URL ký');
});

test('ghi Neon ready lỗi → trả metadata_failed, không báo thành công giả', async () => {
  const store = makeStore({}, { failReady: true });
  const r2 = makeR2();
  const lib = audioLib.createAudioLibrary({ store, r2, ttsFetch: async () => MP3, wait: tick });
  const out = await lib.resolve(REQ);
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.code, 'metadata_failed');
  assert.strictEqual(store.calls.ready, 1);
  assert.strictEqual(store.calls.failed, 1, 'phải đánh dấu failed để lần sau thử lại');
});

test('2 request đồng thời: chỉ 1 bên tạo, bên kia chờ rồi dùng lại', async () => {
  const store = makeStore();
  const r2 = makeR2();
  let ttsCalls = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const lib = audioLib.createAudioLibrary({
    store, r2,
    ttsFetch: async () => { ttsCalls++; await gate; return MP3; },
    wait: tick,
  });
  const p1 = lib.resolve(REQ);
  await tick(10);
  const p2 = lib.resolve(REQ);
  await tick(10);
  release();
  const [a, b] = await Promise.all([p1, p2]);
  assert.strictEqual(a.ok, true);
  assert.strictEqual(b.ok, true);
  assert.strictEqual(ttsCalls, 1, 'chỉ được gọi Edge-TTS 1 lần');
  assert.strictEqual(r2.calls.put, 1, 'chỉ được upload 1 lần');
  assert.strictEqual(a.url, b.url);
  assert.strictEqual(b.cached, true);
});

test('pending quá lâu → trả pending để client thử lại, không treo vô hạn', async () => {
  const hash = audioLib.sha256(AH.canonical(REQ.text, REQ.voice, REQ.rate));
  const store = makeStore({ [hash]: { content_hash: hash, status: 'pending', updated_at: Date.now() } });
  let clock = 0;
  const lib = audioLib.createAudioLibrary({
    store, r2: makeR2(),
    ttsFetch: async () => { throw new Error('không được gọi'); },
    wait: async () => { clock += 60000; },
    now: () => clock,
  });
  const out = await lib.resolve(REQ);
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.pending, true);
});

test('row failed trước đó được phép tạo lại', async () => {
  const hash = audioLib.sha256(AH.canonical(REQ.text, REQ.voice, REQ.rate));
  const store = makeStore({ [hash]: { content_hash: hash, status: 'failed', updated_at: Date.now(), error: 'old' } });
  const lib = audioLib.createAudioLibrary({ store, r2: makeR2(), ttsFetch: async () => MP3, wait: tick });
  const out = await lib.resolve(REQ);
  assert.strictEqual(out.ok, true);
  assert.strictEqual(store.calls.ready, 1);
});

test('chưa cấu hình R2 / đầu vào sai → trả mã lỗi, không gọi store', async () => {
  const store = makeStore();
  const notCfg = audioLib.createAudioLibrary({ store, r2: makeR2({ notConfigured: true }), ttsFetch: async () => MP3, wait: tick });
  const a = await notCfg.resolve(REQ);
  assert.strictEqual(a.code, 'r2_not_configured');
  assert.strictEqual(store.calls.find, 0);

  const bad = audioLib.createAudioLibrary({ store, r2: makeR2(), ttsFetch: async () => MP3, wait: tick });
  const b = await bad.resolve({ text: '', voice: REQ.voice });
  assert.strictEqual(b.code, 'invalid_input');
  assert.strictEqual(store.calls.find, 0);
});

// ══════════════════════════════════════════════════════════════════════════════
// C. js/audio.js trong vm
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n[C] Frontend: IndexedDB → R2 → Edge-TTS → Web Speech');

function makeEnv(opts) {
  const options = opts || {};
  const calls = { resolve: [], r2fetch: [], tts: [], plays: [], logs: [], events: [] };
  let seq = 0;
  const blobByUrl = new Map();

  class BlobStub {
    constructor() { this.size = 100; this.type = 'audio/mpeg'; this._id = ++seq; this.corrupt = false; }
  }

  class FakeAudio {
    constructor(src) { this.src = src; this.paused = false; this._timer = null; this.onplay = null; this.onended = null; this.onerror = null; }
    play() {
      calls.plays.push(this.src);
      calls.events.push('play:' + this.src);
      const blob = blobByUrl.get(this.src);
      if (blob && blob.corrupt) return Promise.reject(Object.assign(new Error('decode'), { name: 'NotSupportedError' }));
      const self = this;
      setTimeout(() => {
        if (self.onplay) self.onplay();
        self._timer = setTimeout(() => {
          calls.events.push('end:' + self.src);
          if (self.onended) self.onended();
        }, 1);
      }, 0);
      return Promise.resolve();
    }
    pause() { this.paused = true; if (this._timer) { clearTimeout(this._timer); this._timer = null; } }
    removeAttribute() {}
    load() {}
  }

  const synth = { speak(u) { calls.tts.push(u.text); }, cancel() {}, pause() {}, resume() {}, getVoices() { return []; } };

  async function fetchStub(url, init) {
    if (url === '/api/audio/resolve') {
      const body = JSON.parse(init.body);
      calls.resolve.push({ body, headers: init.headers });
      const n = calls.resolve.length - 1;
      if (options.resolveThrow) throw Object.assign(new Error('net'), { name: options.resolveThrow });
      const cfg = typeof options.resolve === 'function' ? options.resolve(n, body) : options.resolve;
      if (!cfg) return { ok: true, status: 200, json: async () => ({ ok: true, cached: false, url: 'https://r2.test/' + n }) };
      return { ok: !!cfg.ok, status: cfg.status || (cfg.ok === false ? 503 : 200), json: async () => cfg };
    }
    if (String(url).startsWith('https://r2.test/')) {
      calls.r2fetch.push(url);
      const idx = calls.r2fetch.length - 1;
      const fail = options.r2FailAll || (Array.isArray(options.r2Fail) && options.r2Fail.includes(idx));
      if (fail) return { ok: false, status: 404, blob: async () => null };
      const blob = new BlobStub();
      blob.corrupt = !!options.corruptFirstR2 && idx === 0;
      return { ok: true, status: 200, blob: async () => blob };
    }
    if (url === '/api/tts') {
      calls.tts.push(JSON.parse(init.body));
      if (options.ttsFail) return { ok: false, status: 500, json: async () => ({ error: 'tts' }) };
      return { ok: true, blob: async () => new BlobStub() };
    }
    throw new Error('URL không mong đợi: ' + url);
  }

  const idb = options.noIdb ? null : makeIdb(options.idbOpts);
  const win = { AudioContext: function AudioContext() {}, speechSynthesis: synth };
  if (idb) win.indexedDB = idb;

  const ctx = {
    console: { log: (...a) => calls.logs.push(a.join(' ')), warn: (...a) => calls.logs.push(a.join(' ')) },
    window: win,
    speechSynthesis: synth,
    SpeechSynthesisUtterance: class { constructor(t) { this.text = t; this.lang = ''; this.rate = 1; this.volume = 1; this.pitch = 1; } },
    Audio: FakeAudio,
    Blob: BlobStub,
    URL: { createObjectURL(blob) { const u = 'blob:' + blob._id; blobByUrl.set(u, blob); return u; }, revokeObjectURL() {} },
    AbortController: class { constructor() { this.signal = { aborted: false }; } abort() { this.signal.aborted = true; } },
    fetch: fetchStub,
    authHeaders: () => (options.noAuth ? {} : { Authorization: 'Bearer test' }),
    document: { getElementById: () => null },
    Math, Date, JSON, Set, Map, Array, Object, String, Number, Boolean, Promise, Error, RegExp,
    setTimeout, clearTimeout,
  };
  if (idb) ctx.indexedDB = idb;
  vm.createContext(ctx);
  vm.runInContext(read('js/tts-text.js'), ctx);
  vm.runInContext(read('js/audio-hash.js'), ctx);
  vm.runInContext(read('js/audio.js'), ctx);
  return { ctx, calls, idb, R: (code) => vm.runInContext(code, ctx) };
}

function makeIdb(opts) {
  const options = opts || {};
  const store = new Map();
  let putCount = 0;
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore() {},
    transaction() {
      const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
      // IndexedDB thật: callback của request (getAll) chạy TRƯỚC sự kiện complete của transaction.
      setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 5);
      tx.objectStore = () => ({
        get(k) { const req = {}; setTimeout(() => { req.result = store.get(k); if (req.onsuccess) req.onsuccess(); }, 0); return req; },
        put(v) {
          putCount++;
          if (options.quotaOnce && putCount === 1) {
            const err = Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
            tx.error = err;
            throw err;
          }
          store.set(v.key, v);
        },
        delete(k) { store.delete(k); },
        getAll() { const req = {}; setTimeout(() => { req.result = [...store.values()]; if (req.onsuccess) req.onsuccess(); }, 0); return req; },
      });
      return tx;
    },
  };
  return { open() { const req = { result: db }; setTimeout(() => { if (req.onupgradeneeded) req.onupgradeneeded(); if (req.onsuccess) req.onsuccess(); }, 0); return req; }, _store: store };
}

test('IndexedDB hit: lần 2 không gọi server, vẫn phát', async () => {
  const env = makeEnv();
  await env.R("speak('你好。')");
  const afterFirst = env.calls.resolve.length;
  await env.R("speak('你好。')");
  assert.strictEqual(env.calls.resolve.length, afterFirst, 'không được hỏi server lại');
  assert.strictEqual(env.calls.plays.length, 2);
  const rec = [...env.idb._store.values()][0];
  assert.strictEqual(rec.voice, 'zh-CN-XiaoxiaoNeural');
  assert.strictEqual(rec.rate, '0.9');
  assert.strictEqual(rec.ttsVersion, AH.TTS_VERSION);
  assert.strictEqual(rec.format, 'mp3');
  assert.ok(env.calls.logs.some(l => l.includes('AUDIO_CACHE_HIT')));
});

test('cache miss: gọi /api/audio/resolve kèm token, tải MP3 từ R2, không gọi Edge-TTS', async () => {
  const env = makeEnv();
  await env.R("speak('你好。')");
  assert.strictEqual(env.calls.resolve.length, 1);
  assert.deepStrictEqual(env.calls.resolve[0].body, { text: '你好。', voice: 'zh-CN-XiaoxiaoNeural', rate: '0.9' });
  assert.strictEqual(env.calls.resolve[0].headers.Authorization, 'Bearer test');
  assert.strictEqual(env.calls.r2fetch.length, 1);
  assert.strictEqual(env.calls.tts.length, 0);
  assert.ok(env.calls.logs.some(l => l.includes('AUDIO_LIBRARY_CREATED') || l.includes('AUDIO_LIBRARY_HIT')));
});

test('chưa đăng nhập: bỏ qua R2, dùng Edge-TTS trực tiếp như cũ', async () => {
  const env = makeEnv({ noAuth: true });
  await env.R("speak('你好。')");
  assert.strictEqual(env.calls.resolve.length, 0);
  assert.strictEqual(env.calls.tts.length, 1);
  assert.ok(env.calls.logs.some(l => l.includes('AUDIO_LIBRARY_SKIP') && l.includes('no_auth')));
  assert.ok(env.calls.logs.some(l => l.includes('EDGE_TTS_SUCCESS')));
});

test('server trả lỗi/chưa cấu hình: log AUDIO_LIBRARY_MISS rồi fallback Edge-TTS', async () => {
  const env = makeEnv({ resolve: { ok: false, code: 'r2_not_configured', status: 503 } });
  await env.R("speak('你好。')");
  assert.strictEqual(env.calls.tts.length, 1);
  assert.deepStrictEqual(env.calls.plays.length, 1);
  assert.ok(env.calls.logs.some(l => l.includes('AUDIO_LIBRARY_MISS') && l.includes('r2_not_configured')));
});

test('URL R2 tải lỗi lần đầu → hỏi lại 1 lần (server HEAD tạo lại), dùng URL thứ 2', async () => {
  let n = 0;
  const env = makeEnv({
    resolve: () => (++n === 1
      ? { ok: true, cached: true, url: 'https://r2.test/0' }
      : { ok: true, cached: false, url: 'https://r2.test/1' }),
    r2Fail: [0],
  });
  await env.R("speak('你好。')");
  assert.strictEqual(env.calls.resolve.length, 2);
  assert.strictEqual(env.calls.tts.length, 0);
  assert.strictEqual(env.calls.plays.length, 1);
});

test('URL R2 lỗi cả 2 lần → fallback Edge-TTS', async () => {
  const env = makeEnv({ r2FailAll: true });
  await env.R("speak('你好。')");
  assert.strictEqual(env.calls.resolve.length, 2);
  assert.strictEqual(env.calls.tts.length, 1);
  assert.strictEqual(env.calls.plays.length, 1);
});

test('mạng lỗi ở resolve + Edge-TTS lỗi → Web Speech fallback', async () => {
  const env = makeEnv({ resolveThrow: 'TypeError', ttsFail: true });
  await env.R("speak('你好。')");
  assert.deepStrictEqual(env.calls.tts.filter(t => t.text).map(t => t.text), ['你好。']);
  assert.ok(env.calls.logs.some(l => l.includes('EDGE_TTS_API_ERROR')));
  assert.ok(env.calls.logs.some(l => l.includes('WEB_SPEECH_FALLBACK')));
});

test('cache hỏng: xoá + hỏi R2 lại đúng 1 lần rồi phát bản mới', async () => {
  const env = makeEnv({ corruptFirstR2: true });
  await env.R("speak('你好。')");
  assert.strictEqual(env.calls.resolve.length, 2, 'phải hỏi lại sau khi tệp R2 hỏng');
  assert.strictEqual(env.calls.plays.length, 2, '1 lần lỗi + 1 lần phát lại');
  assert.strictEqual(env.idb._store.size, 1);
});

test('bấm nhanh cùng nội dung: chỉ 1 request resolve (gộp inflight)', async () => {
  const env = makeEnv();
  const [a, b] = await Promise.all([
    env.R("ttsBlobFor('你好。', 'zh-CN-XiaoxiaoNeural', '0.9')"),
    env.R("ttsBlobFor('你好。', 'zh-CN-XiaoxiaoNeural', '0.9')"),
  ]);
  assert.strictEqual(env.calls.resolve.length, 1);
  assert.ok(a && b);
});

test('IndexedDB hết dung lượng: nén bớt rồi vẫn phát, không làm hỏng luồng', async () => {
  const env = makeEnv({ idbOpts: { quotaOnce: true } });
  await env.R("speak('你好。')");
  assert.strictEqual(env.calls.plays.length, 1);
  assert.strictEqual(env.idb._store.size, 1);
});

test('câu dài: mỗi đoạn đi qua thư viện theo đúng thứ tự, không chồng lấn', async () => {
  const text = '今天天气很好。'.repeat(100) + '我们去公园散步吧！';
  const env = makeEnv();
  await env.R(`speak(${JSON.stringify(text)})`);
  assert.ok(env.calls.resolve.length > 1);
  assert.strictEqual(env.calls.resolve.map(r => r.body.text).join(''), text);
  assert.strictEqual(env.calls.r2fetch.length, env.calls.resolve.length);
  const plays = env.calls.events.filter(e => e.startsWith('play:'));
  const ends = env.calls.events.filter(e => e.startsWith('end:'));
  for (let i = 1; i < plays.length; i++) {
    assert.ok(env.calls.events.indexOf(plays[i]) > env.calls.events.indexOf(ends[i - 1]), 'đoạn ' + i + ' phát chồng lấn');
  }
});

test('dừng khi đang tải: không phát đoạn vừa tải xong', async () => {
  const env = makeEnv();
  const p = env.R("ttsSpeakSegments([{ text: '你好。', voice: 'zh-CN-XiaoxiaoNeural', rate: '0.9' }])");
  env.R('stopSpeaking()');
  await p;
  assert.strictEqual(env.calls.plays.length, 0);
});

runAll();