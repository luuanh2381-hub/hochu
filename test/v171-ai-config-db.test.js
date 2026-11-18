#!/usr/bin/env node
// test/v171-ai-config-db.test.js — V171: bảng ai_config trên Postgres THẬT (lưu / đọc / ghi đè / khoá không lẫn). Không có Postgres → SKIP (mã 3).
const assert = require('assert'); const path = require('path'); const Module = require('module');
const { connectMini } = require('./helpers/mini-pg');
const C = require('../lib/ai-config.js');
const ROOT = path.join(__dirname, '..');
const STUB = /^(ts-fsrs|\.\/fsrs|\.\/fsrs-auto-rating|\.\/skill-store|\.\/word-notes)$/;
(async () => {
  let ok = false; try { const a = await connectMini({ database: 'postgres' }); await a.query('SELECT 1'); a.end(); ok = true; } catch (e) { /* không có PG */ }
  if (!ok) { console.log('  ⏭️  SKIP (không có Postgres test)'); process.exit(3); }
  const name = `t171_${process.pid}`;
  const a = await connectMini({ database: 'postgres' }); await a.query(`CREATE DATABASE ${name}`); a.end();
  const origLoad = Module._load;
  Module._load = function (request) {
    if (STUB.test(request)) return {};
    if (request === 'pg') return { Pool: class { async connect() { return connectMini({ database: name }); } async query(s, p) { const c = await connectMini({ database: name }); try { return await c.query(s, p); } finally { c.end(); } } on() {} } };
    return origLoad.apply(this, arguments);
  };
  const dbPath = path.join(ROOT, 'lib/db.js'); process.env.DATABASE_URL = 'postgresql://u:pw@localhost/x'; delete require.cache[dbPath];
  const D = require(dbPath);
  let failed = 0; const t = async (n, f) => { try { await f(); console.log('  ✅ ' + n); } catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + e.message); } };
  try {
    await t('chưa lưu gì → data rỗng (không lỗi, tự tạo bảng)', async () => {
      const r = await D.getAiConfigRow(); assert.deepStrictEqual(r.data, {}); assert.strictEqual(r.updatedBy, null);
    });
    await t('lưu → đọc lại đúng (kể cả tiếng Việt/JSON lồng), ghi lại là CẬP NHẬT chứ không thêm dòng', async () => {
      const p1 = C.applyPatch({}, { text: { baseUrl: 'https://api.groq.com/openai/v1', models: 'llama-3.3-70b-versatile\nmixtral', apiKey: 'gsk-test-key-123456' }, image: { steps: 3 } });
      await D.saveAiConfigRow(p1.stored, 'tuananh');
      let r = await D.getAiConfigRow();
      assert.deepStrictEqual(r.data.text.models, ['llama-3.3-70b-versatile', 'mixtral']); assert.strictEqual(r.data.text.apiKey, 'gsk-test-key-123456'); assert.strictEqual(r.updatedBy, 'tuananh');
      const p2 = C.applyPatch(r.data, { text: { models: 'chi-mot-model' }, speech: { model: 'gemini-x' } });
      await D.saveAiConfigRow(p2.stored, 'admin2');
      r = await D.getAiConfigRow();
      assert.deepStrictEqual(r.data.text.models, ['chi-mot-model']); assert.strictEqual(r.data.text.apiKey, 'gsk-test-key-123456', 'khoá cũ được giữ khi vá không gửi khoá');
      assert.strictEqual(r.data.speech.model, 'gemini-x'); assert.strictEqual(r.updatedBy, 'admin2');
      const probe = await connectMini({ database: name }); assert.strictEqual((await probe.query('SELECT COUNT(*)::int n FROM ai_config')).rows[0].n, 1); probe.end();
    });
    await t('reset nhóm → lưu lại: nhóm biến mất, nhóm khác còn; resolve quay về env', async () => {
      const r = await D.getAiConfigRow(); const p = C.applyPatch(r.data, { text: { reset: true } });
      await D.saveAiConfigRow(p.stored, 'x'); const r2 = await D.getAiConfigRow();
      assert.ok(!r2.data.text); assert.strictEqual(r2.data.speech.model, 'gemini-x');
      assert.strictEqual(C.resolve(r2.data, { AI_API_KEY: 'env-key-12345' }).text.sources.apiKey, 'env');
    });
  } finally {
    Module._load = origLoad; delete require.cache[dbPath];
    try { const a2 = await connectMini({ database: 'postgres' }); await a2.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); a2.end(); } catch (e) { /* bỏ qua */ }
  }
  console.log(failed ? `\n${failed} failed` : '\nall passed'); process.exit(failed ? 1 : 0);
})();
