// test/v127-fsrs-isolation.test.js — KIỂM TOÁN ĐỘC LẬP V127 (phần A: FSRS).
//
// Mục tiêu: chứng minh bằng SO SÁNH DỮ LIỆU TRƯỚC/SAU (không chỉ đọc mã) rằng
//   (1) các lượt luyện bổ sung (kể cả câu "thăm dò tự gõ") không đổi dữ liệu FSRS;
//   (2) phiên học ?adaptive=1 không đổi thẻ FSRS nào (thứ tự, số lượng, due/stability/difficulty/state/reps/lapses/version).
//
// GIỚI HẠN (nói rõ, không giấu): KHÔNG có Postgres thật và KHÔNG có ts-fsrs trong môi trường này.
//   • DB là GIẢ LẬP trong bộ nhớ: mọi câu SQL do mã THẬT (lib/skill-store.js, lib/fsrs/reviewService.js) phát ra đều được ghi lại
//     và phân loại; câu SQL KHÔNG được chạy bởi Postgres thật → cú pháp SQL của truy vấn mới vẫn "chưa xác minh trên DB thật".
//   • Thuật toán lập lịch (ts-fsrs) KHÔNG chạy ở đây: test này chứng minh "luyện bổ sung/phiên adaptive KHÔNG GHI vào dữ liệu FSRS",
//     không chứng minh toán FSRS đúng (đó là việc của test/fsrs.test.js — cần ts-fsrs).
//   • Có ĐỐI CHỨNG DƯƠNG: cùng bộ phát hiện phải BẮT ĐƯỢC một lượt ôn chính thức giả (INSERT review_history + UPDATE fsrs_cards).
'use strict';
const assert = require('assert');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');
const ROOT = path.join(__dirname, '..');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✅ ' + name); }
  catch (e) { failed++; console.log('  ❌ ' + name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e)); }
}
const section = (s) => console.log('\n' + s);

