#!/usr/bin/env node
// test/v160-openrouter.test.js — V160: AI văn bản chạy qua OpenRouter (model free), không còn Vilao/DeepSeek trong mã chạy.
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const api = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
let passed = 0, failed = 0;
function test(n, f) { try { f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + e.message); } }
test('mặc định: OpenRouter + openrouter/free; không còn Vilao/DeepSeek trong api/index.js', () => {
  assert.ok(/AI_BASE_URL \|\| 'https:\/\/openrouter\.ai\/api\/v1'/.test(api));
  assert.ok(/AI_MODELS \|\| 'openrouter\/free'/.test(api));
  assert.ok(!/vilao|deepseek/i.test(api));
});
test('key: AI_API_KEY hoặc OPENROUTER_API_KEY; không còn chỗ nào đọc thẳng process.env.AI_API_KEY để gọi', () => {
  assert.ok(/process\.env\.AI_API_KEY \|\| process\.env\.OPENROUTER_API_KEY/.test(api));
  assert.strictEqual((api.match(/process\.env\.AI_API_KEY/g) || []).length, 1, 'chỉ trong hàm aiApiKey');
});
test('giãn cách ≥3.5s cho model free; header OpenRouter; JSON mode tự lùi khi 400/404', () => {
  assert.ok(/AI_MIN_INTERVAL_MS\) \|\| 3500/.test(api));
  assert.ok(/'HTTP-Referer'/.test(api) && /'X-Title'/.test(api));
  assert.ok(/status === 400 \|\| status === 404\) && useJsonMode/.test(api));
});
test('giữ nguyên tên callGemini và chữ ký (opts) cho các nơi gọi', () => {
  assert.ok(/function callGemini\(prompt, opts\)/.test(api));
});
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
