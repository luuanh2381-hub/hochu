#!/usr/bin/env node
// test/v156-word-examples-file.test.js — V156: nhập / xoá câu ví dụ bằng file (admin), chạy trên POSTGRES THẬT (như v154).
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

test('mã nguồn: 4 route admin + UI file + không đổi schema', () => {
  const api = fs.readFileSync(path.join(ROOT, 'api/index.js'), 'utf8');
  for (const r of ['import', 'delete-by-file', 'delete-by-lesson', 'list', 'delete']) assert.ok(api.includes(`/api/admin/word-examples/${r}'`), r);
  const block = api.slice(api.indexOf('async function adminOnly'), api.indexOf('Kích hoạt thủ công việc sinh ví dụ theo từ'));
  assert.ok(/requireAdmin\(/.test(block));
  assert.strictEqual((block.match(/await adminOnly\(req, res\)/g) || []).length, 5, 'cả 5 route đều qua adminOnly');
  const db = fs.readFileSync(path.join(ROOT, 'lib/db.js'), 'utf8');
  const sect = db.slice(db.indexOf('V156: quản lý câu ví dụ'), db.indexOf('Lấy toàn bộ ví dụ theo từ cho các bài đang học'));
  assert.ok(!/\bDROP\b|\bTRUNCATE\b|ALTER TABLE|CREATE TABLE/i.test(sect), 'không đổi schema / không DROP');
  const ui = fs.readFileSync(path.join(ROOT, 'js/admin.js'), 'utf8');
  for (const f of ['uploadExampleFile', 'previewDeleteExamplesByFile', 'confirmDeleteExamplesByFile', 'searchWordExamples', 'deleteExampleRow', 'downloadExampleTemplate']) assert.ok(ui.includes('function ' + f), f);
});

test('db THẬT: nhập file → thêm / trùng / bỏ qua đúng lý do; xem trước xoá không xoá; xoá theo file, theo id, theo từ', async () => {
  const name = `t156_${process.pid}_${++seq}`;
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
    await D.importVocab([{ hz: '学习', py: 'xuéxí', vi: 'học', l: 1 }, { hz: '朋友', py: 'péngyou', vi: 'bạn', l: 2 }], false);
    const rows = [
      { hz: '学习', zh: '我每天学习汉语。', vi: 'Mỗi ngày tôi học tiếng Trung.' },
      { hz: '学习', zh: '他在学习。', vi: 'Anh ấy đang học.' },
      { hz: '朋友', zh: '他是我的朋友。', vi: 'Anh ấy là bạn tôi.' },
      { hz: '学习', zh: '我每天学习汉语。', vi: 'trùng trong file' },       // trùng → duplicate
      { hz: '朋友', zh: '今天很热。', vi: 'Hôm nay nóng.' },                // không chứa hz
      { hz: '猫', zh: '这是猫。', vi: 'Đây là mèo.' },                      // từ chưa có
      { hz: '学习', zh: '', vi: 'thiếu zh' },                               // thiếu cột
    ];
    const r = await D.importWordExamples(rows);
    assert.strictEqual(r.added, 3); assert.strictEqual(r.duplicate, 1); assert.strictEqual(r.skipped.length, 3);
    assert.deepStrictEqual(r.skipped.map((x) => x.line), [6, 7, 8]);
    assert.ok(/không chứa/.test(r.skipped[0].reason) && /chưa có trong kho/.test(r.skipped[1].reason) && /Thiếu/.test(r.skipped[2].reason));
    const lessons = (await probe.query(`SELECT hz, lesson FROM word_examples ORDER BY id`)).rows;
    assert.deepStrictEqual(lessons.map((x) => x.lesson), [1, 1, 2], 'lesson lấy từ kho từ vựng');
    // nhập lại cùng file → không thêm gì
    const r2 = await D.importWordExamples(rows); assert.strictEqual(r2.added, 0); assert.strictEqual(r2.duplicate, 4);
    // xem trước xoá: KHÔNG xoá
    const del = [{ hz: '学习', zh: '他在学习。' }, { hz: '学习', zh: 'không tồn tại' }];
    const dry = await D.deleteWordExamplesByRows(del, true);
    assert.strictEqual(dry.matched, 1); assert.strictEqual(dry.notFound.length, 1);
    assert.strictEqual((await probe.query('SELECT COUNT(*)::int n FROM word_examples')).rows[0].n, 3);
    // xoá thật
    const real = await D.deleteWordExamplesByRows(del, false);
    assert.strictEqual(real.deleted, 1);
    assert.strictEqual((await probe.query('SELECT COUNT(*)::int n FROM word_examples')).rows[0].n, 2);
    // xoá theo bài: bài 2 (朋友) — xem trước không xoá, rồi xoá thật; bài 1 giữ nguyên
    await D.importWordExamples([{ hz: '朋友', zh: '我的朋友来了。', vi: 'Bạn tôi đến rồi.' }]);
    const before = (await probe.query('SELECT COUNT(*)::int n FROM word_examples')).rows[0].n;
    const dryL = await D.deleteWordExamplesByLesson(2, true);
    assert.strictEqual(dryL.matched, 2); assert.strictEqual(dryL.words, 1);
    assert.strictEqual((await probe.query('SELECT COUNT(*)::int n FROM word_examples')).rows[0].n, before);
    assert.strictEqual((await D.deleteWordExamplesByLesson(2, false)).deleted, 2);
    assert.strictEqual((await D.listWordExamples('朋友')).length, 0);
    assert.strictEqual((await D.listWordExamples('学习')).length, 1, 'bài khác không bị đụng');
    await assert.rejects(D.deleteWordExamplesByLesson('abc', false));
    await D.importWordExamples([{ hz: '朋友', zh: '他是我的朋友。', vi: 'Anh ấy là bạn tôi.' }]);
    // liệt kê + xoá theo id + xoá theo từ
    const list = await D.listWordExamples('学习'); assert.strictEqual(list.length, 1);
    assert.strictEqual(await D.deleteWordExample({ id: list[0].id }), 1);
    assert.strictEqual((await D.listWordExamples('')).length, 1);
    assert.strictEqual(await D.deleteWordExample({ id: NaN, hz: '朋友' }), 1);
    assert.strictEqual((await D.listWordExamples('')).length, 0);
    await assert.rejects(D.deleteWordExample({ id: NaN }));
    // V157: pinyin — nhập kèm py; câu cũ chưa có py được bổ sung khi nhập lại; lấy ra qua getWordExamplesForLessons
    const withPy = await D.importWordExamples([{ hz: '学习', zh: '我今天学习。', py: 'Wǒ jīntiān xuéxí.', vi: 'Hôm nay tôi học.' }, { hz: '朋友', zh: '他是朋友。', vi: 'Anh ấy là bạn.' }]);
    assert.strictEqual(withPy.added, 2); assert.strictEqual(withPy.withoutPinyin, 1);
    const fill = await D.importWordExamples([{ hz: '朋友', zh: '他是朋友。', py: 'Tā shì péngyou.', vi: 'Anh ấy là bạn.' }]);
    assert.strictEqual(fill.added, 0); assert.strictEqual(fill.updatedPinyin, 1);
    const again = await D.importWordExamples([{ hz: '朋友', zh: '他是朋友。', py: 'khác', vi: 'x' }]);
    assert.strictEqual(again.updatedPinyin, 0); assert.strictEqual(again.duplicate, 1, 'không ghi đè pinyin đã có');
    const forLessons = await D.getWordExamplesForLessons([1, 2]);
    assert.ok(forLessons.some((e) => e.zh === '他是朋友。' && e.py === 'Tā shì péngyou.'));
    assert.ok(forLessons.some((e) => e.zh === '我今天学习。' && e.py === 'Wǒ jīntiān xuéxí.'));
    await D.deleteWordExamplesByRows([{ hz: '学习', zh: '我今天学习。' }, { hz: '朋友', zh: '他是朋友。' }], false);
    // hiệu năng: 5000 dòng phải nhập/xoá theo LÔ (vài câu lệnh), không phải 5000 lượt gọi DB
    const big = Array.from({ length: 5000 }, (_, i) => ({ hz: '学习', zh: `我今天学习第${i}课。`, vi: 'Hôm nay tôi học bài ' + i }));
    const q0 = Date.now(); const rb = await D.importWordExamples(big);
    assert.strictEqual(rb.added, 5000); const tImport = Date.now() - q0;
    const q1 = Date.now(); const rd = await D.deleteWordExamplesByRows(big, false);
    assert.strictEqual(rd.deleted, 5000); const tDel = Date.now() - q1;
    console.log(`     (5000 dòng: nhập ${tImport}ms, xoá ${tDel}ms)`);
    assert.ok(tImport < 8000 && tDel < 8000);
    // vocab không bị đụng
    assert.strictEqual((await probe.query('SELECT COUNT(*)::int n FROM vocab_words')).rows[0].n, 2);
    // giới hạn kích thước & rỗng
    await assert.rejects(D.importWordExamples([]));
    await assert.rejects(D.importWordExamples(new Array(5001).fill(rows[0])));
    probe.end();
  } finally { Module._load = origLoad; delete require.cache[dbPath]; if (old === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = old; }
}, true);

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