// ── Dữ liệu mẫu: thẻ FSRS với đủ trường đang được hệ thống dùng ──────────────────────────────────────────────────────────
const NOW = new Date('2026-10-29T03:00:00Z');
const days = (n) => new Date(NOW.getTime() + n * 86400000).toISOString();
const SEED = {
  vocab_words: [
    { id: 1, hz: '提高', py: 'tígāo', vi: 'nâng cao', l: 1, tag: '', hanviet: 'đề cao' },
    { id: 2, hz: '学习', py: 'xuéxí', vi: 'học tập', l: 1, tag: '', hanviet: 'học tập' },
    { id: 3, hz: '朋友', py: 'péngyou', vi: 'bạn bè', l: 1, tag: '', hanviet: 'bằng hữu' },
    { id: 4, hz: '学校', py: 'xuéxiào', vi: 'trường học', l: 2, tag: '', hanviet: 'học hiệu' },
    { id: 5, hz: '老师', py: 'lǎoshī', vi: 'giáo viên', l: 2, tag: '', hanviet: 'lão sư' },
    { id: 6, hz: '喝水', py: 'hē shuǐ', vi: 'uống nước', l: 2, tag: '', hanviet: '' },
  ],
  fsrs_cards: [
    { user_id: 'u1', word_id: 1, hz: '提高', l: 1, state: 2, due: days(-2), stability: 12.3456, difficulty: 5.4321, elapsed_days: 9, scheduled_days: 11, reps: 7, lapses: 1, last_review: days(-11), version: 4 },
    { user_id: 'u1', word_id: 2, hz: '学习', l: 1, state: 2, due: days(-1), stability: 33.1, difficulty: 3.2, elapsed_days: 30, scheduled_days: 32, reps: 11, lapses: 0, last_review: days(-33), version: 9 },
    { user_id: 'u1', word_id: 3, hz: '朋友', l: 1, state: 3, due: days(0), stability: 1.9, difficulty: 8.8, elapsed_days: 2, scheduled_days: 2, reps: 4, lapses: 3, last_review: days(-2), version: 6 },
    { user_id: 'u1', word_id: 4, hz: '学校', l: 2, state: 1, due: days(0), stability: 0.4, difficulty: 6.1, elapsed_days: 0, scheduled_days: 0, reps: 1, lapses: 0, last_review: days(0), version: 1 },
  ],
  review_history: [
    { id: 1, user_id: 'u1', word_id: 1, hz: '提高', l: 1, rating: 3, answer_correct: true, exercise_type: 'review-hz2vi', exposure: null, skill: 'recognition', reviewed_at: days(-11), source: 'review' },
    { id: 2, user_id: 'u1', word_id: 1, hz: '提高', l: 1, rating: 1, answer_correct: false, exercise_type: 'review-vi2hz', exposure: null, skill: 'recall', reviewed_at: days(-30), source: 'review' },
    { id: 3, user_id: 'u1', word_id: 2, hz: '学习', l: 1, rating: 3, answer_correct: true, exercise_type: 'review-listen', exposure: null, skill: 'listening', reviewed_at: days(-33), source: 'review' },
    { id: 4, user_id: 'u1', word_id: 3, hz: '朋友', l: 1, rating: 2, answer_correct: true, exercise_type: 'review-cloze', exposure: null, skill: 'context', reviewed_at: days(-2), source: 'review' },
    { id: 5, user_id: 'u1', word_id: 4, hz: '学校', l: 2, rating: 3, answer_correct: true, exercise_type: 'review-hz2vi', exposure: 'intro', skill: 'recognition', reviewed_at: days(0), source: 'review' },
  ],
  user_settings: [{ user_id: 'u1', desired_retention: 0.9 }],
  word_skill_stats: [
    { user_id: 'u1', word_id: 1, skill: 'recall', attempts: 3, correct: 1, w_attempts: 2.5, w_correct: 1, last_attempt_at: days(-3), active_days: 2, delayed_attempts: 1, delayed_correct: 0 },
  ],
  skill_practice_log: [
    { user_id: 'u1', attempt_key: 'seed-0001', word_id: 2, skill: 'listening', exercise_type: 'practice-listening', answer_correct: true, attempted_at: days(-1), source: 'practice' },
  ],
};
const FSRS_TABLES = ['fsrs_cards', 'review_history', 'user_settings', 'vocab_words']; // dữ liệu phải BẤT BIẾN
const ALLOWED_WRITE = new Set(['skill_practice_log', 'word_skill_stats']);               // chỉ 2 bảng này được ghi khi luyện bổ sung
const hashOf = (T) => crypto.createHash('sha256').update(JSON.stringify(FSRS_TABLES.map(t => T[t]))).digest('hex');

