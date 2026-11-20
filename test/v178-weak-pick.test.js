#!/usr/bin/env node
// test/v178-weak-pick.test.js — V178: "từ hay sai" trong luyện bổ sung bớt lặp lại.
//  Trước: xếp STRICT theo độ yếu → buổi nào cũng đúng nhóm từ yếu nhất. Nay: lấy mẫu có trọng số theo độ yếu + nghỉ mềm cho từ vừa luyện.
//  Chạy hàm THẬT (lib/practice-pick.js, và getPracticeWords thật với database giả); KHÔNG thay cho thử trên Postgres thật.
const assert = require('assert'); const fs = require('fs'); const path = require('path'); const Module = require('module');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const PP = require('../lib/practice-pick');

// Bộ sinh số ngẫu nhiên có hạt giống (để kết quả thống kê lặp lại được).
function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const NOW = Date.parse('2026-11-20T12:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3600000).toISOString();
const row = (id, score, lastH, extra) => Object.assign({ word_id: id, hz: 'w' + id, py: '', vi: '', l: 1, skill: 'recognition', attempts: 5, score, last_at: lastH == null ? null : hoursAgo(lastH), priority: 0 }, extra);
function freq(rows, n, trials, limit, seed, over) {
  const rand = prng(seed); const c = {};
  for (let t = 0; t < trials; t++) for (const r of PP.pickWeakWords(rows, Object.assign({ limit, rand, now: NOW }, over))) c[r.word_id] = (c[r.word_id] || 0) + 1;
  return c;
}

const tests = []; const test = (n, f) => tests.push([n, f]);

test('trọng số: điểm càng thấp càng cao, luôn > 0; điểm không có (null) coi như sát ngưỡng', () => {
  assert.ok(PP.weakWeight(0) > PP.weakWeight(0.3) && PP.weakWeight(0.3) > PP.weakWeight(0.55));
  for (const s of [0, 0.3, 0.59, 0.6, 0.9, null, undefined, NaN]) assert.ok(PP.weakWeight(s) > 0, String(s));
  assert.strictEqual(PP.weakWeight(null), PP.weakWeight(0.6));
});
test('KHÔNG còn "top-N cố định": từ yếu nhất hay được chọn nhất nhưng không phải lúc nào cũng có mặt; từ sát ngưỡng vẫn có lúc được chọn', () => {
  const rows = Array.from({ length: 10 }, (_, i) => row(i + 1, 0.05 + i * 0.05, null)); // 10 từ yếu, id 1 yếu nhất
  const c = freq(rows, 10, 4000, 3, 7); const f = (id) => (c[id] || 0) / 4000;
  assert.ok(f(1) > f(10), 'từ yếu nhất vẫn được ưu tiên hơn từ sát ngưỡng');
  assert.ok(f(1) < 0.95, 'từ yếu nhất KHÔNG còn mặt ở mọi buổi (cách cũ: 100%) — thực tế ' + f(1).toFixed(2));
  assert.ok(f(10) > 0.02, 'từ yếu thứ 10 trước đây KHÔNG BAO GIỜ được chọn (limit 3) — nay có lúc được chọn: ' + f(10).toFixed(3));
  for (let id = 1; id <= 10; id++) assert.ok((c[id] || 0) > 0, 'từ ' + id + ' phải có lúc xuất hiện');
});
test('nghỉ mềm: từ vừa luyện (<36 giờ) rất ít được chọn khi còn từ khác đã nghỉ đủ', () => {
  const rows = [...[1, 2, 3, 4, 5].map((i) => row(i, 0.3, 80)), ...[6, 7, 8, 9, 10].map((i) => row(i, 0.3, 5))]; // 5 từ nghỉ đủ, 5 từ mới luyện 5 giờ trước
  const c = freq(rows, 10, 3000, 5, 11); const fresh = [1, 2, 3, 4, 5].reduce((a, i) => a + (c[i] || 0), 0), cooled = [6, 7, 8, 9, 10].reduce((a, i) => a + (c[i] || 0), 0);
  assert.ok(fresh / (fresh + cooled) > 0.95, 'từ đã nghỉ đủ chiếm > 95% lượt chọn, thực tế ' + (fresh / (fresh + cooled)).toFixed(3));
});
test('nghỉ mềm KHÔNG loại hẳn: thiếu từ đã nghỉ thì vẫn lấy từ vừa luyện cho đủ số câu', () => {
  const rows = [row(1, 0.3, 80), row(2, 0.3, 80), ...[3, 4, 5, 6, 7, 8].map((i) => row(i, 0.3, 2))];
  const rand = prng(3); let withBothFresh = 0; const T = 1000;
  for (let t = 0; t < T; t++) { const r = PP.pickWeakWords(rows, { limit: 5, rand, now: NOW }); assert.strictEqual(r.length, 5, 'luôn đủ 5 câu'); const ids = r.map((x) => x.word_id); if (ids.includes(1) && ids.includes(2)) withBothFresh++; }
  assert.ok(withBothFresh / T > 0.9, '2 từ đã nghỉ đủ gần như luôn có mặt: ' + withBothFresh / T);
});
test('biên của thời gian nghỉ: 35 giờ vẫn nghỉ, 37 giờ hết nghỉ; thiếu/sai ngày hoặc giờ ở tương lai → coi như không nghỉ', () => {
  const cd = (v) => PP.isCoolingDown(v, NOW, 36);
  assert.strictEqual(cd(hoursAgo(35)), true); assert.strictEqual(cd(hoursAgo(37)), false); assert.strictEqual(cd(hoursAgo(0.01)), true);
  assert.strictEqual(cd(null), false); assert.strictEqual(cd(undefined), false); assert.strictEqual(cd('không phải ngày'), false); assert.strictEqual(cd(hoursAgo(-5)), false, 'giờ ở tương lai (lệch đồng hồ)');
  assert.strictEqual(cd(new Date(NOW - 3600000)), true, 'nhận cả đối tượng Date (driver pg trả Date)');
});
test('mỗi từ đúng 1 dòng và là dòng ĐẦU của từ (kỹ năng yếu nhất theo thứ tự SQL); không sửa dữ liệu đầu vào; giới hạn số lượng', () => {
  const rows = [row(1, 0.1, null, { skill: 'recall' }), row(1, 0.4, null, { skill: 'listening' }), row(2, 0.2, null), row(3, 0.3, null)];
  const snapshot = JSON.stringify(rows);
  for (let s = 1; s <= 30; s++) { const r = PP.pickWeakWords(rows, { limit: 10, rand: prng(s), now: NOW }); assert.strictEqual(r.length, 3); assert.strictEqual(new Set(r.map((x) => x.word_id)).size, 3); assert.strictEqual(r.find((x) => x.word_id === 1).skill, 'recall'); }
  assert.strictEqual(JSON.stringify(rows), snapshot, 'không sửa đầu vào');
  assert.strictEqual(PP.pickWeakWords(rows, { limit: 2, now: NOW }).length, 2);
});
test('trường hợp biên: rỗng / không phải mảng / limit 0 → []; rand trả 0 không gây lỗi', () => {
  assert.deepStrictEqual(PP.pickWeakWords([], { limit: 5 }), []); assert.deepStrictEqual(PP.pickWeakWords(null, { limit: 5 }), []); assert.deepStrictEqual(PP.pickWeakWords([row(1, 0.1)], { limit: 0 }), []);
  const r = PP.pickWeakWords([row(1, 0.1), row(2, 0.2), row(3, 0.3)], { limit: 2, rand: () => 0, now: NOW }); assert.strictEqual(r.length, 2);
});

// ---- Nối dây: getPracticeWords THẬT với database giả
function loadSkillStore() {
  for (const k of Object.keys(require.cache)) if (k.startsWith(path.join(ROOT, 'lib'))) delete require.cache[k];
  const orig = Module._load;
  const stub = () => new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : (k === Symbol.toPrimitive ? () => '' : stub())), apply: () => stub(), construct: () => stub() });
  Module._load = function (req) {
    try { return orig.apply(this, arguments); } catch (e) {
      if (e && e.code === 'MODULE_NOT_FOUND' && !req.startsWith('.') && !req.startsWith('/')) {
        if (req === 'pg') return { Pool: class { on() {} } };
        if (req === 'ts-fsrs') return new Proxy({ generatorParameters: () => ({ w: new Array(21).fill(0.5) }) }, { get: (t, k) => (k in t ? t[k] : stub()) });
        return stub();
      } throw e;
    }
  };
  try { const db = require('../lib/db'); const store = require('../lib/skill-store'); return { db, store }; } finally { Module._load = orig; }
}
function withFakeDb(rows) {
  const { db, store } = loadSkillStore(); const seen = [];
  const client = { query: async (sql, params) => { const t = String(sql); if (/^\s*WITH known AS/.test(t)) { seen.push({ sql: t, params }); return { rows: rows.map((r) => Object.assign({}, r)) }; } if (/^\s*SELECT COUNT\(\*\)/.test(t)) return { rows: [{ c: 5, count: 5 }], rowCount: 1 }; return { rows: [], rowCount: 0 }; }, release() {} };
  db.getPool = () => ({ connect: async () => client });
  return { store, seen };
}
const fixtureRows = [row(1, 0.1, 100, { skill: 'recall' }), row(1, 0.5, 100, { skill: 'listening' }), ...Array.from({ length: 29 }, (_, i) => row(i + 2, 0.12 + i * 0.015, i % 3 ? 100 : 4))];

