#!/usr/bin/env node
// ════════════════════════════════════════════════════
// test/lesson-order.integration.test.js
//
// Lỗi "Hôm nay học" lặp từ cũ HSK 1 — 4 kịch bản chỉ chứng minh được với Postgres thật:
//   1. Từ đã học nhưng MẤT fsrs_cards (còn review_history) không được trả về như từ mới.
//   2. Nhiều phiên liên tiếp: 10 từ/phiên, không trùng từ giữa các phiên.
//   3. Đang học bài 10 → từ bài 10 trả về trước từ bài 1.
//   4. Chọn đúng 1 bài (bài 10) → không lẫn bài 1-9 hay 11+.
//   5. countNewWordsInLessons khớp với số từ getNewWordsByLessonOrder thực trả (dashboard không lệch).
//
// Tự SKIP (exit 0) nếu chưa có DATABASE_URL. Dữ liệu test dùng tiền tố riêng, tự dọn trước/sau.
// Chạy: DATABASE_URL=postgres://... node test/lesson-order.integration.test.js
// ════════════════════════════════════════════════════
const assert = require('assert');

const HZ_PREFIX = '__itest_order_';
const TEST_USER = '__integration_test_user_lesson_order__';
const L1 = 997101, L10 = 997110, L11 = 997111;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('⏭️  SKIP: chưa cấu hình DATABASE_URL — test này cần Postgres thật.');
    return;
  }
  const db = require('../lib/db');
  const pool = db.getPool();

  async function cleanup() {
    await pool.query('DELETE FROM fsrs_cards WHERE user_id = $1', [TEST_USER]);
    await pool.query('DELETE FROM review_history WHERE user_id = $1', [TEST_USER]);
    await pool.query(`DELETE FROM vocab_words WHERE hz LIKE '${HZ_PREFIX}%'`);
  }

  let passed = 0;
  async function test(name, fn) {
    try { await fn(); console.log('  ✅ ' + name); passed++; }
    catch (e) { console.error('  ❌ ' + name + '\n     ' + e.message); process.exitCode = 1; }
  }

  // 30 từ bài 1, 20 từ bài 10, 10 từ bài 11 (đủ để lấp 3 phiên 10 từ)
  async function seed() {
    await cleanup();
    const rows = [];
    for (let i = 1; i <= 30; i++) rows.push({ hz: HZ_PREFIX + 'a' + i, l: L1 });
    for (let i = 1; i <= 20; i++) rows.push({ hz: HZ_PREFIX + 'j' + i, l: L10 });
    for (let i = 1; i <= 10; i++) rows.push({ hz: HZ_PREFIX + 'k' + i, l: L11 });
    for (const r of rows) {
      const ins = await pool.query(
        'INSERT INTO vocab_words (hz, py, vi, l) VALUES ($1, $2, $3, $4) RETURNING id',
        [r.hz, 'py' + r.l, 'nghia', r.l]
      );
      await pool.query('INSERT INTO vocab_lessons (word_id, lesson) VALUES ($1, $2)', [ins.rows[0].id, r.l]);
    }
  }

  await seed();
  const studyScope = require('../lib/fsrs/studyScope');

  await test('Đang bài 10 + phạm vi bài 1-11 → từ bài 10 đứng trước từ bài 1', async () => {
    const scope = [L1, L10, L11];
    const { inScopeOrder } = studyScope.buildLessonPriorityOrder(L10, scope, scope);
    assert.deepStrictEqual(inScopeOrder, [L10, L11, L1]);
    const words = await db.getNewWordsByLessonOrder(TEST_USER, inScopeOrder, 10);
    assert.strictEqual(words.length, 10);
    assert.ok(words.every(w => w.l === L10), 'cả 10 từ đầu phải thuộc bài 10: ' + words.map(w => w.l).join(','));
  });

  await test('Từ đã học nhưng mất fsrs_cards (còn review_history) KHÔNG bị coi là từ mới', async () => {
    const learned = await db.getNewWordsByLessonOrder(TEST_USER, [L1], 1);
    const victim = learned[0];
    // Mô phỏng đúng sự cố: lịch sử còn, thẻ FSRS không còn.
    await pool.query(
      `INSERT INTO review_history (user_id, hz, l, rating, answer_correct) VALUES ($1,$2,$3,'good',true)`,
      [TEST_USER, victim.hz, victim.l]
    );
    const after = await db.getNewWordsByLessonOrder(TEST_USER, [L1], 100);
    assert.ok(!after.some(w => w.hz === victim.hz), 'từ đã có lịch sử học không được trả về như từ mới');
    await pool.query('DELETE FROM review_history WHERE user_id = $1', [TEST_USER]);
  });

  await test('3 phiên liên tiếp 10 từ/phiên không trùng nhau', async () => {
    const scope = [L1, L10, L11];
    const { inScopeOrder } = studyScope.buildLessonPriorityOrder(L10, scope, scope);
    const seen = new Set();
    for (let s = 0; s < 3; s++) {
      const batch = await db.getNewWordsByLessonOrder(TEST_USER, inScopeOrder, 10);
      assert.strictEqual(batch.length, 10, `phiên ${s + 1} phải đủ 10 từ`);
      for (const w of batch) {
        assert.ok(!seen.has(w.hz), `phiên ${s + 1} lặp lại ${w.hz} đã học ở phiên trước`);
        seen.add(w.hz);
        // ghi nhận như đã học xong (thẻ FSRS được tạo khi trả lời lần đầu)
        const id = w.resolved_word_id;
        await pool.query(
          `INSERT INTO fsrs_cards (user_id, hz, l, word_id, state, due, reps, last_review)
           VALUES ($1,$2,$3,$4,2,now() + interval '1 day',1,now())`,
          [TEST_USER, w.hz, w.l, id]
        );
      }
    }
    assert.strictEqual(seen.size, 30);
  });

  await test('Chọn chỉ bài 10 → không lẫn từ bài 1-9 hay 11+', async () => {
    await pool.query('DELETE FROM fsrs_cards WHERE user_id = $1', [TEST_USER]);
    const words = await db.getNewWordsByLessonOrder(TEST_USER, [L10], 100);
    assert.ok(words.length > 0);
    assert.ok(words.every(w => w.l === L10), 'chỉ được có từ bài 10, gặp: ' + [...new Set(words.map(w => w.l))].join(','));
  });

  await test('countNewWordsInLessons khớp số từ getNewWordsByLessonOrder thực trả', async () => {
    const lessons = [L1, L10, L11];
    const count = await db.countNewWordsInLessons(TEST_USER, lessons);
    const got = await db.getNewWordsByLessonOrder(TEST_USER, lessons, 1000);
    assert.strictEqual(count, got.length, `dashboard báo ${count} nhưng phiên học trả ${got.length}`);
  });

  await cleanup();
  console.log(`\n${passed} PASS${process.exitCode ? ' (có FAIL)' : ''}`);
  await pool.end();
}

main().catch(e => { console.error('❌', e); process.exit(1); });
