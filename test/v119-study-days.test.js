#!/usr/bin/env node
// test/v119-study-days.test.js — V119.4: đếm SỐ NGÀY ĐÃ HỌC và SỐ NGÀY TỪ KHI TẠO TÀI KHOẢN (theo ngày lịch giờ Việt Nam).
// Phần thuần chạy thật; SQL/hàm DB được TRÍCH từ lib/fsrs/analytics.js chạy với client giả; route trích từ api/index.js chạy trong vm.
const assert = require('assert'); const fs = require('fs'); const path = require('path'); const vm = require('vm');
const SD = require('../lib/study-days');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let passed = 0, failed = 0; const T = [];
const test = (n, f) => T.push([n, f]);
const ms = iso => Date.parse(iso);
// So sánh qua JSON: đối tượng tạo trong vm có prototype khác realm nên deepStrictEqual trực tiếp sẽ báo lệch dù cùng cấu trúc.
const deq = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));

// ───────── phần thuần ─────────
test('vnDateKey: tính theo giờ Việt Nam (UTC+7) — 17:00 UTC đã là ngày hôm sau ở VN; đầu vào lỗi → null', () => {
  assert.strictEqual(SD.vnDateKey(ms('2026-10-22T16:59:59Z')), '2026-10-22');
  assert.strictEqual(SD.vnDateKey(ms('2026-10-22T17:00:00Z')), '2026-10-23');
  assert.strictEqual(SD.vnDateKey('2026-12-31T20:00:00Z'), '2027-01-01'); assert.strictEqual(SD.vnDateKey(new Date('2026-01-01T00:00:00Z')), '2026-01-01');
  for (const bad of ['abc', NaN, undefined, null, '', {}]) assert.strictEqual(SD.vnDateKey(bad), null, String(bad));
  assert.strictEqual(SD.accountAge(null, ms('2026-10-23T05:00:00Z')), null, 'createdAt = null (dữ liệu cũ) không bị hiểu thành năm 1970');
});
test('daysBetweenKeys: qua tháng/năm/năm nhuận, 0 nếu cùng ngày, âm nếu ngược; thiếu → null', () => {
  assert.strictEqual(SD.daysBetweenKeys('2026-10-23', '2026-10-23'), 0); assert.strictEqual(SD.daysBetweenKeys('2026-10-23', '2026-10-24'), 1);
  assert.strictEqual(SD.daysBetweenKeys('2028-02-28', '2028-03-01'), 2, 'năm nhuận'); assert.strictEqual(SD.daysBetweenKeys('2027-02-28', '2027-03-01'), 1);
  assert.strictEqual(SD.daysBetweenKeys('2025-12-31', '2026-01-01'), 1); assert.strictEqual(SD.daysBetweenKeys('2026-01-01', '2026-12-31'), 364); assert.strictEqual(SD.daysBetweenKeys('2026-10-24', '2026-10-23'), -1);
  assert.strictEqual(SD.daysBetweenKeys(null, '2026-10-23'), null); assert.strictEqual(SD.daysBetweenKeys('x', '2026-10-23'), null);
});
test('accountAge: tạo hôm nay = 0; tạo hôm qua = 1; tính theo NGÀY LỊCH VN (23:50 hôm qua → 00:10 hôm nay = 1 ngày dù chỉ cách 20 phút); không có mốc tạo → null', () => {
  const now = ms('2026-10-23T05:00:00Z'); // 12:00 ngày 23/10 VN
  deq(SD.accountAge(ms('2026-10-23T00:30:00Z'), now), { accountDays: 0, createdDate: '2026-10-23' });
  assert.strictEqual(SD.accountAge(ms('2026-10-22T05:00:00Z'), now).accountDays, 1); assert.strictEqual(SD.accountAge(ms('2026-09-23T05:00:00Z'), now).accountDays, 30);
  assert.strictEqual(SD.accountAge(ms('2026-10-22T16:50:00Z'), ms('2026-10-22T17:10:00Z')).accountDays, 1, 'qua nửa đêm VN');
  assert.strictEqual(SD.accountAge(ms('2026-10-22T16:00:00Z'), ms('2026-10-22T16:50:00Z')).accountDays, 0);
  assert.strictEqual(SD.accountAge(ms('2026-10-30T05:00:00Z'), now).accountDays, 0, 'mốc tạo ở tương lai (lệch đồng hồ) không ra số âm');
  assert.strictEqual(SD.accountAge(undefined, now), null); assert.strictEqual(SD.accountAge('rác', now), null);
});
test('summarize: số ngày học, số ngày tạo, tỉ lệ = học/(ngày tạo+1) làm tròn, tối đa 100%', () => {
  const now = ms('2026-10-23T05:00:00Z');
  const s = SD.summarize({ studyDays: 3, firstStudyDay: '2026-10-20', lastStudyDay: '2026-10-23' }, ms('2026-10-19T20:00:00Z'), now); // tạo 20/10 VN
  deq(s, { studyDays: 3, firstStudyDay: '2026-10-20', lastStudyDay: '2026-10-23', accountDays: 3, createdDate: '2026-10-20', totalDays: 4, studyRatePct: 75 });
  assert.strictEqual(SD.summarize({ studyDays: 1 }, ms('2026-10-23T01:00:00Z'), now).studyRatePct, 100, 'tạo hôm nay, đã học hôm nay');
  assert.strictEqual(SD.summarize({ studyDays: 1 }, ms('2026-07-23T05:00:00Z'), now).studyRatePct, 1, '1/93 ≈ 1%');
});
test('summarize: dữ liệu lệch (học nhiều ngày hơn tuổi tài khoản) không vượt 100%; thiếu dữ liệu → 0 ngày; tài khoản cũ không có createdAt → ẩn số ngày tạo/tỉ lệ nhưng vẫn có số ngày học', () => {
  const now = ms('2026-10-23T05:00:00Z');
  const over = SD.summarize({ studyDays: 10 }, ms('2026-10-22T05:00:00Z'), now); assert.strictEqual(over.studyRatePct, 100); assert.strictEqual(over.totalDays, 10);
  const none = SD.summarize(null, ms('2026-10-20T05:00:00Z'), now); assert.strictEqual(none.studyDays, 0); assert.strictEqual(none.studyRatePct, 0); assert.strictEqual(none.firstStudyDay, null);
  const old = SD.summarize({ studyDays: 5, lastStudyDay: '2026-10-22' }, undefined, now); assert.strictEqual(old.studyDays, 5); assert.strictEqual(old.accountDays, null); assert.strictEqual(old.createdDate, null); assert.strictEqual(old.studyRatePct, null);
  assert.strictEqual(SD.summarize({ studyDays: '7.9' }, undefined, now).studyDays, 7); assert.strictEqual(SD.summarize({ studyDays: -3 }, undefined, now).studyDays, 0);
});