test('THẬT: weakOnly=1 → cửa sổ ứng viên rộng (≥60 và 10×limit), kết quả ≤ limit, mỗi từ 1 dòng, KHÔNG lộ last_at, SQL có last_at', async () => {
  const { store, seen } = withFakeDb(fixtureRows);
  const out = await store.getPracticeWords('u1', { skill: 'mixed', limit: 6, allowedSkills: ['recall', 'listening', 'pinyin', 'context'], weakOnly: true });
  assert.strictEqual(seen.length, 1); assert.strictEqual(seen[0].params[4], 60, 'max(6*10, 60)'); assert.strictEqual(seen[0].params[5], true);
  assert.ok(/s\.last_attempt_at AS last_at/.test(seen[0].sql) && /SELECT word_id, hz, py, vi, l, skill, attempts, score, last_at,/.test(seen[0].sql));
  assert.ok(out.length <= 6 && out.length > 0); assert.strictEqual(new Set(out.map((x) => x.word_id)).size, out.length); assert.ok(out.every((x) => !('last_at' in x) && x.hz && x.skill));
  const { store: s2, seen: seen2 } = withFakeDb(fixtureRows); await s2.getPracticeWords('u1', { skill: 'mixed', limit: 30, allowedSkills: ['recall'], weakOnly: true }); assert.strictEqual(seen2[0].params[4], 300);
});
test('THẬT: weakOnly=1 qua nhiều lần gọi cho ra các nhóm từ KHÁC NHAU (không còn cố định theo top độ yếu)', async () => {
  const { store } = withFakeDb(fixtureRows); const sets = new Set();
  for (let i = 0; i < 25; i++) { const out = await store.getPracticeWords('u1', { skill: 'mixed', limit: 5, allowedSkills: ['recall', 'listening'], weakOnly: true }); sets.add(out.map((x) => x.word_id).sort((a, b) => a - b).join(',')); }
  assert.ok(sets.size >= 8, 'chỉ ' + sets.size + ' nhóm khác nhau trong 25 lần (cách cũ: luôn 1 nhóm)');
});
test('THẬT: weakOnly=0 (Luyện theo kỹ năng, từ thiếu dữ liệu, thăm dò…) GIỮ NGUYÊN: lim*3 dòng, thứ tự SQL, mỗi từ 1 dòng, không lộ last_at', async () => {
  const { store, seen } = withFakeDb(fixtureRows);
  const out = await store.getPracticeWords('u1', { skill: 'mixed', limit: 4, allowedSkills: ['recall', 'listening'], weakOnly: false });
  assert.strictEqual(seen[0].params[4], 12); assert.strictEqual(seen[0].params[5], false);
  assert.deepStrictEqual(out.map((x) => x.word_id), [1, 2, 3, 4], 'đúng thứ tự SQL, từ 1 chỉ 1 dòng (dòng đầu = recall)'); assert.strictEqual(out[0].skill, 'recall'); assert.ok(out.every((x) => !('last_at' in x)));
});
test('nối dây tĩnh: ORDER BY của SQL giữ nguyên; route và phía người học không đổi (vẫn weakOnly=1, chỉ ĐỌC)', () => {
  const s = read('lib/skill-store.js');
  assert.ok(s.includes('ORDER BY priority ASC, score ASC NULLS LAST, attempts ASC, random()'));
  assert.ok(/pickWeakWords\(r\.rows, \{ limit: lim \}\)/.test(s) && /require\('\.\/practice-pick'\)/.test(s));
  assert.ok(read('js/review.js').includes('/api/skills/practice-words?skill=mixed&weakOnly=1&limit=${limit}'));
  assert.ok(read('api/index.js').includes("weakOnly: req.query.weakOnly === '1'"));
});

(async () => {
  let passed = 0, failed = 0;
  for (const [n, f] of tests) { try { await f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + (e && e.message)); } }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