// ── DB giả: ghi lại MỌI câu SQL, phát hiện ghi vào dữ liệu ngoài danh sách cho phép ───────────────────────────────────────
function makeFakeDb() {
  const T = JSON.parse(JSON.stringify(SEED));
  const stmts = [];      // { verb, tables, sql }
  const violations = []; // ghi dữ liệu ngoài ALLOWED_WRITE
  const failOn = [];     // regex: câu SQL khớp → ném lỗi (giả lập sự cố)
  let nextLogId = 100;
  const tablesOf = (s) => { const out = []; const re = /\b(?:FROM|JOIN|INTO|UPDATE|TABLE(?: IF NOT EXISTS)?|ON)\s+([a-z_]+)/gi; let m; while ((m = re.exec(s))) out.push(m[1].toLowerCase()); return [...new Set(out)]; };
  const sinceOf = (nDays) => NOW.getTime() - nDays * 86400000;
  async function query(sql, params) {
    const s = sql.replace(/\s+/g, ' ').trim();
    const verb = s.split(' ')[0].toUpperCase();
    const tables = tablesOf(s);
    stmts.push({ verb, tables, sql: s });
    for (const re of failOn) if (re.test(s)) throw new Error('sự cố giả lập: ' + re);
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(s)) return { rows: [] };
    if (verb === 'ALTER' || verb === 'CREATE' || verb === 'DROP') return { rows: [] }; // DDL (ensureSkillTables) — thống kê riêng bên dưới
    if (verb === 'INSERT' || verb === 'UPDATE' || verb === 'DELETE' || verb === 'TRUNCATE') {
      const target = (s.match(/^(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE(?: TABLE)?)\s+([a-z_]+)/i) || [])[1];
      if (!ALLOWED_WRITE.has(target)) {
        violations.push({ target, sql: s.slice(0, 120) });
        if (T[target]) T[target].push({ __ghi_ngoai_y_muon: true, sql: s.slice(0, 60) }); // làm hash đổi → bắt được cả bằng so sánh dữ liệu
        return { rows: [] };
      }
      if (target === 'skill_practice_log') {
        const [user, key, wordId, skill, exType, ok, rt, sid, source] = params;
        if (T.skill_practice_log.some(r => r.user_id === user && r.attempt_key === key)) return { rows: [] }; // ON CONFLICT DO NOTHING
        T.skill_practice_log.push({ id: nextLogId++, user_id: user, attempt_key: key, word_id: wordId, skill, exercise_type: exType, answer_correct: ok, response_time_ms: rt, session_id: sid, source, attempted_at: NOW.toISOString() });
        return { rows: [{ id: nextLogId }] };
      }
      if (target === 'word_skill_stats') {
        const [user, wordId, skill, ok] = params;
        let r = T.word_skill_stats.find(x => x.user_id === user && x.word_id === wordId && x.skill === skill);
        if (!r) { r = { user_id: user, word_id: wordId, skill, attempts: 0, correct: 0, w_attempts: 0, w_correct: 0 }; T.word_skill_stats.push(r); }
        r.attempts += 1; r.correct += ok; r.w_attempts += 1; r.w_correct += ok;
        return { rows: [] };
      }
    }
    // ── các SELECT mà getStudySession (adaptive) phát ra: mô phỏng NGỮ NGHĨA bằng JS (KHÔNG chạy SQL thật) ──
    if (/SELECT DISTINCT ON \(word_id\) word_id, exercise_type/.test(s)) {
      const ids = params[1], best = new Map(), lim = sinceOf(60);
      const push = (r, ts) => { if (!ids.includes(r.word_id) || !r.exercise_type || new Date(ts).getTime() < lim) return; const b = best.get(r.word_id); if (!b || new Date(ts) > new Date(b.ts)) best.set(r.word_id, { ts, exercise_type: r.exercise_type }); };
      T.review_history.filter(r => r.user_id === params[0] && r.exposure !== 'intro').forEach(r => push(r, r.reviewed_at));
      T.skill_practice_log.filter(r => r.user_id === params[0]).forEach(r => push(r, r.attempted_at));
      return { rows: [...best.entries()].map(([word_id, b]) => ({ word_id, exercise_type: b.exercise_type })) };
    }
    if (/GROUP BY 1, 2 ORDER BY n DESC/.test(s)) { // getTypeBreakdown
      const lim = sinceOf(Number(params[1])), shown = params[2] || [], g = new Map();
      const add = (et, ok, kind) => { const k = et + '|' + kind; const x = g.get(k) || { exercise_type: et, kind, n: 0, correct: 0 }; x.n++; x.correct += ok ? 1 : 0; g.set(k, x); };
      T.review_history.filter(r => r.user_id === params[0] && r.exercise_type && new Date(r.reviewed_at).getTime() >= lim && r.exposure !== 'intro').forEach(r => add(r.exercise_type, r.answer_correct, 'fsrs'));
      T.skill_practice_log.filter(r => r.user_id === params[0] && new Date(r.attempted_at).getTime() >= lim && !shown.includes(r.source || 'practice')).forEach(r => add(r.exercise_type, r.answer_correct, 'practice'));
      return { rows: [...g.values()].sort((a, b) => b.n - a.n) };
    }
    if (/FROM word_skill_stats WHERE user_id = \$1 AND word_id = ANY/.test(s)) return { rows: T.word_skill_stats.filter(r => r.user_id === params[0] && params[1].includes(r.word_id)) };
    if (/wrong_answer IS NOT NULL/.test(s)) return { rows: [] }; // getConfusionsForWords: không có từ hay nhầm
    return { rows: [] };
  }
  const client = { query, release() {} };
  return { T, stmts, violations, failOn, pool: { connect: async () => client }, client,
    wordIdFor: async (_c, hz) => { const w = T.vocab_words.find(x => x.hz === hz); return w ? w.id : null; } };
}