// ───────── SQL/DB (trích từ lib/fsrs/analytics.js) ─────────
function makeDb(opts = {}) {
  const queries = [];
  const client = { released: false, release() { this.released = true; }, query: async (sql, params) => {
    queries.push({ sql, params });
    if (/to_regclass/.test(sql)) return { rows: [{ ok: opts.hasHistory !== false }] };
    return { rows: opts.rows || [] };
  } };
  const SRC = read('lib/fsrs/analytics.js'); const a = SRC.indexOf('async function hasReviewHistory'), b = SRC.indexOf('// ── Heatmap kiểu GitHub (Phần 12)');
  assert.ok(a > 0 && b > a);
  const ctx = { VN_TZ: 'Asia/Ho_Chi_Minh', Date, getPool: () => ({ connect: async () => client }), ensureAnalyticsTables: async () => { queries.push({ sql: 'ENSURE' }); }, console };
  vm.createContext(ctx); vm.runInContext(SRC.slice(a, b) + '\nthis.__x = { getStudyDays, getStudyDaysForUsers, studyDaysSql };', ctx);
  return { ...ctx.__x, queries, client };
}
test('SQL 1 người: gộp study_sessions (cards_reviewed > 0) + review_history bằng UNION (loại trùng ngày), đếm theo NGÀY giờ VN, trả đếm + ngày đầu/cuối', async () => {
  const d = makeDb({ rows: [{ study_days: 12, first_day: new Date('2026-09-01T00:00:00Z'), last_day: new Date('2026-10-22T00:00:00Z') }] });
  const r = await d.getStudyDays('minh'); deq(r, { studyDays: 12, firstStudyDay: '2026-09-01', lastStudyDay: '2026-10-22' });
  const q = d.queries.find(x => /FROM study_sessions/.test(x.sql || '')); assert.ok(q, 'có truy vấn đếm');
  assert.ok(/FROM study_sessions WHERE user_id = \$1 AND cards_reviewed > 0/.test(q.sql) && /UNION/.test(q.sql) && /FROM review_history WHERE user_id = \$1/.test(q.sql) && !/UNION ALL/.test(q.sql));
  assert.ok(/\(start_time AT TIME ZONE \$2\)::date/.test(q.sql) && /\(reviewed_at AT TIME ZONE \$2\)::date/.test(q.sql)); deq(q.params, ['minh', 'Asia/Ho_Chi_Minh']);
  assert.ok(/COUNT\(\*\)::int AS study_days, MIN\(day\) AS first_day, MAX\(day\) AS last_day/.test(q.sql)); assert.ok(d.client.released, 'trả kết nối');
});
test('chưa từng học (không có dòng) → 0 ngày, ngày đầu/cuối null; chưa có bảng review_history → bỏ nhánh đó, không lỗi', async () => {
  const d = makeDb({ rows: [{ study_days: 0, first_day: null, last_day: null }], hasHistory: false });
  deq(await d.getStudyDays('x'), { studyDays: 0, firstStudyDay: null, lastStudyDay: null });
  assert.ok(!/review_history/.test(d.queries.find(x => /FROM study_sessions/.test(x.sql || '')).sql)); deq(await makeDb({ rows: [] }).getStudyDays('x'), { studyDays: 0, firstStudyDay: null, lastStudyDay: null });
});
test('SQL nhiều người: 1 truy vấn GROUP BY user_id với ANY($1) (không N+1); người chưa học vắng mặt trong kết quả; danh sách rỗng → không truy vấn', async () => {
  const d = makeDb({ rows: [{ user_id: 'a', study_days: 4, first_day: new Date('2026-10-01T00:00:00Z'), last_day: new Date('2026-10-20T00:00:00Z') }, { user_id: 'b', study_days: 1, first_day: new Date('2026-10-22T00:00:00Z'), last_day: new Date('2026-10-22T00:00:00Z') }] });
  const r = await d.getStudyDaysForUsers(['a', 'b', 'c']); deq(Object.keys(r), ['a', 'b']); assert.strictEqual(r.a.studyDays, 4); assert.strictEqual(r.b.lastStudyDay, '2026-10-22');
  const qs = d.queries.filter(x => /FROM study_sessions/.test(x.sql || '')); assert.strictEqual(qs.length, 1); assert.ok(/user_id = ANY\(\$1\)/.test(qs[0].sql) && /GROUP BY user_id/.test(qs[0].sql)); deq(qs[0].params[0], ['a', 'b', 'c']);
  const e = makeDb(); deq(await e.getStudyDaysForUsers([]), {}); assert.strictEqual(e.queries.length, 0); deq(await e.getStudyDaysForUsers(null), {});
});

