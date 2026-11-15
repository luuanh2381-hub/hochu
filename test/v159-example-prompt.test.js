#!/usr/bin/env node
// test/v159-example-prompt.test.js — V159: prompt sinh câu ví dụ (≥10 chữ Hán, mẫu ngữ pháp HSK 3.0 cấp 3–4, kèm pinyin) + bộ lọc câu hợp lệ.
const assert = require('assert'); const fs = require('fs'); const path = require('path'); const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
let passed = 0, failed = 0;
function test(n, f) { try { f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); } }
const a = SRC.indexOf('const EXAMPLE_MIN_HAN'); const b = SRC.indexOf('// Logic sinh CHIẾT TỰ BỘ THỦ');
const TARGET_EXAMPLES_PER_WORD = 3;
const ctx = vm.createContext({ TARGET_EXAMPLES_PER_WORD });
vm.runInContext(SRC.slice(a, b) + '\nthis.validGeneratedExample = validGeneratedExample; this.pickGrammarPatterns = pickGrammarPatterns; this.countHan = countHan; this.PATTERNS = HSK34_GRAMMAR_PATTERNS;', ctx);

test('đếm chữ Hán bỏ dấu câu/khoảng trắng; câu <10 chữ Hán bị loại, 10–30 được nhận', () => {
  const ok = { zh: '我每天早上都要去学校学习汉语。', vi: 'x' };         // 14 chữ Hán
  assert.strictEqual(ctx.countHan(ok.zh), 14);
  assert.ok(ctx.validGeneratedExample(ok, '学习'));
  assert.ok(!ctx.validGeneratedExample({ zh: '我在学习汉语。', vi: 'x' }, '学习'), '7 chữ → loại');
  assert.ok(!ctx.validGeneratedExample({ zh: '我，我，我，我，学，习，。', vi: 'x' }, '学习'), 'dấu câu không được tính');
  assert.ok(ctx.validGeneratedExample({ zh: '我们学习了很久才弄懂这个问题。', vi: 'x' }, '学习'));
  assert.ok(!ctx.validGeneratedExample({ zh: '学习'.repeat(16), vi: 'x' }, '学习'), '>30 chữ → loại');
  assert.ok(!ctx.validGeneratedExample({ zh: '今天我们一起去公园里面玩儿吧。', vi: 'x' }, '学习'), 'thiếu từ mục tiêu → loại');
  assert.ok(!ctx.validGeneratedExample({ zh: ok.zh, vi: '  ' }, '学习'), 'thiếu nghĩa → loại');
});
test('mẫu ngữ pháp HSK 3–4: đủ nhiều, 3 mẫu gợi ý mỗi từ khác nhau và xoay vòng theo vị trí', () => {
  assert.ok(ctx.PATTERNS.length >= 30);
  for (let i = 0; i < 40; i++) { const p = Array.from(ctx.pickGrammarPatterns(i, 3)); assert.strictEqual(new Set(p).size, 3); }
  assert.notDeepStrictEqual(Array.from(ctx.pickGrammarPatterns(0, 3)), Array.from(ctx.pickGrammarPatterns(1, 3)));
});
test('prompt: nêu HSK 3.0 cấp 3–4, tối thiểu 10 chữ Hán, yêu cầu pinyin; lưu py vào DB', () => {
  const run = SRC.slice(SRC.indexOf('async function runWordExampleGeneration'), SRC.indexOf('// ── [AI] Chấm điểm phát âm'));
  assert.ok(/HSK 3\.0/.test(run) && /HSK 3 – HSK 4/.test(run) && /TỐI THIỂU \$\{EXAMPLE_MIN_HAN\} chữ Hán/.test(run));
  assert.ok(/"py":"pinyin cả câu"/.test(run) && /validGeneratedExample\(e, w\.hz\)/.test(run));
  assert.ok(/INSERT INTO word_examples \(hz, lesson, vi, zh, py\)/.test(fs.readFileSync(path.join(__dirname, '../lib/db.js'), 'utf8')));
});
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