// ── Nạp mã THẬT với lib/db.js (cần pg), scheduler/optimizer (cần ts-fsrs) được thay bằng stub ──────────────────────────
function loadReal(fake) {
  const mk = (rel, exp) => { const p = path.join(ROOT, rel); const m = new Module(p); m.filename = p; m.loaded = true; m.exports = exp; require.cache[p] = m; };
  const dueRows = () => fake.T.fsrs_cards.filter(c => c.reps > 0 && new Date(c.due).getTime() <= NOW.getTime() + 86400000).map(c => ({ ...fake.T.vocab_words.find(w => w.id === c.word_id), ...c, resolved_word_id: c.word_id }));
  const newRows = () => fake.T.vocab_words.filter(w => !fake.T.fsrs_cards.some(c => c.word_id === w.id)).map(w => ({ ...w, resolved_word_id: w.id }));
  mk('lib/db.js', {
    getPool: () => fake.pool, resolveCanonicalWordId: fake.wordIdFor, ensureVocabTable: async () => {}, ensureFsrsTables: async () => {},
    vnDateKey: () => '2026-10-29', getVocabCounts: async () => ({ 1: 3, 2: 3 }), getBookDefs: async () => [],
    getTodayStudyCounts: async () => ({ newToday: 0, reviewToday: 0 }), countDueFsrsCards: async () => dueRows().length,
    getDueFsrsCards: async (_u, lim) => dueRows().slice(0, lim), getNewWordsByLessonOrder: async (_u, _o, lim) => newRows().slice(0, lim),
    countNewWordsInLessons: async () => newRows().length, getWeakFsrsCards: async () => [], getLearnedFsrsCards: async () => [],
    getLessonsByWordIds: async (ids) => { const o = {}; for (const id of ids) { const w = fake.T.vocab_words.find(x => x.id === id); if (w) o[id] = [w.l]; } return o; },
    reviewFsrsCard: async () => { throw new Error('KHÔNG được gọi reviewFsrsCard trong test này'); }, previewAutoRating: async () => { throw new Error('KHÔNG được gọi previewAutoRating'); },
  });
  mk('lib/fsrs/scheduler.js', { ALLOWED_RETENTIONS: [0.8, 0.85, 0.9, 0.95], isAllowedRetention: () => true, DEFAULT_RETENTION: 0.9 });
  mk('lib/fsrs/optimizer.js', { getUserActiveWeights: async () => null });
  mk('lib/fsrs/analytics.js', { recordStudyActivity: async () => { throw new Error('KHÔNG được ghi study_sessions'); } });
  for (const rel of ['lib/skill-store.js', 'lib/fsrs/reviewService.js']) delete require.cache[require.resolve(path.join(ROOT, rel))];
  return { store: require(path.join(ROOT, 'lib/skill-store.js')), service: require(path.join(ROOT, 'lib/fsrs/reviewService.js')) };
}
const practice = (over) => ({ userId: 'u1', hz: '提高', exerciseType: 'practice-recall-typed', answerCorrect: true, selectedAnswer: '提高', responseTimeMs: 1500, attemptKey: 'k-' + Math.random().toString(36).slice(2, 12), sessionId: 'sess-audit-1', source: 'extra', ...over });
const writesByTable = (stmts) => { const o = {}; for (const s of stmts) if (['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'].includes(s.verb)) { const t = (s.sql.match(/^(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE(?: TABLE)?)\s+([a-z_]+)/i) || [])[1]; o[t] = (o[t] || 0) + 1; } return o; };