// ───────── route (trích từ api/index.js) ─────────
const API = read('api/index.js');
function routeSrc(marker) {
  const start = API.indexOf(marker); assert.ok(start > 0, marker);
  const open = API.indexOf('async (req, res) => {', start) + 'async (req, res) '.length; let depth = 0, i = open;
  for (; i < API.length; i++) { if (API[i] === '{') depth++; else if (API[i] === '}') { depth--; if (depth === 0) break; } }
  return '(async (req, res) ' + API.slice(open, i + 1) + ')';
}
function makeApi(role) {
  const created = Date.parse('2026-10-19T20:00:00Z'); // 20/10 giờ VN
  const db = { users: { minh: { username: 'minh', role, createdAt: created }, cu: { username: 'cu', role: 'user' /* không createdAt */ } } };
  const calls = { daysForUsers: [], days: [] };
  const ctx = {
    console, Date, studyDays: SD,
    requireAuth: async (req, res) => ({ username: 'minh', db }),
    requireAdmin: (u, res) => { if (!u || (u.role !== 'admin' && u.role !== 'superadmin')) { res.status(403).json({ ok: false }); return false; } return true; },
    getKnownCountsForUsers: async () => ({ minh: 5 }),
    fsrsAnalytics: {
      getDashboardSummary: async () => ({ today: {}, allTime: { totalReviews: 9 } }), getStreak: async () => ({ currentStreak: 2, longestStreak: 4 }),
      getStudyDays: async (u) => { calls.days.push(u); return { studyDays: 3, firstStudyDay: '2026-10-20', lastStudyDay: '2026-10-23' }; },
      getStudyDaysForUsers: async (keys) => { calls.daysForUsers.push(keys); return { minh: { studyDays: 3, firstStudyDay: '2026-10-20', lastStudyDay: '2026-10-22' } }; },
    },
    fail: (res, e) => res.status(500).json({ ok: false, error: String(e && e.message) }),
  };
  vm.createContext(ctx);
  const mk = (marker) => { const h = vm.runInContext(routeSrc(marker), ctx); return async (query) => { const out = { status: 200, body: null }; await h({ query: query || {}, body: {}, headers: {} }, { status(s) { out.status = s; return this; }, json(b) { out.body = b; return this; }, set() { return this; } }); return out; }; };
  return { dash: mk("app.get('/api/study/dashboard'"), users: mk("app.get('/api/admin/users'"), calls };
}
test('/api/study/dashboard: giữ nguyên các trường cũ (streak…) và thêm days {studyDays, accountDays, createdDate, tỉ lệ…} theo tài khoản đang đăng nhập', async () => {
  const a = makeApi('user'); const r = await a.dash(); assert.ok(r.body.ok); assert.strictEqual(r.body.streak, 2); assert.strictEqual(r.body.longestStreak, 4); assert.strictEqual(r.body.allTime.totalReviews, 9);
  assert.strictEqual(r.body.days.studyDays, 3); assert.strictEqual(r.body.days.createdDate, '2026-10-20'); assert.strictEqual(typeof r.body.days.accountDays, 'number'); assert.ok(r.body.days.accountDays >= 3);
  deq(a.calls.days, ['minh']); assert.strictEqual(r.body.days.lastStudyDay, '2026-10-23');
});
test('/api/admin/users: mỗi tài khoản có studyDays/lastStudyDay/accountDays; lấy bằng 1 lần gọi cho cả danh sách; tài khoản chưa học = 0; tài khoản cũ không có createdAt → accountDays null; user thường bị 403', async () => {
  const a = makeApi('admin'); const r = await a.users(); assert.ok(r.body.ok); assert.strictEqual(a.calls.daysForUsers.length, 1); deq(a.calls.daysForUsers[0].sort(), ['cu', 'minh']);
  const minh = r.body.users.find(u => u.key === 'minh'), cu = r.body.users.find(u => u.key === 'cu');
  assert.strictEqual(minh.studyDays, 3); assert.strictEqual(minh.lastStudyDay, '2026-10-22'); assert.ok(minh.accountDays >= 3 && minh.known === 5);
  assert.strictEqual(cu.studyDays, 0); assert.strictEqual(cu.accountDays, null); assert.strictEqual(cu.lastStudyDay, null);
  assert.strictEqual((await makeApi('user').users()).status, 403);
});

