#!/usr/bin/env node
// test/cron-task.test.js — /api/cron/generate-daily?task=examples phải chỉ chạy sinh ví dụ,
// không bị hán việt/chiết tự chặn (lý do endpoint này được thêm tham số task).
// Không cần DATABASE_URL: stub 2 hàm DB mà route dùng.
const assert = require('assert');
process.env.VERCEL = '1'; // để api/index.js không tự listen khi require

const db = require('../lib/db');
db.getAllVocabWords = async () => [{ hz: '学', py: 'xué', vi: 'học', l: 1 }];
db.getWordExampleCounts = async () => ({ '学': 3 }); // đã đủ ví dụ → không gọi Gemini

const app = require('../api/index.js');

const srv = app.listen(0, async () => {
  const base = `http://127.0.0.1:${srv.address().port}/api/cron/generate-daily`;
  try {
    const r = await fetch(base + '?task=examples');
    const body = await r.json();
    assert.strictEqual(r.status, 200);
    assert.strictEqual(body.ok, true);
    // Chỉ nhánh ví dụ chạy: hán việt bị bỏ qua hoàn toàn (totalPending 0 vì không gọi hàm)
    assert.strictEqual(body.hanviet.totalPending, 0);
    assert.strictEqual(body.hanziParts.totalPending, 0);
    assert.strictEqual(body.wordExamples.totalPending, 0); // 学 đã đủ 3 ví dụ
    console.log('✅ cron-task.test.js — 4 PASS');
    srv.close();
    process.exit(0);
  } catch (e) {
    console.error('❌ cron-task.test.js —', e.message);
    srv.close();
    process.exit(1);
  }
});
