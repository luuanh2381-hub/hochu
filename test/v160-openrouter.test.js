#!/usr/bin/env node
// test/v160-openrouter.test.js — V160: AI văn bản chạy qua OpenRouter (model free), không còn Vilao/DeepSeek trong mã chạy.
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const api = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
let passed = 0, failed = 0;
function test(n, f) { try { f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + e.message); } }
const cfgLib = require('../lib/ai-config.js');
test('mặc định: OpenRouter + openrouter/free (V171: mặc định nằm trong lib/ai-config.js); không còn Vilao/DeepSeek', () => {
  const r = cfgLib.resolve({}, {});
  assert.strictEqual(r.text.baseUrl, 'https://openrouter.ai/api/v1');
  assert.deepStrictEqual(r.text.models, ['openrouter/free']);
  assert.ok(!/vilao|deepseek/i.test(api) && !/vilao|deepseek/i.test(fs.readFileSync(path.join(__dirname, '../lib/ai-config.js'), 'utf8')));
});
test('key: AI_API_KEY hoặc OPENROUTER_API_KEY (biến môi trường vẫn là dự phòng); api/index.js không đọc thẳng biến này nữa', () => {
  assert.strictEqual(cfgLib.resolve({}, { AI_API_KEY: 'k-env-12345' }).text.apiKey, 'k-env-12345');
  assert.strictEqual(cfgLib.resolve({}, { OPENROUTER_API_KEY: 'k-or-12345' }).text.apiKey, 'k-or-12345');
  assert.strictEqual((api.match(/process\.env\.AI_API_KEY/g) || []).length, 0);
});
test('giãn cách mặc định 3.5s cho model free; header OpenRouter chỉ khi là OpenRouter; JSON mode tự lùi khi 400/404', () => {
  assert.strictEqual(cfgLib.resolve({}, {}).text.minIntervalMs, 3500);
  assert.ok(/'HTTP-Referer'/.test(api) && /'X-Title'/.test(api));
  assert.ok(/status === 400 \|\| status === 404\) && useJsonMode/.test(api));
});
test('giữ nguyên tên callGemini và chữ ký (prompt, opts) cho các nơi gọi', () => {
  assert.ok(/function callGemini\(prompt, opts\)/.test(api));
});
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