// ───────── giao diện ─────────
function load(file, from, extra) { const src = read(file); const ctx = { console, ...(extra || {}) }; vm.createContext(ctx); vm.runInContext(src.slice(src.indexOf(from), src.indexOf(from) + 4000).split('\nfunction renderStats()')[0].split('\nasync function adminLoadUsers()')[0], ctx); return ctx; }
test('Thống kê: 2 ô KPI — "Số ngày đã học" (+ tỉ lệ) và "Ngày từ khi tạo tài khoản" (+ ngày tạo dd/mm/yyyy; "Tạo hôm nay" khi 0); khách/không có dữ liệu → không thêm ô', () => {
  const c = load('js/stats.js', '// V119.4: 2 ô KPI');
  const rows = c.statsDayKpis({ studyDays: 3, accountDays: 3, createdDate: '2026-10-20', totalDays: 4, studyRatePct: 75 });
  deq(rows, [['📅', 3, 'Số ngày đã học', '75% trong 4 ngày'], ['🗓️', 3, 'Ngày từ khi tạo tài khoản', 'Tạo ngày 20/10/2026']]);
  assert.strictEqual(c.statsDayKpis({ studyDays: 0, accountDays: 0, createdDate: '2026-10-23', totalDays: 1, studyRatePct: 0 })[1][3], 'Tạo hôm nay'); assert.strictEqual(c.statsDayKpis({ studyDays: 0, accountDays: 0, createdDate: '2026-10-23', totalDays: 1, studyRatePct: 0 })[1][1], 0);
  const old = c.statsDayKpis({ studyDays: 5, accountDays: null, createdDate: null, totalDays: null, studyRatePct: null }); assert.strictEqual(old.length, 1); assert.strictEqual(old[0][3], '');
  deq(c.statsDayKpis(undefined), []); deq(c.statsDayKpis(null), []);
  assert.ok(/\.\.\.statsDayKpis\(dash\.days\)/.test(read('js/stats.js')));
});
test('Quản trị: dòng đếm ngày cho từng tài khoản; thiếu số liệu thì bỏ phần đó; không còn in "🔥undefined"', () => {
  const c = load('js/admin.js', '// V119.4: dòng "📅 học X ngày');
  assert.strictEqual(c.adminDaysLine({ studyDays: 12, accountDays: 30, lastStudyDay: '2026-10-22' }), '📅 Đã học 12 ngày · 🗓️ Tạo 30 ngày trước · Học gần nhất: 22/10/2026');
  assert.strictEqual(c.adminDaysLine({ studyDays: 0, accountDays: 0, lastStudyDay: null }), '📅 Đã học 0 ngày · 🗓️ Tạo hôm nay');
  assert.strictEqual(c.adminDaysLine({ studyDays: 4, accountDays: null }), '📅 Đã học 4 ngày'); assert.strictEqual(c.adminDaysLine({}), '');
  const a = read('js/admin.js'); assert.ok(/\$\{adminDaysLine\(u\)\}/.test(a)); assert.ok(!/·\s*🔥\$\{u\.streak\}/.test(a), 'không in streak khi server không trả');
});

(async () => { for (const [n, f] of T) { try { await f(); passed++; console.log('  ✅ ' + n); } catch (e) { failed++; console.log('  ❌ ' + n + '\n     ' + String(e.stack || e).split('\n').slice(0, 4).join('\n     ')); } }
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); })();