(async () => {
  // ═════════════ [A1] ĐỐI CHỨNG DƯƠNG: bộ phát hiện phải bắt được một lượt ôn FSRS chính thức ═════════════
  section('[A1] Đối chứng dương — bộ phát hiện bắt được ghi vào FSRS');
  await test('Giả lập 1 lượt ôn chính thức (INSERT review_history + UPDATE fsrs_cards) → hash dữ liệu ĐỔI và có vi phạm', async () => {
    const f = makeFakeDb(); const before = hashOf(f.T);
    await f.client.query('INSERT INTO review_history (user_id, hz, l, rating) VALUES ($1,$2,$3,$4)', ['u1', '提高', 1, 3]);
    await f.client.query('UPDATE fsrs_cards SET due = $1, stability = $2, reps = reps + 1 WHERE user_id = $3 AND hz = $4', [days(5), 20, 'u1', '提高']);
    assert.notStrictEqual(hashOf(f.T), before, 'hash phải đổi — nếu không, bộ so sánh không có giá trị');
    assert.deepStrictEqual(f.violations.map(v => v.target).sort(), ['fsrs_cards', 'review_history']);
  });

  // ═════════════ [A2] Luyện bổ sung (mã THẬT recordPractice) ═════════════
  section('[A2] Luyện bổ sung (kể cả thăm dò tự gõ) — dữ liệu FSRS trước/sau');
  await test('30 lượt luyện bổ sung đủ loại (tự gõ đúng/sai, trắc nghiệm, nghe, câu; extra/check/redo/drill; trùng khoá; bỏ trống; nhãn FSRS; từ lạ): hash FSRS KHÔNG đổi, 0 vi phạm', async () => {
    const f = makeFakeDb(); const { store } = loadReal(f); const before = hashOf(f.T); const snapBefore = JSON.stringify(FSRS_TABLES.map(t => f.T[t]));
    const results = [];
    const types = ['practice-recall-typed', 'practice-recall', 'practice-recognition', 'practice-listening', 'practice-context', 'practice-pinyin-typed'];
    const sources = ['extra', 'practice', 'check', 'redo', 'drill'];
    for (let i = 0; i < 24; i++) results.push(await store.recordPractice(practice({ hz: f.T.vocab_words[i % 6].hz, exerciseType: types[i % types.length], source: sources[i % sources.length], answerCorrect: i % 3 !== 0, attemptKey: 'audit-key-' + i })));
    results.push(await store.recordPractice(practice({ attemptKey: 'audit-key-0' })));                                   // trùng khoá
    results.push(await store.recordPractice(practice({ selectedAnswer: '⨯ (bỏ trống) ⨯', attemptKey: 'audit-blank-1' }))); // bỏ trống
    results.push(await store.recordPractice(practice({ exerciseType: 'review-vi2hz', attemptKey: 'audit-fsrs-1' })));     // nhãn FSRS → từ chối
    results.push(await store.recordPractice(practice({ exerciseType: 'quiz-vi2hz', attemptKey: 'audit-fsrs-2' })));
    results.push(await store.recordPractice(practice({ hz: '不存在', attemptKey: 'audit-miss-1' })));                    // từ không tồn tại → rollback
    results.push(await store.recordPractice(practice({ attemptKey: 'short' })));                                          // khoá quá ngắn
    assert.strictEqual(f.violations.length, 0, 'vi phạm: ' + JSON.stringify(f.violations));
    assert.strictEqual(hashOf(f.T), before, 'dữ liệu FSRS (fsrs_cards/review_history/user_settings/vocab_words) đã bị đổi');
    assert.strictEqual(JSON.stringify(FSRS_TABLES.map(t => f.T[t])), snapBefore);
    const w = writesByTable(f.stmts);
    assert.deepStrictEqual(Object.keys(w).sort(), ['skill_practice_log', 'word_skill_stats'], 'chỉ 2 bảng kỹ năng được ghi, thực tế: ' + JSON.stringify(w));
    // chỉ số 24 trùng khoá · 25 bỏ trống · 26,27 nhãn FSRS · 28 từ lạ · 29 khoá quá ngắn
    assert.deepStrictEqual(results.map((r, i) => (r.ok === false ? i : null)).filter(i => i !== null), [26, 27, 28, 29], 'đúng 4 lượt bị từ chối: 2 nhãn FSRS, 1 từ lạ, 1 khoá ngắn');
    assert.strictEqual(results[24].duplicate, true);
    assert.strictEqual(results[25].recorded, false);
    assert.ok(f.stmts.some(s => s.sql === 'ROLLBACK'), 'từ không tồn tại phải ROLLBACK');
  });
  await test('Lượt thăm dò tự gõ (practice-recall-typed) ghi ĐÚNG vào skill_practice_log + word_skill_stats[recall]; check/redo chỉ ghi nhật ký, không cộng điểm', async () => {
    const f = makeFakeDb(); const { store } = loadReal(f);
    const a = await store.recordPractice(practice({ hz: '学习', answerCorrect: false, selectedAnswer: '学校', source: 'extra', attemptKey: 'probe-key-1' }));
    assert.strictEqual(a.recorded, true); assert.strictEqual(a.skill, 'recall'); assert.strictEqual(a.countedInSkill, true);
    const row = f.T.skill_practice_log.find(r => r.attempt_key === 'probe-key-1');
    assert.ok(row && row.exercise_type === 'practice-recall-typed' && row.answer_correct === false && row.word_id === 2);
    assert.strictEqual(f.T.word_skill_stats.find(r => r.word_id === 2 && r.skill === 'recall').attempts, 1);
    const b = await store.recordPractice(practice({ hz: '朋友', source: 'check', attemptKey: 'probe-key-2' }));
    assert.strictEqual(b.countedInSkill, false);
    assert.strictEqual(f.T.word_skill_stats.find(r => r.word_id === 3 && r.skill === 'recall'), undefined, 'check không được cộng điểm kỹ năng');
  });
  await test('Lỗi giữa chừng (INSERT word_skill_stats ném lỗi): ROLLBACK, FSRS vẫn nguyên, lỗi được ném ra (không nuốt)', async () => {
    const f = makeFakeDb(); const { store } = loadReal(f); const before = hashOf(f.T);
    f.failOn.push(/^INSERT INTO word_skill_stats/);
    await assert.rejects(() => store.recordPractice(practice({ attemptKey: 'boom-key-1', source: 'extra' })), /sự cố giả lập/);
    assert.ok(f.stmts.some(s => s.sql === 'ROLLBACK'));
    assert.strictEqual(hashOf(f.T), before); assert.strictEqual(f.violations.length, 0);
  });

  // ═════════════ [A3] getStudySession: adaptive vs không adaptive (mã THẬT) ═════════════
  section('[A3] Phiên học: ?adaptive=1 so với V126 — thẻ FSRS nguyên vẹn, truy vấn thêm chỉ ĐỌC');
  await test('Cùng dữ liệu: session/thẻ/thứ tự/FSRS fields giống hệt; chỉ thêm `learner` (cấp phiên) và `lastExerciseType` (cấp thẻ)', async () => {
    const f = makeFakeDb(); const { service } = loadReal(f);
    f.T.skill_practice_log.push({ id: 7, user_id: 'u1', attempt_key: 'x1', word_id: 1, skill: 'recall', exercise_type: 'practice-recall-typed', answer_correct: true, attempted_at: days(-1), source: 'extra' });
    const before = hashOf(f.T);
    const base = await service.getStudySession('u1', {}), nBase = f.stmts.length;
    const adp = await service.getStudySession('u1', {}, { adaptive: true });
    assert.strictEqual(hashOf(f.T), before, 'FSRS đổi sau getStudySession');
    assert.strictEqual(f.violations.length, 0); assert.deepStrictEqual(writesByTable(f.stmts), {}, 'getStudySession không được ghi gì');
    assert.strictEqual(base.learner, undefined, 'không adaptive → không có learner');
    assert.ok(adp.learner && adp.learner.v === 1 && adp.learner.skills.recall, 'adaptive → có learner');
    assert.strictEqual(adp.session.length, base.session.length); assert.ok(base.session.length >= 4, 'cần cả thẻ ôn lẫn từ mới');
    const strip = (it) => { const c = JSON.parse(JSON.stringify(it)); delete c.lastExerciseType; return c; };
    assert.deepStrictEqual(adp.session.map(strip), base.session.map(strip), 'khác nhau ngoài field mới');
    for (const k of ['reviewCount', 'newCount', 'currentLesson', 'totalDue', 'blockedByBacklog', 'scopeLessons']) assert.deepStrictEqual(adp[k], base[k], k);
    // Thẻ ôn: mọi trường FSRS bằng đúng dữ liệu gốc
    for (const it of adp.session.filter(x => x.type === 'review')) {
      const c = SEED.fsrs_cards.find(x => x.hz === it.word.hz);
      for (const k of ['state', 'due', 'stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'reps', 'lapses', 'last_review', 'version']) assert.strictEqual(it.word[k], c[k], it.word.hz + '.' + k);
    }
    const w1 = adp.session.find(x => x.word.hz === '提高'); assert.strictEqual(w1.lastExerciseType, 'practice-recall-typed', 'dạng gần nhất của 提高 = lượt luyện hôm qua');
    const w4 = adp.session.find(x => x.word.hz === '学校'); assert.strictEqual(w4.lastExerciseType, undefined, 'dòng intro bị bỏ → không có dạng gần nhất');
  });
  await test('Truy vấn thêm khi adaptive: đúng 3 SELECT (lastTypes + breakdown 90d + 14d), 0 ghi dữ liệu; không adaptive thì 0 truy vấn thêm', async () => {
    const f = makeFakeDb(); const { service } = loadReal(f);
    f.stmts.length = 0; await service.getStudySession('u1', {}); const dml = (a) => a.filter(s => ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(s.verb));
    const base = dml(f.stmts).length; f.stmts.length = 0;
    await service.getStudySession('u1', {}, { adaptive: true }); const adaptive = dml(f.stmts);
    assert.strictEqual(adaptive.length - base, 3, 'số truy vấn thêm');
    assert.ok(adaptive.every(s => s.verb === 'SELECT'), 'mọi truy vấn phải là SELECT');
    assert.strictEqual(adaptive.filter(s => /DISTINCT ON \(word_id\)/.test(s.sql)).length, 1);
    assert.strictEqual(adaptive.filter(s => /GROUP BY 1, 2/.test(s.sql)).length, 2);
  });
  await test('Sự cố ở phần phụ (lastTypes/breakdown ném lỗi): phiên học vẫn trả, thẻ FSRS giống hệt không adaptive, không có `learner`', async () => {
    const f = makeFakeDb(); const { service } = loadReal(f); const base = await service.getStudySession('u1', {});
    f.failOn.push(/DISTINCT ON \(word_id\)/, /GROUP BY 1, 2/);
    const adp = await service.getStudySession('u1', {}, { adaptive: true });
    assert.strictEqual(adp.learner, undefined); assert.deepStrictEqual(adp.session, base.session);
  });
  await test('Chỉ cửa sổ 14 ngày lỗi → vẫn dùng cửa sổ 90 ngày; chỉ cửa sổ 90 ngày lỗi → không gửi learner (chạy như người mới)', async () => {
    const f = makeFakeDb(); const { service } = loadReal(f);
    f.T.skill_practice_log.push({ id: 8, user_id: 'u1', attempt_key: 'x2', word_id: 1, skill: 'recall', exercise_type: 'practice-recognition', answer_correct: true, attempted_at: days(-1), source: 'practice' });
    const origQuery = f.client.query; let call = 0;
    f.client.query = async (sql, p) => { if (/GROUP BY 1, 2/.test(sql)) { call++; if (p[1] === '14' && f.mode === '14') throw new Error('14d lỗi'); if (p[1] === '90' && f.mode === '90') throw new Error('90d lỗi'); } return origQuery(sql, p); };
    f.mode = '14'; const a = await service.getStudySession('u1', {}, { adaptive: true }); assert.ok(a.learner && a.learner.skills.recognition.c.n >= 1 && a.learner.skills.recognition.rc.n === 0);
    f.mode = '90'; const b = await service.getStudySession('u1', {}, { adaptive: true }); assert.strictEqual(b.learner, undefined);
  });
  await test('Người mới (chưa có hồ sơ/lịch sử): phiên trả bình thường; learner = { v:1, skills:{} } (hoặc không có) và không lỗi', async () => {
    const f = makeFakeDb(); f.T.review_history.length = 0; f.T.skill_practice_log.length = 0; f.T.word_skill_stats.length = 0; const { service } = loadReal(f);
    const adp = await service.getStudySession('u1', {}, { adaptive: true });
    assert.ok(adp.session.length > 0); assert.deepStrictEqual(adp.learner, { v: 1, skills: {} });
    assert.ok(adp.session.every(it => it.lastExerciseType === undefined));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
