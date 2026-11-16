#!/usr/bin/env node
// test/v156-word-examples-file.test.js — V164: câu ví dụ trùng (1 bản có py, 1 bản không) — app phải lấy bản CÓ pinyin; nhập lại file bổ sung py cho bản thiếu.
// Không có Postgres test → SKIP và thoát mã 3. Mỗi test dùng DB riêng.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { connectMini } = require('./helpers/mini-pg');
const ROOT = path.join(__dirname, '..');
const STUB_MODULES = /^(ts-fsrs|\.\/fsrs|\.\/fsrs-auto-rating|\.\/skill-store|\.\/word-notes)$/;
let passed = 0, failed = 0, skipped = 0; const pending = []; const createdDbs = []; let seq = 0;
const test = (n, f, db) => pending.push({ n, f, db: !!db });

test('db THẬT: cùng (hz, zh) có 2 bản ghi, 1 có py 1 không → API trả bản có py; nhập lại file bổ sung py cho bản thiếu', async () => {
  const name = `t164_${process.pid}_${++seq}`;
  const a = await connectMini({ database: 'postgres' }); await a.query(`CREATE DATABASE ${name}`); a.end(); createdDbs.push(name);
  const origLoad = Module._load;
  Module._load = function (request) {
    if (STUB_MODULES.test(request)) return {};
    if (request === 'pg') return { Pool: class { async connect() { return connectMini({ database: name }); } async query(s, p) { const c = await connectMini({ database: name }); try { return await c.query(s, p); } finally { c.end(); } } on() {} } };
    return origLoad.apply(this, arguments);
  };
  const dbPath = path.join(ROOT, 'lib/db.js'); const old = process.env.DATABASE_URL; process.env.DATABASE_URL = 'postgresql://u:pw@localhost/x';
  try {
    delete require.cache[dbPath];
    const D = require(dbPath);
    const probe = await connectMini({ database: name });
    await D.importVocab([{ hz: '多数', py: 'duōshù', vi: 'đa số', l: 4 }], false);
    // bản có py (từ file) + bản không py (vd do AI sinh trước đó) của CÙNG câu
    await D.importWordExamples([{ hz: '多数', zh: '多数人都同意这个办法。', vi: 'Đa số mọi người đều đồng ý cách này.', py: 'Duōshù rén dōu tóngyì zhège bànfǎ.' }]);
    await probe.query(`INSERT INTO word_examples (hz, lesson, vi, zh) VALUES ('多数', 4, 'Đa số mọi người đồng ý.', '多数人都同意这个办法。')`);
    assert.strictEqual((await probe.query('SELECT COUNT(*)::int n FROM word_examples')).rows[0].n, 2);
    for (let i = 0; i < 5; i++) {
      const got = await D.getWordExamplesForLessons([4]);
      assert.strictEqual(got.length, 1, 'mỗi (hz, zh) chỉ 1 dòng');
      assert.strictEqual(got[0].py, 'Duōshù rén dōu tóngyì zhège bànfǎ.', 'ưu tiên bản có pinyin');
    }
    // V165: 1 chữ = 1 ví dụ cho màn học — thêm câu thứ 2 (không py, mới hơn) và câu thứ 3 (có py, cũ hơn) → vẫn chỉ trả 1 câu CÓ py
    await probe.query(`INSERT INTO word_examples (hz, lesson, vi, zh) VALUES ('多数', 4, 'AI sinh', '这里多数是新的。')`);
    await D.importWordExamples([{ hz: '多数', zh: '他们多数是学生。', vi: 'Phần lớn họ là học sinh.', py: 'Tāmen duōshù shì xuéshēng.' }]);
    await probe.query(`INSERT INTO word_examples (hz, lesson, vi, zh) VALUES ('多数', 4, 'AI sinh 2', '多数时候我在家。')`);
    const one = await D.getWordExamplesForLessons([4]);
    assert.strictEqual(one.length, 1, '1 chữ = 1 ví dụ');
    assert.ok(one[0].py, 'ví dụ trả về phải là câu có pinyin');
    // nhập lại file → bổ sung py cho bản còn thiếu (trước đây bị bỏ qua vì "đã có pinyin")
    const r = await D.importWordExamples([{ hz: '多数', zh: '多数人都同意这个办法。', vi: 'x', py: 'Duōshù rén dōu tóngyì zhège bànfǎ.' }]);
    assert.strictEqual(r.updatedPinyin, 1);
    assert.strictEqual((await probe.query(`SELECT COUNT(*)::int n FROM word_examples WHERE zh = '多数人都同意这个办法。' AND (py IS NULL OR py = '')`)).rows[0].n, 0);
    probe.end();
  } finally { Module._load = origLoad; delete require.cache[dbPath]; if (old === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = old; }
}, true);

test('question-engine: cùng 1 câu có 2 bản ghi (1 có py) → câu hỏi luôn mang py', () => {
  const QE = require('../js/question-engine.js');
  const pool = []; for (let i = 0; i < 6; i++) pool.push({ hz: '词' + '甲乙丙丁戊己'[i], py: 'cí' + i, vi: 'từ' + i, l: 1 });
  const w = pool[0];
  const examples = pool.map((p, i) => ({ hz: p.hz, zh: '我今天在学校学习' + p.hz + '这个词。', vi: 'Hôm nay ' + i, py: 'Wǒ jīntiān ' + i }));
  examples.push({ hz: w.hz, zh: examples[0].zh, vi: 'bản không py' }); // bản trùng KHÔNG có py
  for (let k = 0; k < 20; k++) {
    const q = QE.build('sent2vi', w, { pool, examples, sentences: [], rand: Math.random });
    assert.ok(q && q.sentence && q.sentence.py, 'có py ở lần ' + k);
    assert.ok(q.explanation.some((l) => /^Pinyin cả câu: /.test(l)));
  }
});

(async () => {
  let ok = false; try { const a = await connectMini({ database: 'postgres' }); await a.query('SELECT 1'); a.end(); ok = true; } catch (e) { ok = false; }
  for (const { n, f, db } of pending) {
    if (db && !ok) { skipped++; console.log('  ⏭️  SKIP (không có Postgres test) ' + n); continue; }
    try { await f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n     ') : e)); }
  }
  if (ok) { try { const a = await connectMini({ database: 'postgres' }); for (const d of createdDbs) await a.query(`DROP DATABASE IF EXISTS ${d} WITH (FORCE)`); a.end(); } catch (e) { /* bỏ qua */ } }
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  process.exit(failed ? 1 : (skipped ? 3 : 0));
})();
