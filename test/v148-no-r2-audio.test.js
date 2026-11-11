#!/usr/bin/env node
// test/v148-no-r2-audio.test.js — V148: âm thanh KHÔNG còn dùng Cloudflare R2; Edge-TTS được gọi trực tiếp.
// Kiểm tra bằng đọc mã nguồn (không cần mạng/DB/R2/AWS SDK):
//   A. Đã xoá thư viện âm thanh (lib/audio-library.js) + 2 route (/api/audio/resolve, /api/r2/health).
//   B. Đường âm thanh phía client: IndexedDB → POST /api/tts → Web Speech; không còn dấu vết R2.
//   C. Python /api/tts: không còn token nội bộ; vercel.json vẫn rewrite /api/tts → /api/edge-tts.
//   D. lib/r2.js chỉ còn phần ẢNH GỢI NHỚ (ảnh gợi nhớ chưa bị đụng tới).
//   E. Khoá cache IndexedDB (AH.canonical) giữ nguyên → người học không mất cache âm thanh cũ.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name); }
  catch (e) { failed++; console.log('  ❌ ' + name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); }
}

console.log('\n[A] Server: thư viện âm thanh R2 đã gỡ');
test('lib/audio-library.js và test V141 đã bị xoá', () => {
  assert.ok(!exists('lib/audio-library.js'));
  assert.ok(!exists('test/v141-audio-library.test.js'));
});
test('api/index.js: không còn require/route của thư viện âm thanh hay /api/r2/health', () => {
  const s = read('api/index.js');
  for (const bad of ['audio-library', 'audioLibrary', '/api/audio/resolve', '/api/r2/health']) {
    assert.ok(!s.includes(bad), 'api/index.js còn chứa: ' + bad);
  }
});
test('api/index.js: phần ảnh gợi nhớ vẫn nguyên (headObject + presignImageGet)', () => {
  const s = read('api/index.js');
  assert.ok(/await r2\.headObject\(row\.storage_key\)/.test(s));
  assert.ok(/await r2\.presignImageGet\(row\.storage_key/.test(s));
});

console.log('\n[B] Client: Edge-TTS trực tiếp');
test('js/audio.js: ttsBlobFor gọi edgeTtsFetch → POST /api/tts, không bước trung gian', () => {
  const s = read('js/audio.js');
  assert.ok(/const blob = await edgeTtsFetch\(text, voice, rate\)/.test(s));
  assert.ok(/fetch\('\/api\/tts', \{\s*method: 'POST'/.test(s));
});
test('các tệp đường âm thanh không nhắc R2 / presign / thư viện âm thanh', () => {
  const files = ['js/audio.js', 'js/audio-hash.js', 'js/study-workspace.js', 'js/listen.js', 'js/listening.js', 'js/tts-text.js',
    'lib/tts-hints.js', 'api/edge-tts.py', 'vercel.json', 'requirements.txt', 'js/settings.js'];
  for (const f of files) {
    if (!exists(f)) continue;
    const s = read(f);
    assert.ok(!/\bR2\b|\br2\./.test(s), f + ' còn nhắc R2');
    assert.ok(!/presign|audio\/resolve|thư viện âm thanh/i.test(s), f + ' còn nhắc presign / thư viện âm thanh');
  }
});

console.log('\n[C] Python /api/tts + vercel.json');
test('api/edge-tts.py: không còn AUDIO_INTERNAL_TOKEN / x-audio-internal / hmac', () => {
  const s = read('api/edge-tts.py');
  for (const bad of ['AUDIO_INTERNAL_TOKEN', 'x-audio-internal', 'hmac', '_is_internal']) assert.ok(!s.includes(bad), 'còn chứa ' + bad);
});
test('vercel.json: /api/tts → /api/edge-tts đứng TRƯỚC rewrite /api/(.*)', () => {
  const v = JSON.parse(read('vercel.json'));
  const i = v.rewrites.findIndex((r) => r.source === '/api/tts' && r.destination === '/api/edge-tts');
  const j = v.rewrites.findIndex((r) => r.source === '/api/(.*)');
  assert.ok(i >= 0 && j > i);
  assert.ok(v.functions['api/edge-tts.py'] && v.functions['api/edge-tts.py'].maxDuration >= 60);
});

console.log('\n[D] lib/r2.js: chỉ còn ảnh gợi nhớ');
test('lib/r2.js không còn hàm MP3/âm thanh/health', () => {
  const s = read('lib/r2.js');
  for (const bad of ['putMp3', 'presignGet', 'storageKey', 'HEALTH_KEY', 'isMp3', 'ListObjectsV2Command', 'HeadBucketCommand', 'audio/mpeg', 'tts/v1']) {
    assert.ok(!s.includes(bad), 'lib/r2.js còn chứa: ' + bad);
  }
  for (const keep of ['putImage', 'presignImageGet', 'headObject', 'imageKey', 'detectImage']) assert.ok(s.includes(keep), 'thiếu ' + keep);
});
test('package.json: bỏ script test:v141, có test:v148', () => {
  const p = JSON.parse(read('package.json'));
  assert.ok(!p.scripts['test:v141']);
  assert.ok(p.scripts['test:v148']);
});

console.log('\n[E] Khoá cache IndexedDB không đổi');
test('AH.canonical giữ đúng định dạng cũ (NUL-nối, TTS_VERSION edge-tts-7.3.1-v1)', () => {
  const AH = require('../js/audio-hash.js');
  assert.strictEqual(AH.canonical('你好', 'zh-CN-XiaoxiaoNeural', '0.9'), ['你好', 'zh-CN-XiaoxiaoNeural', '0.9', 'mp3', 'edge-tts-7.3.1-v1'].join('\u0000'));
  assert.strictEqual(AH.TTS_VERSION, 'edge-tts-7.3.1-v1');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
